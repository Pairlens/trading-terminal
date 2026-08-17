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
 * DEX Terminal — the default pair layout for the `dex` asset class. Chart over
 * pool stats, the on-chain tape in the middle, and the swap ticket above the
 * aggregator route.
 *
 * Still no order book and no depth pane, and now for a stated reason rather
 * than an absence: DEX data providers synthesize bid/ask from pool state, so
 * that pane would render fabricated depth. `pool-stats` is what an AMM
 * actually has (reserves both sides, value locked, 24h volume, fee tier, and
 * impact at three sizes), and `route` shows the aggregator's split, so the
 * slippage on the ticket has a cause you can read.
 */
export const DEX_TERMINAL_LAYOUT = {
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
          id: 'cell-pool-stats',
          heightPercent: 35,
          activeTabIndex: 0,
          panes: [{ id: 'pane-pool-stats', type: 'pool-stats' }],
        },
      ],
    },
    {
      id: 'col-tape',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-onchain',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-onchain-trades', type: 'onchain-trades' }],
        },
      ],
    },
    {
      id: 'col-swap',
      widthPercent: 18,
      cells: [
        {
          id: 'cell-trade',
          heightPercent: 77,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
        {
          id: 'cell-route',
          heightPercent: 23,
          activeTabIndex: 0,
          panes: [{ id: 'pane-route', type: 'route' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * DEX Liquidity — the LP side of the same pool. Chart over fees accrued, the
 * position in the middle, and the range editor on the right.
 *
 * Every pane here reads a wallet's own position, so the template opens bound
 * to an account rather than read-only: a range and an impermanent-loss figure
 * with nobody holding them is a chart of nothing.
 */
export const DEX_LIQUIDITY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 56,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 69,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-fees',
          heightPercent: 31,
          activeTabIndex: 0,
          panes: [{ id: 'pane-fee-accrual', type: 'fee-accrual' }],
        },
      ],
    },
    {
      id: 'col-position',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-lp-position',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-lp-position', type: 'lp-position' }],
        },
      ],
    },
    {
      id: 'col-manage',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-manage',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-manage-liquidity', type: 'manage-liquidity' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * DEX Cross-Chain — the same token, priced per chain, with the bridge next to
 * it. The chain ladder leads, over the chart; the bridge route takes the
 * middle column, and transfers still confirming sit above recent tickers.
 *
 * Ladder totals are gas-adjusted, which is the only comparison worth making:
 * the cheapest quote on the most expensive chain is routinely the worst fill.
 */
export const DEX_CROSS_CHAIN_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 59,
      cells: [
        {
          id: 'cell-chain-ladder',
          heightPercent: 34,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chain-ladder', type: 'chain-ladder' }],
        },
        {
          id: 'cell-chart',
          heightPercent: 66,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
      ],
    },
    {
      id: 'col-bridge',
      widthPercent: 23,
      cells: [
        {
          id: 'cell-route-bridge',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-route-bridge', type: 'route-bridge' }],
        },
      ],
    },
    {
      id: 'col-flight',
      widthPercent: 18,
      cells: [
        {
          id: 'cell-in-flight',
          heightPercent: 78,
          activeTabIndex: 0,
          panes: [{ id: 'pane-in-flight', type: 'in-flight' }],
        },
        {
          id: 'cell-recent',
          heightPercent: 22,
          activeTabIndex: 0,
          panes: [{ id: 'pane-recent-tickers', type: 'recent-tickers' }],
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
 * DEX Discovery — the home board for on-chain markets. Chain first, then pool:
 * a chain rail on the left, pools ranked by volume against liquidity in the
 * middle over the flow chart, and the selected pool's detail on the right.
 *
 * Chain rows come from the installed chain connectors, so a chain with no
 * connector is absent rather than a dead link, and the pool rows under it are
 * always ones this install can actually chart and swap.
 */
export const DEX_DISCOVERY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-chains',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-chains',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chains', type: 'chains' }],
        },
      ],
    },
    {
      id: 'col-pools',
      widthPercent: 58,
      cells: [
        {
          id: 'cell-pool-map',
          heightPercent: 64,
          activeTabIndex: 0,
          panes: [{ id: 'pane-pool-map', type: 'pool-map' }],
        },
        {
          id: 'cell-flow',
          heightPercent: 36,
          activeTabIndex: 0,
          panes: [{ id: 'pane-liquidity-flow', type: 'liquidity-flow' }],
        },
      ],
    },
    {
      id: 'col-detail',
      widthPercent: 22,
      cells: [
        {
          id: 'cell-pool-detail',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-pool-detail', type: 'pool-detail' }],
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
      'The default on-chain layout: a chart over pool stats, the on-chain tape beside it, and a swap ticket above the aggregator route so slippage has a stated cause. There is no order book column: pool-quoted depth is synthetic, so it is not shown.',
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
    tagline: 'Pick the chain, then the pool.',
    description:
      'The on-chain home board: a chain rail with gas and liquidity, pools ranked by volume against liquidity over the flow chart, and the selected pool on the right, one click from its chart and a swap. Chains you have no connector for never appear.',
    facets: {
      traderTypes: ['dex-degen', 'day-trader'],
      assetClasses: ['dex'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'dex', 'onchain'],
    layout: DEX_DISCOVERY_LAYOUT,
  },
  {
    id: 'template:dex-liquidity',
    name: 'DEX Liquidity',
    menuLabel: 'Liquidity',
    context: 'pair',
    routeMenu: true,
    icon: 'Droplets',
    tagline: 'Your range, your fees, your impermanent loss.',
    description:
      'The LP side of a pool: the chart with your range on it, fees accrued and the APR they imply, time in range, and impermanent loss measured against simply holding. The range editor sits beside it, so a position is rebalanced without leaving the chart.',
    facets: {
      traderTypes: ['dex-degen', 'position-investor'],
      assetClasses: ['dex'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['dex', 'onchain', 'liquidity'],
    layout: DEX_LIQUIDITY_LAYOUT,
    pairDefault: { pairKey: 'SOL-USDC', market: 'jupiter' },
  },
  {
    id: 'template:dex-cross-chain',
    name: 'DEX Cross-Chain',
    menuLabel: 'Cross-Chain',
    context: 'pair',
    routeMenu: true,
    icon: 'Waypoints',
    tagline: 'The same token, every chain, gas included.',
    description:
      'A board for moving between chains: the chain ladder prices the token everywhere with gas folded into the total, the bridge route states its fee and how long it takes, and transfers still confirming sit beside them with their current stage.',
    facets: {
      traderTypes: ['dex-degen', 'quant'],
      assetClasses: ['dex'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['dex', 'onchain', 'bridge'],
    layout: DEX_CROSS_CHAIN_LAYOUT,
    pairDefault: { pairKey: 'ETH-USDC', market: 'ethereum' },
  },
]
