// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `pairlens-dex` — the on-chain workspace presets, as a plugin.
 *
 * Presets only: no capabilities, no panels, no runtime. Every pane the DEX
 * layouts use already ships in `pairlens-core`; what belongs to the `dex`
 * family is the arrangement of them. So this plugin carries the two on-chain
 * workspaces and nothing else, and a deployment that drops the family (or a
 * user who disables it) loses the DEX entries from the Workspace Store, the
 * workspaces menu and Discovery along with the connectors.
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
    'On-chain workspace presets: the DEX terminal and the degen hunting board',
  homepage: 'https://pairlens.finance',
  icon: 'https://pairlens.finance/favicon.svg',
  metadata: { family: 'dex' },
  capabilities: [],
  config: {},
  contributes: {
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
