// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { validateManifest } from '@pairlens/shared/plugin-manifest-schema'
import {
  PLUGIN_PACKAGE_FILES,
  looksLikeZip,
  readZipEntries,
} from '@pairlens/shared/plugin-package'

import type { CustomIndicatorDescriptor } from '@pairlens/shared/plugin-types'
import type { IndicatorModule } from '@/stores/indicator-scripts-store'
import { ENTRY_FILE, isValidModulePath } from '@/stores/indicator-scripts-store'

// ---------------------------------------------------------------------------
// "Import indicator" — the mirror image of export-plugin.ts. Brings a script
// in from a paste, a `.py` file, a plugin zip, or an installed plugin's
// indicator, and hands the caller a plain {name, source, modules} it can pass
// straight to the script store's createScript().
//
// Everything here treats its input as hostile: zips arrive from strangers, so
// paths are validated against the store's own rules (never sanitised), sizes
// and file counts are capped before decompression, and a single bad file
// fails the whole import. A half-imported indicator — entry present, helper
// silently dropped — is worse than one that never imported, because it fails
// later, at compute time, with a confusing ImportError.
// ---------------------------------------------------------------------------

/** A script ready for `createScript(name, source, modules)`. */
export type ImportedScript = {
  /**
   * The *desired* name. Callers de-duplicate against their own store with
   * `dedupeScriptName()` — import never silently overwrites or renames.
   */
  name: string
  /** Entry module source; always lands as `main.py`. */
  source: string
  /** Helper modules, paths already validated against the store's rules. */
  modules: Array<IndicatorModule>
}

export const IMPORT_LIMITS = {
  /** Total decompressed source bytes across the entry and every helper. */
  maxTotalBytes: 2 * 1024 * 1024,
  /** Entry + helpers. The store's editor is unusable well before this. */
  maxFiles: 32,
  /** Compressed input cap — no honest indicator zip comes close. */
  maxZipBytes: 4 * 1024 * 1024,
  /** Longest accepted script name. */
  maxNameLength: 80,
} as const

/** Room for manifest.json / module.js / styles.css on top of the sources. */
const MAX_ZIP_ENTRIES = IMPORT_LIMITS.maxFiles + 4

/** Fallback when nothing usable can be derived from the file or metadata. */
export const DEFAULT_IMPORT_NAME = 'Imported indicator'

export type ImportErrorCode =
  /** Nothing to import (no bytes, blank paste). */
  | 'empty'
  /** A file is not UTF-8 text. */
  | 'binary'
  /** Over `maxTotalBytes` / `maxZipBytes`. */
  | 'tooLarge'
  /** Over `maxFiles`. */
  | 'tooManyFiles'
  /** Not a zip, truncated, or missing a required plugin-package file. */
  | 'badZip'
  /** A path the script store would never accept (escape, absolute, non-.py). */
  | 'invalidPath'
  /** Two entries claim the same path. */
  | 'duplicatePath'
  /** No file could be identified as the entry module. */
  | 'noEntry'
  /** A plugin package that carries no importable indicator source. */
  | 'noIndicators'
  /** A descriptor in some language other than Python. */
  | 'unsupportedLanguage'
  /** A descriptor whose shape doesn't match CustomIndicatorDescriptor. */
  | 'malformedDescriptor'

/**
 * Import failure. `code` + `params` let the UI translate; `message` is the
 * English fallback, which is also what surfaces in logs and tests.
 */
export class IndicatorImportError extends Error {
  readonly code: ImportErrorCode
  readonly params: Record<string, string | number>

  constructor(
    code: ImportErrorCode,
    message: string,
    params: Record<string, string | number> = {},
  ) {
    super(message)
    this.name = 'IndicatorImportError'
    this.code = code
    this.params = params
  }
}

/**
 * Declared (not an arrow const) so TypeScript's control-flow analysis treats
 * every call as terminating — that is what lets the code below read as a
 * straight line of guards instead of nested else-branches.
 */
