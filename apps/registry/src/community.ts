// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Community plugin pipeline — source-in-repo distribution.
 *
 * Community plugins are submitted as PRs adding a source folder under
 * `apps/registry/community/<plugin-id>/`:
 *
 *   community/<plugin-id>/
 *     manifest.json   — the plugin manifest (same schema as any plugin)
 *     store.json      — store metadata (category, tagline, githubUser, ...)
 *     src/index.ts    — module entry, exports `manifest` + `createPlugin`
 *
 * At startup the registry validates each submission, bundles its source with
 * `bun build` into `static/modules/community/<id>.js`, and serves it in the
 * catalog with `tier: 'community'`. Signing then covers the freshly-built
 * bytes with the COMMUNITY key (see signing.ts) — the registry never serves
 * community bytes it did not build itself from the reviewed source.
 *
 * Security posture: community plugins are validated against a capability
 * denylist (no trading), and terminals treat community-key signatures as
 * permanently sandbox-only. Review of a community PR is a skim, not an audit —
 * the sandbox and this lint are the real enforcement.
 */
import { validateManifest } from '@pairlens/shared/plugin-manifest-schema'

import { CATALOG, CATEGORIES } from './catalog'
import type { PluginManifest } from '@pairlens/shared/plugin-types'
import type { RegistryPluginEntry } from '@pairlens/shared/registry-types'

const COMMUNITY_DIR = new URL('../community/', import.meta.url).pathname
const MODULES_OUT_DIR = new URL('../static/modules/community/', import.meta.url)
  .pathname

/** Hard cap on a built community bundle — themes are ~10 KB, connectors ~100 KB. */
export const MAX_COMMUNITY_MODULE_BYTES = 512 * 1024

/**
 * Capabilities a community plugin may NOT declare. Trading stays out of the
 * community tier: nothing repo-submitted can route orders or read balances.
 *
 * `rpc:solana` is on the list for a different reason. It hands its consumer a
 * node URL with the user's API key embedded, which a repo-submitted plugin has
 * no business either serving or reading.
 */
export const COMMUNITY_DENIED_CAPABILITIES: ReadonlyArray<string> = [
  'trading:orders',
  'trading:balances',
  'trading:positions',
  'trading:bridge',
  'rpc:solana',
]

/**
 * Bundler externals — must match the plugin-sdk build contract used by
 * examples/dev-starter-plugin and create-pairlens-plugin. Externals resolve
 * through the host import map (full-trust plugins only); sandboxed plugins
 * must not import them at runtime.
 */
const BUILD_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  '@pairlens/plugin-sdk',
  '@pairlens/ui',
  '@pairlens/fast-financial-charts',
  '@pairlens/fast-financial-charts/react',
]

/** Store metadata each community submission provides in store.json. */
export type CommunityStoreMeta = {
  /** GitHub user/org submitting the plugin — the id namespace owner. */
  githubUser: string
  /** Store category — must be one of the registry's category ids. */
  category: string
  tagline: string
  longDescription?: string
  homepage?: string
  /** Absolute URL to a ≥128px square-ish brand mark for store poster art. */
  posterImage?: string
}

export type CommunityValidationResult = {
  dir: string
  pluginId: string | null
  errors: Array<string>
  manifest: PluginManifest | null
  store: CommunityStoreMeta | null
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    return JSON.parse(await file.text()) as unknown
  } catch {
    return null
  }
}

function validateStoreMeta(
  input: unknown,
  errors: Array<string>,
): CommunityStoreMeta | null {
  if (!isPlainObject(input)) {
    errors.push('store.json must be a JSON object')
    return null
  }
  const githubUser = input['githubUser']
  if (
    typeof githubUser !== 'string' ||
    !/^[a-z0-9][a-z0-9-]*$/.test(githubUser)
  ) {
    errors.push(
      'store.json "githubUser" is required and must be a lowercase GitHub username',
    )
  }
  const category = input['category']
  if (
    typeof category !== 'string' ||
    !CATEGORIES.some((c) => c.id === category)
  ) {
    errors.push(
      `store.json "category" must be one of: ${CATEGORIES.map((c) => c.id).join(', ')}`,
    )
  }
  const tagline = input['tagline']
  if (typeof tagline !== 'string' || tagline.length === 0) {
    errors.push('store.json "tagline" is required')
  } else if (tagline.length > 140) {
    errors.push('store.json "tagline" must be at most 140 characters')
  }
  for (const key of ['longDescription', 'homepage', 'posterImage'] as const) {
    if (input[key] !== undefined && typeof input[key] !== 'string') {
      errors.push(`store.json "${key}" must be a string when present`)
    }
  }
  if (errors.length > 0) return null
  return input as CommunityStoreMeta
}

/**
 * Validate one community submission folder (manifest + store metadata +
 * community policy). Does not build — see buildCommunityModule.
 */
