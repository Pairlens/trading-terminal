// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Workspace presets shipped by `pairlens-dex`.
 *
 * A leaf data module: type-only imports, plain object literals, no runtime
 * dependency on the plugin system or on any connector. The terminal imports it
 * through its own subpath (`@pairlens/plugins/pairlens-dex/workspaces`) to seed
 * the dex class default at boot.
 */
import type {
  ContributedWorkspace,
  ContributedWorkspaceLayout,
} from '@pairlens/shared/plugin-types'

/**
 * DEX Terminal — the default pair layout for the `dex` asset class. No order
 * book column: DEX data providers synthesize bid/ask from pool state, so a
 * book pane would render fabricated depth. Pair Info leads the data strip
 * (pool stats always stream from the data providers, while the tape depends on
 * the venue), the swap ticket pairs with Recent Tickers for new listings, and
 * the social feed takes the right rail, because on-chain alpha travels there
 * first.
 */
export const DEX_TERMINAL_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 56,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 70,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 25,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-pair-info', type: 'pair-info' },
            { id: 'pane-trades', type: 'trades' },
            { id: 'pane-data-log', type: 'data-log' },
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
      id: 'col-swap',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-trade',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
        {
          id: 'cell-recent',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-recent-tickers', type: 'recent-tickers' }],
        },
      ],
    },
    {
      id: 'col-right',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-social',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-social', type: 'social' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/** DEX Degen — the standalone on-chain hunting board. */
export const DEX_DEGEN_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'dex-col-0',
      widthPercent: 60,
      cells: [
        {
          id: 'dex-c-0-0',
          heightPercent: 68,
          activeTabIndex: 0,
          panes: [{ id: 'dex-p-0-0-0', type: 'chart' }],
        },
        {
          id: 'dex-c-0-1',
          heightPercent: 32,
          activeTabIndex: 0,
          panes: [{ id: 'dex-p-0-1-0', type: 'trade-entry' }],
        },
      ],
    },
    {
      id: 'dex-col-1',
      widthPercent: 40,
      cells: [
        {
          id: 'dex-c-1-0',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'dex-p-1-0-0', type: 'recent-tickers' }],
        },
        {
          id: 'dex-c-1-1',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'dex-p-1-1-0', type: 'social' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * DEX Discovery — the home board for on-chain markets. On-chain discovery is a
 * flow problem rather than a table problem: what just listed, what people are
 * posting about. So the scanner shares the board with recent tickers over the
 * social feed, and the right rail keeps the watchlist above the news wire.
 */
export const DEX_DISCOVERY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-markets',
      widthPercent: 46,
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
      id: 'col-flow',
      widthPercent: 30,
      cells: [
        {
          id: 'cell-recent',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-recent-tickers', type: 'recent-tickers' }],
        },
        {
          id: 'cell-social',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-social', type: 'social' }],
        },
      ],
    },
    {
      id: 'col-pulse',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-watchlist',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-watchlist', type: 'watchlist' }],
        },
        {
          id: 'cell-news',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-news', type: 'news' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/** Id of the on-chain home board — the DEX section opens on it. */
export const DEX_DISCOVERY_TEMPLATE_ID = 'template:dex-discovery'

export const DEX_WORKSPACES: Array<ContributedWorkspace> = [
  {
    id: 'template:dex-terminal',
    name: 'DEX Terminal',
    menuLabel: 'Default',
    context: 'pair',
    routeMenu: true,
    icon: 'Flame',
    tagline: 'On-chain trading without the fake order book.',
    description:
      'The default on-chain layout: a chart with pool stats and the tape below it, a swap ticket over your recent tickers for catching new listings, and the social feed on the right. There is no order book column: pool-quoted depth is synthetic, so it is not shown.',
    facets: {
      traderTypes: ['dex-degen', 'day-trader'],
      assetClasses: ['dex'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['dex', 'onchain', 'swap'],
    layout: DEX_TERMINAL_LAYOUT,
    pairDefault: { pairKey: 'SOL-USDC', market: 'jupiter' },
  },
  {
    id: 'template:dex-degen',
    name: 'DEX Degen',
    icon: 'Rocket',
    tagline: 'On-chain charts, swaps, and the social feed.',
    description:
      'Built for on-chain hunting: a chart with a swap ticket, recent tickers to catch new listings, and the social feed for alpha. Route swaps through a DEX connector such as Jupiter.',
    facets: {
      traderTypes: ['dex-degen', 'scalper'],
      assetClasses: ['dex'],
      screenSizes: ['compact', 'standard'],
    },
    tags: ['dex', 'onchain', 'memecoins'],
    layout: DEX_DEGEN_LAYOUT,
    pairDefault: { pairKey: 'SOL-USDC', market: 'jupiter' },
    requiredPlugins: [
      {
        pluginId: 'jupiter-dex-connector',
        reason: 'Routes Solana swaps and streams on-chain prices',
      },
    ],
  },
  {
    id: DEX_DISCOVERY_TEMPLATE_ID,
    name: 'DEX Discovery',
    menuLabel: 'Default',
    context: 'discovery',
    routeMenu: true,
    icon: 'Flame',
    tagline: 'On-chain listings, the social feed, and your watchlist.',
    description:
      'The on-chain home board: the markets scanner filtered to DEX pairs, recent tickers over the social feed for catching what just listed, and your watchlist above the news wire.',
    facets: {
      traderTypes: ['dex-degen', 'day-trader'],
      assetClasses: ['dex'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'dex', 'onchain'],
    layout: DEX_DISCOVERY_LAYOUT,
  },
]
