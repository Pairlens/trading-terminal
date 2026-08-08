// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

/**
 * Guards against i18n catalog drift:
 * 1. every locale carries exactly the English key set (modulo extra plural
 *    forms that some languages legitimately need, e.g. Russian _few/_many),
 * 2. every translated value keeps the same {{placeholders}} as English,
 * 3. every translation key statically referenced from source exists in the
 *    English catalog (fallback strings in code hide these gaps in English
 *    but break every other language),
 * 4. every English key is referenced from source — the mirror of 3. An
 *    orphaned key is dead weight carried by seventeen catalogs, and worse,
 *    it looks translated: the 2026-08-08 cleanup found five mobile.shell
 *    keys that had been translated into every locale for a UI that no
 *    longer existed.
 */

const SRC_DIR = join(import.meta.dir, '..', '..')
const LOCALES_DIR = join(SRC_DIR, 'locales')

const EN = 'en'
const LOCALES = readdirSync(LOCALES_DIR).filter((l) => l !== EN)

// Plural suffixes a locale may define beyond en's _one/_other pair.
const EXTRA_PLURAL_SUFFIXES = new Set(['few', 'many', 'two', 'zero'])

type Catalog = Record<string, unknown>

function loadCatalog(locale: string): Catalog {
  const raw = readFileSync(
    join(LOCALES_DIR, locale, 'translation.json'),
    'utf8',
  )
  return JSON.parse(raw) as Catalog
}

/** Flatten a nested catalog into dotted-key → string-value entries. */
function flatten(node: Catalog, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of flatten(value as Catalog, path)) out.set(k, v)
    } else {
      out.set(path, String(value))
    }
  }
  return out
}

function placeholders(value: string): Array<string> {
  return [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]).sort()
}

/** An extra locale key is fine if it is a plural form of an en plural key. */
function isPluralExtra(key: string, enKeys: Set<string>): boolean {
  const idx = key.lastIndexOf('_')
  if (idx === -1) return false
  const suffix = key.slice(idx + 1)
  return (
    EXTRA_PLURAL_SUFFIXES.has(suffix) &&
    enKeys.has(`${key.slice(0, idx)}_other`)
  )
}

const en = flatten(loadCatalog(EN))
const enKeys = new Set(en.keys())

describe('i18n catalog parity', () => {
  test('all shipped locales are present', () => {
    const shipped = [
      'es',
      'zh',
      'zh-Hant',
      'ru',
      'uk',
      'fr',
      'pt',
      'de',
      'it',
      'pl',
      'ja',
      'ko',
      'vi',
      'th',
      'tr',
      'id',
    ]
    for (const locale of shipped) {
      expect(LOCALES).toContain(locale)
    }
  })

  for (const locale of LOCALES) {
    const catalog = flatten(loadCatalog(locale))
    const keys = new Set(catalog.keys())

    test(`${locale}: key set matches en`, () => {
      const missing = [...enKeys].filter((k) => !keys.has(k))
      const extra = [...keys].filter(
        (k) => !enKeys.has(k) && !isPluralExtra(k, enKeys),
      )
      expect(missing).toEqual([])
      expect(extra).toEqual([])
    })

    test(`${locale}: placeholders match en`, () => {
      const mismatched = [...enKeys]
        .filter((k) => keys.has(k))
        .filter(
          (k) =>
            placeholders(en.get(k)!).join(',') !==
            placeholders(catalog.get(k)!).join(','),
        )
      expect(mismatched).toEqual([])
    })
  }
})

// ── Static usage audit ──────────────────────────────────────────────

/**
 * Matches t('key'), t('key', 'fallback'), t('key', "fallback"), and
 * t('key', { defaultValue: '...' }). Dynamic template-literal keys are
 * intentionally not matched — they cannot be checked statically.
 */
const T_CALL =
  /\bt\(\s*'([a-zA-Z0-9_.-]+)'\s*(?:,\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\{\s*defaultValue:))?/gs

function sourceFiles(dir: string): Array<string> {
  const out: Array<string> = []
  for (const entry of readdirSync(dir)) {
    if (
      entry === 'locales' ||
      entry === '__tests__' ||
      entry === 'node_modules'
    )
      continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path))
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !/\.test\.(ts|tsx)$/.test(entry) &&
      !entry.endsWith('.gen.ts')
    ) {
      out.push(path)
    }
  }
  return out
}

/** A referenced key exists if en has it directly or as plural forms. */
function existsInEn(key: string): boolean {
  return (
    enKeys.has(key) || enKeys.has(`${key}_one`) || enKeys.has(`${key}_other`)
  )
}

describe('i18n static usage audit', () => {
  test('every statically-referenced t() key exists in the en catalog', () => {
    const missing: Array<string> = []
    for (const file of sourceFiles(SRC_DIR)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(T_CALL)) {
        const key = match[1]
        // Require a dot so bare identifiers matched by accident are skipped.
        if (!key.includes('.')) continue
        if (!existsInEn(key)) {
          missing.push(`${key} (${file.slice(SRC_DIR.length + 1)})`)
        }
      }
    }
    expect([...new Set(missing)].sort()).toEqual([])
  })

  test('the audit regex actually finds t() usages (self-check)', () => {
    // Guard against the regex silently rotting: the codebase has hundreds of
    // static t() calls; if the scan finds almost none, the audit is broken.
    let count = 0
    for (const file of sourceFiles(SRC_DIR)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(T_CALL)) {
        if (match[1].includes('.')) count++
      }
    }
    expect(count).toBeGreaterThan(500)
  })
})

// ── Orphan audit ────────────────────────────────────────────────────

