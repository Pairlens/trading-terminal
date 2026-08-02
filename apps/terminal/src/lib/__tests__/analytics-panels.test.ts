// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, mock, setSystemTime, test } from 'bun:test'
import type { TerminalLayout } from '../layout/types'

// Capture track() calls instead of routing them into the (inert) PostHog
// layer, so dwell accounting is observable.
const events: Array<{ name: string; props: Record<string, unknown> }> = []
void mock.module('@/lib/analytics-events', () => ({
  track: (name: string, props?: Record<string, unknown>) => {
    events.push({ name, props: props ?? {} })
  },
}))

const { reportVisiblePanes, visiblePaneTypes, workspaceAnalyticsKind } =
  await import('../analytics-panels')

function layoutWith(
  cells: Array<{ panes: Array<string>; active: number }>,
): TerminalLayout {
  return {
    version: 1,
    columns: [
      {
        id: 'col1',
        widthPercent: 100,
        cells: cells.map((cell, i) => ({
          id: `cell${i}`,
          heightPercent: 100 / cells.length,
          activeTabIndex: cell.active,
          panes: cell.panes.map((type, j) => ({ id: `p${i}-${j}`, type })),
        })),
      },
    ],
  }
}

describe('workspaceAnalyticsKind', () => {
  test('maps storage keys to coarse kinds, never ids', () => {
    expect(workspaceAnalyticsKind('pairlens:terminal.layout')).toBe('pair')
    expect(workspaceAnalyticsKind('pairlens:discovery.layout')).toBe(
      'discovery',
    )
    expect(workspaceAnalyticsKind('pairlens:workspace.abc-123.layout')).toBe(
      'custom',
    )
  })
})

describe('visiblePaneTypes', () => {
  test('returns the active tab of each cell', () => {
    const layout = layoutWith([
      { panes: ['chart', 'trade'], active: 1 },
      { panes: ['orderbook'], active: 0 },
    ])
    expect(visiblePaneTypes(layout)).toEqual(['trade', 'orderbook'])
  })

  test('falls back to the first pane on a stale tab index', () => {
    const layout = layoutWith([{ panes: ['chart'], active: 5 }])
    expect(visiblePaneTypes(layout)).toEqual(['chart'])
  })
})

describe('panel dwell accounting', () => {
  test('credits visible time per type and flushes on workspace switch', () => {
    const t0 = new Date('2026-01-01T00:00:00Z')
    setSystemTime(t0)
    events.length = 0

    reportVisiblePanes('pair', ['chart', 'trade'])
    setSystemTime(new Date(t0.getTime() + 10_000))
    // Tab switch within the same workspace: settle, no flush yet.
    reportVisiblePanes('pair', ['chart', 'positions'])
    setSystemTime(new Date(t0.getTime() + 14_000))
    // Workspace switch: everything accumulated for 'pair' flushes.
    reportVisiblePanes('discovery', ['screener'])

    const dwell = events.filter((e) => e.name === 'panel_dwell')
    const byType = Object.fromEntries(
      dwell.map((e) => [e.props.pane_type, e.props]),
    )
    // chart: visible for the full 14s; trade: first 10s; positions: last 4s.
    expect(byType.chart?.seconds).toBe(14)
    expect(byType.trade?.seconds).toBe(10)
    expect(byType.positions?.seconds).toBe(4)
    expect(dwell.every((e) => e.props.workspace === 'pair')).toBe(true)

    // Sub-second dwell is dropped as noise.
    events.length = 0
    setSystemTime(new Date(t0.getTime() + 14_500))
    reportVisiblePanes('pair', [])
    expect(events.filter((e) => e.name === 'panel_dwell')).toHaveLength(0)

    setSystemTime()
  })
})
