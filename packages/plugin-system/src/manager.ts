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

    let lastError: unknown
    for (const candidate of chain) {
      try {
        return await candidate.execute(executeParams)
      } catch (err) {
        lastError = err
        // Continue to next fallback
      }
    }

    throw new Error(
      `All candidates for capability '${capability}' failed. Last error: ${String(lastError)}`,
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
