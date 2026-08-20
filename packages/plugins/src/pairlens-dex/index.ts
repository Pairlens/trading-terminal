// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `pairlens-dex` — the on-chain surfaces and workspace presets, as a plugin.
 *
 * Panels and presets, no capabilities and no runtime. The panes read pool and
 * swap state from whichever DEX connector or data provider is active, so this
 * plugin serves nothing itself. It carries the on-chain workspaces and the
 * panes those layouts are built from, so a deployment that drops the family
 * (or a user who disables it) loses the DEX entries from the Workspace Store,
 * the workspaces menu and Discovery along with the connectors.
 *
 * Same shape and same reasoning as `pairlens-predictions` and
 * `pairlens-cex-futures`: an empty `capabilities` array is deliberate and
 * legal, and it keeps the plugin out of every capability-shape predicate in
 * the terminal, so the boot path activates it in the generic
 * remaining-plugins pass.
 */
import { DEX_WORKSPACES } from './workspaces'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const pairlensDexManifest: PluginManifest = {
  id: 'pairlens-dex',
  name: 'Pairlens DEX',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'On-chain surfaces: pool stats, the swap route, LP positions and the cross-chain ladder',
  homepage: 'https://pairlens.finance',
  // Served from the terminal bundle, not pairlens.finance: a first-party
  // plugin's mark must render offline, on the desktop app, and inside the
  // desktop CSP without reaching for the marketing site.
  icon: '/logo512.png',
  metadata: { family: 'dex' },
  capabilities: [],
  config: {},
  contributes: {
    panels: [
      {
        id: 'chains',
        label: 'Chains',
        labelKey: 'panes.chains',
        descriptionKey: 'paneDescriptions.chains',
        icon: 'Link2',
        category: 'discovery',
        minHeight: 150,
        singleton: true,
      },
      {
        id: 'pool-map',
        label: 'Pool Map',
        labelKey: 'panes.poolMap',
        descriptionKey: 'paneDescriptions.poolMap',
        icon: 'Droplets',
        category: 'discovery',
        minHeight: 150,
        singleton: true,
      },
      {
        id: 'liquidity-flow',
        label: 'Liquidity Flow',
        labelKey: 'panes.liquidityFlow',
        descriptionKey: 'paneDescriptions.liquidityFlow',
        icon: 'Waves',
        category: 'discovery',
        minHeight: 100,
      },
      {
        id: 'pool-detail',
        label: 'Pool Detail',
        labelKey: 'panes.poolDetail',
        descriptionKey: 'paneDescriptions.poolDetail',
        icon: 'Info',
        category: 'discovery',
        minHeight: 150,
      },
      {
        id: 'pool-stats',
        label: 'Pool Stats',
        labelKey: 'panes.poolStats',
        descriptionKey: 'paneDescriptions.poolStats',
        icon: 'Droplets',
        category: 'charting',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'onchain-trades',
        label: 'On-chain Trades',
        labelKey: 'panes.onchainTrades',
        descriptionKey: 'paneDescriptions.onchainTrades',
        icon: 'Receipt',
        category: 'charting',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'route',
        label: 'Route',
        labelKey: 'panes.route',
        descriptionKey: 'paneDescriptions.route',
        icon: 'Waypoints',
        category: 'trading',
        minHeight: 80,
        requires: ['workspace:active-pair'],
      },
      // The LP panes read a wallet's own position, so they gate on one: an
      // account is not a display filter here, it is the only thing that
      // decides whether there is a position at all.
      {
        id: 'fee-accrual',
        label: 'Fee Accrual',
        labelKey: 'panes.feeAccrual',
        descriptionKey: 'paneDescriptions.feeAccrual',
        icon: 'Coins',
        category: 'trading',
        minHeight: 100,
        requires: ['workspace:active-pair', 'workspace:active-wallet'],
      },
      {
        id: 'lp-position',
        label: 'LP Position',
        labelKey: 'panes.lpPosition',
        descriptionKey: 'paneDescriptions.lpPosition',
        icon: 'Layers',
        category: 'trading',
        minHeight: 120,
        requires: ['workspace:active-pair', 'workspace:active-wallet'],
      },
      {
        id: 'manage-liquidity',
        label: 'Manage Liquidity',
        labelKey: 'panes.manageLiquidity',
        descriptionKey: 'paneDescriptions.manageLiquidity',
        icon: 'SlidersHorizontal',
        category: 'trading',
        minHeight: 160,
        requires: ['workspace:active-pair', 'workspace:active-wallet'],
      },
      {
        id: 'chain-ladder',
        label: 'Chain Ladder',
        labelKey: 'panes.chainLadder',
        descriptionKey: 'paneDescriptions.chainLadder',
        icon: 'ListOrdered',
        category: 'charting',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'route-bridge',
        label: 'Bridge Route',
        labelKey: 'panes.routeBridge',
        descriptionKey: 'paneDescriptions.routeBridge',
        icon: 'Waypoints',
        category: 'trading',
        minHeight: 140,
        requires: ['workspace:active-pair', 'workspace:active-wallet'],
      },
      {
        id: 'in-flight',
        label: 'In Flight',
        labelKey: 'panes.inFlight',
        descriptionKey: 'paneDescriptions.inFlight',
        icon: 'Send',
        category: 'trading',
        minHeight: 100,
        requires: ['workspace:active-wallet'],
      },
    ],
    workspaces: DEX_WORKSPACES,
  },
}

export function createPairlensDexPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return {
    manifest,
    status: 'installed',
    config: {},
    async execute(params): Promise<unknown> {
      throw new Error(
        `pairlens-dex: unsupported capability '${params.capability}'`,
      )
    },
  }
}
