// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { PluginResolver } from './resolver.ts'
import type {
  AccessProvider,
  CapabilityAccessResult,
  CapabilityId,
  PluginContext,
  PluginInstance,
  PluginLifecycleListener,
  PluginManifest,
  UserPluginPin,
} from './types.ts'

// Factory type for creating plugin instances
export type PluginFactory = (manifest: PluginManifest) => PluginInstance

/**
 * A provider failure the SAME request would survive: a rate limit, or a
 * transient refusal.
 *
 * Duck-typed on purpose. `ProviderThrottledError` lives in market-engine and
 * carries `__providerThrottled` precisely so it can be recognised across
 * bundles without an import; plugin-system deliberately does not depend on
 * market-engine, and adding that edge to read one boolean would be the wrong
 * trade.
 */
function isRetryableProviderError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { __providerThrottled?: unknown }).__providerThrottled === true
  )
}

/**
 * A failure the USER can act on, rather than one the caller can retry.
 *
 * Same shape as the throttle passthrough above and the same argument: wrapping
 * it erases the only thing that made it useful. A provider refusing because no
 * API key is configured is not "this data does not exist", it is "paste a key
 * and this works", and a pane that renders the wrapped
 * `All candidates for capability 'x' failed` tells someone to wait for a
 * recovery that cannot come.
 *
 * Duck-typed for the same reason: the marker is set inside a plugin bundle and
 * read here, and plugin-system does not depend on the packages that mint it.
 */
function isActionableProviderError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { __actionable?: unknown }).__actionable === true
  )
}

const DEFAULT_CONTEXT: PluginContext = {
  pair: '',
  market: '',
  timeframe: '1h',
  mode: 'paper',
  country: '',
}

export class PluginManager {
  private resolver: PluginResolver
  private context: PluginContext
  private accessProvider: AccessProvider | null = null
  private lifecycleListeners = new Set<PluginLifecycleListener>()

  constructor(initialContext?: Partial<PluginContext>) {
    this.resolver = new PluginResolver()
    this.context = { ...DEFAULT_CONTEXT, ...initialContext }
  }

  // Lifecycle listeners

  addLifecycleListener(listener: PluginLifecycleListener): void {
    this.lifecycleListeners.add(listener)
  }

  removeLifecycleListener(listener: PluginLifecycleListener): void {
    this.lifecycleListeners.delete(listener)
  }

  // Context management

  setContext(context: Partial<PluginContext>): void {
    this.context = { ...this.context, ...context }
  }

  getContext(): PluginContext {
    return { ...this.context }
  }

  // Plugin lifecycle

  async installPlugin(
    manifest: PluginManifest,
    factory: PluginFactory,
  ): Promise<void> {
    const existing = this.resolver.getPlugin(manifest.id)
    if (existing !== undefined) {
      throw new Error(
        `Plugin '${manifest.id}' is already installed. Uninstall it first.`,
      )
    }

    const instance = factory(manifest)
    // Force status to 'installed' regardless of what the factory sets
    const installed: PluginInstance = { ...instance, status: 'installed' }
    this.resolver.registerPlugin(installed)
  }

  async activatePlugin(
    pluginId: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    const plugin = this.resolver.getPlugin(pluginId)
    if (plugin === undefined) {
      throw new Error(`Plugin '${pluginId}' is not installed.`)
    }

    // Run optional initializer
    if (plugin.initialize !== undefined) {
      await plugin.initialize(config)
    }

    // Update status and config in place by re-registering a mutated copy
    const activated: PluginInstance = { ...plugin, status: 'active', config }
    this.resolver.registerPlugin(activated)

    // Notify lifecycle listeners
    for (const listener of this.lifecycleListeners) {
      listener.onActivated?.(activated)
    }
  }

