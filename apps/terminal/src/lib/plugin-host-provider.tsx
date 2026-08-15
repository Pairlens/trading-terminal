// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useContext, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import { PluginHostContext } from '@pairlens/plugin-sdk/host-context'

import { usePairlens } from './pairlens-provider'
import { useOptimisticSession } from './session'
import { PaneContext, usePanePair, usePaneWallet } from './layout/pane-context'
import { usePaneRegistry } from './layout/pane-registry'
import { useServiceRegistry } from './service-registry-context'
import type {
  NotifyOptions,
  PluginHostServices,
} from '@pairlens/plugin-sdk/host-context'
import type { ReactNode } from 'react'
import type { CapabilityId } from '@pairlens/plugin-system'

type PluginHostProviderProps = {
  paneType: string
  children: ReactNode
}

export function PluginHostProvider({
  paneType,
  children,
}: PluginHostProviderProps) {
  const { pluginManager, pluginStateVersion } = usePairlens()
  const { session } = useOptimisticSession()
  const navigate = useNavigate()
  const registry = usePaneRegistry()
  const pair = usePanePair()
  const wallet = usePaneWallet()
  const serviceRegistry = useServiceRegistry()

  // Read pairSource from PaneContext — unconditional useContext (null when outside provider)
  const paneCtx = useContext(PaneContext)
  const pairSource = paneCtx?.pairSource ?? (pair ? 'global' : null)
  const walletSource = paneCtx?.walletSource ?? (wallet ? 'global' : null)

  // Determine which plugin owns this pane
  const pluginId = registry.getPluginForPane(paneType) ?? 'builtin'

  // Get the plugin's active config
  const pluginConfig = useMemo(() => {
    const plugin = pluginManager
      .getInstalledPlugins()
      .find((p) => p.manifest.id === pluginId)
    return plugin?.config ?? {}
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginId, pluginStateVersion])

  // Resolve user tier from AccessProvider entitlements.
  //
  // We probe the access level for 'market-data:discovery' because it resolves
  // to 'pairlens-intelligence' — the primary platform plugin. The AccessProvider
  // is keyed by plugin ID, so `currentAccessLevel` reflects the user's
  // subscription tier as returned by the entitlements endpoint. This correctly
  // gives us the user's tier without a dedicated tier API.
  const userTier = useMemo(() => {
    const access = pluginManager.getCapabilityAccess(
      'market-data:discovery' as CapabilityId,
    )
    return access.currentAccessLevel ?? null
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginStateVersion])

  // Execute a capability through the plugin manager
  const executeCapability = useCallback(
    (capability: CapabilityId, params: Record<string, unknown>) =>
      pluginManager.execute(capability, params),
    [pluginManager],
  )

  // Subscribe to a streaming capability
  const subscribeCapability = useCallback(
    (
      capability: CapabilityId,
      params: Record<string, unknown>,
      callback: (data: unknown) => void,
    ) => pluginManager.subscribe(capability, params, callback),
    [pluginManager],
  )

  // Navigation
  const navigateTo = useCallback(
    (path: string) => {
      navigate({ to: path })
    },
    [navigate],
  )

  // Notifications via sonner toast
  const notify = useCallback((message: string, opts?: NotifyOptions) => {
    if (opts?.type === 'error') {
      toast.error(message, { description: opts.description })
    } else if (opts?.type === 'success') {
      toast.success(message, { description: opts.description })
    } else {
      toast.info(message, { description: opts?.description })
    }
  }, [])

  // Plugin-scoped localStorage persistence
  const getStorage = useCallback(
    <T,>(key: string, defaultValue: T): T => {
      try {
        const stored = localStorage.getItem(`plugin:${pluginId}:${key}`)
        if (stored === null) return defaultValue
        return JSON.parse(stored) as T
      } catch {
        return defaultValue
      }
    },
    [pluginId],
  )

  const setStorage = useCallback(
    <T,>(key: string, value: T): void => {
      try {
        localStorage.setItem(`plugin:${pluginId}:${key}`, JSON.stringify(value))
      } catch {
        // Storage full or unavailable
      }
    },
    [pluginId],
  )

  // Service registry — scoped to current plugin
  const registerService = useCallback(
    (name: string, service: unknown) =>
      serviceRegistry.register(pluginId, name, service),
    [serviceRegistry, pluginId],
  )

  const getService = useCallback(
    <T,>(name: string): T | null => serviceRegistry.get<T>(name),
    [serviceRegistry],
  )

  const onServiceChange = useCallback(
    (name: string, callback: () => void) =>
      serviceRegistry.onChange(name, callback),
    [serviceRegistry],
  )

  // Access level for a specific plugin — delegates to the AccessProvider.
  //
  // The probe works by naming one of the plugin's own capabilities, because
  // the AccessProvider is keyed by the plugin that SERVES a capability. That
  // leaves one case the fallback gets wrong: a plugin with no capabilities at
  // all (a panels-only plugin like `pairlens-predictions`) would fall through
  // to 'market-data:discovery' and be answered by whichever plugin serves
  // discovery — reporting someone else's entitlement as its own. An installed
  // plugin we cannot probe gets null, which callers read as "unrestricted",
  // and a plugin that declares nothing is gating nothing.
  const getAccessLevel = useCallback(
    (targetPluginId: string) => {
      const target = pluginManager
        .getInstalledPlugins()
        .find((p) => p.manifest.id === targetPluginId)
      const own = target?.manifest.capabilities[0]?.id
      if (target && !own) return null
      const access = pluginManager.getCapabilityAccess(
        own ?? 'market-data:discovery',
      )
      return access.currentAccessLevel ?? null
    },
    [pluginManager],
  )

  const services = useMemo<PluginHostServices>(
    () => ({
      pluginId,
      pair,
      pairSource,
      wallet,
      walletSource,
      pluginManager,
      executeCapability,
      subscribeCapability,
      isAuthenticated: !!session,
      userTier,
      getAccessLevel,
      navigate: navigateTo,
      notify,
      config: pluginConfig,
      getStorage,
      setStorage,
      registerService,
      getService,
      onServiceChange,
    }),
    [
      pluginId,
      pair,
      pairSource,
      wallet,
      walletSource,
      pluginManager,
      executeCapability,
      subscribeCapability,
      session,
      userTier,
      getAccessLevel,
      navigateTo,
      notify,
      pluginConfig,
      getStorage,
      setStorage,
      registerService,
      getService,
      onServiceChange,
    ],
  )

  return (
    <PluginHostContext.Provider value={services}>
      {children}
    </PluginHostContext.Provider>
  )
}
