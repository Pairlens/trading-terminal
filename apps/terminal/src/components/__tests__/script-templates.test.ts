// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The Python a starter template creates cannot be executed under `bun test`
// (that needs Pyodide), so this checks the things that break templates in
// practice and are checkable statically:
//
//  - a top-level `meta = indicator(...)` / `meta = strategy(...)`. A script
//    without it registers with meta undefined, which is the crash that once
//    blanked the whole indicator picker;
//  - a `compute(ctx)` to go with it;
//  - every name imported from `pairlens` / `pairlens.ta` actually exists in
//    the shipped SDK sources — the same agreement check `sdk-completions`
//    runs, applied to the templates;
//  - helper modules exist for the entry's local imports;
//  - the bot shelf only ever offers `strategy(...)` scripts, because an
//    indicator cannot be deployed.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

import { botTemplates } from '../bots/bot-templates'
import { indicatorTemplates } from '../indicators/indicator-templates'

/** i18n stands in as identity — this file is about the Python, not the copy. */
const t = (key: string) => key

const PY_DIR = join(import.meta.dir, '..', '..', 'lib', 'python')
const SDK_SOURCE = readFileSync(join(PY_DIR, 'pairlens_sdk.py'), 'utf8')
const TA_SOURCE = readFileSync(join(PY_DIR, 'pairlens_ta.py'), 'utf8')

/** Top-level names a Python module defines: def/class/assignment. */
function topLevelNames(source: string): Set<string> {
  const names = new Set<string>()
  for (const match of source.matchAll(/^(?:def|class)\s+([A-Za-z_]\w*)/gm)) {
    names.add(match[1])
  }
  for (const match of source.matchAll(/^([A-Za-z_]\w*)\s*(?::[^=\n]+)?=/gm)) {
    names.add(match[1])
  }
  return names
}

const SDK_NAMES = topLevelNames(SDK_SOURCE)
const TA_NAMES = topLevelNames(TA_SOURCE)

/** `from pairlens import a, b` / `from pairlens.ta import c` — names only. */
function importedNames(source: string, module: string): Array<string> {
  const pattern = new RegExp(
    `^from\\s+${module.replace('.', '\\.')}\\s+import\\s+(.+)$`,
    'gm',
  )
  const names: Array<string> = []
  for (const match of source.matchAll(pattern)) {
    for (const raw of match[1].split(',')) {
      const name = raw
        .trim()
        .split(/\s+as\s+/)[0]
        .trim()
      if (name) names.push(name)
    }
  }
  return names
}

/** Local `from <mod> import ...` / `import <mod>` that is not stdlib/SDK. */
function localModules(source: string): Array<string> {
  const known = new Set(['numpy', 'np', 'math', 'pairlens'])
  const mods = new Set<string>()
  for (const match of source.matchAll(/^from\s+([A-Za-z_]\w*)\s+import/gm)) {
    if (!known.has(match[1])) mods.add(match[1])
  }
  for (const match of source.matchAll(/^import\s+([A-Za-z_]\w*)/gm)) {
    if (!known.has(match[1])) mods.add(match[1])
  }
  return [...mods]
}

function checkScript(source: string, metaKind: 'indicator' | 'strategy') {
  // The meta assignment must be top level, not nested inside a function.
  expect(source).toMatch(new RegExp(`^meta = ${metaKind}\\(`, 'm'))
  expect(source).toMatch(/^def compute\(ctx\):/m)

  for (const name of importedNames(source, 'pairlens')) {
    expect({ name, inSdk: SDK_NAMES.has(name) }).toEqual({ name, inSdk: true })
  }
  for (const name of importedNames(source, 'pairlens.ta')) {
    expect({ name, inTa: TA_NAMES.has(name) }).toEqual({ name, inTa: true })
  }
}

describe('indicator starter templates', () => {
  const templates = indicatorTemplates(t)

  it('offers a shelf of between three and six', () => {
    expect(templates.length).toBeGreaterThanOrEqual(3)
    expect(templates.length).toBeLessThanOrEqual(6)
  })

  it('uses unique ids and resolves every dressing to an example', () => {
    const ids = templates.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(
      templates.every((template) => template.example.source.length > 0),
    ).toBe(true)
  })

  it('offers only plottable indicators — strategies live on the Bots page', () => {
    expect(
      templates.filter((template) => template.example.kind !== 'indicator'),
    ).toEqual([])
  })

  for (const template of templates) {
    it(`"${template.title}" is a valid indicator script`, () => {
      checkScript(template.example.source, 'indicator')
    })

    it(`"${template.title}" ships every module it imports`, () => {
      const paths = new Set(
        (template.example.modules ?? []).map((module) =>
          module.path.replace(/\.py$/, ''),
        ),
      )
      for (const module of localModules(template.example.source)) {
        expect({ module, shipped: paths.has(module) }).toEqual({
          module,
          shipped: true,
        })
      }
    })
  }
})

describe('bot starter templates', () => {
  const templates = botTemplates(t)

  it('offers a shelf of between three and four', () => {
    expect(templates.length).toBeGreaterThanOrEqual(3)
    expect(templates.length).toBeLessThanOrEqual(4)
  })

  it('uses unique ids', () => {
    const ids = templates.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('offers only deployable strategies', () => {
    expect(
      templates.filter((template) => template.example.kind !== 'strategy'),
    ).toEqual([])
  })

  for (const template of templates) {
    it(`"${template.title}" is a valid strategy script`, () => {
      checkScript(template.example.source, 'strategy')
    })

    it(`"${template.title}" declares sizing and a protective exit`, () => {
      // A bot the user can arm live with no stop is the one shape of template
      // this shelf must never hand out.
      expect(template.example.source).toMatch(/^\s*position_size=/m)
      expect(template.example.source).toMatch(
        /^\s*(?:stop_loss|trailing_stop)=/m,
      )
    })
  }
})
