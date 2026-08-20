// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a multi-chart preset becomes when it is applied in place: the lead
 * chart follows the page, every other chart holds a pair of its own, and a
 * board whose panes share one pair variable is not touched at all.
 */
import { describe, expect, test } from 'bun:test'

import { materializePerPaneChartPairs } from '../multi-chart'
import type { PairValue } from '../multi-chart'
import type { TerminalLayout, WorkspaceVariableDefinition } from '../types'
import {
  BUILTIN_WORKSPACE_TEMPLATES,
  routePresets,
} from '@/lib/workspace-store/catalog'

const CHART_VARS: Array<WorkspaceVariableDefinition> = [
  {
    name: '$chart1',
    label: 'Chart 1',
    type: 'pair',
    defaultValue: { pairKey: 'BTC-USDT', market: 'okx' },
  },
  {
    name: '$chart2',
    label: 'Chart 2',
    type: 'pair',
    defaultValue: { pairKey: 'ETH-USDT', market: 'okx' },
  },
  {
    name: '$chart3',
    label: 'Chart 3',
    type: 'pair',
    defaultValue: { pairKey: 'SOL-USDT', market: 'okx' },
  },
]

function chartBoard(vars: Array<string>): TerminalLayout {
  return {
    version: 1,
    columns: vars.map((name, i) => ({
      id: `col-${i}`,
      widthPercent: 100 / vars.length,
      cells: [
        {
          id: `cell-${i}`,
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [
            {
              id: `pane-chart-${i + 1}`,
              type: 'chart',
              bindings: { 'active-pair': name },
            },
          ],
        },
      ],
    })),
  }
}

function panes(layout: TerminalLayout) {
  return layout.columns.flatMap((c) => c.cells.flatMap((cell) => cell.panes))
}

function pairOf(layout: TerminalLayout, paneId: string) {
  const pane = panes(layout).find((p) => p.id === paneId)
  return pane?.overrides?.['active-pair'] as PairValue | undefined
}

describe('materializePerPaneChartPairs', () => {
  test('the lead chart follows the page, the rest are pinned', () => {
    const out = materializePerPaneChartPairs(
      chartBoard(['$chart1', '$chart2', '$chart3']),
      CHART_VARS,
      { pairKey: 'SOL-USDT', market: 'binance' },
      'spot',
    )

    expect(pairOf(out, 'pane-chart-1')).toBeUndefined()
    // Its own variable's default, on the venue the page is already on.
    expect(pairOf(out, 'pane-chart-2')).toEqual({
      pairKey: 'ETH-USDT',
      market: 'binance',
    })
    // SOL is what the lead chart is showing, so the third chart takes the
    // next spare rather than charting it twice.
    expect(pairOf(out, 'pane-chart-3')).toEqual({
      pairKey: 'BTC-USDT',
      market: 'binance',
    })
  })

  test('every binding it spends is dropped, so nothing resolves twice', () => {
    const out = materializePerPaneChartPairs(
      chartBoard(['$chart1', '$chart2']),
      CHART_VARS,
      { pairKey: 'BTC-USDT', market: 'okx' },
      'spot',
    )
    for (const pane of panes(out)) {
      expect(pane.bindings?.['active-pair']).toBeUndefined()
    }
  })

  test('a pair variable several panes share is left alone', () => {
    const board = chartBoard(['$pair', '$pair', '$pair'])
    const out = materializePerPaneChartPairs(
      board,
      [
        {
          name: '$pair',
          label: 'Pair',
          type: 'pair',
          defaultValue: { pairKey: 'BTC-USDT', market: 'okx' },
        },
      ],
      { pairKey: 'SOL-USDT', market: 'okx' },
      'spot',
    )
    expect(out).toEqual(board)
  })

  test('defaults from another asset class are refused', () => {
    // A prediction page: spot defaults would chart BTC-USDT beside a contract.
    const out = materializePerPaneChartPairs(
      chartBoard(['$chart1', '$chart2']),
      CHART_VARS,
      { pairKey: 'KXBTCD-26AUG15-T53', market: 'kalshi' },
      'prediction',
    )
    expect(pairOf(out, 'pane-chart-2')).toEqual({
      pairKey: 'KXBTCD-26AUG15-T53',
      market: 'kalshi',
    })
  })

  test('with no page pair the template is taken as authored', () => {
    const out = materializePerPaneChartPairs(
      chartBoard(['$chart1', '$chart2']),
      CHART_VARS,
      null,
      null,
    )
    expect(pairOf(out, 'pane-chart-1')).toEqual({
      pairKey: 'BTC-USDT',
      market: 'okx',
    })
    expect(pairOf(out, 'pane-chart-2')).toEqual({
      pairKey: 'ETH-USDT',
      market: 'okx',
    })
  })

  test('a board with no variables is returned untouched', () => {
    const board = chartBoard(['$chart1', '$chart2'])
    expect(materializePerPaneChartPairs(board, undefined, null)).toBe(board)
    expect(materializePerPaneChartPairs(board, [], null)).toBe(board)
  })
})

describe('the shipped multi-chart presets', () => {
  const MULTI = [
    'template:dual-charts',
    'template:triple-charts',
    'template:quad-charts',
  ]

  test('carry a variable per chart into the route menu', () => {
    const presets = routePresets('pair', 'spot')
    for (const id of MULTI) {
      const preset = presets[id]
      expect(preset).toBeDefined()
      const chartPanes = panes(preset!.layout).filter((p) => p.type === 'chart')
      const bound = new Set(
        chartPanes.map((p) => p.bindings?.['active-pair']).filter(Boolean),
      )
      expect(bound.size).toBe(chartPanes.length)
      expect(preset!.variables?.length).toBe(chartPanes.length)
    }
  })

  test('open on a different instrument per chart', () => {
    const presets = routePresets('pair', 'spot')
    for (const id of MULTI) {
      const preset = presets[id]!
      const out = materializePerPaneChartPairs(
        preset.layout,
        preset.variables,
        { pairKey: 'BTC-USDT', market: 'okx' },
        'spot',
      )
      const chartPanes = panes(out).filter((p) => p.type === 'chart')
      const keys = chartPanes.map(
        (p) =>
          (p.overrides?.['active-pair'] as PairValue | undefined)?.pairKey ??
          'BTC-USDT',
      )
      expect(new Set(keys).size).toBe(chartPanes.length)
    }
  })

  test('are the only templates shipping per-pane pair variables', () => {
    for (const template of BUILTIN_WORKSPACE_TEMPLATES) {
      const pairVars = (template.variables ?? []).filter(
        (v) => v.type === 'pair',
      )
      if (pairVars.length > 1) expect(MULTI).toContain(template.id)
    }
  })
})
