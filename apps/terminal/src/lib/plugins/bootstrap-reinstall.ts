// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Runtime reinstall of a bundled plugin the user uninstalled.
 *
 * Bundled plugins are compiled into the binary, so getting one back needs no
 * network and no registry: look the id up in `BOOTSTRAP_PLUGINS`, install the
 * factory into the manager, activate it, and lift the ledger tombstone. This is
 * what makes an asset class a real install unit — uninstall Kalshi and
 * Polymarket to drop prediction markets, install them again when you want them
 * back, without "Reset to defaults" wiping every other choice you made.
 *
 * Two refusals, both deliberate:
 *  - An id that is not in the bundle. There is nothing local to install; the
 *    caller should go through the registry download path instead.
 *  - A family this deployment excluded via `VITE_PAIRLENS_DISABLED_FAMILIES`.
 *    That switch is the organization's, not the user's: an excluded family is
 *    not part of the product and must stay uninstallable.
 */

import type { PluginManager, PluginManifest } from '@pairlens/plugin-system'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'
import { isFamilyExcluded } from '@/lib/plugins/plugin-families'
import { buildActivationConfig } from '@/lib/plugins/official-config'
import {
  reviveBootstrapEntry,
  setLedgerEnabled,
} from '@/lib/plugins/plugin-ledger'
import { api } from '@/lib/api'
import { track } from '@/lib/analytics-events'

export type BundledPluginRefusal = 'not-bundled' | 'family-excluded'

/** Thrown when a plugin id cannot be installed from the compiled-in bundle. */
export class BundledPluginUnavailableError extends Error {
  constructor(
    readonly pluginId: string,
    readonly refusal: BundledPluginRefusal,
  ) {
    super(
      refusal === 'not-bundled'
        ? `Plugin '${pluginId}' does not ship with Pairlens.`
        : `Plugin '${pluginId}' belongs to a family this deployment does not ship.`,
    )
    this.name = 'BundledPluginUnavailableError'
  }
}

/** True when this id can be installed straight from the compiled-in bundle. */
export function isReinstallableBundledPlugin(pluginId: string): boolean {
  const bundled = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === pluginId)
  return !!bundled && !isFamilyExcluded(bundled.manifest, 'bootstrap')
}

export type ReinstallBundledPluginOptions = {
  manager: PluginManager
  pluginId: string
  /** Overrides the config kept in the ledger row (rarely needed). */
  config?: Record<string, unknown>
  /**
   * Push the new enabled state to the App Server. Components pass their own
   * mutation so the query cache stays in step; the default writes directly.
   */
  persistState?: (data: {
    pluginId: string
    enabled: boolean
    config: Record<string, unknown>
  }) => void
}

const defaultPersistState = (data: {
  pluginId: string
  enabled: boolean
  config: Record<string, unknown>
}) => {
  api.setPluginState(data).catch(() => {})
}

/**
 * Install and activate a bundled plugin from the compiled-in bundle, and clear
 * its ledger tombstone. Returns the manifest so callers can name it in a toast.
 *
 * Activation runs through the manager, so the same lifecycle listeners fire as
 * on the boot path: panes register, workflow and notification steps register,
 * custom indicators are collected. A connector reinstalled this way comes up
 * exactly as it would have at startup.
 */
export async function reinstallBundledPlugin({
  manager,
  pluginId,
  config,
  persistState = defaultPersistState,
}: ReinstallBundledPluginOptions): Promise<PluginManifest> {
  const bundled = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === pluginId)
  if (!bundled) {
    throw new BundledPluginUnavailableError(pluginId, 'not-bundled')
  }
  if (isFamilyExcluded(bundled.manifest, 'bootstrap')) {
    throw new BundledPluginUnavailableError(pluginId, 'family-excluded')
  }

  const existing = manager
    .getInstalledPlugins()
    .find((p) => p.manifest.id === pluginId)
  if (!existing) {
    await manager.installPlugin(bundled.manifest, bundled.factory)
  }

  const entry = reviveBootstrapEntry(pluginId, bundled.manifest.version)
  const activationConfig = config ?? entry.config

  if (existing?.status !== 'active') {
    try {
      await manager.activatePlugin(
        pluginId,
        buildActivationConfig(pluginId, activationConfig),
      )
    } catch (err) {
      // Installed but not running (a connector missing its API key, say).
      // Leave the row off rather than claiming an activation that failed.
      setLedgerEnabled(pluginId, false)
      throw err
    }
  }

  track('plugin_installed', { plugin_id: pluginId })
  persistState({ pluginId, enabled: true, config: activationConfig })
  return bundled.manifest
}
