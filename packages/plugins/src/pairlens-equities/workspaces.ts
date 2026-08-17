// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Workspace presets shipped by `pairlens-equities`.
 *
 * A leaf data module: type-only imports, plain object literals, no runtime
 * dependency on the plugin system or on the Alpaca connector. The terminal
 * imports it through its own subpath
 * (`@pairlens/plugins/pairlens-equities/workspaces`) to seed the stocks class
 * default at boot.
 */
import type {
  ContributedWorkspace,
  ContributedWorkspaceLayout,
} from '@pairlens/shared/plugin-types'

const ALPACA_REQUIREMENT = {
  pluginId: 'alpaca-market-connector',
  reason: 'Streams US equities data and routes stock orders',
}

/**
 * Equities Terminal — the default pair layout for the `stocks` asset class.
 * The session clock leads the column, the chart takes the middle, and the data
 * strip carries time and sales beside positions.
 *
 * Still no order book: the broker feed quotes top-of-book, not depth, so
 * `level-1` stands in for it, and a stock has one venue and a spread rather
 * than fourteen tapes. The clock sits directly above the ticket because
 * extended hours change what the ticket will accept, not just a label on it.
 */
export const EQUITIES_TERMINAL_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 80,
      cells: [
        {
          id: 'cell-session-clock',
          heightPercent: 13,
          activeTabIndex: 0,
          panes: [{ id: 'pane-session-clock', type: 'session-clock' }],
        },
        {
          id: 'cell-chart',
          heightPercent: 59,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 28,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-trades', type: 'trades' },
            { id: 'pane-positions', type: 'positions' },
            { id: 'pane-data-log', type: 'data-log' },
          ],
        },
      ],
    },
    {
      id: 'col-rail',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-level-1',
          heightPercent: 28,
          activeTabIndex: 0,
          panes: [{ id: 'pane-level-1', type: 'level-1' }],
        },
        {
          id: 'cell-trade',
          heightPercent: 72,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-trade-entry', type: 'trade-entry' },
            { id: 'pane-symbol-news', type: 'symbol-news' },
          ],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Equities Company — the pair as a business rather than a price. Chart over
 * the company pane, the symbol wire beside it, and your position above the
 * ticket.
 *
 * One pane replaces what used to be a five-tab strip: valuation, growth,
 * margins, the next catalyst and the analyst range. When the connector cannot
 * supply fundamentals the pane says so, rather than drawing a grid of dashes
 * that reads as real data with every number missing.
 */
