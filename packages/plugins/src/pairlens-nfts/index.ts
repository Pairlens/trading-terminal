// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `pairlens-nfts` — the NFT surfaces and workspace presets, as a plugin.
 *
 * Panels and presets, no capabilities and no runtime. The panes read collection
 * state from whichever NFT connector is active, so this plugin serves nothing
 * itself. It carries the NFT workspaces and the panes those layouts are built
 * from, so a deployment that drops the family (or a user who disables it) loses
 * the NFT entries from the Workspace Store, the workspaces menu and Discovery
 * along with the connectors.
 *
 * Same shape and same reasoning as `pairlens-dex` and `pairlens-predictions`:
 * an empty `capabilities` array is deliberate and legal, and it keeps the
 * plugin out of every capability-shape predicate in the terminal, so the boot
 * path activates it in the generic remaining-plugins pass.
 *
 * There is no `nft-chart` pane. A collection's floor over time is a candle
 * series like any other, so the connectors serve `market-data:candles` and the
 * boards mount the ordinary `chart` pane — which brings drawings, indicators
 * and the timeframe control with it for free.
 */
import { NFT_WORKSPACES } from './workspaces'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const pairlensNftsManifest: PluginManifest = {
  id: 'pairlens-nfts',
  name: 'Pairlens NFTs',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'NFT surfaces: collection rankings, the listings and offers ladder, the items grid and the sales tape',
  homepage: 'https://pairlens.finance',
  // Served from the terminal bundle, not pairlens.finance: a first-party
  // plugin's mark must render offline, on the desktop app, and inside the
  // desktop CSP without reaching for the marketing site.
  icon: '/logo512.png',
  metadata: { family: 'nfts' },
  capabilities: [],
  config: {},
  contributes: {
    panels: [
      // ── Discovery ──────────────────────────────────────────────
      {
        id: 'nft-chains',
        label: 'Chains',
        labelKey: 'panes.nftChains',
        descriptionKey: 'paneDescriptions.nftChains',
        icon: 'Link2',
        preview: 'table',
        category: 'discovery',
        minHeight: 150,
        singleton: true,
      },
      {
        id: 'nft-collections',
        label: 'Collections',
        labelKey: 'panes.nftCollections',
        descriptionKey: 'paneDescriptions.nftCollections',
        icon: 'Gem',
        preview: 'table',
        category: 'discovery',
        minHeight: 180,
        singleton: true,
      },
      {
        id: 'nft-overview',
        label: 'NFT Market',
        labelKey: 'panes.nftOverview',
        descriptionKey: 'paneDescriptions.nftOverview',
        icon: 'Globe',
        preview: 'stats',
        category: 'discovery',
        minHeight: 100,
        singleton: true,
      },
      {
        id: 'nft-movers',
        label: 'Floor Movers',
        labelKey: 'panes.nftMovers',
        descriptionKey: 'paneDescriptions.nftMovers',
        icon: 'TrendingUp',
        preview: 'table',
        category: 'discovery',
        minHeight: 120,
      },
      {
        id: 'nft-mints',
        label: 'New & Minting',
        labelKey: 'panes.nftMints',
        descriptionKey: 'paneDescriptions.nftMints',
        icon: 'Sparkles',
        preview: 'tokens',
        category: 'discovery',
        minHeight: 120,
      },
      {
        id: 'nft-tape',
        label: 'Whale Sales',
        labelKey: 'panes.nftTape',
        descriptionKey: 'paneDescriptions.nftTape',
        icon: 'Receipt',
        preview: 'tape',
        category: 'discovery',
        minHeight: 120,
      },
      // ── The collection board ───────────────────────────────────
      {
        id: 'nft-collection-header',
        label: 'Collection',
        labelKey: 'panes.nftCollectionHeader',
        descriptionKey: 'paneDescriptions.nftCollectionHeader',
        icon: 'Info',
        preview: 'stats',
        category: 'charting',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'nft-book',
        label: 'Ladder',
        labelKey: 'panes.nftBook',
        descriptionKey: 'paneDescriptions.nftBook',
        icon: 'BookOpen',
        preview: 'book',
        category: 'charting',
        minHeight: 160,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'nft-listings',
        label: 'Listings',
        labelKey: 'panes.nftListings',
        descriptionKey: 'paneDescriptions.nftListings',
        icon: 'ListOrdered',
        preview: 'table',
        category: 'charting',
        minHeight: 120,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'nft-offers',
        label: 'Offers',
        labelKey: 'panes.nftOffers',
        descriptionKey: 'paneDescriptions.nftOffers',
        icon: 'Coins',
        preview: 'table',
        category: 'charting',
        minHeight: 120,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'nft-sales',
        label: 'Sales',
        labelKey: 'panes.nftSales',
        descriptionKey: 'paneDescriptions.nftSales',
        icon: 'History',
        preview: 'tape',
        category: 'charting',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'nft-items',
        label: 'Items',
        labelKey: 'panes.nftItems',
        descriptionKey: 'paneDescriptions.nftItems',
        icon: 'Images',
        preview: 'gallery',
        category: 'charting',
        minHeight: 160,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'nft-traits',
        label: 'Traits',
        labelKey: 'panes.nftTraits',
        descriptionKey: 'paneDescriptions.nftTraits',
        icon: 'Tags',
        preview: 'heat',
        category: 'charting',
        minHeight: 120,
        requires: ['workspace:active-pair'],
      },
      // The write panes gate on a wallet: an NFT order is signed by a key, and
      // holdings with nobody holding them is a grid of nothing.
      {
        id: 'nft-ticket',
        label: 'NFT Ticket',
        labelKey: 'panes.nftTicket',
        descriptionKey: 'paneDescriptions.nftTicket',
        icon: 'ShoppingBasket',
        preview: 'ticket',
        category: 'trading',
        minHeight: 180,
        requires: ['workspace:active-pair', 'workspace:active-wallet'],
      },
      {
        id: 'nft-holdings',
        label: 'My Items',
        labelKey: 'panes.nftHoldings',
        descriptionKey: 'paneDescriptions.nftHoldings',
        icon: 'Wallet',
        preview: 'table',
        category: 'trading',
        minHeight: 120,
        requires: ['workspace:active-pair', 'workspace:active-wallet'],
      },
    ],
    workspaces: NFT_WORKSPACES,
  },
}

export function createPairlensNftsPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return {
    manifest,
    status: 'installed',
    config: {},
    async execute(params): Promise<unknown> {
      throw new Error(
        `pairlens-nfts: unsupported capability '${params.capability}'`,
      )
    },
  }
}
