// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, CircleAlert, Pin, RotateCcw, Store } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@pairlens/ui/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import { CAPABILITY_DOMAINS } from '@pairlens/shared/capability-meta'
import { PluginIcon } from './plugin-icon'
import type { CapabilityMeta } from '@pairlens/shared/capability-meta'
import type { CapabilityId } from '@pairlens/shared/plugin-types'
import type {
  PluginCapabilityDeclaration,
  PluginInstance,
} from '@pairlens/plugin-system'
import { track } from '@/lib/analytics-events'

import { usePairlens } from '@/lib/pairlens-provider'
import { api, queryKeys } from '@/lib/api'
import { missingConfigHint } from '@/lib/plugins/config-requirements'
import {
  capabilityDescription,
  capabilityDomainLabel,
  capabilityLabel,
} from '@/lib/registry-labels'

const AUTO = 'auto'

type Provider = {
  plugin: PluginInstance
  decls: Array<PluginCapabilityDeclaration>
  active: boolean
  // Why an inactive provider can't activate, e.g. "API key required"
  inactiveHint: string | null
}

type MarketRow = {
  market: string
  pinnedId: string | null
  autoName: string | null
  providers: Array<Provider>
}

type CapabilityRow = {
  meta: CapabilityMeta
  providers: Array<Provider>
  activeCount: number
  pinnedId: string | null
  pinnedActive: boolean
  autoName: string | null
  autoChain: Array<string>
  marketRows: Array<MarketRow>
  marketPinCount: number
}

// Mirror of PluginResolver.getPriority: first declaration matching the market
// scope decides. `market === undefined` is the all-markets scope, which only
// wildcard declarations serve.
function priorityFor(
  decls: Array<PluginCapabilityDeclaration>,
  market: string | undefined,
): number | null {
  for (const decl of decls) {
    const matches =
      decl.markets.includes('*') ||
      (market !== undefined && decl.markets.includes(market))
    if (matches) return decl.priority
  }
  return null
}

function formatChain(
  chain: Array<string>,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const shown = chain.slice(0, 3)
  const rest = chain.length - shown.length
  const base = shown.join(' → ')
  return rest > 0
    ? t('pluginStore.chainMore', { chain: base, count: rest })
    : base
}

function autoOrder(
  providers: Array<Provider>,
  market: string | undefined,
): Array<Provider> {
  return providers
    .map((p) => ({ p, prio: p.active ? priorityFor(p.decls, market) : null }))
    .filter((e): e is { p: Provider; prio: number } => e.prio !== null)
    .sort((a, b) => a.prio - b.prio)
    .map((e) => e.p)
}

