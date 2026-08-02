// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  parseIndicatorMeta,
  resolveParams,
  resolveSourceKey,
  trimPythonTraceback,
} from '../meta'
import type { CustomIndicatorInputSpec } from '@pairlens/shared/plugin-types'

// Exact dict shape produced by pairlens_sdk.py's Meta.to_dict() for the
// bundled RSI example (captured from a real interpreter run).
const RSI_META_DICT = {
  title: 'RSI',
  pane: 'separate',
  inputs: [
    { kind: 'int', key: 'length', default: 14, min: 2, max: 200 },
    { kind: 'source', key: 'src', default: 'close' },
  ],
  series: [
    {
      key: 'rsi',
      style: 'line',
      title: 'RSI',
      color: 'token:accent',
      width: 2,
    },
  ],
  hlines: [
    { value: 70, color: 'token:down' },
    { value: 30, color: 'token:up' },
  ],
  packages: ['numpy'],
  minBars: 15,
}

describe('parseIndicatorMeta', () => {
  it('accepts a full meta dict and stamps the host-provided id', () => {
    const meta = parseIndicatorMeta(RSI_META_DICT, 'script-1')
    expect(meta.id).toBe('script-1')
    expect(meta.title).toBe('RSI')
    expect(meta.pane).toBe('separate')
    expect(meta.inputs).toHaveLength(2)
    expect(meta.series[0]).toEqual({
      key: 'rsi',
      style: 'line',
      title: 'RSI',
      color: 'token:accent',
      width: 2,
    })
    expect(meta.hlines).toEqual([
      { value: 70, color: 'token:down' },
      { value: 30, color: 'token:up' },
    ])
    expect(meta.packages).toEqual(['numpy'])
    expect(meta.minBars).toBe(15)
  })

  it('accepts a minimal meta dict', () => {
    const meta = parseIndicatorMeta(
      {
        title: 'X',
        pane: 'overlay',
        inputs: [],
        series: [{ key: 'a', style: 'line' }],
      },
      'id',
    )
    expect(meta.hlines).toBeUndefined()
    expect(meta.packages).toBeUndefined()
    expect(meta.minBars).toBeUndefined()
  })

  it('normalizes bare-number hlines', () => {
    const meta = parseIndicatorMeta(
      {
        title: 'X',
        pane: 'separate',
        series: [{ key: 'a', style: 'line' }],
        hlines: [50],
      },
      'id',
    )
    expect(meta.hlines).toEqual([{ value: 50 }])
  })

  it('rejects non-object meta', () => {
    expect(() => parseIndicatorMeta(null, 'id')).toThrow(
      /meta = indicator\(\.\.\.\)/,
    )
  })

  it('rejects a bad pane', () => {
    expect(() =>
      parseIndicatorMeta(
        { title: 'X', pane: 'sub', series: [{ key: 'a', style: 'line' }] },
        'id',
      ),
    ).toThrow(/pane/)
  })

  it('rejects empty series', () => {
    expect(() =>
      parseIndicatorMeta({ title: 'X', pane: 'overlay', series: [] }, 'id'),
    ).toThrow(/series/)
  })

  it('rejects duplicate series keys', () => {
    expect(() =>
      parseIndicatorMeta(
        {
          title: 'X',
          pane: 'overlay',
          series: [
            { key: 'a', style: 'line' },
            { key: 'a', style: 'histogram' },
          ],
        },
        'id',
      ),
    ).toThrow(/duplicate series key/)
  })

  it('rejects an unknown input kind and a bad choice default', () => {
    const base = {
      title: 'X',
      pane: 'overlay',
      series: [{ key: 'a', style: 'line' }],
    }
    expect(() =>
      parseIndicatorMeta(
        { ...base, inputs: [{ kind: 'text', key: 'k', default: '' }] },
        'id',
      ),
    ).toThrow(/kind/)
    expect(() =>
      parseIndicatorMeta(
        {
          ...base,
          inputs: [
            { kind: 'choice', key: 'k', options: ['a', 'b'], default: 'c' },
          ],
        },
        'id',
      ),
    ).toThrow(/default/)
  })

  it('rejects a source default outside the known source keys', () => {
    expect(() =>
      parseIndicatorMeta(
        {
          title: 'X',
          pane: 'overlay',
          series: [{ key: 'a', style: 'line' }],
          inputs: [{ kind: 'source', key: 'src', default: 'median' }],
        },
        'id',
      ),
    ).toThrow(/default/)
  })

  it('rounds int defaults', () => {
    const meta = parseIndicatorMeta(
      {
        title: 'X',
        pane: 'overlay',
        series: [{ key: 'a', style: 'line' }],
        inputs: [{ kind: 'int', key: 'n', default: 14.6 }],
      },
      'id',
    )
    expect(meta.inputs[0]).toMatchObject({ kind: 'int', default: 15 })
  })
})

const INPUTS: Array<CustomIndicatorInputSpec> = [
  { kind: 'int', key: 'length', default: 14, min: 2, max: 200 },
  { kind: 'float', key: 'mult', default: 2.0, min: 0.1, max: 10 },
  { kind: 'bool', key: 'smooth', default: false },
  { kind: 'choice', key: 'mode', default: 'ema', options: ['ema', 'sma'] },
  { kind: 'source', key: 'src', default: 'close' },
]

