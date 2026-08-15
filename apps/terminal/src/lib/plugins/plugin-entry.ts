// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning an installed or bundled manifest into the `RegistryPluginEntry` shape
 * the store cards, shelves and product page all speak.
 *
 * The Store and the Installed tab each grew their own copy of this and they
 * drifted: the Store classified an entry onto the right shelf (predictions, DEX,
 * exchange, themes), the Installed tab dropped everything into "installed", so
 * the same plugin got a different category depending on which surface opened its
 * product page. One function, the richer classification.
 */

import type { PluginManifest } from '@pairlens/plugin-system'
import type { RegistryPluginEntry } from '@pairlens/shared/registry-types'
import { pluginDescription } from '@/lib/plugin-text'

export function isThemeManifest(manifest: PluginManifest): boolean {
  return manifest.capabilities.some((c) => c.id === 'theme:override')
}

export function isExchangeManifest(manifest: PluginManifest): boolean {
  return manifest.capabilities.some((c) => c.id === 'market-data:candles')
}

/**
 * Local category inference for plugins the registry does not list. Asset class
 * is checked before the generic "has candles ⇒ exchange" rule so a prediction
 * or DEX venue lands on its own shelf instead of among the spot exchanges.
 */
export function manifestToEntry(manifest: PluginManifest): RegistryPluginEntry {
  const assetClass = manifest.metadata?.['assetClass']
  const category = isThemeManifest(manifest)
    ? 'themes'
    : assetClass === 'prediction'
      ? 'predictions'
      : assetClass === 'dex'
        ? 'dex'
        : isExchangeManifest(manifest)
          ? 'exchange'
          : 'installed'
  return {
    manifest,
    category,
    tagline: pluginDescription(manifest),
    bundled: true,
  }
}
