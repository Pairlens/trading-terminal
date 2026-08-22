// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
//
// Official plugin families — the asset-class-level grouping over the atomic
// plugin catalog. Every official plugin stamps `metadata.family` with one of
// these ids; deployments can exclude whole families (a bank drops 'memes', a
// crypto firm drops 'equities') and the Plugin Store groups by them. A family
// is presentation + policy only: plugin ids, capabilities and persisted state
// are unaffected by family membership, and third-party plugins are never
// filtered by family.

import type { PluginManifest } from './plugin-types'

export type PluginFamilyId =
  | 'core'
  | 'intelligence'
  | 'themes'
  | 'ai-byok'
  | 'cex-spot'
  | 'cex-futures'
  | 'dex'
  | 'memes'
  | 'equities'
  | 'predictions'

export type PluginFamilyMeta = {
  id: PluginFamilyId
  /** Terminal i18n catalog key for the family display name. */
  labelKey: string
  /** Terminal i18n catalog key for the one-line family description. */
  descriptionKey: string
  /** Display order in grouped listings. */
  order: number
  /**
   * Families the terminal refuses to exclude: the shell cannot boot without
   * core, and intelligence carries the bundled discovery/AI fallbacks.
   */
  required: boolean
}

export const PLUGIN_FAMILIES: Array<PluginFamilyMeta> = [
  {
    id: 'core',
    labelKey: 'pluginStore.families.core.label',
    descriptionKey: 'pluginStore.families.core.description',
    order: 0,
    required: true,
  },
  {
    id: 'intelligence',
    labelKey: 'pluginStore.families.intelligence.label',
    descriptionKey: 'pluginStore.families.intelligence.description',
    order: 1,
    required: true,
  },
  {
    id: 'cex-spot',
    labelKey: 'pluginStore.families.cexSpot.label',
    descriptionKey: 'pluginStore.families.cexSpot.description',
    order: 2,
    required: false,
  },
  {
    id: 'cex-futures',
    labelKey: 'pluginStore.families.cexFutures.label',
    descriptionKey: 'pluginStore.families.cexFutures.description',
    order: 3,
    required: false,
  },
  {
    id: 'dex',
    labelKey: 'pluginStore.families.dex.label',
    descriptionKey: 'pluginStore.families.dex.description',
    order: 4,
    required: false,
  },
  {
    id: 'memes',
    labelKey: 'pluginStore.families.memes.label',
    descriptionKey: 'pluginStore.families.memes.description',
    order: 5,
    required: false,
  },
  {
    id: 'equities',
    labelKey: 'pluginStore.families.equities.label',
    descriptionKey: 'pluginStore.families.equities.description',
    order: 6,
    required: false,
  },
  {
    id: 'predictions',
    labelKey: 'pluginStore.families.predictions.label',
    descriptionKey: 'pluginStore.families.predictions.description',
    order: 7,
    required: false,
  },
  {
    id: 'ai-byok',
    labelKey: 'pluginStore.families.aiByok.label',
    descriptionKey: 'pluginStore.families.aiByok.description',
    order: 8,
    required: false,
  },
  {
    id: 'themes',
    labelKey: 'pluginStore.families.themes.label',
    descriptionKey: 'pluginStore.families.themes.description',
    order: 9,
    required: false,
  },
]

export const PLUGIN_FAMILY_MAP: Record<PluginFamilyId, PluginFamilyMeta> =
  Object.fromEntries(PLUGIN_FAMILIES.map((f) => [f.id, f])) as Record<
    PluginFamilyId,
    PluginFamilyMeta
  >

const FAMILY_IDS = new Set<string>(PLUGIN_FAMILIES.map((f) => f.id))

export function isPluginFamilyId(value: unknown): value is PluginFamilyId {
  return typeof value === 'string' && FAMILY_IDS.has(value)
}

/**
 * Resolve a manifest's family. Official manifests carry an explicit
 * `metadata.family`; for unstamped manifests (third-party, older cached
 * copies) fall back to capability shape so grouped listings stay sensible.
 * Returns null when nothing matches — an unfamilied plugin is listed under
 * its own heading and is never subject to family filtering.
 */
export function pluginFamilyOf(
  manifest: PluginManifest,
): PluginFamilyId | null {
  const declared = manifest.metadata?.['family']
  if (isPluginFamilyId(declared)) return declared
  const capabilities = manifest.capabilities ?? []
  if (capabilities.some((c) => c.id === 'theme:override')) return 'themes'
  if (
    capabilities.some(
      (c) =>
        (c.id === 'ai:inference' || c.id === 'ai:web-search') &&
        c.requiresAuth !== true,
    )
  ) {
    return 'ai-byok'
  }
  const assetClass = manifest.metadata?.['assetClass']
  if (assetClass === 'memecoin') return 'memes'
  if (assetClass === 'prediction') return 'predictions'
  if (assetClass === 'stocks') return 'equities'
  if (assetClass === 'dex') return 'dex'
  if (assetClass === 'crypto-spot') return 'cex-spot'
  if (assetClass === 'crypto-perp') return 'cex-futures'
  return null
}
