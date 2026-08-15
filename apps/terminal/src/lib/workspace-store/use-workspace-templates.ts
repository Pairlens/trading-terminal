// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RESERVED_PLUGIN_IDS } from '@pairlens/shared/plugin-manifest-schema'

import {
  BUILTIN_PROVIDER_ID,
  builtinProvider,
  createPluginStoreProvider,
} from './providers'
import { workspaceTemplateRegistry } from './workspace-template-registry'
import type {
  WorkspaceStoreListQuery,
  WorkspaceStoreProvider,
  WorkspaceStoreRegistry,
} from './provider'
import type { WorkspaceTemplate } from './types'
import { queryKeys } from '@/lib/api'
import { usePairlens } from '@/lib/pairlens-provider'
import { BOOTSTRAP_PLUGIN_IDS } from '@/lib/plugins/bootstrap-bundle'

export type WorkspaceTemplateList = {
  templates: Array<WorkspaceTemplate>
  isLoading: boolean
  registry: WorkspaceStoreRegistry
}

const RESERVED_IDS = new Set<string>(RESERVED_PLUGIN_IDS)

/**
 * Assemble the active store providers into a registry: the bundled catalog, the
 * Pairlens community store, and one adapter per active plugin declaring the
 * `workspace-store:catalog` capability. Rebuilt when plugin state changes.
 */
export function useWorkspaceStoreRegistry(): WorkspaceStoreRegistry {
  const { pluginManager, pluginStateVersion } = usePairlens()

  return useMemo(() => {
    // Touch the version so the registry rebuilds when plugins activate/deactivate.
    void pluginStateVersion
    const pluginProviders = pluginManager
      .getPluginsForCapability('workspace-store:catalog')
      .map(createPluginStoreProvider)
      // A third-party plugin must never claim a reserved first-party id (e.g.
      // shadow the built-in provider), even if it slipped past manifest
      // validation. Bootstrap plugins legitimately own their reserved id (the
      // Pairlens community store is 'pairlens-community').
      .filter((p) => {
        if (RESERVED_IDS.has(p.id) && !BOOTSTRAP_PLUGIN_IDS.has(p.id)) {
          console.warn(
            `[workspace-store] ignoring plugin store provider with reserved id "${p.id}"`,
          )
          return false
        }
        return true
      })

    const all: Array<WorkspaceStoreProvider> = [
      builtinProvider,
      ...pluginProviders,
    ]
    const providers = all.filter((p) => p.isAvailable())
    const byId = new Map(providers.map((p) => [p.id, p]))

    return {
      providers,
      submitProviders: providers.filter((p) => p.capabilities.submit),
      providerFor: (template) => {
        const providerId = template.community?.providerId ?? BUILTIN_PROVIDER_ID
        return byId.get(providerId) ?? null
      },
      list: async (query: WorkspaceStoreListQuery) => {
        const results = await Promise.all(
          providers.map((p) => p.list(query).catch(() => [])),
        )
        return results.flat()
      },
    }
  }, [pluginManager, pluginStateVersion])
}

/**
 * The templates shown in the Workspace Store — the merged catalog across every
 * available store provider. Each provider fetch is best-effort, so an offline or
 * failing provider never blanks the store.
 */
export function useWorkspaceTemplates(): WorkspaceTemplateList {
  const { pluginStateVersion } = usePairlens()
  const registry = useWorkspaceStoreRegistry()

  const query = useQuery({
    // Stable key: the `registry` closure already rebuilds on plugin-state change,
    // so we refetch below rather than mint a new key — that keeps the previous
    // grid on screen instead of blanking whenever any unrelated plugin toggles.
    queryKey: queryKeys.workspaceStore(),
    queryFn: () => registry.list({ scope: 'all' }),
    staleTime: 60_000,
    retry: 1,
    placeholderData: (prev) => prev,
  })

  // Refetch (keeping current data visible) only when the provider set may have
  // changed — i.e. when pluginStateVersion actually changes, not on every render
  // or when isFetched first flips true.
  const { refetch, isFetched } = query
  const prevVersion = useRef(pluginStateVersion)
  useEffect(() => {
    if (prevVersion.current === pluginStateVersion) return
    prevVersion.current = pluginStateVersion
    if (isFetched) void refetch()
  }, [pluginStateVersion, isFetched, refetch])

  // Plugin-contributed workspaces are not fetched — they are already in the
  // process, registered on activation. Merging them here rather than behind
  // another provider keeps the store's single list, and the id-dedupe favours
  // the registry copy: a plugin that ships a layout the bundled catalog also
  // carries is the one that owns it.
  const contributed = useSyncExternalStore(
    workspaceTemplateRegistry.subscribe,
    workspaceTemplateRegistry.getSnapshot,
    workspaceTemplateRegistry.getSnapshot,
  )

  const fetched = query.data
  const templates = useMemo(() => {
    void contributed
    const registryTemplates = workspaceTemplateRegistry.getTemplates()
    if (registryTemplates.length === 0) return fetched ?? []
    const byId = new Map<string, WorkspaceTemplate>()
    for (const t of fetched ?? []) byId.set(t.id, t)
    for (const t of registryTemplates) byId.set(t.id, t)
    return [...byId.values()]
  }, [fetched, contributed])

  return { templates, isLoading: query.isLoading, registry }
}
