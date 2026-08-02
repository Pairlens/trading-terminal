// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_TIMEFRAME,
  addRow,
  collectVariableUsage,
  countVariableBindings,
  createVariable,
  defaultValueForType,
  ensureUniqueName,
  isBindingValid,
  labelToName,
  reconcileValues,
  removeRow,
  rowsFromVariables,
  updateRow,
  valueMatchesType,
  variablesFromRows,
} from '../variable-utils'
import type { TerminalLayout, WorkspaceVariableDefinition } from '../types'

function pairVar(name: string, label = name): WorkspaceVariableDefinition {
  return { name, label, type: 'pair' }
}

function layoutWithBindings(
  bindings: Array<Record<string, string> | undefined>,
): TerminalLayout {
  return {
    version: 1,
    columns: [
      {
        id: 'col',
        widthPercent: 100,
        cells: [
          {
            id: 'cell',
            heightPercent: 100,
            activeTabIndex: 0,
            panes: bindings.map((b, i) => ({
              id: `pane-${i}`,
              type: 'chart',
              bindings: b,
            })),
          },
        ],
      },
    ],
  }
}

describe('labelToName', () => {
  it('slugs labels into $names', () => {
    expect(labelToName('Coin 1')).toBe('$coin_1')
    expect(labelToName('  BTC / Spot  ')).toBe('$btc_spot')
    expect(labelToName('ÄÖÜ')).toBe('$var') // no ascii chars left
    expect(labelToName('')).toBe('$var')
  })
})

describe('ensureUniqueName', () => {
  it('suffixes on collision', () => {
    const taken = new Set(['$coin', '$coin_2'])
    expect(ensureUniqueName('$coin', taken)).toBe('$coin_3')
    expect(ensureUniqueName('$other', taken)).toBe('$other')
  })
})

describe('createVariable', () => {
  it('creates unique names and labels', () => {
    const existing = [pairVar('$variable_1', 'Variable 1')]
    const v = createVariable(existing)
    expect(v.label).toBe('Variable 2')
    expect(v.name).toBe('$variable_2')
    expect(v.type).toBe('pair')
  })
})

describe('valueMatchesType', () => {
  it('validates pair values', () => {
    expect(
      valueMatchesType('pair', { pairKey: 'BTC-USDT', market: 'okx' }),
    ).toBe(true)
    expect(valueMatchesType('pair', { pairKey: 'BTC-USDT' })).toBe(false)
    expect(valueMatchesType('pair', 'BTC-USDT')).toBe(false)
    expect(valueMatchesType('pair', null)).toBe(false)
  })

  it('validates wallet values', () => {
    expect(valueMatchesType('wallet', { walletId: 'w1', market: 'okx' })).toBe(
      true,
    )
    expect(valueMatchesType('wallet', { walletId: '' })).toBe(false)
  })

  it('validates timeframe and string values', () => {
    expect(valueMatchesType('timeframe', '1h')).toBe(true)
    expect(valueMatchesType('timeframe', '')).toBe(false)
    expect(valueMatchesType('string', '')).toBe(true)
    expect(valueMatchesType('string', 42)).toBe(false)
  })
})

describe('reconcileValues', () => {
  it('drops values for removed variables', () => {
    const result = reconcileValues([pairVar('$a')], {
      $a: { pairKey: 'BTC-USDT', market: 'okx' },
      $gone: { pairKey: 'ETH-USDT', market: 'okx' },
    })
    expect(result.changed).toBe(true)
    expect(Object.keys(result.values)).toEqual(['$a'])
  })

  it('drops values whose shape no longer matches after a type change', () => {
    const defs: Array<WorkspaceVariableDefinition> = [
      { name: '$x', label: 'X', type: 'timeframe' },
    ]
    const result = reconcileValues(defs, {
      $x: { pairKey: 'BTC-USDT', market: 'okx' }, // was a pair variable
    })
    expect(result.changed).toBe(true)
    // Falls back to the per-type default for timeframes
    expect(result.values['$x']).toBe(DEFAULT_TIMEFRAME)
  })

  it('fills missing values from the definition default', () => {
    const defs: Array<WorkspaceVariableDefinition> = [
      { name: '$tf', label: 'TF', type: 'timeframe', defaultValue: '4h' },
    ]
    const result = reconcileValues(defs, {})
    expect(result.changed).toBe(true)
    expect(result.values['$tf']).toBe('4h')
  })

  it('ignores defaults whose shape mismatches the type', () => {
    const defs: Array<WorkspaceVariableDefinition> = [
      { name: '$tf', label: 'TF', type: 'timeframe', defaultValue: 42 },
    ]
    const result = reconcileValues(defs, {})
    expect(result.values['$tf']).toBe(DEFAULT_TIMEFRAME)
  })

  it('reports unchanged when values already align', () => {
    const values = { $a: { pairKey: 'BTC-USDT', market: 'okx' } }
    const result = reconcileValues([pairVar('$a')], values)
    expect(result.changed).toBe(false)
    expect(result.values).toBe(values) // same reference — no churn
  })
})

