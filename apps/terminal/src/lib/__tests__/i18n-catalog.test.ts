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
 *    but break every other language).
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
