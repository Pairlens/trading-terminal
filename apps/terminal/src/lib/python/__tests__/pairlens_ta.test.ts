// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

/**
 * `pairlens_ta.py` is the `pairlens.ta` standard library. It only runs inside
 * Pyodide, so a Bun test cannot execute it — what it can do is hold the module
 * to the contract the runtime depends on:
 *
 * 1. the SPDX header every source file in this repo carries,
 * 2. the published function surface (indicator scripts import these by name),
 * 3. numpy as the module's only import — the worker preloads numpy and nothing
 *    else is guaranteed to be installable offline,
 * 4. a docstring on every public function (surfaced as editor hover docs),
 * 5. no `np.append` inside a loop — quadratic reallocation in the recursive
 *    indicators is the one performance trap that is easy to reintroduce.
 */

const SOURCE = readFileSync(
  join(import.meta.dir, '..', 'pairlens_ta.py'),
  'utf8',
)
const LINES = SOURCE.split('\n')

/** Public surface, grouped the way the module groups it. */
const REQUIRED_FUNCTIONS: Record<string, Array<string>> = {
  'moving averages & smoothing': [
    'sma',
    'ema',
    'wma',
    'rma',
    'hma',
    'vwma',
    'dema',
    'tema',
    'alma',
    'swma',
    'linreg',
  ],
  'bands & channels': [
    'bb',
    'bbw',
    'percent_b',
    'keltner',
    'donchian',
    'envelope',
    'supertrend',
  ],
  oscillators: [
    'rsi',
    'stoch',
    'stoch_rsi',
    'macd',
    'cci',
    'mfi',
    'willr',
    'roc',
    'mom',
    'tsi',
    'cmo',
    'uo',
    'ao',
    'trix',
    'ppo',
    'cmf',
  ],
  'volatility & range': [
    'tr',
    'atr',
    'natr',
    'stdev',
    'variance',
    'dev',
    'range_',
  ],
  'trend & directional': ['adx', 'dmi', 'aroon', 'psar', 'vortex', 'chop'],
  volume: ['obv', 'ad', 'vwap', 'pvt', 'eom', 'force_index'],
  'statistics & series helpers': [
    'highest',
    'lowest',
    'highest_bars',
    'lowest_bars',
    'change',
    'crossover',
    'crossunder',
    'cross',
    'rising',
    'falling',
    'barssince',
    'valuewhen',
    'cum',
    'correlation',
    'percentrank',
    'median',
    'mode_',
    'pivot_high',
    'pivot_low',
    'rescale',
    'normalize',
    'nz',
    'fill_forward',
  ],
  'candle & price helpers': ['hl2', 'hlc3', 'ohlc4', 'hlcc4', 'heikin_ashi'],
}

type PythonFunction = { name: string; line: number }

/** Every top-level `def name(...)` in the module, in source order. */
function topLevelFunctions(): Array<PythonFunction> {
  const found: Array<PythonFunction> = []
  LINES.forEach((text, line) => {
    const match = /^def ([A-Za-z_]\w*)\(/.exec(text)
    if (match) found.push({ name: match[1], line })
  })
  return found
}

/** Index of the line closing a (possibly multi-line) `def` signature. */
function signatureEnd(start: number): number {
  for (let line = start; line < LINES.length; line++) {
    if (LINES[line].trimEnd().endsWith(':')) return line
  }
  return start
}

/** Source lines with docstring bodies dropped, so prose is never read as code. */
function codeLines(): Array<string> {
  const code: Array<string> = []
  let inDocstring = false
  for (const text of LINES) {
    const fences = (text.match(/"""/g) ?? []).length
    if (inDocstring) {
      if (fences > 0) inDocstring = false
      continue
    }
    if (fences === 1) {
      inDocstring = true
      continue
    }
    code.push(text)
  }
  return code
}

/** Every line nested inside a `for` block, at any depth. */
function linesInsideForLoops(): Array<string> {
  const nested: Array<string> = []
  const loopIndents: Array<number> = []
  for (const text of CODE) {
    if (text.trim() === '') continue
    const indent = text.length - text.trimStart().length
    while (
      loopIndents.length > 0 &&
      indent <= loopIndents[loopIndents.length - 1]
    ) {
      loopIndents.pop()
    }
    if (loopIndents.length > 0) nested.push(text)
    if (/^\s*for\s.*:$/.test(text)) loopIndents.push(indent)
  }
  return nested
}

const CODE = codeLines()
const FUNCTIONS = topLevelFunctions()
const NAMES = new Set(FUNCTIONS.map((fn) => fn.name))
const PUBLIC = FUNCTIONS.filter((fn) => !fn.name.startsWith('_'))

describe('pairlens_ta.py', () => {
  it('carries the SPDX header', () => {
    expect(LINES[0]).toBe('# Copyright (c) 2026 Juan Ignacio Molina Estrada')
    expect(LINES[1]).toBe('# SPDX-License-Identifier: FSL-1.1-Apache-2.0')
  })

  it('opens with a module docstring showing the import form', () => {
    expect(LINES[2].startsWith('"""')).toBe(true)
    expect(SOURCE).toContain('from pairlens.ta import')
  })

  it('imports numpy and nothing else', () => {
    const imports = CODE.filter((text) => /^\s*(import|from)\s/.test(text))
    expect(imports).toEqual(['import numpy as np'])
  })

  it('defines no duplicate top-level functions', () => {
    expect(FUNCTIONS).toHaveLength(NAMES.size)
  })

  it('never grows an array with np.append inside a loop', () => {
    const offenders = linesInsideForLoops().filter((text) =>
      text.includes('np.append'),
    )
    expect(offenders).toEqual([])
  })

  it('documents every public function', () => {
    const undocumented = PUBLIC.filter((fn) => {
      const body = LINES[signatureEnd(fn.line) + 1] ?? ''
      return !body.trim().startsWith('"""')
    }).map((fn) => fn.name)
    expect(undocumented).toEqual([])
  })

  it('gives every public function a one-line docstring', () => {
    const sprawling = PUBLIC.filter((fn) => {
      const body = LINES[signatureEnd(fn.line) + 1] ?? ''
      return !body.trimEnd().endsWith('"""')
    }).map((fn) => fn.name)
    expect(sprawling).toEqual([])
  })

  for (const [group, names] of Object.entries(REQUIRED_FUNCTIONS)) {
    it(`implements every ${group} function`, () => {
      const missing = names.filter((name) => !NAMES.has(name))
      expect(missing).toEqual([])
    })
  }
})
