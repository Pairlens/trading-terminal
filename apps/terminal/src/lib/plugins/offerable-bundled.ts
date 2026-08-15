// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which compiled-in plugins this deployment may still offer.
 *
 * A bundled plugin the user uninstalled still ships in the binary, so the
 * Plugin Store keeps listing it with an Install action — that is what makes
 * dropping an asset class reversible instead of a one-way door. But a plugin
 * whose family the deployment excluded (`VITE_PAIRLENS_DISABLED_FAMILIES`) is
 * not part of the product at all: it must never appear as an installable card,
 * and `reinstallBundledPlugin` refuses it.
 *
 * Three places used to answer that question separately (the Store's entry
 * merge, its deep-link fallback, and the reinstall guard) and only two of them
 * applied the family filter. One seam now, so a card and the button on it can
 * never disagree.
 */

import type { PluginManifest } from '@pairlens/plugin-system'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'
import { isFamilyExcluded } from '@/lib/plugins/plugin-families'

/**
 * The bundled manifest for this id, or null when the id does not ship with
 * Pairlens or belongs to a family this deployment excluded.
 */
export function findOfferableBundledManifest(
  pluginId: string,
): PluginManifest | null {
  const bundled = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === pluginId)
  if (!bundled) return null
  return isFamilyExcluded(bundled.manifest, 'bootstrap')
    ? null
    : bundled.manifest
}

/**
 * Every bundled manifest this deployment can offer, optionally minus the ids
 * already installed (the Store lists those from the manager instead).
 */
export function listOfferableBundledManifests(options?: {
  excludeIds?: ReadonlySet<string>
}): Array<PluginManifest> {
  const exclude = options?.excludeIds
  const out: Array<PluginManifest> = []
  for (const { manifest } of BOOTSTRAP_PLUGINS) {
    if (exclude?.has(manifest.id)) continue
    if (isFamilyExcluded(manifest, 'bootstrap')) continue
    out.push(manifest)
  }
  return out
}
