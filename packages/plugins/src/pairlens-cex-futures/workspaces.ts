// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Workspace presets shipped by `pairlens-cex-futures`.
 *
 * A leaf data module: type-only imports, plain object literals, no runtime
 * dependency on the plugin system or on ccxt. The terminal imports it through
 * its own subpath (`@pairlens/plugins/pairlens-cex-futures/workspaces`) to seed
 * the perp class default at boot, so pulling in the futures workspaces never
 * drags a connector runtime into the main bundle.
 */
import type {
  ContributedWorkspace,
  ContributedWorkspaceLayout,
} from '@pairlens/shared/plugin-types'

/**
 * Perps Terminal — the default pair layout for the `perp` asset class. Same
 * skeleton as the spot default so a spot trader feels at home, but the data
 * strip carries `futures-positions` (entry, mark, liquidation, per-venue
 * contracts) instead of the spot positions pane, which reads nothing from a
 * futures account.
 */
export const PERPS_TERMINAL_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 55,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 71,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 24,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-trades', type: 'trades' },
            { id: 'pane-futures-positions', type: 'futures-positions' },
            { id: 'pane-data-log', type: 'data-log' },
            { id: 'pane-depth', type: 'depth' },
            { id: 'pane-pair-info', type: 'pair-info' },
          ],
        },
        {
          id: 'cell-risk',
          heightPercent: 5,
          activeTabIndex: 0,
          panes: [{ id: 'pane-risk', type: 'risk' }],
        },
      ],
    },
    {
      id: 'col-market',
      widthPercent: 21,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 52,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-trade',
          heightPercent: 48,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
      ],
    },
    {
      id: 'col-copilot',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-copilot',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

export const CEX_FUTURES_WORKSPACES: Array<ContributedWorkspace> = [
  {
    id: 'template:perps-terminal',
    name: 'Perps Terminal',
    menuLabel: 'Default',
    context: 'pair',
    routeMenu: true,
    icon: 'TrendingUp',
    tagline: 'The futures desk: positions with mark and liquidation.',
    description:
      'The default perpetual-futures layout: a large chart with the tape, open contracts (entry, mark, liquidation), and market data tabbed below it, an order book and leverage-aware ticket in the middle, and the AI Copilot on the right.',
    facets: {
      traderTypes: ['day-trader', 'scalper'],
      assetClasses: ['crypto-perp'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['futures', 'perps', 'leverage'],
    layout: PERPS_TERMINAL_LAYOUT,
    pairDefault: { pairKey: 'BTC-USDT-USDT', market: 'binance-futures' },
  },
]