  async deactivatePlugin(pluginId: string): Promise<void> {
    const plugin = this.resolver.getPlugin(pluginId)
    if (plugin === undefined) {
      throw new Error(`Plugin '${pluginId}' is not installed.`)
    }

    if (plugin.destroy !== undefined) {
      await plugin.destroy()
    }

    const deactivated: PluginInstance = { ...plugin, status: 'disabled' }
    this.resolver.registerPlugin(deactivated)

    // Notify lifecycle listeners
    for (const listener of this.lifecycleListeners) {
      listener.onDeactivated?.(pluginId)
    }
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    const plugin = this.resolver.getPlugin(pluginId)
    if (plugin === undefined) {
      throw new Error(`Plugin '${pluginId}' is not installed.`)
    }

    // Destroy if currently active
    if (plugin.status === 'active' && plugin.destroy !== undefined) {
      await plugin.destroy()
    }

    this.resolver.unregisterPlugin(pluginId)

    // Notify lifecycle listeners
    for (const listener of this.lifecycleListeners) {
      listener.onUninstalled?.(pluginId)
    }
  }

  // Execution — terminal calls these, never references plugin IDs

  async execute(
    capability: CapabilityId,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const query = { capability, market: this.context.market || undefined }
    const resolved = this.resolver.resolve(query)

    if (resolved === null) {
      throw new Error(
        `No active plugin found for capability '${capability}' on market '${this.context.market}'.`,
      )
    }

    const executeParams = {
      capability,
      params,
      context: this.getContext(),
    }

    // Side-effecting capabilities (orders, transfers) must NEVER be re-routed
    // to a fallback plugin: a thrown error (e.g. network timeout) does not
    // guarantee the action failed at the venue — re-executing elsewhere could
    // duplicate a real-money operation. Surface the original error instead.
    const declaration = resolved.plugin.manifest.capabilities.find(
      (c) => c.id === capability,
    )
    const isSideEffecting =
      capability === 'trading:orders' || declaration?.sideEffect === true

    if (isSideEffecting) {
      return await resolved.plugin.execute(executeParams)
    }

    // Try primary plugin first, then walk the fallback chain on error
    const chain = [resolved.plugin, ...resolved.fallbacks]

    let primaryError: unknown
    let retryable: unknown
    let actionable: unknown
    for (const candidate of chain) {
      try {
        return await candidate.execute(executeParams)
      } catch (err) {
        if (primaryError === undefined) primaryError = err
        if (retryable === undefined && isRetryableProviderError(err)) {
          retryable = err
        }
        if (actionable === undefined && isActionableProviderError(err)) {
          actionable = err
        }
        // Continue to next fallback
      }
    }

    // A throttled provider is rethrown UNWRAPPED, because it is the one
    // failure a caller can act on: it means "ask again in a moment", not
    // "this data does not exist". Wrapping it in a plain Error erased the
    // type, and every consumer that checks for a throttle before publishing a
    // permanent verdict ("this venue does not carry this pair", "no pools on
    // this chain") silently stopped seeing one.
    if (retryable !== undefined) throw retryable

    // An actionable refusal outranks the primary's error for the same reason a
    // throttle does: it is the one failure in the walk with a fix attached, and
    // the primary may simply be the provider that is not configured.
    if (actionable !== undefined) throw actionable

    // The PRIMARY's failure, not the last one walked. The last candidate is
    // usually the lowest-priority provider, which is the one most likely to
    // have refused on a technicality ("does not publish 'pools'") while the
    // real reason sits in the first error.
    throw new Error(
      `All candidates for capability '${capability}' failed. Primary error: ${String(primaryError)}`,
    )
  }

  // Streaming execution
  subscribe(
    capability: CapabilityId,
    params: Record<string, unknown>,
    callback: (data: unknown) => void,
  ): () => void {
    const query = { capability, market: this.context.market || undefined }
    const resolved = this.resolver.resolve(query)

    if (resolved === null) {
      throw new Error(
        `No active plugin found for capability '${capability}' on market '${this.context.market}'.`,
      )
    }

    const executeParams = {
      capability,
      params,
      context: this.getContext(),
    }

    // Try the primary plugin; if it has no subscribe method walk to fallbacks
    const chain = [resolved.plugin, ...resolved.fallbacks]

    for (const candidate of chain) {
      if (candidate.subscribe !== undefined) {
        return candidate.subscribe(executeParams, callback)
      }
    }

    throw new Error(
      `No active plugin with streaming support found for capability '${capability}'.`,
    )
  }

