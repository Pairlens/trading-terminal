// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `pairlens-memecoins` — the launchpad surfaces and workspace presets, as a
 * plugin.
 *
 * Panels and presets, no capabilities and no runtime. The panes read token
 * state from keyless public sources through the terminal's memecoin feed, so
 * this plugin serves nothing itself. It carries the memecoin workspaces and
 * the panes those layouts are built from, so a deployment that drops the
 * family (or a user who disables it) loses the Memecoins tab from Discovery,
 * the Workspace Store entries and the workspaces menu in one move. That is the
 * compliance recipe: a venue that cannot list launchpad tokens uninstalls this
 * plugin and the surface is gone, not merely hidden.
 *
 * Same shape and same reasoning as `pairlens-dex` and `pairlens-predictions`:
 * an empty `capabilities` array is deliberate and legal, and it keeps the
 * plugin out of every capability-shape predicate in the terminal, so the boot
 * path activates it in the generic remaining-plugins pass.
 */
import { MEMECOIN_WORKSPACES } from './workspaces'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const pairlensMemecoinsManifest: PluginManifest = {
  id: 'pairlens-memecoins',
  name: 'Pairlens Memecoins',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Launchpad surfaces: new mints, bonding-curve progress, graduations and the large caps that outlived them',
  homepage: 'https://pairlens.finance',
  // Served from the terminal bundle, not pairlens.finance: a first-party
  // plugin's mark must render offline, on the desktop app, and inside the
  // desktop CSP without reaching for the marketing site.
  icon: '/logo512.png',
  metadata: { family: 'memes', assetClass: 'memecoin' },
  capabilities: [],
  config: {},
  contributes: {
    panels: [
      // ── The four stages of the board ─────────────────────────────────
      //
      // Four pane types rather than one with a stage setting, because they
      // are four different questions: what just minted, what is about to
      // migrate, what survived migration, and what survived the cycle. A
      // trader who only works graduations should be able to put that one pane
      // on a board of their own without carrying the other three.
      {
        id: 'meme-new',
        label: 'New Mints',
        labelKey: 'panes.memeNew',
        descriptionKey: 'paneDescriptions.memeNew',
        icon: 'Sparkles',
        preview: 'tokens',
        category: 'discovery',
        minHeight: 150,
        singleton: true,
      },
      {
        id: 'meme-graduating',
        label: 'Graduating',
        labelKey: 'panes.memeGraduating',
        descriptionKey: 'paneDescriptions.memeGraduating',
        icon: 'Rocket',
        preview: 'tokens',
        category: 'discovery',
        minHeight: 150,
        singleton: true,
      },
      {
        id: 'meme-graduated',
        label: 'Graduated',
        labelKey: 'panes.memeGraduated',
        descriptionKey: 'paneDescriptions.memeGraduated',
        icon: 'GraduationCap',
        preview: 'tokens',
        category: 'discovery',
        minHeight: 150,
        singleton: true,
      },
      {
        id: 'meme-legendary',
        label: 'Legendary',
        labelKey: 'panes.memeLegendary',
        descriptionKey: 'paneDescriptions.memeLegendary',
        icon: 'Crown',
        preview: 'tokens',
        category: 'discovery',
        minHeight: 150,
        singleton: true,
      },
      // ── The trade board ──────────────────────────────────────────────
      {
        id: 'meme-token-stats',
        label: 'Token Stats',
        labelKey: 'panes.memeTokenStats',
        descriptionKey: 'paneDescriptions.memeTokenStats',
        icon: 'Coins',
        preview: 'stats',
        category: 'charting',
        minHeight: 120,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'meme-flow',
        label: 'Buy / Sell Flow',
        labelKey: 'panes.memeFlow',
        descriptionKey: 'paneDescriptions.memeFlow',
        icon: 'Activity',
        preview: 'sparkbar',
        category: 'charting',
        minHeight: 110,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'meme-safety',
        label: 'Token Safety',
        labelKey: 'panes.memeSafety',
        descriptionKey: 'paneDescriptions.memeSafety',
        icon: 'ShieldCheck',
        preview: 'stats',
        category: 'charting',
        minHeight: 110,
        requires: ['workspace:active-pair'],
      },
    ],
    workspaces: MEMECOIN_WORKSPACES,
  },
}

export function createPairlensMemecoinsPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return {
    manifest,
    status: 'installed',
    config: {},
    async execute(params): Promise<unknown> {
      throw new Error(
        `pairlens-memecoins: unsupported capability '${params.capability}'`,
      )
    },
  }
}