export function CapabilityProviders() {
  const { t } = useTranslation()
  const { pluginManager, pluginStateVersion, notifyPluginStateChange } =
    usePairlens()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { rows, hasPins } = useMemo(() => {
    // Force re-compute when plugin state changes
    void pluginStateVersion

    const installed = pluginManager.getInstalledPlugins()

    const buildRow = (meta: CapabilityMeta): CapabilityRow => {
      const providers: Array<Provider> = []
      for (const plugin of installed) {
        const decls = plugin.manifest.capabilities.filter(
          (c) => c.id === meta.id,
        )
        if (decls.length > 0) {
          const active = plugin.status === 'active'
          providers.push({
            plugin,
            decls,
            active,
            inactiveHint: active ? null : missingConfigHint(plugin.manifest),
          })
        }
      }
      // Active providers first, then by declared priority (lower wins)
      providers.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        const pa = Math.min(...a.decls.map((d) => d.priority))
        const pb = Math.min(...b.decls.map((d) => d.priority))
        return pa - pb
      })

      const activeCount = providers.filter((p) => p.active).length
      const pinnedId = pluginManager.isPinned(meta.id, '*')
      const pinnedActive =
        pinnedId !== null &&
        providers.some((p) => p.plugin.manifest.id === pinnedId && p.active)

      const chain = autoOrder(providers, undefined)
      const autoName = chain[0]?.plugin.manifest.name ?? null

      // Concrete markets served by more than one provider are the only ones
      // where a per-market override changes anything
      const concreteMarkets = new Set<string>()
      for (const p of providers) {
        for (const decl of p.decls) {
          for (const m of decl.markets) {
            if (m !== '*') concreteMarkets.add(m)
          }
        }
      }
      const marketRows: Array<MarketRow> = []
      let marketPinCount = 0
      for (const market of Array.from(concreteMarkets).sort()) {
        const capable = providers.filter(
          (p) => priorityFor(p.decls, market) !== null,
        )
        const pin = pluginManager.isPinned(meta.id, market)
        if (pin !== null) marketPinCount++
        if (capable.length < 2 && pin === null) continue
        marketRows.push({
          market,
          pinnedId: pin,
          autoName:
            autoOrder(providers, market)[0]?.plugin.manifest.name ?? null,
          providers: capable,
        })
      }

      return {
        meta,
        providers,
        activeCount,
        pinnedId,
        pinnedActive,
        autoName,
        autoChain: chain.map((p) => p.plugin.manifest.name),
        marketRows,
        marketPinCount,
      }
    }

    return {
      rows: CAPABILITY_DOMAINS.map((domain) => ({
        id: domain.id,
        label: domain.label,
        capabilities: domain.capabilities.map(buildRow),
      })),
      hasPins: pluginManager.getUserPins().length > 0,
    }
  }, [pluginManager, pluginStateVersion])

  // Pins apply optimistically — the resolver is local state — and roll back
  // if the server rejects the persistence call
  const restorePin = (
    capability: CapabilityId,
    market: string,
    previous: string | null,
  ) => {
    if (previous === null) {
      pluginManager.unpinPlugin(capability, market)
    } else {
      pluginManager.pinPlugin(capability, market, previous)
    }
    notifyPluginStateChange()
  }

  const pinMutation = useMutation({
    mutationFn: (data: {
      capability: CapabilityId
      market: string
      pluginId: string
    }) => api.setPluginPin(data),
    onMutate: (data) => {
      const previous = pluginManager.isPinned(data.capability, data.market)
      pluginManager.pinPlugin(data.capability, data.market, data.pluginId)
      notifyPluginStateChange()
      return { previous }
    },
    onError: (err, data, context) => {
      restorePin(data.capability, data.market, context?.previous ?? null)
      toast.error(t('pluginStore.saveOverrideFailed'), {
        description: String(err),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pluginPins() })
    },
  })

  const unpinMutation = useMutation({
    mutationFn: (data: { capability: CapabilityId; market: string }) =>
      api.removePluginPin(data.capability, data.market),
    onMutate: (data) => {
      const previous = pluginManager.isPinned(data.capability, data.market)
      pluginManager.unpinPlugin(data.capability, data.market)
      notifyPluginStateChange()
      return { previous }
    },
    onError: (err, data, context) => {
      restorePin(data.capability, data.market, context?.previous ?? null)
      toast.error(t('pluginStore.removeOverrideFailed'), {
        description: String(err),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pluginPins() })
    },
  })

  const resetAllPinsMutation = useMutation({
    mutationFn: () => api.removeAllPluginPins(),
    onMutate: () => {
      const previous = pluginManager.getUserPins()
      pluginManager.clearAllPins()
      notifyPluginStateChange()
      return { previous }
    },
    onError: (err, _data, context) => {
      for (const pin of context?.previous ?? []) {
        pluginManager.pinPlugin(pin.capability, pin.market, pin.pluginId)
      }
      notifyPluginStateChange()
      toast.error(t('pluginStore.resetOverridesFailed'), {
        description: String(err),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pluginPins() })
    },
  })

  const handleChange = (capability: CapabilityId, market: string) => {
    return (value: string | null) => {
      if (value === null) return
      track('ai_provider_selected', {
        capability,
        plugin_id: value === AUTO ? 'auto' : value,
      })
      if (value === AUTO) {
        unpinMutation.mutate({ capability, market })
      } else {
        pinMutation.mutate({ capability, market, pluginId: value })
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <section className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t('pluginStore.capabilityProvidersTitle')}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {t('pluginStore.capabilityProvidersDescription')}
          </p>
        </div>
        {hasPins && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs"
            onClick={() => resetAllPinsMutation.mutate()}
            disabled={resetAllPinsMutation.isPending}
          >
            <RotateCcw className="size-3" />
            {t('pluginStore.resetAllOverrides')}
          </Button>
        )}
      </section>

      <div className="space-y-6">
        {rows.map((domain) => (
          <section key={domain.id}>
            <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {capabilityDomainLabel(t, domain)}
            </h3>
            <div className="divide-y rounded-xl border">
              {domain.capabilities.map((row) => (
                <CapabilityRowView
                  key={row.meta.id}
                  row={row}
                  onChange={handleChange}
                  onBrowseStore={() =>
                    navigate({ to: '/plugins', search: { tab: 'store' } })
                  }
                  onManagePlugins={() =>
                    navigate({ to: '/plugins', search: { tab: 'installed' } })
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function CapabilityRowView({
  row,
  onChange,
  onBrowseStore,
  onManagePlugins,
}: {
  row: CapabilityRow
  onChange: (
    capability: CapabilityId,
    market: string,
  ) => (value: string | null) => void
  onBrowseStore: () => void
  onManagePlugins: () => void
}) {
  const { t } = useTranslation()
  const { meta, providers, activeCount, pinnedId, pinnedActive } = row
  const pinned = pinnedId !== null

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 pt-0.5">
          <span className="text-sm font-medium">
            {capabilityLabel(t, meta)}
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {capabilityDescription(t, meta)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {providers.length === 0 ? (
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-muted-foreground">
                {t('pluginStore.noProviderInstalled')}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={onBrowseStore}
              >
                <Store className="size-3" />
                {t('pluginStore.browseStore')}
              </Button>
            </div>
          ) : activeCount === 0 ? (
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <CircleAlert className="size-3.5" />
                {providers.every((p) => p.inactiveHint !== null)
                  ? providers.length === 1
                    ? t('pluginStore.installedNeedsKeySingle')
                    : t('pluginStore.installedNeedsKeyPlural', {
                        count: providers.length,
                      })
                  : providers.length === 1
                    ? t('pluginStore.installedDisabledSingle')
                    : t('pluginStore.installedDisabledPlural', {
                        count: providers.length,
                      })}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onManagePlugins}
              >
                {t('pluginStore.manage')}
              </Button>
            </div>
          ) : (
            <ProviderSelect
              value={pinnedId ?? AUTO}
              autoName={row.autoName}
              providers={providers}
              onChange={onChange(meta.id, '*')}
            />
          )}

          {pinned && pinnedActive && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <Pin className="size-2.5 fill-current" />
              {t('pluginStore.pinnedActiveNote')}
            </span>
          )}
          {pinned && !pinnedActive && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <CircleAlert className="size-2.5" />
              {t('pluginStore.pinnedInactiveNote')}
            </span>
          )}
          {!pinned && row.autoChain.length > 1 && (
            <span className="max-w-72 truncate text-[10px] text-muted-foreground">
              {t('pluginStore.autoOrderLabel', {
                chain: formatChain(row.autoChain, t),
              })}
            </span>
          )}
          {!pinned && row.autoName === null && activeCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {t('pluginStore.resolvedPerMarket')}
            </span>
          )}
        </div>
      </div>

      {row.marketRows.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" />
            {t('pluginStore.marketOverrides')}
            {row.marketPinCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                {t('pluginStore.pinnedCountBadge', {
                  count: row.marketPinCount,
                })}
              </Badge>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1 rounded-lg bg-muted/30 p-2">
              {row.marketRows.map((marketRow) => (
                <div
                  key={marketRow.market}
                  className="flex items-center justify-between gap-3 px-2 py-1"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
                    {marketRow.market}
                    {marketRow.pinnedId !== null && (
                      <Pin className="size-2.5 fill-current text-emerald-500" />
                    )}
                  </span>
                  <ProviderSelect
                    value={marketRow.pinnedId ?? AUTO}
                    autoName={marketRow.autoName}
                    providers={marketRow.providers}
                    onChange={onChange(meta.id, marketRow.market)}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

function ProviderSelect({
  value,
  autoName,
  providers,
  onChange,
  size = 'default',
}: {
  value: string
  autoName: string | null
  providers: Array<Provider>
  onChange: (value: string | null) => void
  size?: 'sm' | 'default'
}) {
  const { t } = useTranslation()
  // A stale pin can reference a plugin that is no longer installed — keep it
  // selectable so the trigger renders something meaningful and Automatic
  // remains one click away
  const orphanPin =
    value !== AUTO && !providers.some((p) => p.plugin.manifest.id === value)

  const renderValue = (selected: string | null) => {
    if (selected === null || selected === AUTO) {
      return (
        <span className="flex items-center gap-1.5">
          <span>{t('pluginStore.automatic')}</span>
          {autoName !== null && (
            <span className="text-muted-foreground">· {autoName}</span>
          )}
        </span>
      )
    }
    const provider = providers.find((p) => p.plugin.manifest.id === selected)
    if (!provider) {
      return <span className="text-muted-foreground">{selected}</span>
    }
    return (
      <span className="flex items-center gap-1.5">
        <PluginIcon
          src={provider.plugin.manifest.icon}
          name={provider.plugin.manifest.name}
          themeColors={provider.plugin.manifest.theme?.previewColors}
          className="size-4"
        />
        <span>{provider.plugin.manifest.name}</span>
      </span>
    )
  }

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== value) onChange(next)
      }}
    >
      <SelectTrigger size={size} className="w-72 justify-between">
        <SelectValue>{renderValue}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="w-auto min-w-(--anchor-width)">
        <SelectItem value={AUTO}>
          <span>{t('pluginStore.automatic')}</span>
          {autoName !== null && (
            <span className="text-muted-foreground">· {autoName}</span>
          )}
        </SelectItem>
        <SelectSeparator />
        {providers.map(({ plugin, active, inactiveHint }) => (
          <SelectItem
            key={plugin.manifest.id}
            value={plugin.manifest.id}
            disabled={!active && value !== plugin.manifest.id}
          >
            <PluginIcon
              src={plugin.manifest.icon}
              name={plugin.manifest.name}
              themeColors={plugin.manifest.theme?.previewColors}
              className="size-4"
            />
            <span>{plugin.manifest.name}</span>
            {!active && (
              <span className="text-muted-foreground">
                ({inactiveHint?.toLowerCase() ?? t('pluginStore.disabledHint')})
              </span>
            )}
          </SelectItem>
        ))}
        {orphanPin && (
          <SelectItem value={value}>
            <span className="text-muted-foreground">
              {t('pluginStore.notInstalled', { id: value })}
            </span>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}