  // Query

  getInstalledPlugins(): Array<PluginInstance> {
    return this.resolver.getPlugins()
  }

  getActivePlugins(): Array<PluginInstance> {
    return this.resolver.getPlugins().filter((p) => p.status === 'active')
  }

  getPluginForCapability(
    capability: CapabilityId,
    market?: string,
  ): PluginInstance | null {
    const query = {
      capability,
      market: market ?? (this.context.market || undefined),
    }
    const resolved = this.resolver.resolve(query)
    return resolved?.plugin ?? null
  }

  /**
   * All active plugins providing a capability, priority-sorted. For broadcast /
   * multi-provider capabilities (e.g. `workspace-store:catalog`) where the app
   * aggregates every provider rather than picking a single best one.
   */
  getPluginsForCapability(
    capability: CapabilityId,
    market?: string,
  ): Array<PluginInstance> {
    return this.resolver.resolveAll({
      capability,
      market: market ?? (this.context.market || undefined),
    })
  }

  // User pins

  pinPlugin(capability: CapabilityId, market: string, pluginId: string): void {
    this.resolver.setUserPin(capability, market, pluginId)
  }

  unpinPlugin(capability: CapabilityId, market: string): void {
    this.resolver.removeUserPin(capability, market)
  }

  getUserPins(): Array<UserPluginPin> {
    return this.resolver.getUserPins()
  }

  clearAllPins(): void {
    this.resolver.clearAllPins()
  }

  isPinned(capability: CapabilityId, market: string): string | null {
    return this.resolver.isPinned(capability, market)
  }

  // Access control

  setAccessProvider(provider: AccessProvider | null): void {
    this.accessProvider = provider
  }

  getCapabilityAccess(
    capability: CapabilityId,
    market?: string,
  ): CapabilityAccessResult {
    const query = {
      capability,
      market: market ?? (this.context.market || undefined),
    }
    const resolved = this.resolver.resolve(query)

    if (resolved === null) {
      return { status: 'unavailable', pluginId: null }
    }

    const chain = [resolved.plugin, ...resolved.fallbacks]
    let bestDenial: CapabilityAccessResult | null = null

    for (const candidate of chain) {
      const decl = candidate.manifest.capabilities.find(
        (c) => c.id === capability,
      )
      if (!decl) continue

      // No auth required → granted
      if (!decl.requiresAuth) {
        return { status: 'granted', pluginId: candidate.manifest.id }
      }

      // Auth required — check provider
      if (!this.accessProvider || !this.accessProvider.isAuthenticated()) {
        // Record auth-required candidate
        if (!bestDenial || bestDenial.status !== 'auth-required') {
          bestDenial = {
            status: 'auth-required',
            pluginId: candidate.manifest.id,
          }
        }
        continue
      }

      // Authenticated — check access level
      if (!decl.requiredAccessLevel) {
        return { status: 'granted', pluginId: candidate.manifest.id }
      }

      const userLevel = this.accessProvider.getAccessLevel(
        candidate.manifest.id,
      )
      if (
        this.meetsAccessLevel(
          candidate.manifest,
          userLevel,
          decl.requiredAccessLevel,
        )
      ) {
        return { status: 'granted', pluginId: candidate.manifest.id }
      }

      // Insufficient access level
      if (!bestDenial || bestDenial.status === 'upgrade-required') {
        bestDenial = {
          status: 'upgrade-required',
          pluginId: candidate.manifest.id,
          requiredAccessLevel: decl.requiredAccessLevel,
          currentAccessLevel: userLevel,
        }
      }
    }

    // Return best denial — auth-required wins over upgrade-required
    return bestDenial ?? { status: 'unavailable', pluginId: null }
  }

  private meetsAccessLevel(
    manifest: PluginManifest,
    userLevel: string | null,
    requiredLevel: string,
  ): boolean {
    const levels = manifest.accessLevels
    if (!levels || !userLevel) return false
    const userIdx = levels.indexOf(userLevel)
    const requiredIdx = levels.indexOf(requiredLevel)
    if (userIdx === -1 || requiredIdx === -1) return false
    return userIdx >= requiredIdx
  }
}