describe('isBindingValid', () => {
  const defs: Array<WorkspaceVariableDefinition> = [
    { name: '$coin', label: 'Coin', type: 'pair' },
    { name: '$tf', label: 'TF', type: 'timeframe' },
  ]

  it('accepts a matching type for the slot', () => {
    expect(isBindingValid('active-pair', '$coin', defs)).toBe(true)
    expect(isBindingValid('active-timeframe', '$tf', defs)).toBe(true)
  })

  it('rejects deleted variables', () => {
    expect(isBindingValid('active-pair', '$gone', defs)).toBe(false)
  })

  it('rejects retyped variables', () => {
    expect(isBindingValid('active-pair', '$tf', defs)).toBe(false)
  })
})

describe('countVariableBindings / collectVariableUsage', () => {
  it('counts bindings across panes and layouts', () => {
    const layout = layoutWithBindings([
      { 'active-pair': '$coin' },
      { 'active-pair': '$coin', 'active-timeframe': '$tf' },
      undefined,
    ])
    expect(countVariableBindings(layout, '$coin')).toBe(2)
    expect(countVariableBindings(layout, '$tf')).toBe(1)
    expect(countVariableBindings(null, '$coin')).toBe(0)

    const usage = collectVariableUsage(
      [layout, layout],
      [pairVar('$coin'), { name: '$tf', label: 'TF', type: 'timeframe' }],
    )
    expect(usage['$coin']).toBe(4)
    expect(usage['$tf']).toBe(2)
  })
})

describe('editor rows', () => {
  it('freezes names for pre-existing variables on rename', () => {
    const rows = rowsFromVariables([pairVar('$coin_1', 'Coin 1')])
    const updated = updateRow(rows, '$coin_1', { label: 'Renamed Coin' })
    expect(updated[0].def.label).toBe('Renamed Coin')
    expect(updated[0].def.name).toBe('$coin_1') // identity survives
  })

  it('re-derives names for rows added in this session', () => {
    let rows = rowsFromVariables([pairVar('$coin_1', 'Coin 1')])
    rows = addRow(rows)
    const newKey = rows[1].key
    rows = updateRow(rows, newKey, { label: 'My Coin' })
    expect(rows[1].def.name).toBe('$my_coin')
    // Colliding label gets a suffix instead of stealing the name
    rows = updateRow(rows, newKey, { label: 'Coin 1' })
    expect(rows[1].def.name).toBe('$coin_1_2')
  })

  it('resets defaultValue when the type changes', () => {
    let rows = rowsFromVariables([
      { name: '$x', label: 'X', type: 'string', defaultValue: 'hello' },
    ])
    rows = updateRow(rows, '$x', { type: 'timeframe' })
    expect(rows[0].def.defaultValue).toBe(DEFAULT_TIMEFRAME)
    rows = updateRow(rows, '$x', { type: 'pair' })
    expect(rows[0].def.defaultValue).toBeUndefined()
  })

  it('round-trips rows to definitions and removes by key', () => {
    let rows = rowsFromVariables([pairVar('$a'), pairVar('$b')])
    rows = removeRow(rows, '$a')
    expect(variablesFromRows(rows).map((v) => v.name)).toEqual(['$b'])
  })
})

describe('defaultValueForType', () => {
  it('only timeframes have an implicit default', () => {
    expect(defaultValueForType('timeframe')).toBe(DEFAULT_TIMEFRAME)
    expect(defaultValueForType('pair')).toBeUndefined()
    expect(defaultValueForType('wallet')).toBeUndefined()
    expect(defaultValueForType('string')).toBeUndefined()
  })
})
