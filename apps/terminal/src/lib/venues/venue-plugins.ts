// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which active plugins are VENUES of a given asset class, for a capability the
 * caller means to fan out over.
 *
 * Two properties are load-bearing and were copied into two hooks before this
 * existed. The asset class is what makes a plugin a venue of that family at
 * all. And the capability must be MARKET-SCOPED: a wildcard declaration is a
 * data source that answers for anything, while a fan-out addresses venues by
 * name and needs each one's own market id to build its call context.
 *
 * The asset class is a parameter rather than a constant because the shape is
 * identical for every family that fans a capability across its venues —
 * predictions do it for `market-data:events` and `trading:positions`, futures
 * do it for `trading:positions`. Copying the module for the second family is
 * how the wildcard rule would have been dropped from one of the copies.
 */
import type { CapabilityId } from '@pairlens/shared/plugin-types'
import type { PluginInstance } from '@pairlens/plugin-system/types'

export type VenuePlugin = {
  plugin: PluginInstance
  market: string
  /** Venue display name, matching the venue picker's suffix-stripping rule. */
  label: string
}

export function venuePluginsFor(
  plugins: Array<PluginInstance>,
  capability: CapabilityId,
  assetClass: string,
): Array<VenuePlugin> {
  const result: Array<VenuePlugin> = []
  for (const plugin of plugins) {
    if (plugin.manifest.metadata?.['assetClass'] !== assetClass) continue
    const declaration = plugin.manifest.capabilities.find(
      (c) => c.id === capability && !c.markets.includes('*'),
    )
    const market = declaration?.markets[0]
    if (!market) continue
    result.push({ plugin, market, label: venueLabel(plugin, market) })
  }
  return result
}

/** The prediction family's venues. */
export function predictionPluginsFor(
  plugins: Array<PluginInstance>,
  capability: CapabilityId,
): Array<VenuePlugin> {
  return venuePluginsFor(plugins, capability, 'prediction')
}

/** The perpetual-futures family's venues. */
export function futuresPluginsFor(
  plugins: Array<PluginInstance>,
  capability: CapabilityId,
): Array<VenuePlugin> {
  return venuePluginsFor(plugins, capability, 'crypto-perp')
}

function venueLabel(plugin: PluginInstance, market: string): string {
  return (
    plugin.manifest.name
      .replace(/ Market Connector$/, '')
      .replace(/ Connector$/, '') || market
  )
}
