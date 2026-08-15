// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `pairlens-cex-futures` — the perpetual-futures surfaces, as a plugin.
 *
 * Panels only: no capabilities, no runtime. The positions pane reads
 * `trading:positions` from whichever futures connector is active, so this
 * plugin serves nothing itself. It exists so the pane ships, installs,
 * disables and uninstalls with the `cex-futures` family rather than riding in
 * `pairlens-core`, which a deployment that drops futures still keeps.
 *
 * Same shape and same reasoning as `pairlens-predictions`. An empty
 * `capabilities` array is deliberate and legal (`validateManifest` asks only
 * that the field be an array), and it keeps the plugin out of every
 * capability-shape predicate in the terminal: it is not a venue, not a theme
 * and not a data source, so the boot path activates it in the generic
 * remaining-plugins pass, which is where a panels-only plugin belongs.
 */
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
    'Perpetual futures surfaces — open positions with entry, mark and liquidation',
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
    ],
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
