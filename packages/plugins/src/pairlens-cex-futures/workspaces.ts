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

/**
 * Perps Discovery — the home board for the futures section. A perp trader
 * browses with exposure already on: the scanner takes the wide column and open
 * contracts sit right beside it, over a multi-price rail for the majors the
 * whole market trades off. Sentiment and the news wire close the board, because
 * funding follows the same headlines spot does.
 */
export const PERPS_DISCOVERY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-markets',
      widthPercent: 48,
      cells: [
        {
          id: 'cell-markets',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-markets', type: 'markets' }],
        },
      ],
    },
    {
      id: 'col-desk',
      widthPercent: 28,
      cells: [
        {
          id: 'cell-positions',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-futures-positions', type: 'futures-positions' }],
        },
        {
          id: 'cell-multi-price',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-multi-price', type: 'multi-price' }],
        },
      ],
    },
    {
      id: 'col-pulse',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-sentiment',
          heightPercent: 38,
          activeTabIndex: 0,
          panes: [{ id: 'pane-fear-greed', type: 'fear-greed' }],
        },
        {
          id: 'cell-news',
          heightPercent: 62,
          activeTabIndex: 0,
          panes: [{ id: 'pane-news', type: 'news' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/** Id of the futures home board — the CEX Futures section opens on it. */
export const PERPS_DISCOVERY_TEMPLATE_ID = 'template:perps-discovery'

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
  {
    id: PERPS_DISCOVERY_TEMPLATE_ID,
    name: 'Perps Discovery',
    menuLabel: 'Default',
    context: 'discovery',
    routeMenu: true,
    icon: 'TrendingUp',
    tagline: 'Scan perps with your open contracts beside them.',
    description:
      'The futures home board: the markets scanner filtered to perpetual contracts, your open positions with mark and liquidation next to it over a multi-price rail, and sentiment above the news wire.',
    facets: {
      traderTypes: ['day-trader', 'scalper'],
      assetClasses: ['crypto-perp'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'futures', 'perps'],
    layout: PERPS_DISCOVERY_LAYOUT,
  },
]
