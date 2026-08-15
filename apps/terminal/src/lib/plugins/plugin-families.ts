// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Deployment-level plugin family exclusion.
 *
 * `VITE_PAIRLENS_DISABLED_FAMILIES` is a build-time, comma-separated list of
 * `PluginFamilyId`s a deployment refuses to ship (a bank drops 'predictions',
 * a crypto firm drops 'equities'). Excluded families are never seeded into the
 * ledger, never installed at boot even if a stale ledger row survives from an
 * earlier build, and never listed in the Plugin Store.
 *
 * Two hard limits keep the switch from being a foot-gun:
 *  - Families marked `required` in PLUGIN_FAMILIES cannot be excluded. The
 *    shell does not boot without them; the request is warned about and ignored.
 *  - Exclusion applies ONLY to bundled (ledger source 'bootstrap') plugins. A
 *    third-party connector may share a family for *display* grouping, but a
 *    deployment switch over official plugins must never uninstall a user's own
 *    plugin. Callers pass the ledger source, or use the bootstrap-id form.
 */

import {
  PLUGIN_FAMILY_MAP,
  isPluginFamilyId,
  pluginFamilyOf,
} from '@pairlens/shared/plugin-families'
import { BOOTSTRAP_PLUGIN_IDS } from './bootstrap-bundle'
import type { PluginFamilyId } from '@pairlens/shared/plugin-families'
import type { PluginManifest } from '@pairlens/plugin-system'
import type { PluginSourceKind } from './plugin-ledger'

/**
 * Parse a raw env value into the set of families to exclude. Unknown ids and
 * required families are dropped; each rejection is reported once so a typo in
 * a deployment config is visible instead of silently doing nothing.
 */
export function parseDisabledFamilies(
  raw: string | undefined,
  warn: (message: string) => void = (m) => console.warn(m),
): Set<PluginFamilyId> {
  const excluded = new Set<PluginFamilyId>()
  if (!raw) return excluded

  const unknown: Array<string> = []
  const refused: Array<string> = []
  for (const token of raw.split(',')) {
    const id = token.trim()
    if (!id) continue
    if (!isPluginFamilyId(id)) {
      unknown.push(id)
      continue
    }
    if (PLUGIN_FAMILY_MAP[id].required) {
      refused.push(id)
      continue
    }
    excluded.add(id)
  }

  if (unknown.length > 0) {
    warn(
      `[plugins] VITE_PAIRLENS_DISABLED_FAMILIES: unknown plugin ${
        unknown.length === 1 ? 'family' : 'families'
      } ignored: ${unknown.join(', ')}`,
    )
  }
  if (refused.length > 0) {
    warn(
      `[plugins] VITE_PAIRLENS_DISABLED_FAMILIES: ${refused.join(
        ', ',
      )} cannot be excluded (required) — ignored`,
    )
  }
  return excluded
}

let cached: Set<PluginFamilyId> | null = null

/** The families this build excludes. Empty by default. */
export function excludedPluginFamilies(): ReadonlySet<PluginFamilyId> {
  if (!cached) {
    cached = parseDisabledFamilies(
      import.meta.env.VITE_PAIRLENS_DISABLED_FAMILIES as string | undefined,
    )
  }
  return cached
}

/** Test seam: drop the memoized env parse. */
export function resetExcludedPluginFamiliesCache(): void {
  cached = null
}

/**
 * True when this manifest belongs to a family the deployment excluded AND the
 * plugin is one we ship. `source` defaults to the bundled check by plugin id,
 * which is what callers that have no ledger row (the Store) rely on.
 */
export function isFamilyExcluded(
  manifest: PluginManifest,
  source?: PluginSourceKind,
): boolean {
  const bundled =
    source === undefined
      ? BOOTSTRAP_PLUGIN_IDS.has(manifest.id)
      : source === 'bootstrap'
  if (!bundled) return false
  const family = pluginFamilyOf(manifest)
  if (!family) return false
  return excludedPluginFamilies().has(family)
}