describe('resolveParams', () => {
  it('falls back to defaults when user values are missing', () => {
    expect(resolveParams(INPUTS, {})).toEqual({
      length: 14,
      mult: 2.0,
      smooth: false,
      mode: 'ema',
      src: 'close',
    })
  })

  it('overlays valid user values', () => {
    expect(
      resolveParams(INPUTS, {
        length: 21,
        mult: 3.5,
        smooth: true,
        mode: 'sma',
        src: 'hl2',
      }),
    ).toEqual({ length: 21, mult: 3.5, smooth: true, mode: 'sma', src: 'hl2' })
  })

  it('clamps numbers to min/max and rounds int inputs', () => {
    const resolved = resolveParams(INPUTS, { length: 1000.4, mult: 0.01 })
    expect(resolved.length).toBe(200)
    expect(resolved.mult).toBe(0.1)
    expect(resolveParams(INPUTS, { length: 14.5 }).length).toBe(15)
  })

  it('rejects wrong-typed and out-of-domain values', () => {
    const resolved = resolveParams(INPUTS, {
      length: 'twenty',
      mult: Number.NaN,
      smooth: 'yes',
      mode: 'wma',
      src: 'median',
    })
    expect(resolved).toEqual({
      length: 14,
      mult: 2.0,
      smooth: false,
      mode: 'ema',
      src: 'close',
    })
  })
})

describe('resolveSourceKey', () => {
  it('reads the resolved source input value', () => {
    expect(resolveSourceKey(INPUTS, { src: 'ohlc4' })).toBe('ohlc4')
  })

  it('defaults to close when no source input is declared', () => {
    expect(resolveSourceKey([INPUTS[0]], { length: 14 })).toBe('close')
  })
})

describe('trimPythonTraceback', () => {
  const traceback = [
    'Traceback (most recent call last):',
    '  File "/lib/python314.zip/_pyodide/_base.py", line 597, in eval_code',
    '    .run(globals, locals)',
    '  File "/lib/python3.14/site-packages/pairlens.py", line 300, in _compute',
    "    result = entry['compute'](ctx)",
    '  File "<indicator:rsi>", line 24, in compute',
    "    raise ValueError('boom')",
    'ValueError: boom',
  ].join('\n')

  it('drops pyodide-internal frames, keeping user frames + exception', () => {
    expect(trimPythonTraceback(traceback)).toBe(
      [
        'Traceback (most recent call last):',
        '  File "<indicator:rsi>", line 24, in compute',
        "    raise ValueError('boom')",
        'ValueError: boom',
      ].join('\n'),
    )
  })

  it('returns the input untouched when there is no user frame', () => {
    const noUserFrame = 'Traceback (most recent call last):\nValueError: boom'
    expect(trimPythonTraceback(noUserFrame)).toBe(noUserFrame)
    expect(trimPythonTraceback('plain error')).toBe('plain error')
  })

  it('keeps helper-module frames under their editor file names', () => {
    const multiFile = [
      'Traceback (most recent call last):',
      '  File "/lib/python3.14/site-packages/pairlens.py", line 300, in _compute',
      "    result = entry['compute'](ctx)",
      '  File "<indicator:bb>", line 30, in compute',
      '    basis = rolling_mean(src, length)',
      '  File "/pairlens_indicators/bb/stats.py", line 12, in rolling_mean',
      '    return cumsum[length:] / length',
      'ZeroDivisionError: division by zero',
    ].join('\n')

    expect(trimPythonTraceback(multiFile)).toBe(
      [
        'Traceback (most recent call last):',
        '  File "<indicator:bb>", line 30, in compute',
        '    basis = rolling_mean(src, length)',
        '  File "stats.py", line 12, in rolling_mean',
        '    return cumsum[length:] / length',
        'ZeroDivisionError: division by zero',
      ].join('\n'),
    )
  })

  it('drops the import machinery around a failing helper module', () => {
    const importError = [
      'Traceback (most recent call last):',
      '  File "/lib/python3.14/site-packages/pairlens.py", line 280, in _register_script',
      '    exec(code, ns)',
      '  File "<indicator:bb>", line 5, in <module>',
      '    from stats import rolling_mean',
      '  File "<frozen importlib._bootstrap>", line 1360, in _find_and_load',
      '  File "<frozen importlib._bootstrap_external>", line 999, in exec_module',
      '    exec(code, module.__dict__)',
      '  File "/pairlens_indicators/bb/stats.py", line 3, in <module>',
      '    import nope',
      "ModuleNotFoundError: No module named 'nope'",
    ].join('\n')

    expect(trimPythonTraceback(importError)).toBe(
      [
        'Traceback (most recent call last):',
        '  File "<indicator:bb>", line 5, in <module>',
        '    from stats import rolling_mean',
        '  File "stats.py", line 3, in <module>',
        '    import nope',
        "ModuleNotFoundError: No module named 'nope'",
      ].join('\n'),
    )
  })
})
