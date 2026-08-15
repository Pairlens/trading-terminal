// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `pairlens-equities` — the stock-desk workspace presets, as a plugin.
 *
 * Presets only: no capabilities, no panels, no runtime. Every pane the equities
 * layouts use already ships in `pairlens-core`; what belongs to the `equities`
 * family is the arrangement of them. So this plugin carries the two stock
 * workspaces and nothing else, and a deployment that drops the family (or a
 * user who disables it) loses the equities entries from the Workspace Store
 * and the workspaces menu along with the Alpaca connector.
 *
 * Same shape and same reasoning as `pairlens-dex`: an empty `capabilities`
 * array is deliberate and legal, and it keeps the plugin out of every
 * capability-shape predicate in the terminal, so the boot path activates it in
 * the generic remaining-plugins pass.
 */
import { EQUITIES_WORKSPACES } from './workspaces'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const pairlensEquitiesManifest: PluginManifest = {
  id: 'pairlens-equities',
  name: 'Pairlens Equities',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Stock workspace presets: the equities terminal and the scanner-led desk',
  homepage: 'https://pairlens.finance',
  icon: 'https://pairlens.finance/favicon.svg',
  metadata: { family: 'equities' },
  capabilities: [],
  config: {},
  contributes: {
    workspaces: EQUITIES_WORKSPACES,
  },
}

export function createPairlensEquitiesPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return {
    manifest,
    status: 'installed',
    config: {},
    async execute(params): Promise<unknown> {
      throw new Error(
        `pairlens-equities: unsupported capability '${params.capability}'`,
      )
    },
  }
}
