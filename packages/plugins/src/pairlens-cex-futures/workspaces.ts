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
      widthPercent: 79,
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
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Perps Discovery — the home board for the futures section. It scans by cost
 * of carry rather than by price, which is the thing a perp desk actually
 * shops for: the funding matrix takes the wide column with the basis monitor
 * under it, and open interest sits beside them over the funding extremes.
 *
 * A price scanner already lives on the spot board, and repeating it here made
 * the section the same page a fifth time. All four panes read the
 * `fetchFundingRates` / `fetchOpenInterest` pair the perps venues already
 * serve, so the board opens nothing new.
 */
export const PERPS_DISCOVERY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-funding',
      widthPercent: 62,
      cells: [
        {
          id: 'cell-funding-matrix',
          heightPercent: 60,
          activeTabIndex: 0,
          panes: [{ id: 'pane-funding-matrix', type: 'funding-matrix' }],
        },
        {
          id: 'cell-basis',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-basis-monitor', type: 'basis-monitor' }],
        },
      ],
    },
    {
      id: 'col-oi',
      widthPercent: 38,
      cells: [
        {
          id: 'cell-oi',
          heightPercent: 56,
          activeTabIndex: 0,
          panes: [{ id: 'pane-open-interest', type: 'open-interest' }],
        },
        {
          id: 'cell-extremes',
          heightPercent: 44,
          activeTabIndex: 0,
          panes: [{ id: 'pane-funding-extremes', type: 'funding-extremes' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Perps Carry — the desk for holding a perp rather than scalping one. The
 * funding belt gets a 12% cell of its own above the chart: the countdown to
 * the next stamp, the current and predicted rate, what the last 8h, 24h and 7d
 * paid or earned, and what holding the current size to the next stamp costs.
 *
 * A cell rather than chart chrome, so removing the pane gives the height back
 * to the candles instead of leaving a gap.
 */
export const PERPS_CARRY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 80,
      cells: [
        {
          id: 'cell-funding-belt',
          heightPercent: 12,
          activeTabIndex: 0,
          panes: [{ id: 'pane-funding-belt', type: 'funding-belt' }],
        },
        {
          id: 'cell-chart',
          heightPercent: 63,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 25,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-futures-positions', type: 'futures-positions' },
            { id: 'pane-trades', type: 'trades' },
            { id: 'pane-data-log', type: 'data-log' },
          ],
        },
      ],
    },
    {
      id: 'col-market',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 31,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-trade',
          heightPercent: 69,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Perps Risk — the same pair, read as exposure. The chart sits over the
 * liquidation map, margin health leads the middle column, and the guardrails
 * are editable right there instead of behind Settings.
 *
 * `risk-controls` writes the same `risk-config-store` the 24px risk strip
 * summarises: max daily loss, max daily trades, max position size, kill
 * switch. Putting the limits where the trade happens is the whole point of the
 * board.
 */
export const PERPS_RISK_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 59,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 71,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-liq-map',
          heightPercent: 29,
          activeTabIndex: 0,
          panes: [{ id: 'pane-liquidation-map', type: 'liquidation-map' }],
        },
      ],
    },
    {
      id: 'col-margin',
      widthPercent: 23,
      cells: [
        {
          id: 'cell-margin',
          heightPercent: 41,
          activeTabIndex: 0,
          panes: [{ id: 'pane-margin-health', type: 'margin-health' }],
        },
        {
          id: 'cell-risk-controls',
          heightPercent: 59,
          activeTabIndex: 0,
          panes: [{ id: 'pane-risk-controls', type: 'risk-controls' }],
        },
      ],
    },
    {
      id: 'col-trade',
      widthPercent: 18,
      cells: [
        {
          id: 'cell-trade',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
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
      'The default perpetual-futures layout: a large chart with the tape, open contracts (entry, mark, liquidation), and market data tabbed below it, with an order book over a leverage-aware ticket on the right.',
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
    tagline: 'Scan by cost of carry, not by price.',
    description:
      'The futures home board: the funding matrix over the basis monitor, with open interest and the funding extremes beside them. It ranks perps by what holding them costs, which is the question a price scanner never answers.',
    facets: {
      traderTypes: ['day-trader', 'scalper'],
      assetClasses: ['crypto-perp'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'futures', 'perps'],
    layout: PERPS_DISCOVERY_LAYOUT,
  },
  {
    id: 'template:perps-carry',
    name: 'Perps Carry',
    menuLabel: 'Carry',
    context: 'pair',
    routeMenu: true,
    icon: 'Timer',
    tagline: 'What the next funding stamp costs you.',
    description:
      'For a perp you intend to hold: the funding belt above the chart with the countdown, the current and predicted rate and what your size pays or earns, open contracts below, and the book over a leverage-aware ticket.',
    facets: {
      traderTypes: ['swing-trader', 'day-trader'],
      assetClasses: ['crypto-perp'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['futures', 'perps', 'funding'],
    layout: PERPS_CARRY_LAYOUT,
    pairDefault: { pairKey: 'BTC-USDT-USDT', market: 'binance-futures' },
  },
  {
    id: 'template:perps-risk',
    name: 'Perps Risk',
    menuLabel: 'Risk',
    context: 'pair',
    routeMenu: true,
    icon: 'ShieldCheck',
    tagline: 'Where the position dies, and the limits that stop it.',
    description:
      'The same pair read as exposure: the chart over a liquidation map, margin health above your guardrails, and the ticket on the right. The limits are editable in place, so a size cap is adjusted where the trade happens rather than in Settings.',
    facets: {
      traderTypes: ['day-trader', 'swing-trader'],
      assetClasses: ['crypto-perp'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['futures', 'perps', 'risk'],
    layout: PERPS_RISK_LAYOUT,
    pairDefault: { pairKey: 'BTC-USDT-USDT', market: 'binance-futures' },
  },
]
