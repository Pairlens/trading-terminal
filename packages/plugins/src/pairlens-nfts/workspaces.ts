// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The NFT workspaces, as data.
 *
 * A leaf module on purpose: type-only imports, plain object literals, no
 * runtime. It is imported statically by the terminal's `pair-workspace.ts` and
 * `discovery-workspace.ts` because those seed the layout reducer on first
 * paint, before any plugin has activated, and it is ALSO shipped through
 * `contributes.workspaces` so the Workspace Store and the layouts menu read the
 * same geometry. One source, two paths in.
 */
import type {
  ContributedWorkspace,
  ContributedWorkspaceLayout,
} from '@pairlens/shared/plugin-types'

/**
 * The NFT trade board.
 *
 * Built around one claim: a collection is a market with a bid, an ask and a
 * tape, and the reason NFT trading feels like shopping rather than trading is
 * that every venue draws it as a grid of pictures. So the middle column is a
 * chart over a two-sided ladder, and the grid of pictures is demoted to a tab.
 *
 * The chart is the ORDINARY chart pane, not a bespoke one. A floor price over
 * time is a candle series like any other, so the connector serves
 * `market-data:candles` and the WebGL chart, its drawings, its indicators and
 * its timeframe control all work unchanged. That is the opposite of the
 * prediction board, which needed its own chart because an event has many
 * outcomes at once and a single price line cannot say what it is doing.
 *
 * `nft-book` sits directly under the chart rather than in the right rail
 * because on an NFT market the ladder IS the liquidity story: a floor with two
 * items behind it and a floor with two hundred are the same number and
 * completely different markets.
 */