export const EQUITIES_COMPANY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 58,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 65,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-company',
          heightPercent: 35,
          activeTabIndex: 0,
          panes: [{ id: 'pane-company', type: 'company' }],
        },
      ],
    },
    {
      id: 'col-news',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-news',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-symbol-news', type: 'symbol-news' }],
        },
      ],
    },
    {
      id: 'col-rail',
      widthPercent: 18,
      cells: [
        {
          id: 'cell-your-position',
          heightPercent: 77,
          activeTabIndex: 0,
          panes: [{ id: 'pane-your-position', type: 'your-position' }],
        },
        {
          id: 'cell-trade',
          heightPercent: 23,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/** Equities Desk — the standalone scanner-led stock board. */
export const EQUITIES_DESK_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'equities-col-0',
      widthPercent: 28,
      cells: [
        {
          id: 'equities-c-0-0',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'equities-p-0-0-0', type: 'markets' }],
        },
      ],
    },
    {
      id: 'equities-col-1',
      widthPercent: 46,
      cells: [
        {
          id: 'equities-c-1-0',
          heightPercent: 68,
          activeTabIndex: 0,
          panes: [{ id: 'equities-p-1-0-0', type: 'chart' }],
        },
        {
          id: 'equities-c-1-1',
          heightPercent: 32,
          activeTabIndex: 0,
          panes: [{ id: 'equities-p-1-1-0', type: 'positions' }],
        },
      ],
    },
    {
      id: 'equities-col-2',
      widthPercent: 26,
      cells: [
        {
          id: 'equities-c-2-0',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'equities-p-2-0-0', type: 'news' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Equities Discovery — the home board for stocks, built around the calendar
 * rather than the tape. The session state leads, earnings sit under it, macro
 * releases under those, with the movers and the news wire beside them.
 *
 * The clock comes from the broker connector's own calendar rather than a
 * hardcoded 09:30, because holidays and half days are exactly the days it
 * matters. No sentiment gauge and no heatmap here — both read a crypto index
 * and would be quietly wrong above a list of tickers.
 */
export const EQUITIES_DISCOVERY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-session',
      widthPercent: 56,
      cells: [
        {
          id: 'cell-session',
          heightPercent: 16,
          activeTabIndex: 0,
          panes: [{ id: 'pane-session', type: 'session' }],
        },
        {
          id: 'cell-earnings',
          heightPercent: 44,
          activeTabIndex: 0,
          panes: [{ id: 'pane-earnings-calendar', type: 'earnings-calendar' }],
        },
        {
          id: 'cell-econ',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-economic-calendar', type: 'economic-calendar' }],
        },
      ],
    },
    {
      id: 'col-movers',
      widthPercent: 25,
      cells: [
        {
          id: 'cell-movers',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-movers', type: 'movers' }],
        },
      ],
    },
    {
      id: 'col-news',
      widthPercent: 19,
      cells: [
        {
          id: 'cell-news',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-news', type: 'news' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/** Id of the stock home board — the Equities section opens on it. */
export const EQUITIES_DISCOVERY_TEMPLATE_ID = 'template:equities-discovery'

export const EQUITIES_WORKSPACES: Array<ContributedWorkspace> = [
  {
    id: 'template:equities-terminal',
    name: 'Equities Terminal',
    menuLabel: 'Default',
    context: 'pair',
    routeMenu: true,
    icon: 'BarChart3',
    tagline: 'The session clock over the chart, Level 1 over the ticket.',
    description:
      'The default stock layout: the session clock leads, then the chart with time and sales and positions below it, and a rail carrying Level 1 quotes over the ticket and the symbol wire. Outside regular hours the clock says so, and the ticket goes limit-only.',
    facets: {
      traderTypes: ['day-trader', 'position-investor'],
      assetClasses: ['equities'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['equities', 'stocks', 'news'],
    layout: EQUITIES_TERMINAL_LAYOUT,
    pairDefault: { pairKey: 'AAPL', market: 'alpaca' },
    requiredPlugins: [ALPACA_REQUIREMENT],
  },
  {
    id: 'template:equities-desk',
    name: 'Equities Desk',
    icon: 'BarChart3',
    tagline: 'Trade stocks with a scanner, chart, and positions.',
    description:
      'A stock-trading layout: the markets scanner, a chart, open positions, and the news wire. Connect the Alpaca broker plugin to stream US equities and route orders.',
    facets: {
      traderTypes: ['day-trader', 'position-investor'],
      assetClasses: ['equities'],
      screenSizes: ['standard'],
    },
    tags: ['equities', 'stocks', 'broker'],
    layout: EQUITIES_DESK_LAYOUT,
    pairDefault: { pairKey: 'AAPL', market: 'alpaca' },
    requiredPlugins: [ALPACA_REQUIREMENT],
  },
  {
    id: EQUITIES_DISCOVERY_TEMPLATE_ID,
    name: 'Equities Discovery',
    menuLabel: 'Default',
    context: 'discovery',
    routeMenu: true,
    icon: 'BarChart3',
    tagline: 'The trading day, by the calendar that runs it.',
    description:
      'The stock home board: where the session is right now, who reports and when, and the macro releases due, with the movers and the news wire beside them. The clock comes from the broker calendar, so holidays and half days are right.',
    facets: {
      traderTypes: ['day-trader', 'position-investor'],
      assetClasses: ['equities'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'equities', 'stocks'],
    layout: EQUITIES_DISCOVERY_LAYOUT,
    requiredPlugins: [ALPACA_REQUIREMENT],
  },
  {
    id: 'template:equities-company',
    name: 'Equities Company',
    menuLabel: 'Company',
    context: 'pair',
    routeMenu: true,
    icon: 'Building2',
    tagline: 'The business behind the ticker.',
    description:
      'For holding a stock rather than trading it: the chart over valuation, growth, margins, the next catalyst and the analyst range, with the symbol wire beside it and your position above the ticket.',
    facets: {
      traderTypes: ['position-investor', 'swing-trader'],
      assetClasses: ['equities'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['equities', 'stocks', 'fundamentals'],
    layout: EQUITIES_COMPANY_LAYOUT,
    pairDefault: { pairKey: 'AAPL', market: 'alpaca' },
    requiredPlugins: [ALPACA_REQUIREMENT],
  },
]
