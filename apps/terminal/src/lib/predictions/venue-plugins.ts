// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which active plugins are prediction VENUES for a given capability.
 *
 * Two properties are load-bearing and were copied into two hooks before this
 * existed. The asset class is what makes a plugin a prediction venue at all.
 * And the capability must be MARKET-SCOPED: a wildcard declaration is a data
 * source that answers for anything, while a fan-out addresses venues by name
 * and needs each one's own market id to build its call context.
 */
import type { CapabilityId } from '@pairlens/shared/plugin-types'
import type { PluginInstance } from '@pairlens/plugin-system/types'

export type PredictionVenuePlugin = {
  plugin: PluginInstance
  market: string
  /** Venue display name, matching the venue picker's suffix-stripping rule. */
  label: string
}

export function predictionPluginsFor(
  plugins: Array<PluginInstance>,
  capability: CapabilityId,
): Array<PredictionVenuePlugin> {
  const result: Array<PredictionVenuePlugin> = []
  for (const plugin of plugins) {
    if (plugin.manifest.metadata?.['assetClass'] !== 'prediction') continue
    const declaration = plugin.manifest.capabilities.find(
      (c) => c.id === capability && !c.markets.includes('*'),
    )
    const market = declaration?.markets[0]
    if (!market) continue
    result.push({ plugin, market, label: venueLabel(plugin, market) })
  }
  return result
}

function venueLabel(plugin: PluginInstance, market: string): string {
  return (
    plugin.manifest.name
      .replace(/ Market Connector$/, '')
      .replace(/ Connector$/, '') || market
  )
}
