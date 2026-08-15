// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one uninstall path, shared by the Installed tab, the Plugin Store and the
 * product page.
 *
 * Uninstalling is not a single call: the plugin has to leave the manager, the
 * ledger, the module cache, the desktop network allowlist, the App Server
 * state table and any capability pin aimed at it, and a theme has to hand the
 * palette back before it goes. Three copies of that sequence drifted apart
 * before this file existed (the Store could only ever *disable* a bundled
 * plugin, nobody cleared pins, and only one surface released the theme), so
 * every caller goes through here.
 *
 * `pairlens-core` is refused here rather than in the UI: hiding the button is
 * presentation, and the terminal has no shell without the core panes.
 */

import type { PluginManager } from '@pairlens/plugin-system'
import type { PluginModuleLoader } from '@/lib/plugins/plugin-module-loader'
import { api } from '@/lib/api'
import { track } from '@/lib/analytics-events'
import { removeFromLedger } from '@/lib/plugins/plugin-ledger'
import { revokeNetworkGrant } from '@/lib/plugins/network-grants'
import { releaseThemeIfActive } from '@/lib/plugins/theme-handoff'

/** The plugin the terminal cannot run without — never uninstallable. */
export const IRREDUCIBLE_PLUGIN_ID = 'pairlens-core'

/** Thrown when the requested plugin may not be uninstalled at all. */
export class PluginUninstallRefusedError extends Error {
  constructor(readonly pluginId: string) {
    super(`Plugin '${pluginId}' cannot be uninstalled.`)
    this.name = 'PluginUninstallRefusedError'
  }
}

export function canUninstallPlugin(pluginId: string): boolean {
  return pluginId !== IRREDUCIBLE_PLUGIN_ID
}

export type UninstallPluginOptions = {
  manager: PluginManager
  pluginId: string
  /** Module loader whose IndexedDB cache holds the code (remote plugins). */
  moduleLoader?: PluginModuleLoader | null
}

/**
 * Uninstall one plugin, whatever its source.
 *
 * Bundled plugins are tombstoned in the ledger (their code still ships in the
 * binary, so boot must be told to skip them); everything else loses its ledger
 * row and its cached module. Reinstalling a bundled plugin later goes through
 * `reinstallBundledPlugin`.
 */
export async function uninstallPluginEverywhere({
  manager,
  pluginId,
  moduleLoader,
}: UninstallPluginOptions): Promise<void> {
  if (!canUninstallPlugin(pluginId)) {
    throw new PluginUninstallRefusedError(pluginId)
  }

  // Read the pins BEFORE the resolver forgets the plugin: the server rows are
  // keyed by capability + market, and we still need those keys to delete them.
  // This is the ONE place pins are cleaned up. The resolver deliberately keeps
  // them across `unregisterPlugin`, because that is also how a plugin under
  // development gets replaced by a fresh zip.
  const stalePins = manager
    .getUserPins()
    .filter((pin) => pin.pluginId === pluginId)

  // A theme cannot be removed while it paints the terminal: the style tag and
  // its cached CSS outlive the plugin.
  releaseThemeIfActive(pluginId)

  const installed = manager
    .getInstalledPlugins()
    .some((p) => p.manifest.id === pluginId)
  if (installed) await manager.uninstallPlugin(pluginId)

  removeFromLedger(pluginId)

  for (const pin of stalePins) {
    manager.unpinPlugin(pin.capability, pin.market)
    api.removePluginPin(pin.capability, pin.market).catch(() => {})
  }

  await moduleLoader?.evict(pluginId)
  void revokeNetworkGrant(pluginId)
  api.removePluginState(pluginId).catch(() => {})
  track('plugin_uninstalled', { plugin_id: pluginId })
}
