// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which bootstrap plugins have to be ACTIVE before the terminal calls itself
 * ready.
 *
 * `pluginsReady` is the gate every pane's first read waits on, so anything a
 * pane asks for on mount has to be active before that flag flips. Boot
 * activates in two passes: this set first, then everything else after the flag
 * — which is fine for a plugin nothing reads on mount and fatal for one that
 * does. The memecoin feed was in the second pass, so the trade board asked for
 * its token, got "no active plugin found for capability", and parked on a
 * backed-off retry that an unfocused window never resumes.
 *
 * The list is capabilities rather than plugin ids on purpose: a new data
 * provider that answers one of these is in the first pass by declaring it,
 * with nothing to remember.
 */
import type {
  PluginCapabilityDeclaration,
  PluginManifest,
} from '@pairlens/plugin-system/types'

/**
 * Read by a pane on mount, so they cannot wait for the second pass.
 *
 * `market-data:discovery` is the exception with a condition attached: the
 * wildcard provider is the global instrument catalog, which is `pairlens-core`
 * and is already activated by name ahead of everything here. Only a
 * venue-specific discovery declaration belongs to a connector.
 */
const EAGER_CAPABILITIES: ReadonlySet<string> = new Set([
  'market-data:candles',
  'market-data:launchpad',
  'market-data:pool-stats',
])

function isEagerDeclaration(decl: PluginCapabilityDeclaration): boolean {
  if (EAGER_CAPABILITIES.has(decl.id)) return true
  return decl.id === 'market-data:discovery' && !decl.markets.includes('*')
}

/** Whether this plugin must be active before `pluginsReady` is set. */
export function activatesBeforeReady(manifest: PluginManifest): boolean {
  return manifest.capabilities.some(isEagerDeclaration)
}
