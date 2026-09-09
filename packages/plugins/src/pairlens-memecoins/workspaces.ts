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
 * whether the deployer can still mint. Every trenches terminal converged on
 * the same shape for a token page, and this is it: the chart over the tape,
 * the token's dossier and its audit beside them, the ticket at the right edge
 * with the trader's own book under it.
 *
 * Every column has to earn its height. Token Stats and Token Safety are
 * `fitContent` panes, so they draw their rows and hand the rest of the column
 * to Pool Stats, which reads the pool the token migrated into (and says so
 * honestly while it is still on the curve). The ticket is `fitContent` too,
 * so Positions takes whatever the ticket leaves. The first cut of this board
 * gave each of those panes a percentage, and on a 1300px window that was
 * three cards of empty space under seven rows of figures.
 *
 * The tape and the flow strip share a tab cell under the chart because they
 * answer the same question at two scales: the flow strip is buys against
 * sells over four windows, the tape is the last two hundred of them.
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
          heightPercent: 64,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-tape',
          heightPercent: 36,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-onchain-trades', type: 'onchain-trades' },
            { id: 'pane-meme-flow', type: 'meme-flow' },
          ],
        },
      ],
    },
    {
      id: 'col-token',
      widthPercent: 22,
      cells: [
        {
          id: 'cell-meme-token-stats',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-meme-token-stats', type: 'meme-token-stats' }],
        },
        {
          id: 'cell-meme-safety',
          heightPercent: 25,
          activeTabIndex: 0,
          panes: [{ id: 'pane-meme-safety', type: 'meme-safety' }],
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
      id: 'col-swap',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-trade',
          heightPercent: 60,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
        {
          id: 'cell-positions',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-positions', type: 'positions' }],
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
    tagline: 'The chart, the tape, the dossier, and who can still mint.',
    description:
      'The default memecoin layout: a chart over the on-chain tape and the flow strip, the token dossier (price, moves, market cap, liquidity, volume, holders, age, launchpad, curve) with the deployer audit and the pool under it, and a swap ticket on the right with your positions beneath. No order book: a bonding curve does not have one.',
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
