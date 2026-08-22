// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Workspace presets shipped by `pairlens-memecoins`.
 *
 * A leaf data module: type-only imports, plain object literals, no runtime
 * dependency on the plugin system or on any connector. The terminal imports it
 * through its own subpath (`@pairlens/plugins/pairlens-memecoins/workspaces`)
 * to seed the memecoin class default at boot.
 */
import type {
  ContributedWorkspace,
  ContributedWorkspaceLayout,
} from '@pairlens/shared/plugin-types'

/**
 * Memecoin Discovery — the launchpad board, and the reason the class exists.
 *
 * Four columns, one per stage of a token's life: minted, climbing the bonding
 * curve, migrated to a real pool, and the handful that outlived the cycle. A
 * memecoin trader reads left to right and works the column that matches their
 * risk, so the stages are side by side rather than tabs over one list — the
 * whole skill is noticing that a name in Graduating was in New ten minutes
 * ago.
 *
 * Equal widths on purpose. Any weighting here would be a claim about which
 * stage is worth more attention, and that is the trader's call, not ours.
 */
export const MEMECOIN_DISCOVERY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-meme-new',
      widthPercent: 25,
      cells: [
        {
          id: 'cell-meme-new',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-meme-new', type: 'meme-new' }],
        },
      ],
    },
    {
      id: 'col-meme-graduating',
      widthPercent: 25,
      cells: [
        {
          id: 'cell-meme-graduating',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-meme-graduating', type: 'meme-graduating' }],
        },
      ],
    },
    {
      id: 'col-meme-graduated',
      widthPercent: 25,
      cells: [
        {
          id: 'cell-meme-graduated',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-meme-graduated', type: 'meme-graduated' }],
        },
      ],
    },
    {
      id: 'col-meme-legendary',
      widthPercent: 25,
      cells: [
        {
          id: 'cell-meme-legendary',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-meme-legendary', type: 'meme-legendary' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Memecoin Terminal — the default pair layout for the `memecoin` class.
 *
 * Deliberately not the DEX board. A pool desk is read in reserves, fee tier
 * and price impact; a memecoin desk is read in market cap, who is buying, and
 * whether the deployer can still mint. So the chart sits over the flow strip
 * (buys against sells at four horizons), supply and safety take the middle
 * column, and the swap ticket keeps the right edge.
 *
 * Every pane here is either core or this family's own, so the board still
 * works in a build that dropped the DEX family. Adding the on-chain tape from
 * the picker is one click when that family is installed.
 */
export const MEMECOIN_TERMINAL_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 58,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 66,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-meme-flow',
          heightPercent: 34,
          activeTabIndex: 0,
          panes: [{ id: 'pane-meme-flow', type: 'meme-flow' }],
        },
      ],
    },
    {
      id: 'col-token',
      widthPercent: 22,
      cells: [
        {
          id: 'cell-meme-token-stats',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-meme-token-stats', type: 'meme-token-stats' }],
        },
        {
          id: 'cell-meme-safety',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-meme-safety', type: 'meme-safety' }],
        },
      ],
    },
    {
      id: 'col-swap',
      widthPercent: 20,
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

/**
 * Memecoin Sniper — the compact board for working the curve.
 *
 * New launches and the graduating ladder side by side, with a chart and a
 * ticket under them. Built for the trader who never leaves Discovery: the two
 * columns that decide the entry stay on screen while the order goes in.
 */
export const MEMECOIN_SNIPER_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'meme-col-0',
      widthPercent: 34,
      cells: [
        {
          id: 'meme-c-0-0',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'meme-p-0-0-0', type: 'meme-new' }],
        },
        {
          id: 'meme-c-0-1',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'meme-p-0-1-0', type: 'meme-graduating' }],
        },
      ],
    },
    {
      id: 'meme-col-1',
      widthPercent: 44,
      cells: [
        {
          id: 'meme-c-1-0',
          heightPercent: 62,
          activeTabIndex: 0,
          panes: [{ id: 'meme-p-1-0-0', type: 'chart' }],
        },
        {
          id: 'meme-c-1-1',
          heightPercent: 38,
          activeTabIndex: 0,
          panes: [{ id: 'meme-p-1-1-0', type: 'meme-flow' }],
        },
      ],
    },
    {
      id: 'meme-col-2',
      widthPercent: 22,
      cells: [
        {
          id: 'meme-c-2-0',
          heightPercent: 58,
          activeTabIndex: 0,
          panes: [{ id: 'meme-p-2-0-0', type: 'trade-entry' }],
        },
        {
          id: 'meme-c-2-1',
          heightPercent: 42,
          activeTabIndex: 0,
          panes: [{ id: 'meme-p-2-1-0', type: 'meme-safety' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/** Id of the memecoin home board — the Memecoins section opens on it. */
export const MEMECOIN_DISCOVERY_TEMPLATE_ID = 'template:memecoin-discovery'

export const MEMECOIN_WORKSPACES: Array<ContributedWorkspace> = [
  {
    id: MEMECOIN_DISCOVERY_TEMPLATE_ID,
    name: 'Memecoin Discovery',
    menuLabel: 'Default',
    context: 'discovery',
    routeMenu: true,
    icon: 'Rocket',
    tagline: 'Four columns, one for each stage of the curve.',
    description:
      'The launchpad board: minted in the last hour, climbing the bonding curve with progress against the graduation threshold, migrated to a real pool, and the large caps that outlived their cycle. Every row carries market cap, liquidity, and buys against sells, and clicking one opens its chart and a swap ticket.',
    facets: {
      traderTypes: ['dex-degen', 'scalper'],
      assetClasses: ['memecoins'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'memecoins', 'launchpad', 'onchain'],
    layout: MEMECOIN_DISCOVERY_LAYOUT,
  },
  {
    id: 'template:memecoin-terminal',
    name: 'Memecoin Terminal',
    menuLabel: 'Default',
    context: 'pair',
    routeMenu: true,
    icon: 'Rocket',
    tagline: 'Market cap, flow, and who can still mint.',
    description:
      'The default memecoin layout: a chart over the flow strip that puts buys against sells at four horizons, supply and holder count in the middle, the deployer audit under it, and a swap ticket on the right. No order book: a bonding curve does not have one.',
    facets: {
      traderTypes: ['dex-degen', 'day-trader'],
      assetClasses: ['memecoins'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['memecoins', 'onchain', 'swap'],
    layout: MEMECOIN_TERMINAL_LAYOUT,
    pairDefault: {
      pairKey: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263-USDC',
      market: 'jupiter',
    },
    requiredPlugins: [
      {
        pluginId: 'jupiter-dex-connector',
        reason: 'Routes Solana swaps and streams on-chain prices',
      },
    ],
  },
  {
    id: 'template:memecoin-sniper',
    name: 'Memecoin Sniper',
    menuLabel: 'Sniper',
    context: 'pair',
    routeMenu: true,
    icon: 'Crosshair',
    tagline: 'The curve on the left, the ticket on the right.',
    description:
      'Built for working launches: new mints and the graduating ladder stay on screen while the chart, the flow strip and the swap ticket fill the rest. The safety panel sits under the ticket, because the mint authority is the last thing worth checking before an order.',
    facets: {
      traderTypes: ['dex-degen', 'scalper'],
      assetClasses: ['memecoins'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['memecoins', 'launchpad', 'onchain'],
    layout: MEMECOIN_SNIPER_LAYOUT,
    pairDefault: {
      pairKey: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263-USDC',
      market: 'jupiter',
    },
    requiredPlugins: [
      {
        pluginId: 'jupiter-dex-connector',
        reason: 'Routes Solana swaps and streams on-chain prices',
      },
    ],
  },
]
