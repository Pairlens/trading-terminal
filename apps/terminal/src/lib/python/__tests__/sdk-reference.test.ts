// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'

import {
  MEMBER_COMPLETIONS,
  PAIRLENS_COMPLETIONS,
  SDK_REFERENCE_GROUPS,
  TA_COMPLETIONS,
  TA_SECTIONS,
  sdkInsertSnippet,
  sdkQualifiedName,
} from '../sdk-completions'

import type { SdkCompletion } from '../sdk-completions'

/**
 * The browsable side of the SDK docs — what `components/indicators/
 * sdk-reference.tsx` renders. `sdk-completions.test.ts` proves the docs agree
 * with the Python sources; this proves every group the panel can show is
 * populated, documented, translatable and insertable, and that the `ta`
 * sections still line up with the sections of `pairlens_ta.py`.
 */

const TA_SOURCE = readFileSync(
  new URL('../pairlens_ta.py', import.meta.url),
  'utf8',
)

const EN_CATALOG = JSON.parse(
  readFileSync(
    new URL('../../../locales/en/translation.json', import.meta.url),
    'utf8',
  ),
) as Record<string, Record<string, unknown>>

/** Resolve a dotted i18n key against the en catalog. */
function enString(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      EN_CATALOG,
    )
}

/** Public `def` names of `pairlens_ta.py`, split by its `# ── ... ──` sections. */
function pythonSections(source: string): Array<Array<string>> {
  const sections: Array<Array<string>> = []
  let current: Array<string> | null = null
  for (const line of source.split('\n')) {
    if (line.startsWith('# ── ')) {
      current = []
      sections.push(current)
      continue
    }
    const match = /^def ([A-Za-z_]\w*)\(/.exec(line)
    if (match && !match[1].startsWith('_') && current) current.push(match[1])
  }
  return sections.filter((section) => section.length > 0)
}

const groupEntries = (): Array<[string, SdkCompletion]> =>
  SDK_REFERENCE_GROUPS.flatMap((group) =>
    group.entries.map(
      (entry) =>
        [sdkQualifiedName(group, entry), entry] as [string, SdkCompletion],
    ),
  )

describe('reference groups', () => {
  it('gives every group a unique id', () => {
    const ids = SDK_REFERENCE_GROUPS.map((group) => group.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('shows no empty group', () => {
    for (const group of SDK_REFERENCE_GROUPS) {
      expect(group.entries.length, `${group.id} is empty`).toBeGreaterThan(0)
    }
  })

  it('gives every group exactly one heading — a code name or a phrase', () => {
    for (const group of SDK_REFERENCE_GROUPS) {
      const named = typeof group.name === 'string' && group.name.length > 0
      const keyed =
        typeof group.labelKey === 'string' && group.labelKey.length > 0
      expect(named !== keyed, `${group.id} heading`).toBe(true)
      // ta sections read as prose and are translated; the rest are identifiers.
      expect(group.kind === 'ta' ? keyed : named, `${group.id} kind`).toBe(true)
    }
  })

  it('translates every phrase heading through the en catalog', () => {
    for (const group of SDK_REFERENCE_GROUPS) {
      if (!group.labelKey) continue
      const value = enString(group.labelKey)
      expect(typeof value, `${group.labelKey} is missing from en`).toBe(
        'string',
      )
      expect((value as string).trim().length).toBeGreaterThan(0)
    }
  })

  it('documents every entry it renders', () => {
    for (const [name, entry] of groupEntries()) {
      expect(
        (entry.detail ?? '').trim().length,
        `${name} detail`,
      ).toBeGreaterThan(0)
      expect((entry.info ?? '').trim().length, `${name} info`).toBeGreaterThan(
        20,
      )
    }
  })

  it('lists every documented symbol exactly once', () => {
    const rendered = groupEntries().map(([name]) => name)
    expect(new Set(rendered).size, 'a symbol is listed twice').toBe(
      rendered.length,
    )

    const expected = [
      ...PAIRLENS_COMPLETIONS.map((entry) => entry.label),
      ...Object.entries(MEMBER_COMPLETIONS).flatMap(([namespace, entries]) =>
        entries.map((entry) => `${namespace}.${entry.label}`),
      ),
    ]
    expect(rendered.slice().sort()).toEqual(expected.slice().sort())
  })
})

describe('ta sections', () => {
  it('accounts for every ta completion exactly once', () => {
    const sectioned = TA_SECTIONS.flatMap((section) => section.entries)
    expect(sectioned.length).toBe(TA_COMPLETIONS.length)
    for (const entry of TA_COMPLETIONS) {
      const owners = TA_SECTIONS.filter((section) =>
        section.entries.includes(entry),
      )
      expect(owners.length, `ta.${entry.label} sections`).toBe(1)
    }
  })

  it('gives every section a unique id and a heading key', () => {
    const ids = TA_SECTIONS.map((section) => section.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const section of TA_SECTIONS) {
      expect(section.labelKey, `${section.id} labelKey`).toMatch(/^\w+\.\w+/)
      expect(section.entries.length, `${section.id} is empty`).toBeGreaterThan(
        0,
      )
    }
  })

  it('matches the sections of pairlens_ta.py, in order', () => {
    expect(
      TA_SECTIONS.map((section) => section.entries.map((e) => e.label)),
    ).toEqual(pythonSections(TA_SOURCE))
  })
})

describe('insert snippets', () => {
  it('offers a snippet for everything callable or readable', () => {
    for (const group of SDK_REFERENCE_GROUPS) {
      for (const entry of group.entries) {
        const name = sdkQualifiedName(group, entry)
        const snippet = sdkInsertSnippet(group, entry)
        if (entry.type === 'function' || entry.type === 'property') {
          expect(snippet, `${name} has no snippet`).toBeTruthy()
        } else {
          // Classes and namespace objects are not called — nothing to insert.
          expect(snippet === null || snippet.includes(name), name).toBe(true)
        }
      }
    }
  })

  it('writes snippets that name the symbol and balance their parentheses', () => {
    for (const group of SDK_REFERENCE_GROUPS) {
      for (const entry of group.entries) {
        const name = sdkQualifiedName(group, entry)
        const snippet = sdkInsertSnippet(group, entry)
        if (!snippet) continue
        expect(snippet, `${name} snippet`).toContain(name)
        expect(snippet, `${name} snippet`).not.toContain('undefined')
        expect(snippet, `${name} snippet`).not.toMatch(/,\s*\)|\(\s*,/)
        let depth = 0
        for (const char of snippet) {
          if (char === '(') depth++
          else if (char === ')') depth--
          expect(depth, `${name} parens`).toBeGreaterThanOrEqual(0)
        }
        expect(depth, `${name} parens`).toBe(0)
      }
    }
  })

  it('fills in arguments a reader can run', () => {
    const snippetOf = (groupId: string, label: string) => {
      const group = SDK_REFERENCE_GROUPS.find((g) => g.id === groupId)!
      const entry = group.entries.find((e) => e.label === label)!
      return sdkInsertSnippet(group, entry)
    }
    expect(snippetOf('ta.movingAverages', 'ema')).toBe('ta.ema(ctx.close, 20)')
    expect(snippetOf('ta.oscillators', 'rsi')).toBe('ta.rsi(ctx.close, 14)')
    // Three optional periods would bury the call — leave them defaulted.
    expect(snippetOf('ta.oscillators', 'macd')).toBe('ta.macd(ctx.close)')
    expect(snippetOf('series', 'line')).toBe("series.line('value')")
    expect(snippetOf('input', 'int')).toBe("input.int('length', 14)")
    expect(snippetOf('ctx', 'close')).toBe('ctx.close')
    expect(snippetOf('color', 'up')).toBe('color.up')
    expect(snippetOf('pairlens', 'Meta')).toBeNull()
  })
})
