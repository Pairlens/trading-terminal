// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  uniqueWorkspaceName,
  workspaceParamsFromLayout,
} from '../save-workspace'
import type { PaneDefinition, PaneInstance, TerminalLayout } from '../types'

/** A stand-in for the live registry, mirroring pairlens-core's declarations. */
function definition(
  type: string,
  requires?: Array<string>,
): [string, PaneDefinition] {
  return [type, { type, labelKey: `panes.${type}`, icon: 'Box', requires }]
}

const DEFINITIONS: Record<string, PaneDefinition> = Object.fromEntries([
  definition('chart', ['workspace:active-pair']),
  definition('orderbook', ['workspace:active-pair']),
  definition('trades', ['workspace:active-pair']),
  definition('trade-entry', [
    'workspace:active-pair',
    'workspace:active-wallet',
  ]),
  definition('positions', ['workspace:active-wallet']),
  definition('watchlist'),
  // A pane contributed by a plugin the catalog's static list can't know about.
  definition('acme-flow', ['workspace:active-pair']),
])

function layoutOf(
  ...panes: Array<{ type: string; bindings?: Record<string, string> }>
): TerminalLayout {
  return {
    version: 1,
    columns: [
      {
        id: 'col-1',
        widthPercent: 100,
        cells: [
          {
            id: 'cell-1',
            activeTabIndex: 0,
            heightPercent: 100,
            panes: panes.map(
              (p, i): PaneInstance => ({
                id: `pane-${i}`,
                type: p.type,
                ...(p.bindings ? { bindings: p.bindings } : {}),
              }),
            ),
          },
        ],
      },
    ],
  }
}

function panesOf(layout: TerminalLayout): Array<PaneInstance> {
  return layout.columns.flatMap((c) => c.cells.flatMap((cell) => cell.panes))
}

function save(input: Partial<Parameters<typeof workspaceParamsFromLayout>[0]>) {
  return workspaceParamsFromLayout({
    layout: layoutOf({ type: 'chart' }),
    paneDefinitions: DEFINITIONS,
    name: 'Test',
    ...input,
  })
}

describe('workspaceParamsFromLayout', () => {
  test('derives a $pair variable and binds every pane that needs one', () => {
    const params = save({
      layout: layoutOf(
        { type: 'chart' },
        { type: 'orderbook' },
        { type: 'trades' },
      ),
      activePair: { pairKey: 'SOL-USDT', market: 'okx' },
    })

    expect(params.variables).toEqual([
      {
        name: '$pair',
        label: 'Pair',
        type: 'pair',
        defaultValue: { pairKey: 'SOL-USDT', market: 'okx' },
      },
    ])
    for (const pane of panesOf(params.defaultLayout)) {
      expect(pane.bindings?.['active-pair']).toBe('$pair')
    }
  })

  test('reads requirements from the registry, so plugin panes are covered', () => {
    const params = save({ layout: layoutOf({ type: 'acme-flow' }) })
    expect(params.variables.map((v) => v.type)).toEqual(['pair'])
    expect(panesOf(params.defaultLayout)[0].bindings).toEqual({
      'active-pair': '$pair',
    })
  })

  test('leaves a variable undefaulted when the surface has nothing to seed', () => {
    const params = save({ layout: layoutOf({ type: 'chart' }) })
    expect(params.variables[0].defaultValue).toBeUndefined()
  })

  test('derives a $wallet variable only when a pane needs one', () => {
    expect(
      save({ layout: layoutOf({ type: 'chart' }) }).variables,
    ).toHaveLength(1)

    const withWallet = save({
      layout: layoutOf({ type: 'chart' }, { type: 'positions' }),
      activeWallet: { walletId: 'okx-main', market: 'okx' },
    })
    expect(withWallet.variables.map((v) => v.type)).toEqual(['pair', 'wallet'])
    expect(withWallet.variables[1].defaultValue).toEqual({
      walletId: 'okx-main',
      market: 'okx',
    })
    // Only the wallet-consuming pane is bound to it.
    const [chart, positions] = panesOf(withWallet.defaultLayout)
    expect(chart.bindings).toEqual({ 'active-pair': '$pair' })
    expect(positions.bindings).toEqual({ 'active-wallet': '$wallet' })
  })

  test('binds both slots on a pane that needs both', () => {
    const params = save({ layout: layoutOf({ type: 'trade-entry' }) })
    expect(panesOf(params.defaultLayout)[0].bindings).toEqual({
      'active-pair': '$pair',
      'active-wallet': '$wallet',
    })
  })

  test('adds no variables for a layout whose panes need none', () => {
    const params = save({
      layout: layoutOf({ type: 'watchlist' }),
      activePair: { pairKey: 'SOL-USDT', market: 'okx' },
    })
    expect(params.variables).toEqual([])
    expect(panesOf(params.defaultLayout)[0].bindings).toBeUndefined()
  })

  test('uses translated labels when the caller supplies them', () => {
    const params = save({
      layout: layoutOf({ type: 'trade-entry' }),
      labels: { pair: 'Paar', wallet: 'Konto' },
    })
    expect(params.variables.map((v) => v.label)).toEqual(['Paar', 'Konto'])
  })

  test('keeps a custom workspace’s own variables and bindings', () => {
    const params = save({
      layout: layoutOf({
        type: 'chart',
        bindings: { 'active-pair': '$coin2' },
      }),
      variables: [
        { name: '$coin1', label: 'Coin 1', type: 'pair' },
        { name: '$coin2', label: 'Coin 2', type: 'pair' },
      ],
      // A route pair must not leak in and overwrite the workspace's own
      // variables — the source already answers "what is this pane showing".
      activePair: { pairKey: 'DOGE-USDT', market: 'okx' },
    })

    expect(params.variables.map((v) => v.name)).toEqual(['$coin1', '$coin2'])
    expect(params.variables.every((v) => v.defaultValue === undefined)).toBe(
      true,
    )
    expect(panesOf(params.defaultLayout)[0].bindings).toEqual({
      'active-pair': '$coin2',
    })
  })

  test('normalizes the captured layout', () => {
    const skewed: TerminalLayout = {
      version: 1,
      columns: [
        { id: 'a', widthPercent: 30, cells: [] },
        { id: 'b', widthPercent: 30, cells: [] },
      ],
    }
    const total = save({ layout: skewed }).defaultLayout.columns.reduce(
      (sum, c) => sum + c.widthPercent,
      0,
    )
    expect(total).toBeCloseTo(100, 5)
  })

  test('does not alias the caller’s variable objects', () => {
    const variables = [
      { name: '$coin1', label: 'Coin 1', type: 'pair' as const },
    ]
    const params = save({ variables })
    params.variables[0].label = 'Mutated'
    expect(variables[0].label).toBe('Coin 1')
  })

  test('does not mutate the layout it was handed', () => {
    const layout = layoutOf({ type: 'chart' })
    save({ layout })
    expect(panesOf(layout)[0].bindings).toBeUndefined()
  })
})

describe('uniqueWorkspaceName', () => {
  test('leaves a free name alone', () => {
    expect(uniqueWorkspaceName('Scalping copy', ['Scalping'])).toBe(
      'Scalping copy',
    )
  })

  test('suffixes past every collision', () => {
    expect(
      uniqueWorkspaceName('Scalping copy', [
        'Scalping copy',
        'Scalping copy 2',
      ]),
    ).toBe('Scalping copy 3')
  })

  test('returns empty for an empty base', () => {
    expect(uniqueWorkspaceName('', ['a'])).toBe('')
  })
})
