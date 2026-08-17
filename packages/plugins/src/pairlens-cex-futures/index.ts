// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `pairlens-cex-futures` — the perpetual-futures surfaces, as a plugin.
 *
 * Panels only: no capabilities, no runtime. Every pane here reads from
 * whichever futures connector is active (`trading:positions`, funding and
 * open-interest fetches), so this plugin serves nothing itself. It exists so
 * the perp surfaces ship, install, disable and uninstall with the
 * `cex-futures` family rather than riding in `pairlens-core`, which a
 * deployment that drops futures still keeps.
 *
 * Same shape and same reasoning as `pairlens-predictions`. An empty
 * `capabilities` array is deliberate and legal (`validateManifest` asks only
 * that the field be an array), and it keeps the plugin out of every
 * capability-shape predicate in the terminal: it is not a venue, not a theme
 * and not a data source, so the boot path activates it in the generic
 * remaining-plugins pass, which is where a panels-only plugin belongs.
 */
import { CEX_FUTURES_WORKSPACES } from './workspaces'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const pairlensCexFuturesManifest: PluginManifest = {
  id: 'pairlens-cex-futures',
  name: 'Pairlens Futures',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Perpetual futures surfaces: open positions, funding and basis scanners, liquidation and margin panes',
  homepage: 'https://pairlens.finance',
  icon: 'https://pairlens.finance/favicon.svg',
  metadata: { family: 'cex-futures' },
  capabilities: [],
  config: {},
  contributes: {
    panels: [
      {
        // No `requires`: a futures account is an API credential, not a
        // workspace wallet, and the pane is worth opening before a pair is
        // picked because it lists positions across every connected venue. The
        // pane itself says what is missing.
        id: 'futures-positions',
        label: 'Futures Positions',
        labelKey: 'panes.futuresPositions',
        descriptionKey: 'paneDescriptions.futuresPositions',
        icon: 'Layers',
        category: 'trading',
        minHeight: 120,
      },
      {
        id: 'funding-matrix',
        label: 'Funding Matrix',
        labelKey: 'panes.fundingMatrix',
        descriptionKey: 'paneDescriptions.fundingMatrix',
        icon: 'Grid3X3',
        category: 'discovery',
        minHeight: 150,
      },
      {
        id: 'basis-monitor',
        label: 'Basis Monitor',
        labelKey: 'panes.basisMonitor',
        descriptionKey: 'paneDescriptions.basisMonitor',
        icon: 'Scale',
        category: 'discovery',
        minHeight: 100,
      },
      {
        id: 'open-interest',
        label: 'Open Interest',
        labelKey: 'panes.openInterest',
        descriptionKey: 'paneDescriptions.openInterest',
        icon: 'BarChart3',
        category: 'discovery',
        minHeight: 100,
      },
      {
        id: 'funding-extremes',
        label: 'Funding Extremes',
        labelKey: 'panes.fundingExtremes',
        descriptionKey: 'paneDescriptions.fundingExtremes',
        icon: 'ArrowDownUp',
        category: 'discovery',
        minHeight: 100,
      },
      {
        id: 'funding-belt',
        label: 'Funding Belt',
        labelKey: 'panes.fundingBelt',
        descriptionKey: 'paneDescriptions.fundingBelt',
        icon: 'Timer',
        category: 'charting',
        minHeight: 72,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'liquidation-map',
        label: 'Liquidation Map',
        labelKey: 'panes.liquidationMap',
        descriptionKey: 'paneDescriptions.liquidationMap',
        icon: 'Crosshair',
        category: 'charting',
        minHeight: 120,
        requires: ['workspace:active-pair'],
      },
      {
        // The only pane here that needs an account picked: a margin ratio is
        // per-account, so there is nothing to draw until one is selected.
        id: 'margin-health',
        label: 'Margin Health',
        labelKey: 'panes.marginHealth',
        descriptionKey: 'paneDescriptions.marginHealth',
        icon: 'Gauge',
        category: 'trading',
        minHeight: 120,
        requires: ['workspace:active-wallet'],
      },
      {
        // Guardrails are local config, not venue state, so this pane is
        // useful with nothing connected at all.
        id: 'risk-controls',
        label: 'Risk Controls',
        labelKey: 'panes.riskControls',
        descriptionKey: 'paneDescriptions.riskControls',
        icon: 'SlidersHorizontal',
        category: 'trading',
        minHeight: 140,
      },
    ],
    // The perps desk ships with the family that owns it: uninstall this plugin
    // and the layout leaves the store and the workspaces menu with the pane.
    workspaces: CEX_FUTURES_WORKSPACES,
  },
}

export function createPairlensCexFuturesPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return {
    manifest,
    status: 'installed',
    config: {},
    async execute(params): Promise<unknown> {
      throw new Error(
        `pairlens-cex-futures: unsupported capability '${params.capability}'`,
      )
    },
  }
}