export const NFT_TERMINAL_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-chart',
      widthPercent: 57,
      cells: [
        {
          id: 'cell-header',
          heightPercent: 18,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-header', type: 'nft-collection-header' }],
        },
        {
          id: 'cell-chart',
          heightPercent: 46,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-tape',
          heightPercent: 36,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-nft-sales', type: 'nft-sales' },
            { id: 'pane-nft-items', type: 'nft-items' },
            { id: 'pane-nft-traits', type: 'nft-traits' },
            { id: 'pane-nft-holdings', type: 'nft-holdings' },
          ],
        },
      ],
    },
    {
      id: 'col-book',
      widthPercent: 22,
      cells: [
        {
          id: 'cell-book',
          heightPercent: 58,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-book', type: 'nft-book' }],
        },
        {
          id: 'cell-ticket',
          heightPercent: 42,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-ticket', type: 'nft-ticket' }],
        },
      ],
    },
    {
      id: 'col-depth',
      widthPercent: 21,
      cells: [
        {
          id: 'cell-listings',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-listings', type: 'nft-listings' }],
        },
        {
          id: 'cell-offers',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-offers', type: 'nft-offers' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * The collector's board: the same market, read the way someone picking
 * individual tokens reads it. The items grid takes the space the chart holds on
 * the trade board, trait floors get a column of their own, and the ticket stays
 * because the point is still to trade.
 */
export const NFT_COLLECTOR_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-items',
      widthPercent: 60,
      cells: [
        {
          id: 'cell-header',
          heightPercent: 20,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-header', type: 'nft-collection-header' }],
        },
        {
          id: 'cell-items',
          heightPercent: 80,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-items', type: 'nft-items' }],
        },
      ],
    },
    {
      id: 'col-traits',
      widthPercent: 22,
      cells: [
        {
          id: 'cell-traits',
          heightPercent: 60,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-traits', type: 'nft-traits' }],
        },
        {
          id: 'cell-holdings',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-holdings', type: 'nft-holdings' }],
        },
      ],
    },
    {
      id: 'col-trade',
      widthPercent: 18,
      cells: [
        {
          id: 'cell-ticket',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-ticket', type: 'nft-ticket' }],
        },
        {
          id: 'cell-sales',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-sales', type: 'nft-sales' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * The NFT Discovery board.
 *
 * Same three-part shape the other Discovery boards use — a filter rail, a wide
 * ranking column, a detail rail — because the tabs sit side by side and a
 * trader moving between them should not have to relearn where things are. The
 * chain rail is the filter spine here, the way `categories` is on the
 * prediction board and `chains` is on the DEX one.
 */
export const NFT_DISCOVERY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-chains',
      widthPercent: 17,
      cells: [
        {
          id: 'cell-chains',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-chains', type: 'nft-chains' }],
        },
      ],
    },
    {
      id: 'col-board',
      widthPercent: 60,
      cells: [
        {
          id: 'cell-overview',
          heightPercent: 22,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-overview', type: 'nft-overview' }],
        },
        {
          id: 'cell-collections',
          heightPercent: 78,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-collections', type: 'nft-collections' }],
        },
      ],
    },
    {
      id: 'col-rail',
      widthPercent: 23,
      cells: [
        {
          id: 'cell-movers',
          heightPercent: 36,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-movers', type: 'nft-movers' }],
        },
        {
          id: 'cell-mints',
          heightPercent: 28,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-mints', type: 'nft-mints' }],
        },
        {
          id: 'cell-tape',
          heightPercent: 36,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-tape', type: 'nft-tape' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * A tape-first Discovery variant. Whale sales are the fastest read on what is
 * happening in NFTs right now, and on the default board they are a third of a
 * rail; here they are the board.
 */
export const NFT_FLOW_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-tape',
      widthPercent: 58,
      cells: [
        {
          id: 'cell-tape',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-tape', type: 'nft-tape' }],
        },
      ],
    },
    {
      id: 'col-rank',
      widthPercent: 42,
      cells: [
        {
          id: 'cell-movers',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-movers', type: 'nft-movers' }],
        },
        {
          id: 'cell-collections',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-nft-collections', type: 'nft-collections' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

export const NFT_DISCOVERY_TEMPLATE_ID = 'template:nft-discovery'

/**
 * Pudgy Penguins on Ethereum: liquid enough that every pane on the board has
 * something in it, and indexed by every provider we can reach, so a cold open
 * never lands on a collection one provider has never heard of.
 */
const NFT_PAIR_DEFAULT = {
  pairKey: '0xbd3531da5cf5857e7cfaa92426877b022e612cf8',
  market: 'ethereum',
}

export const NFT_WORKSPACES: Array<ContributedWorkspace> = [
  {
    id: 'template:nft-terminal',
    name: 'NFT Desk',
    menuLabel: 'Default',
    context: 'pair',
    routeMenu: true,
    icon: 'Gem',
    tagline: 'A collection as a book, not a gallery',
    description:
      'Floor chart over a two-sided ladder, with listings and collection offers as real depth. The sales tape, the items grid and trait floors share the tabs below.',
    facets: {
      traderTypes: ['active', 'swing'],
      assetClasses: ['nfts'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['nft', 'floor', 'orderbook'],
    pairDefault: NFT_PAIR_DEFAULT,
    layout: NFT_TERMINAL_LAYOUT,
  },
  {
    id: 'template:nft-collector',
    name: 'Collector',
    menuLabel: 'Collector',
    context: 'pair',
    routeMenu: true,
    icon: 'Images',
    tagline: 'Pick the token, not the floor',
    description:
      'The items grid at full width with trait floors beside it, for buying one specific token rather than whatever is cheapest.',
    facets: {
      traderTypes: ['swing', 'passive'],
      assetClasses: ['nfts'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['nft', 'traits', 'rarity'],
    pairDefault: NFT_PAIR_DEFAULT,
    layout: NFT_COLLECTOR_LAYOUT,
  },
  {
    id: NFT_DISCOVERY_TEMPLATE_ID,
    name: 'NFT Discovery',
    menuLabel: 'Default',
    context: 'discovery',
    routeMenu: true,
    icon: 'Gem',
    tagline: 'What is moving across NFT markets',
    description:
      'Collections ranked by volume with floor moves beside them, a chain filter, the market-wide overview, fresh mints and the whale tape.',
    facets: {
      traderTypes: ['active', 'swing'],
      assetClasses: ['nfts'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['nft', 'discovery', 'trending'],
    layout: NFT_DISCOVERY_LAYOUT,
  },
  {
    id: 'template:nft-flow',
    name: 'NFT Flow',
    menuLabel: 'Flow',
    context: 'discovery',
    routeMenu: true,
    icon: 'Receipt',
    tagline: 'The tape, full width',
    description:
      'Whale sales across every indexed collection, with floor movers and the rankings table alongside.',
    facets: {
      traderTypes: ['active'],
      assetClasses: ['nfts'],
      screenSizes: ['compact', 'standard'],
    },
    tags: ['nft', 'tape', 'whales'],
    layout: NFT_FLOW_LAYOUT,
  },
]
