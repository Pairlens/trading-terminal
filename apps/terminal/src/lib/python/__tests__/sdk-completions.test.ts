// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'

import {
  MEMBER_COMPLETIONS,
  PAIRLENS_COMPLETIONS,
  SDK_NAMESPACES,
  TA_COMPLETIONS,
  lookupSdkSymbol,
} from '../sdk-completions'

import type { SdkCompletion } from '../sdk-completions'

const read = (name: string) =>
  readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')

const SDK_SOURCE = read('pairlens_sdk.py')
const TA_SOURCE = read('pairlens_ta.py')

const VALID_TYPES = new Set([
  'function',
  'property',
  'class',
  'namespace',
  'keyword',
])

/** `ctx` is the compute() argument, not something `pairlens` exports by name. */
const CTX_NAMESPACE = 'ctx'

const GROUPS: Array<[string, Array<SdkCompletion>]> = [
  ['pairlens', PAIRLENS_COMPLETIONS],
  ...Object.entries(MEMBER_COMPLETIONS),
]

/** Public (non-underscore) top-level `def`/`class` names in a Python module. */
function pythonTopLevelNames(source: string): Array<string> {
  const names: Array<string> = []
  for (const match of source.matchAll(/^(?:def|class)\s+([A-Za-z_]\w*)/gm)) {
    if (!match[1].startsWith('_')) names.push(match[1])
  }
  return names
}

describe('completion data shape', () => {
  it.each(GROUPS)('%s: labels are unique', (_group, entries) => {
    const labels = entries.map((entry) => entry.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it.each(GROUPS)('%s: every entry is documented', (group, entries) => {
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.label, `${group} entry with empty label`).toMatch(/^\w+$/)
      expect(VALID_TYPES.has(entry.type), `${group}.${entry.label} type`).toBe(
        true,
      )
      expect(
        (entry.info ?? '').trim().length,
        `${group}.${entry.label} has no info`,
      ).toBeGreaterThan(20)
      expect(
        (entry.detail ?? '').trim().length,
        `${group}.${entry.label} has no detail`,
      ).toBeGreaterThan(0)
    }
  })

  it('exposes every member namespace through SDK_NAMESPACES', () => {
    expect([...SDK_NAMESPACES].sort()).toEqual(
      Object.keys(MEMBER_COMPLETIONS).sort(),
    )
  })

  it('keys MEMBER_COMPLETIONS by namespaces the SDK actually exposes', () => {
    const declared = new Set(
      PAIRLENS_COMPLETIONS.filter((entry) => entry.type === 'namespace').map(
        (entry) => entry.label,
      ),
    )
    for (const namespace of Object.keys(MEMBER_COMPLETIONS)) {
      if (namespace === CTX_NAMESPACE) continue
      expect(
        declared.has(namespace),
        `${namespace} is not a pairlens export`,
      ).toBe(true)
    }
  })

  it('gives every declared namespace a member list', () => {
    for (const entry of PAIRLENS_COMPLETIONS) {
      if (entry.type !== 'namespace') continue
      expect(
        MEMBER_COMPLETIONS[entry.label],
        `${entry.label} has no members`,
      ).toBeDefined()
    }
  })
})

describe('pairlens_sdk.py agreement', () => {
  it('claims only names the module defines', () => {
    for (const entry of PAIRLENS_COMPLETIONS) {
      if (entry.label === 'ta') continue // a submodule, checked below
      const pattern =
        entry.type === 'class'
          ? new RegExp(`^class ${entry.label}\\b`, 'm')
          : entry.type === 'namespace'
            ? new RegExp(`^${entry.label} = _`, 'm')
            : new RegExp(`^def ${entry.label}\\(`, 'm')
      expect(
        pattern.test(SDK_SOURCE),
        `pairlens.${entry.label} is missing`,
      ).toBe(true)
    }
  })

  it('documents every public name the module defines', () => {
    const documented = new Set(PAIRLENS_COMPLETIONS.map((e) => e.label))
    for (const name of pythonTopLevelNames(SDK_SOURCE)) {
      expect(documented.has(name), `pairlens.${name} is undocumented`).toBe(
        true,
      )
    }
    for (const match of SDK_SOURCE.matchAll(/^([a-z_]\w*) = _[A-Z]\w*\(\)/gm)) {
      expect(
        documented.has(match[1]),
        `pairlens.${match[1]} is undocumented`,
      ).toBe(true)
    }
  })

  it('ships `ta` as an importable submodule', () => {
    expect(TA_SOURCE.length).toBeGreaterThan(0)
    expect(SDK_SOURCE).toContain('pairlens.ta')
  })

  it.each(
    Object.entries(MEMBER_COMPLETIONS).filter(
      ([namespace]) => !['color', CTX_NAMESPACE, 'ta'].includes(namespace),
    ),
  )('%s: every member is a builder in the module', (namespace, entries) => {
    for (const entry of entries) {
      expect(
        new RegExp(`^    def ${entry.label}\\(`, 'm').test(SDK_SOURCE),
        `${namespace}.${entry.label} is missing`,
      ).toBe(true)
    }
  })

  it('color: every token exists', () => {
    for (const entry of MEMBER_COMPLETIONS.color) {
      expect(SDK_SOURCE, `color.${entry.label}`).toContain(
        `    ${entry.label} = 'token:`,
      )
    }
  })

  it('ctx: every attribute exists on Context', () => {
    for (const entry of MEMBER_COMPLETIONS.ctx) {
      const pattern =
        entry.type === 'function'
          ? new RegExp(`^    def ${entry.label}\\(`, 'm')
          : new RegExp(`^        self\\.${entry.label} = `, 'm')
      expect(pattern.test(SDK_SOURCE), `ctx.${entry.label} is missing`).toBe(
        true,
      )
    }
  })
})

describe('pairlens_ta.py agreement', () => {
  it('claims only functions the module defines', () => {
    for (const entry of TA_COMPLETIONS) {
      expect(
        new RegExp(`^def ${entry.label}\\(`, 'm').test(TA_SOURCE),
        `ta.${entry.label} is missing`,
      ).toBe(true)
    }
  })

  it('documents every public function the module defines', () => {
    const documented = new Set(TA_COMPLETIONS.map((entry) => entry.label))
    for (const name of pythonTopLevelNames(TA_SOURCE)) {
      expect(documented.has(name), `ta.${name} is undocumented`).toBe(true)
    }
  })
})

describe('lookupSdkSymbol', () => {
  it('resolves qualified members', () => {
    expect(lookupSdkSymbol('int', 'input')?.detail).toContain('key, default=0')
    expect(lookupSdkSymbol('close', 'ctx')?.type).toBe('property')
    expect(lookupSdkSymbol('ema', 'ta')?.type).toBe('function')
  })

  it('resolves bare SDK and ta names', () => {
    expect(lookupSdkSymbol('indicator')?.type).toBe('function')
    expect(lookupSdkSymbol('crossover')?.type).toBe('function')
  })

  it('reads members off the pairlens module itself', () => {
    expect(lookupSdkSymbol('hline', 'pairlens')?.type).toBe('function')
  })

  it('does not invent docs for unknown or mismatched symbols', () => {
    expect(lookupSdkSymbol('numpy')).toBeNull()
    expect(lookupSdkSymbol('int', 'np')).toBeNull()
    expect(lookupSdkSymbol('close')).toBeNull()
  })
})
