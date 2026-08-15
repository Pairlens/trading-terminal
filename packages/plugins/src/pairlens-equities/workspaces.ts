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
 * No order book column: the broker feed quotes top-of-book, not depth. The
 * ticket sits above the symbol's news wire (catalysts move stocks the way
 * order flow moves crypto) and positions ride the data strip beside the tape.
 */
export const EQUITIES_TERMINAL_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 55,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 66,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 29,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-trades', type: 'trades' },
            { id: 'pane-positions', type: 'positions' },
            { id: 'pane-data-log', type: 'data-log' },
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
          id: 'cell-trade',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
        {
          id: 'cell-news',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-symbol-news', type: 'symbol-news' }],
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

export const EQUITIES_WORKSPACES: Array<ContributedWorkspace> = [
  {
    id: 'template:equities-terminal',
    name: 'Equities Terminal',
    menuLabel: 'Default',
    context: 'pair',
    routeMenu: true,
    icon: 'BarChart3',
    tagline: 'Stocks with the ticket over the symbol news wire.',
    description:
      'The default stock layout: a chart with the tape, positions, and fundamentals below it, the order ticket above the symbol news wire (catalysts move stocks the way flow moves crypto), and the AI Copilot on the right.',
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
]
