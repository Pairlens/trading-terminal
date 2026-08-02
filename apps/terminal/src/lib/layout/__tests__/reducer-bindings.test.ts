// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { layoutReducer } from '../reducer'
import type { TerminalLayout, WorkspaceVariableDefinition } from '../types'

const NO_DEFS = {}

function makeLayout(): TerminalLayout {
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
            panes: [
              { id: 'p1', type: 'chart' },
              { id: 'p2', type: 'orderbook' },
            ],
          },
        ],
      },
    ],
  }
}

function paneById(layout: TerminalLayout, id: string) {
  for (const col of layout.columns) {
    for (const cell of col.cells) {
      const pane = cell.panes.find((p) => p.id === id)
      if (pane) return pane
    }
  }
  return null
}

describe('pane override actions', () => {
  it('sets and clears overrides per slot', () => {
    let layout = makeLayout()
    layout = layoutReducer(
      layout,
      {
        type: 'SET_PANE_OVERRIDE',
        paneId: 'p1',
        slot: 'active-pair',
        value: { pairKey: 'BTC-USDT', market: 'okx' },
      },
      NO_DEFS,
    )
    expect(paneById(layout, 'p1')?.overrides?.['active-pair']).toEqual({
      pairKey: 'BTC-USDT',
      market: 'okx',
    })

    layout = layoutReducer(
      layout,
      { type: 'CLEAR_PANE_OVERRIDE', paneId: 'p1', slot: 'active-pair' },
      NO_DEFS,
    )
    expect(paneById(layout, 'p1')?.overrides).toBeUndefined()
  })
})

describe('pane binding actions', () => {
  it('sets and clears bindings per slot', () => {
    let layout = makeLayout()
    layout = layoutReducer(
      layout,
      {
        type: 'SET_PANE_BINDING',
        paneId: 'p1',
        slot: 'active-pair',
        variableName: '$coin',
      },
      NO_DEFS,
    )
    layout = layoutReducer(
      layout,
      {
        type: 'SET_PANE_BINDING',
        paneId: 'p1',
        slot: 'active-timeframe',
        variableName: '$tf',
      },
      NO_DEFS,
    )
    expect(paneById(layout, 'p1')?.bindings).toEqual({
      'active-pair': '$coin',
      'active-timeframe': '$tf',
    })

    layout = layoutReducer(
      layout,
      { type: 'CLEAR_PANE_BINDING', paneId: 'p1', slot: 'active-pair' },
      NO_DEFS,
    )
    expect(paneById(layout, 'p1')?.bindings).toEqual({
      'active-timeframe': '$tf',
    })
  })
})

describe('RECONCILE_BINDINGS', () => {
  const variables: Array<WorkspaceVariableDefinition> = [
    { name: '$coin', label: 'Coin', type: 'pair' },
    { name: '$tf', label: 'TF', type: 'timeframe' },
  ]

  function boundLayout(): TerminalLayout {
    let layout = makeLayout()
    layout = layoutReducer(
      layout,
      {
        type: 'SET_PANE_BINDING',
        paneId: 'p1',
        slot: 'active-pair',
        variableName: '$coin',
      },
      NO_DEFS,
    )
    layout = layoutReducer(
      layout,
      {
        type: 'SET_PANE_BINDING',
        paneId: 'p2',
        slot: 'active-pair',
        variableName: '$deleted',
      },
      NO_DEFS,
    )
    return layout
  }

  it('drops bindings to deleted variables, keeps valid ones', () => {
    const layout = layoutReducer(
      boundLayout(),
      { type: 'RECONCILE_BINDINGS', variables },
      NO_DEFS,
    )
    expect(paneById(layout, 'p1')?.bindings).toEqual({
      'active-pair': '$coin',
    })
    expect(paneById(layout, 'p2')?.bindings).toBeUndefined()
  })

  it('drops bindings whose variable was retyped away from the slot type', () => {
    let layout = makeLayout()
    layout = layoutReducer(
      layout,
      {
        type: 'SET_PANE_BINDING',
        paneId: 'p1',
        slot: 'active-pair',
        variableName: '$coin',
      },
      NO_DEFS,
    )
    // $coin becomes a timeframe variable — the pair binding must go
    layout = layoutReducer(
      layout,
      {
        type: 'RECONCILE_BINDINGS',
        variables: [{ name: '$coin', label: 'Coin', type: 'timeframe' }],
      },
      NO_DEFS,
    )
    expect(paneById(layout, 'p1')?.bindings).toBeUndefined()
  })

  it('returns the same state reference when nothing changes', () => {
    let layout = makeLayout()
    layout = layoutReducer(
      layout,
      {
        type: 'SET_PANE_BINDING',
        paneId: 'p1',
        slot: 'active-pair',
        variableName: '$coin',
      },
      NO_DEFS,
    )
    const next = layoutReducer(
      layout,
      { type: 'RECONCILE_BINDINGS', variables },
      NO_DEFS,
    )
    expect(next).toBe(layout)
  })
})
