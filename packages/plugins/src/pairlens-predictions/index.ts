// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `pairlens-predictions` — the prediction-market surfaces, as a plugin.
 *
 * Panels only: no capabilities, no runtime. The event browser and the
 * positions pane read `market-data:events` and `trading:positions` from
 * whichever prediction connector is active, so this plugin serves nothing
 * itself — it exists so the two panes ship, install, disable and uninstall
 * with the family they belong to rather than riding in `pairlens-core`, which
 * a deployment that drops the predictions family still keeps.
 *
 * An empty `capabilities` array is deliberate and legal (`validateManifest`
 * asks only that the field be an array). It also keeps the plugin out of every
 * capability-shape predicate in the terminal: it is not a venue, not a theme
 * and not a data source, so the boot path activates it in the generic
 * remaining-plugins pass, which is where a panels-only plugin belongs.
 */
import { PREDICTIONS_WORKSPACES } from './workspaces'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const pairlensPredictionsManifest: PluginManifest = {
  id: 'pairlens-predictions',
  name: 'Pairlens Predictions',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Prediction-market surfaces — event browser and open contract positions',
  homepage: 'https://pairlens.finance',
  icon: 'https://pairlens.finance/favicon.svg',
  metadata: { family: 'predictions' },
  capabilities: [],
  config: {},
  contributes: {
    panels: [
      {
        id: 'events',
        label: 'Events',
        labelKey: 'panes.events',
        descriptionKey: 'paneDescriptions.events',
        icon: 'Vote',
        category: 'discovery',
        minHeight: 200,
        singleton: true,
      },
      {
        // No `requires`: Kalshi trades from API credentials and Polymarket
        // from a wallet, so neither 'workspace:active-wallet' nor
        // 'workspace:active-pair' is the precondition. The pane itself says
        // what is missing.
        id: 'prediction-positions',
        label: 'Prediction Positions',
        labelKey: 'panes.predictionPositions',
        descriptionKey: 'paneDescriptions.predictionPositions',
        icon: 'Wallet',
        category: 'trading',
        minHeight: 120,
      },
    ],
    // The prediction desk and the event-market home board ship with the family
    // that owns them: uninstall this plugin and both layouts leave the store,
    // the workspaces menu and Discovery with the panes.
    workspaces: PREDICTIONS_WORKSPACES,
  },
}

export function createPairlensPredictionsPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return {
    manifest,
    status: 'installed',
    config: {},
    async execute(params): Promise<unknown> {
      throw new Error(
        `pairlens-predictions: unsupported capability '${params.capability}'`,
      )
    },
  }
}