/**
 * The mirror of the audit above: flag en keys that no source file
 * references. What counts as a reference:
 *
 * - A string literal that is ENTIRELY the key (`'a.b.c'`, `"a.b.c"`, or an
 *   interpolation-free template literal). Matching the whole literal is the
 *   point, not an optimisation: `mobile.shell.changeVenue` survived a naive
 *   substring scan for a month because `mobile.shell.changeVenueA11y`
 *   exists and contains it. This also covers keys that never pass through
 *   `t()` at the reference site — the mobile shell's PANEL_LABEL_KEY-style
 *   static maps, `nameKey`/`labelKey` fields, and desktop-download.ts's
 *   per-build `labelKey`s.
 * - A dynamic-key template literal whose prefix covers it:
 *   t(`indicatorsPage.importError.${code}`) marks every key under that
 *   prefix as used. Extracted automatically, so a new derived family does
 *   not need registering here — but anything under such a prefix is
 *   invisible to this audit, which is the price of dynamic keys.
 * - Membership in DERIVED_KEY_PREFIXES: families built with a VARIABLE
 *   before the first dot (registry-labels.ts's `${scope}.stepTypes.…`),
 *   which prefix extraction cannot see. These are the same families
 *   scripts/i18n-scan.ts documents as TRANSLATED_AT_RENDER; each entry
 *   names the walking test that proves its keys resolve.
 *
 * Keys are also referenced from outside apps/terminal/src: the
 * pairlens-core plugin declares pane `labelKey`/`descriptionKey` in
 * packages/plugins, and pane categories live in packages/shared. Those
 * roots are part of the corpus; if a key is ever referenced from somewhere
 * new, add the root here rather than allowlisting the key.
 */

const REPO_ROOT = join(SRC_DIR, '..', '..', '..')
const USAGE_ROOTS = [
  SRC_DIR,
  join(REPO_ROOT, 'packages', 'plugins', 'src'),
  join(REPO_ROOT, 'packages', 'shared', 'src'),
]

/**
 * Derived-key namespaces whose keys never appear in source, even as a
 * template-literal prefix. Every entry must name the module that derives
 * the keys and the test that walks the real definitions to prove they
 * resolve in en — an entry without both is how orphans start hiding again.
 * Keep entries as long as possible: a broad prefix shadows real orphans.
 */
const DERIVED_KEY_PREFIXES = [
  // lib/registry-labels.ts builds `${scope}.stepTypes.…` — the scope is a
  // variable, so no literal prefix exists to extract. Proven by
  // lib/__tests__/registry-labels.test.ts walking the real step
  // definitions and capability table.
  'workflows.stepTypes.',
  'notifications.stepTypes.',
]

/** A string literal that is entirely a dotted key. */
const KEY_LITERAL = /(['"`])([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)\1/g
/** The literal prefix of a dynamic key: `indicators.params.${name}`. */
const DYNAMIC_KEY_PREFIX = /`([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.)\$\{/g
/** i18next resolves plural keys from the suffix-less base at the call site. */
const PLURAL_SUFFIX = /_(?:one|other|few|many|two|zero)$/

const referencedKeys = new Set<string>()
const dynamicPrefixes = new Set<string>()
for (const root of USAGE_ROOTS) {
  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(KEY_LITERAL)) referencedKeys.add(m[2])
    for (const m of text.matchAll(DYNAMIC_KEY_PREFIX)) dynamicPrefixes.add(m[1])
  }
}

function isReferenced(key: string): boolean {
  if (referencedKeys.has(key)) return true
  const base = key.replace(PLURAL_SUFFIX, '')
  if (base !== key && referencedKeys.has(base)) return true
  for (const prefix of dynamicPrefixes) {
    if (key.startsWith(prefix)) return true
  }
  return false
}

describe('i18n orphan audit', () => {
  test('every en key is referenced from source', () => {
    const orphans = [...enKeys].filter(
      (key) =>
        !DERIVED_KEY_PREFIXES.some((p) => key.startsWith(p)) &&
        !isReferenced(key),
    )
    expect(orphans.sort()).toEqual([])
  })

  test('the literal extraction actually finds keys (self-check)', () => {
    // Most of the catalog is referenced as plain literals; if the regex
    // rots, "orphans: none" would just mean "the scan found nothing".
    const direct = [...enKeys].filter((k) => referencedKeys.has(k))
    expect(direct.length).toBeGreaterThan(2000)
  })

  test('the dynamic-prefix extraction actually finds prefixes (self-check)', () => {
    // The codebase derives keys in dozens of places (onboarding steps,
    // indicator params, pane categories, plugin manifests, …).
    expect(dynamicPrefixes.size).toBeGreaterThan(20)
  })
})

/**
 * The "stored securely" disclosure bolds one clause by finding it as a
 * SUBSTRING of the surrounding paragraph (stored-locally-disclosure.tsx).
 * Nothing in the type system ties the two strings together, and when a
 * translation of either one drifts the component silently renders the
 * paragraph unemphasised — no error, no visual bug worth reporting, just the
 * strongest sentence on a page where someone is pasting an API key quietly
 * losing its weight. Both paragraph variants have to keep containing it.
 */
describe('i18n composed strings', () => {
  const CLAUSE = 'accounts.storedSecurelyNever'
  const PARAGRAPHS = [
    'accounts.storedSecurelyDetail',
    'accounts.storedSecurelyDetailBrowser',
  ]

  for (const locale of [EN, ...LOCALES]) {
    test(`${locale}: the "never sent" clause appears in both detail paragraphs`, () => {
      const flat = flatten(loadCatalog(locale))
      const clause = flat.get(CLAUSE)
      expect(clause).toBeTruthy()
      for (const key of PARAGRAPHS) {
        const paragraph = flat.get(key)
        expect(paragraph).toBeTruthy()
        expect(paragraph).toContain(clause!)
      }
    })
  }
})
