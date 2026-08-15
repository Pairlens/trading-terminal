// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  CapabilityId,
  CapabilityQuery,
  PluginInstance,
  ResolvedPlugin,
  UserPluginPin,
} from './types.ts'

export class PluginResolver {
  private plugins: Map<string, PluginInstance> = new Map()
  // Key format: "capability|market" -> pluginId
  private userPins: Map<string, string> = new Map()

  registerPlugin(plugin: PluginInstance): void {
    this.plugins.set(plugin.manifest.id, plugin)
  }

  /**
   * Forget a plugin. Pins are deliberately left alone: unregistering is also
   * how a plugin is *replaced* (the dev zip re-import path uninstalls and
   * reinstalls the same id), so dropping pins here would silently discard the
   * user's routing choice on every reload of a plugin under development.
   * A real uninstall clears the pin locally and on the server through
   * `uninstallPluginEverywhere`, which is the one owner of that cleanup.
   */
  unregisterPlugin(pluginId: string): void {
    this.plugins.delete(pluginId)
  }

  setUserPin(capability: CapabilityId, market: string, pluginId: string): void {
    const key = `${capability}|${market}`
    this.userPins.set(key, pluginId)
  }

  removeUserPin(capability: CapabilityId, market: string): void {
    const key = `${capability}|${market}`
    this.userPins.delete(key)
  }

  getUserPins(): Array<UserPluginPin> {
    return Array.from(this.userPins.entries()).map(([key, pluginId]) => {
      const [capability, market] = key.split('|')
      return { capability: capability as CapabilityId, market, pluginId }
    })
  }

  clearAllPins(): void {
    this.userPins.clear()
  }

  isPinned(capability: CapabilityId, market: string): string | null {
    return this.userPins.get(`${capability}|${market}`) ?? null
  }

  private getCandidates(query: CapabilityQuery): Array<PluginInstance> {
    const results: Array<PluginInstance> = []

    for (const plugin of this.plugins.values()) {
      for (const decl of plugin.manifest.capabilities) {
        if (decl.id !== query.capability) continue

        // Match market: a wildcard plugin ('*') serves any request, including
        // an unspecified market (e.g. the global instrument catalog). A
        // market-specific plugin (e.g. ['jupiter']) only matches when that exact
        // market is queried — it must NOT win an unspecified/wildcard request,
        // otherwise a niche connector shadows the global provider.
        const marketMatches =
          decl.markets.includes('*') ||
          (query.market !== undefined && decl.markets.includes(query.market))

        if (marketMatches) {
          results.push(plugin)
          break // Only add each plugin once even if it declares the capability multiple times
        }
      }
    }

    return results
  }

  // Resolve single best plugin (singleton capabilities)
  resolve(query: CapabilityQuery): ResolvedPlugin | null {
    // 1. Get candidates matching capability + market (or wildcard)
    const candidates = this.getCandidates(query)

    // 2. Filter to only active plugins
    const active = candidates.filter((p) => p.status === 'active')

    if (active.length === 0) return null

    // 3. Check for user pin — if pinned, that plugin wins
    const pinKey = `${query.capability}|${query.market ?? '*'}`
    const pinnedId = this.userPins.get(pinKey)

    if (pinnedId !== undefined) {
      const pinned = active.find((p) => p.manifest.id === pinnedId)
      if (pinned !== undefined) {
        const fallbacks = active
          .filter((p) => p.manifest.id !== pinnedId)
          .sort(
            (a, b) => this.getPriority(a, query) - this.getPriority(b, query),
          )
        return { plugin: pinned, fallbacks }
      }
      // Pinned plugin not active — fall through to priority resolution
    }

    // 4. Sort by priority ascending (lower number = higher priority)
    const sorted = [...active].sort(
      (a, b) => this.getPriority(a, query) - this.getPriority(b, query),
    )

    // 5. Return first as primary, rest as fallbacks
    const [primary, ...fallbacks] = sorted
    return { plugin: primary, fallbacks }
  }

  // Resolve all plugins (broadcast capabilities)
  resolveAll(query: CapabilityQuery): Array<PluginInstance> {
    const candidates = this.getCandidates(query)
    const active = candidates.filter((p) => p.status === 'active')

    return [...active].sort(
      (a, b) => this.getPriority(a, query) - this.getPriority(b, query),
    )
  }

  // Get all registered plugins
  getPlugins(): Array<PluginInstance> {
    return Array.from(this.plugins.values())
  }

  // Get plugin by ID
  getPlugin(id: string): PluginInstance | undefined {
    return this.plugins.get(id)
  }

  // Get the declared priority for a plugin for a given query
  private getPriority(plugin: PluginInstance, query: CapabilityQuery): number {
    for (const decl of plugin.manifest.capabilities) {
      if (decl.id !== query.capability) continue

      const marketMatches =
        decl.markets.includes('*') ||
        (query.market !== undefined && decl.markets.includes(query.market))

      if (marketMatches) return decl.priority
    }
    // Should never reach here for a valid candidate; return lowest priority as safety
    return 99
  }
}