export async function validateCommunityPlugin(
  dir: string,
): Promise<CommunityValidationResult> {
  const errors: Array<string> = []
  const base = `${COMMUNITY_DIR}${dir}/`

  const manifestRaw = await readJson(`${base}manifest.json`)
  if (manifestRaw === null) {
    errors.push('manifest.json is missing or not valid JSON')
  }
  const storeRaw = await readJson(`${base}store.json`)
  if (storeRaw === null) {
    errors.push('store.json is missing or not valid JSON')
  }
  if (!(await Bun.file(`${base}src/index.ts`).exists())) {
    errors.push('src/index.ts entry file is missing')
  }
  if (errors.length > 0) {
    return { dir, pluginId: null, errors, manifest: null, store: null }
  }

  const result = validateManifest(manifestRaw)
  if (!result.valid) {
    return {
      dir,
      pluginId: null,
      errors: result.errors.map((e) => `manifest: ${e}`),
      manifest: null,
      store: null,
    }
  }
  const manifest = result.manifest
  const store = validateStoreMeta(storeRaw, errors)

  // Folder name is the plugin id — keeps ids, module filenames, and review
  // diffs trivially alignable.
  if (manifest.id !== dir) {
    errors.push(
      `manifest "id" ("${manifest.id}") must equal the folder name ("${dir}")`,
    )
  }

  // Namespace: the id is prefixed by the submitting GitHub user, so ids can't
  // be squatted and ownership disputes resolve themselves. CI additionally
  // checks the PR author actually owns the namespace.
  if (store && !manifest.id.startsWith(`${store.githubUser}-`)) {
    errors.push(
      `manifest "id" must start with "${store.githubUser}-" (the store.json githubUser)`,
    )
  }

  // Community capability policy — trading stays out of this tier.
  for (const cap of manifest.capabilities) {
    if (COMMUNITY_DENIED_CAPABILITIES.includes(cap.id)) {
      errors.push(
        `capability "${cap.id}" is not allowed for community plugins (trading requires an official or self-hosted publisher)`,
      )
    }
  }

  // Never shadow a first-party catalog entry.
  if (CATALOG.some((entry) => entry.manifest.id === manifest.id)) {
    errors.push(`id "${manifest.id}" collides with an official catalog entry`)
  }

  return {
    dir,
    pluginId: manifest.id,
    errors,
    manifest: errors.length === 0 ? manifest : null,
    store: errors.length === 0 ? store : null,
  }
}

/** List community submission folders (sorted for deterministic output). */
export async function listCommunityDirs(): Promise<Array<string>> {
  try {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(COMMUNITY_DIR, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    return [] // no community/ dir — nothing to serve
  }
}

/**
 * Bundle one community plugin's source into static/modules/community/<id>.js.
 * Returns the built module size in bytes, or throws with the bundler output.
 */
export async function buildCommunityModule(dir: string): Promise<number> {
  const entry = `${COMMUNITY_DIR}${dir}/src/index.ts`
  const outfile = `${MODULES_OUT_DIR}${dir}.js`
  const args = [
    'build',
    entry,
    '--outfile',
    outfile,
    '--format',
    'esm',
    ...BUILD_EXTERNALS.flatMap((ext) => ['--external', ext]),
    '--target',
    'browser',
    '--minify',
  ]
  const proc = Bun.spawn(['bun', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`bun build failed for '${dir}':\n${stderr}`)
  }
  const size = Bun.file(outfile).size
  if (size > MAX_COMMUNITY_MODULE_BYTES) {
    throw new Error(
      `built module for '${dir}' is ${size} bytes — exceeds the ${MAX_COMMUNITY_MODULE_BYTES}-byte community cap`,
    )
  }
  return size
}

// ── Startup catalog ─────────────────────────────────────────────────

const communityCatalog: Array<RegistryPluginEntry> = []

/**
 * Validate + build every community submission and fold the survivors into the
 * served catalog. Call once at startup, BEFORE initSignatures (signing covers
 * the freshly-built bytes). Non-fatal per entry: an invalid or unbuildable
 * submission is logged and skipped — never served.
 */
export async function initCommunityCatalog(): Promise<void> {
  const dirs = await listCommunityDirs()
  for (const dir of dirs) {
    const result = await validateCommunityPlugin(dir)
    if (result.errors.length > 0 || !result.manifest || !result.store) {
      console.warn(
        `[registry] Skipping community plugin '${dir}':\n  - ${result.errors.join('\n  - ')}`,
      )
      continue
    }
    let size: number
    try {
      size = await buildCommunityModule(dir)
    } catch (err) {
      console.warn(
        `[registry] ${err instanceof Error ? err.message : String(err)}`,
      )
      continue
    }
    communityCatalog.push({
      manifest: result.manifest,
      category: result.store.category,
      tagline: result.store.tagline,
      longDescription: result.store.longDescription,
      posterImage: result.store.posterImage,
      moduleUrl: `/static/modules/community/${result.manifest.id}.js`,
      latestVersion: result.manifest.version,
      bundled: false,
      tier: 'community',
      githubUser: result.store.githubUser,
      sourceUrl: `https://github.com/Pairlens/trading-terminal/tree/main/apps/registry/community/${dir}`,
      size,
    })
  }
  if (communityCatalog.length > 0) {
    console.info(
      `[registry] Built ${communityCatalog.length} community plugin(s): ${communityCatalog
        .map((e) => e.manifest.id)
        .join(', ')}`,
    )
  }
}

/**
 * The full served catalog: first-party entries plus whatever community
 * submissions validated and built. Community entries appear only after
 * initCommunityCatalog completes — consistent with the served-unsigned-
 * until-ready startup model.
 */
export function fullCatalog(): Array<RegistryPluginEntry> {
  return [...CATALOG, ...communityCatalog]
}
