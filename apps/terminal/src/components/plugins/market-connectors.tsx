// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cable, Check, ExternalLink, Loader2, Store, X } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Switch } from '@pairlens/ui/components/ui/switch'
import { PluginIcon } from './plugin-icon'
import { useRegistryPlugins } from './use-registry'
import type { PluginInstance } from '@pairlens/plugin-system'
import type { RegistryPluginEntry } from '@pairlens/shared/registry-types'

import type { PluginStateResponse } from '@/lib/api'
import { missingConfigHint } from '@/lib/plugins/config-requirements'
import { api, queryKeys } from '@/lib/api'
import { buildActivationConfig } from '@/lib/plugins/official-config'
import { isFamilyExcluded } from '@/lib/plugins/plugin-families'
import { usePairlens } from '@/lib/pairlens-provider'
import { pluginDescription, pluginTitle } from '@/lib/plugin-text'

function isMarketConnector(plugin: PluginInstance): boolean {
  return plugin.manifest.capabilities.some(
    (c) => c.id === 'market-data:candles',
  )
}

export function MarketConnectors() {
  const { t } = useTranslation()
  const { pluginManager, pluginStateVersion, notifyPluginStateChange } =
    usePairlens()
  const queryClient = useQueryClient()

  // Force re-render when plugin state changes
  void pluginStateVersion

  const connectors = useMemo(
    () => pluginManager.getInstalledPlugins().filter(isMarketConnector),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )

  const installedIds = useMemo(
    () => new Set(connectors.map((c) => c.manifest.id)),
    [connectors],
  )

  const statesQuery = useQuery({
    queryKey: queryKeys.pluginStates(),
    queryFn: () => api.getPluginStates(),
  })

  const statesMap = useMemo(() => {
    const map: Record<string, PluginStateResponse> = {}
    for (const s of statesQuery.data ?? []) {
      map[s.pluginId] = s
    }
    return map
  }, [statesQuery.data])

  const saveStateMutation = useMutation({
    mutationFn: (data: {
      pluginId: string
      enabled: boolean
      config: Record<string, unknown>
    }) => api.setPluginState(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.pluginStates() }),
  })

  const [busyId, setBusyId] = useState<string | null>(null)

  const handleToggle = useCallback(
    async (plugin: PluginInstance, enable: boolean) => {
      const id = plugin.manifest.id
      setBusyId(id)
      try {
        if (enable) {
          const config = statesMap[id]?.config ?? plugin.config ?? {}
          await pluginManager.activatePlugin(
            id,
            buildActivationConfig(id, config),
          )
          toast.success(
            t('pluginStore.enabledToast', { name: plugin.manifest.name }),
          )
        } else {
          await pluginManager.deactivatePlugin(id)
          toast.success(
            t('pluginStore.disabledToast', { name: plugin.manifest.name }),
          )
        }
        notifyPluginStateChange()
        saveStateMutation.mutate({
          pluginId: id,
          enabled: enable,
          config: statesMap[id]?.config ?? plugin.config ?? {},
        })
      } catch (err) {
        toast.error(
          enable
            ? t('pluginStore.enableFailedShort')
            : t('pluginStore.disableFailedShort'),
          { description: String(err) },
        )
      } finally {
        setBusyId(null)
      }
    },
    [pluginManager, statesMap, saveStateMutation, notifyPluginStateChange, t],
  )

  const activeCount = connectors.filter((c) => c.status === 'active').length

  // Registry exchange plugins not yet installed. Bundled connectors whose
  // family this deployment excluded are not offered here either.
  const registryQuery = useRegistryPlugins('exchange')
  const registryExtras = useMemo(() => {
    if (!registryQuery.data?.plugins) return []
    return registryQuery.data.plugins.filter(
      (e) => !installedIds.has(e.manifest.id) && !isFamilyExcluded(e.manifest),
    )
  }, [registryQuery.data, installedIds])

  return (
    <div className="mx-auto max-w-4xl p-6">
      <section className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight">
          {t('pluginStore.marketConnectorsTitle')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('pluginStore.marketConnectorsDescription')}
        </p>
      </section>

      <div className="mb-4">
        <Badge variant="outline" className="gap-1.5 text-[10px] tabular-nums">
          <Cable className="size-3" />
          {t('pluginStore.activeCountBadge', {
            active: activeCount,
            total: connectors.length,
          })}
        </Badge>
      </div>

      {/* Installed connectors */}
      <div className="space-y-2">
        {connectors.map((connector) => {
          const active = connector.status === 'active'
          const configHint = missingConfigHint(connector.manifest)
          const busy = busyId === connector.manifest.id

          const canTrade = connector.manifest.capabilities.some(
            (c) => c.id === 'trading:orders',
          )
          const markets = connector.manifest.capabilities
            .filter((c) => c.id === 'market-data:candles')
            .flatMap((c) => c.markets)

          return (
            <div
              key={connector.manifest.id}
              className="flex items-center gap-4 rounded-[14px] bg-card p-4 transition-colors hover:bg-muted/30"
            >
              <PluginIcon
                id={connector.manifest.id}
                src={connector.manifest.icon}
                name={connector.manifest.name}
                className="size-10"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {pluginTitle(connector.manifest)}
                  </span>
                  {/* A connector enabled but missing its own required
                      config is not connected, and saying so is worth more
                      than a green tick: OpenSea is the first market connector
                      whose DATA needs a key, so "Connected" would have
                      promised a board that answers 401 on every read. */}
                  {active && configHint && (
                    <Badge
                      variant="outline"
                      className="h-4 gap-1 border-amber-500/30 bg-amber-500/10 px-1.5 text-[9px] text-amber-700 dark:text-amber-400"
                    >
                      {configHint}
                    </Badge>
                  )}
                  {active && !configHint && (
                    <Badge
                      variant="outline"
                      className="h-4 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[9px] text-emerald-700 dark:text-emerald-400"
                    >
                      <Check className="size-2.5" />
                      {t('pluginStore.connected')}
                    </Badge>
                  )}
                  {!active && (
                    <Badge
                      variant="outline"
                      className="h-4 gap-1 px-1.5 text-[9px] text-muted-foreground"
                    >
                      <X className="size-2.5" />
                      {t('pluginStore.disabledStatus')}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {pluginDescription(connector.manifest)}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  {markets
                    .filter((m) => m !== '*')
                    .map((m) => (
                      <Badge
                        key={m}
                        variant="secondary"
                        className="h-4 px-1.5 text-[9px]"
                      >
                        {m.toUpperCase()}
                      </Badge>
                    ))}
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                    {canTrade
                      ? t('pluginStore.readAndTrade')
                      : t('pluginStore.readOnly')}
                  </Badge>
                </div>
              </div>

              <div className="shrink-0">
                {busy ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <Switch
                    checked={active}
                    onCheckedChange={(checked) =>
                      handleToggle(connector, checked)
                    }
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {connectors.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {t('pluginStore.noConnectorsInstalled')}
        </div>
      )}

      {/* Registry exchange plugins — not yet installed */}
      {registryExtras.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2">
            <Store className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              {t('pluginStore.moreConnectors')}
            </h3>
            <span className="text-xs text-muted-foreground">
              {t('pluginStore.fromPluginStore')}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {registryExtras.map((entry) => (
              <RegistryExchangeCard key={entry.manifest.id} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function RegistryExchangeCard({ entry }: { entry: RegistryPluginEntry }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-card p-4 transition-colors hover:bg-muted/30">
      <div className="flex items-center gap-3">
        <PluginIcon
          id={entry.manifest.id}
          src={entry.manifest.icon}
          name={entry.manifest.name}
          className="size-8"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{entry.manifest.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {t('pluginStore.versionAuthor', {
              version: entry.manifest.version,
              author: entry.manifest.author,
            })}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{entry.tagline}</p>
      {entry.manifest.homepage && (
        <a
          href={entry.manifest.homepage}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          <ExternalLink className="size-2.5" />
          {t('pluginStore.learnMore')}
        </a>
      )}
    </div>
  )
}