function fail(
  code: ImportErrorCode,
  message: string,
  params?: Record<string, string | number>,
): never {
  throw new IndicatorImportError(code, message, params)
}

// ── Names ───────────────────────────────────────────────────────────

/** `signals/my rsi.py` → `my rsi`; also strips a `.zip` suffix. */
export function scriptNameFromFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? ''
  return base
    .replace(/\.(py|zip)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, IMPORT_LIMITS.maxNameLength)
}

function cleanName(candidate: string): string {
  const name = candidate.replace(/\s+/g, ' ').trim()
  return name ? name.slice(0, IMPORT_LIMITS.maxNameLength) : DEFAULT_IMPORT_NAME
}

/**
 * Pick a name that doesn't collide: `RSI` → `RSI 2` → `RSI 3`. Import returns
 * the *desired* name and leaves this to the caller, so a second import of the
 * same indicator sits next to the first instead of quietly replacing it.
 */
export function dedupeScriptName(
  desired: string,
  existingNames: Iterable<string>,
): string {
  const taken = new Set(existingNames)
  const base = cleanName(desired)
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

// ── Source checks ───────────────────────────────────────────────────

const encoder = new TextEncoder()

function byteLength(text: string): number {
  return encoder.encode(text).length
}

/**
 * Soft signal — does this look like a Pairlens indicator at all? Import never
 * rejects on this (a draft mid-refactor is legitimate); the dialog uses it for
 * an inline hint so a stray paste doesn't turn into a mystery run failure.
 */
export function looksLikeIndicatorSource(source: string): boolean {
  return (
    /\b(indicator|strategy)\s*\(/.test(source) &&
    /\bdef\s+compute\s*\(/.test(source)
  )
}

function decodeText(path: string, bytes: Uint8Array): string {
  // A NUL byte means this was never source code — an image, a nested zip, a
  // compiled .pyc renamed to .py. Decoding would yield replacement-character
  // soup that fails much later, in Python.
  if (bytes.includes(0)) {
    fail('binary', `“${path}” is not a text file`, { path })
  }
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * Final gate every import path funnels through: caps, path rules, duplicate
 * detection. Returns the store-ready script.
 */
function finalizeScript(
  name: string,
  entrySource: string,
  helpers: Array<IndicatorModule>,
): ImportedScript {
  if (helpers.length + 1 > IMPORT_LIMITS.maxFiles) {
    fail(
      'tooManyFiles',
      `Too many files: ${helpers.length + 1} (limit ${IMPORT_LIMITS.maxFiles})`,
      // Never a `count` key: i18next would read it as a plural selector.
      { files: helpers.length + 1, limit: IMPORT_LIMITS.maxFiles },
    )
  }

  if (entrySource.trim().length === 0) {
    fail('empty', 'The entry file is empty')
  }

  let total = byteLength(entrySource)
  const seen = new Set<string>([ENTRY_FILE])
  for (const helper of helpers as Array<Partial<IndicatorModule> | null>) {
    if (typeof helper?.path !== 'string' || typeof helper.source !== 'string') {
      return fail('malformedDescriptor', 'A helper module is malformed')
    }
    if (!isValidModulePath(helper.path)) {
      fail('invalidPath', `“${helper.path}” is not a valid module path`, {
        path: helper.path,
      })
    }
    if (seen.has(helper.path)) {
      fail('duplicatePath', `Duplicate file “${helper.path}”`, {
        path: helper.path,
      })
    }
    seen.add(helper.path)
    total += byteLength(helper.source)
  }

  if (total > IMPORT_LIMITS.maxTotalBytes) {
    fail(
      'tooLarge',
      `Script is too large: ${Math.round(total / 1024)} KB (limit ${Math.round(
        IMPORT_LIMITS.maxTotalBytes / 1024,
      )} KB)`,
      { limit: Math.round(IMPORT_LIMITS.maxTotalBytes / 1024) },
    )
  }

  return { name: cleanName(name), source: entrySource, modules: helpers }
}

// ── 1. A single .py file (or a paste) ───────────────────────────────

/**
 * One Python file becomes a one-file indicator. `fileName` names the script:
 * a `.py`/`.zip` suffix is stripped, anything else is taken as-is — so the
 * paste route can pass the name the user typed.
 */
export function importFromPython(
  fileName: string,
  source: string,
): ImportedScript {
  if (source.trim().length === 0) {
    fail('empty', 'There is nothing to import')
  }
  if (source.includes('\0')) {
    fail('binary', 'That file is not Python source', { path: fileName })
  }
  return finalizeScript(scriptNameFromFileName(fileName), source, [])
}

// ── 2. A zip: plugin package, or a folder of .py files ──────────────

/** Archive litter every OS zipper adds — skipped, never imported. */
function isArchiveNoise(path: string): boolean {
  return (
    path.startsWith('__MACOSX/') ||
    path.split('/').some((seg) => seg === '.DS_Store' || seg === 'Thumbs.db')
  )
}

/** Unzip under a hard budget: entry count and declared size, pre-inflation. */
function readEntriesWithinBudget(
  bytes: Uint8Array,
): Record<string, Uint8Array> {
  let count = 0
  let declaredTotal = 0
  let entries: Record<string, Uint8Array>
  try {
    entries = readZipEntries(bytes, {
      accept: (entry) => {
        if (entry.name.endsWith('/')) return false // directory record
        if (isArchiveNoise(entry.name)) return false
        count += 1
        if (count > MAX_ZIP_ENTRIES) {
          fail(
            'tooManyFiles',
            `Archive holds more than ${IMPORT_LIMITS.maxFiles} files`,
            { limit: IMPORT_LIMITS.maxFiles },
          )
        }
        declaredTotal += entry.originalSize
        if (declaredTotal > IMPORT_LIMITS.maxTotalBytes) {
          fail(
            'tooLarge',
            `Archive contents exceed ${Math.round(
              IMPORT_LIMITS.maxTotalBytes / 1024,
            )} KB`,
            { limit: Math.round(IMPORT_LIMITS.maxTotalBytes / 1024) },
          )
        }
        return true
      },
    })
  } catch (err) {
    if (err instanceof IndicatorImportError) throw err
    fail(
      'badZip',
      `Could not read the archive: ${err instanceof Error ? err.message : String(err)}`,
      { detail: err instanceof Error ? err.message : String(err) },
    )
  }

  // Belt and braces: a lying central directory can't get past the actual
  // decompressed sizes.
  let actual = 0
  for (const data of Object.values(entries)) {
    actual += data.length
    if (actual > IMPORT_LIMITS.maxTotalBytes) {
      fail(
        'tooLarge',
        `Archive contents exceed ${Math.round(
          IMPORT_LIMITS.maxTotalBytes / 1024,
        )} KB`,
        { limit: Math.round(IMPORT_LIMITS.maxTotalBytes / 1024) },
      )
    }
  }
  return entries
}

/**
 * Slice a balanced JSON array out of generated source, string-aware, without
 * evaluating anything. The exporter writes `const descriptors = [...]` as
 * JSON.stringify output, so a plain parse recovers it exactly.
 */
function sliceJsonArray(text: string, start: number): string | null {
  if (text[start] !== '[') return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '[' || ch === '{') depth += 1
    else if (ch === ']' || ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Recover the descriptors an exported indicator plugin embeds. Returns null
 * for any other plugin — a hand-written module can hold arbitrary code, and
 * import will not run it to find out what it contributes.
 */
export function extractEmbeddedDescriptors(
  moduleText: string,
): Array<CustomIndicatorDescriptor> | null {
  const marker = /(?:^|\n)\s*(?:const|let|var)\s+descriptors\s*=\s*/.exec(
    moduleText,
  )
  if (!marker) return null
  const json = sliceJsonArray(moduleText, marker.index + marker[0].length)
  if (!json) return null
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed)
      ? (parsed as Array<CustomIndicatorDescriptor>)
      : null
  } catch {
    return null
  }
}

function importPluginPackage(
  fallbackName: string,
  entries: Record<string, Uint8Array>,
): ImportedScript {
  const manifestRaw = entries[PLUGIN_PACKAGE_FILES.manifest]
  const moduleRaw = entries[PLUGIN_PACKAGE_FILES.module]

  let parsed: unknown
  try {
    parsed = JSON.parse(decodeText(PLUGIN_PACKAGE_FILES.manifest, manifestRaw))
  } catch (err) {
    if (err instanceof IndicatorImportError) throw err
    fail('badZip', `${PLUGIN_PACKAGE_FILES.manifest} is not valid JSON`, {
      detail: err instanceof Error ? err.message : String(err),
    })
  }
  const validated = validateManifest(parsed)
  if (!validated.valid) {
    fail('badZip', `Invalid plugin manifest: ${validated.errors.join('; ')}`, {
      detail: validated.errors.join('; '),
    })
  }

  const descriptors = extractEmbeddedDescriptors(
    decodeText(PLUGIN_PACKAGE_FILES.module, moduleRaw),
  )
  if (!descriptors || descriptors.length === 0) {
    fail(
      'noIndicators',
      'That plugin does not carry an importable indicator script. Install it from the Plugins page and fork it from there.',
    )
  }

  // A package can ship several indicators; the editor holds one script per
  // entry point, so the first descriptor is what gets forked.
  return forkFromDescriptor(
    descriptors[0],
    validated.manifest.name || fallbackName,
  )
}

/** Strip a shared wrapper folder (`my-indicator/main.py` → `main.py`). */
function stripCommonFolder(paths: Array<string>): Array<string> {
  let current = paths
  for (let depth = 0; depth < 4; depth += 1) {
    if (current.length === 0 || !current[0].includes('/')) return current
    const first = current[0].slice(0, current[0].indexOf('/'))
    // Never "strip" a traversal or a leading slash — that would turn a hostile
    // path into an acceptable one, which is exactly what must not happen.
    if (first === '' || first === '.' || first === '..') return current
    if (!current.every((p) => p.startsWith(`${first}/`))) return current
    current = current.map((p) => p.slice(first.length + 1))
  }
  return current
}

function importPythonBundle(
  fallbackName: string,
  entries: Record<string, Uint8Array>,
): ImportedScript {
  const rawPaths = Object.keys(entries)
  if (rawPaths.length === 0) {
    fail('empty', 'The archive is empty')
  }

  const stripped = stripCommonFolder(rawPaths)
  const files = new Map<string, string>()
  for (let i = 0; i < rawPaths.length; i += 1) {
    const path = stripped[i]
    // Untrusted path: it must satisfy the store's own rule as-is. Sanitising
    // `../../etc/passwd` into something acceptable would import a file the
    // user never agreed to.
    if (!isValidModulePath(path)) {
      fail('invalidPath', `“${rawPaths[i]}” is not a valid module path`, {
        path: rawPaths[i],
      })
    }
    if (files.has(path)) {
      fail('duplicatePath', `Duplicate file “${path}”`, { path })
    }
    files.set(path, decodeText(path, entries[rawPaths[i]]))
  }

  const paths = [...files.keys()]
  const entryPath = pickEntryPath(paths, files)
  if (!entryPath) {
    fail(
      'noEntry',
      `Could not tell which file is the entry module — name it ${ENTRY_FILE}`,
      { entry: ENTRY_FILE },
    )
  }

  const helpers: Array<IndicatorModule> = paths
    .filter((p) => p !== entryPath)
    .map((path) => ({ path, source: files.get(path) as string }))

  const name =
    entryPath === ENTRY_FILE
      ? fallbackName
      : scriptNameFromFileName(entryPath) || fallbackName

  return finalizeScript(name, files.get(entryPath) as string, helpers)
}

/** `main.py`, else the only file, else the only root file that defines compute(). */
function pickEntryPath(
  paths: Array<string>,
  files: Map<string, string>,
): string | undefined {
  if (files.has(ENTRY_FILE)) return ENTRY_FILE
  if (paths.length === 1) return paths[0]
  const candidates = paths.filter(
    (p) => !p.includes('/') && looksLikeIndicatorSource(files.get(p) as string),
  )
  return candidates.length === 1 ? candidates[0] : undefined
}

/**
 * A plugin zip produced by export-plugin.ts, or a plain zip of `.py` files.
 * Async so callers can await it uniformly; the unzip itself is synchronous.
 */
export async function importFromZip(
  fileName: string,
  bytes: Uint8Array,
): Promise<ImportedScript> {
  if (bytes.length === 0) {
    fail('empty', 'There is nothing to import')
  }
  if (bytes.length > IMPORT_LIMITS.maxZipBytes) {
    fail(
      'tooLarge',
      `Archive is too large: ${Math.round(bytes.length / 1024)} KB (limit ${Math.round(
        IMPORT_LIMITS.maxZipBytes / 1024,
      )} KB)`,
      { limit: Math.round(IMPORT_LIMITS.maxZipBytes / 1024) },
    )
  }
  if (!looksLikeZip(bytes)) {
    fail('badZip', 'That file is not a zip archive')
  }

  const entries = readEntriesWithinBudget(bytes)
  const hasManifest = PLUGIN_PACKAGE_FILES.manifest in entries
  const hasModule = PLUGIN_PACKAGE_FILES.module in entries
  const fallbackName = scriptNameFromFileName(fileName) || DEFAULT_IMPORT_NAME

  if (hasManifest && hasModule) {
    return importPluginPackage(fallbackName, entries)
  }
  if (hasManifest || hasModule) {
    const missing = hasManifest
      ? PLUGIN_PACKAGE_FILES.module
      : PLUGIN_PACKAGE_FILES.manifest
    fail('badZip', `Plugin package is missing ${missing}`, { detail: missing })
  }
  return importPythonBundle(fallbackName, entries)
}

// ── 3. Fork an installed plugin's indicator ─────────────────────────

/**
 * Copy an installed plugin's indicator into an editable local script. The
 * descriptor is plain JSON that crossed a sandbox boundary, so nothing about
 * its shape is assumed.
 */
export function forkFromDescriptor(
  descriptor: CustomIndicatorDescriptor,
  fallbackName = DEFAULT_IMPORT_NAME,
): ImportedScript {
  if (!descriptor || typeof descriptor !== 'object') {
    fail('malformedDescriptor', 'That indicator is malformed')
  }
  if (descriptor.language !== 'python') {
    fail(
      'unsupportedLanguage',
      `Unsupported indicator language “${String(descriptor.language)}”`,
      { language: String(descriptor.language) },
    )
  }
  if (typeof descriptor.source !== 'string') {
    fail('malformedDescriptor', 'That indicator has no source to import')
  }

  const rawModules = descriptor.modules
  if (rawModules !== undefined && !Array.isArray(rawModules)) {
    fail('malformedDescriptor', 'That indicator’s helper modules are malformed')
  }
  const modules: Array<IndicatorModule> = (rawModules ?? []).map((module) => {
    if (
      !module ||
      typeof module !== 'object' ||
      typeof module.path !== 'string' ||
      typeof module.source !== 'string'
    ) {
      return fail(
        'malformedDescriptor',
        'That indicator’s helper modules are malformed',
      )
    }
    return { path: module.path, source: module.source }
  })

  const meta = descriptor.meta
  const name =
    (typeof meta?.title === 'string' && meta.title) ||
    (typeof meta?.id === 'string' && meta.id) ||
    fallbackName

  return finalizeScript(name, descriptor.source, modules)
}
