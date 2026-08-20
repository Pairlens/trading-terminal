// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { ExternalLink, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Skeleton } from '@pairlens/ui/components/ui/skeleton'
import { usePanePair } from '@pairlens/plugin-sdk'
import { BottomPanelPlaceholder } from './bottom-panel-placeholder'
import type { LegacyAssetClassMap } from '@/lib/market-ref/legacy'

import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { api } from '@/lib/api'
import { hasAppServer } from '@/lib/auth-client'
import { legacySymbolToInstrumentRef } from '@/lib/market-ref/legacy'
import { tickerOverviewTarget } from '@/lib/ticker-overview'

export function PairInfoPane() {
  const activePair = usePanePair()

  if (!activePair) {
    return <PanePairPicker />
  }

  return <PairInfoPaneInner pairKey={activePair.pairKey} />
}

function PairInfoPaneInner({ pairKey }: { pairKey: string }) {
  const { t } = useTranslation()

  // The same class rule the rest of the app navigates by: the side table a
  // picker wrote first, then the symbol's own shape. Reading the table ALONE
  // is what emptied this pane, because a pair reached by a shared link, by the
  // recents strip or by a venue switch never passed through a picker — so
  // MNT-USDT, a crypto pair by any reading, was refused as an unsupported
  // class rather than looked up.
  const [assetClassMap] = usePersistedState<LegacyAssetClassMap>(
    'pair-picker.assetClassMap',
    {},
  )
  const target = useMemo(
    () =>
      tickerOverviewTarget(legacySymbolToInstrumentRef(pairKey, assetClassMap)),
    [pairKey, assetClassMap],
  )

  // `api`, not the plugin transport: `usePluginFetch` builds its base from the
  // OWNING plugin's config, and only the two backend-bound official plugins
  // are handed one. This pane belongs to `pairlens-core`, so every request it
  // made went to the terminal's own origin — a 404 in dev, the SPA shell in
  // the hosted build, and an empty pane in both.
  const { data, isLoading, error } = useQuery({
    queryKey: ['ticker-overview', target?.assetClass, target?.ticker],
    queryFn: () => api.getTickerOverview(target!.ticker, target!.assetClass),
    enabled: hasAppServer && target !== null,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  })

  const overview = data?.overview ?? null

  if (!target) {
    return (
      <BottomPanelPlaceholder
        icon={Info}
        title={t('pairInfo.title')}
        description={t('pairInfo.unsupported')}
      />
    )
  }

  if (!hasAppServer) {
    return (
      <BottomPanelPlaceholder
        icon={Info}
        title={t('pairInfo.title')}
        description={t('pairInfo.standalone')}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-3 py-1">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 pt-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    )
  }

  if (error || !overview) {
    return (
      <BottomPanelPlaceholder
        icon={Info}
        title={t('pairInfo.title')}
        description={error ? t('pairInfo.loadError') : t('pairInfo.noData')}
      />
    )
  }

  const facts: Array<{ label: string; value: string }> = []
  if (overview.marketCap != null) {
    facts.push({
      label: t('pairInfo.marketCap'),
      value: formatLargeNumber(overview.marketCap),
    })
  }
  if (overview.primaryExchange) {
    facts.push({
      label: t('pairInfo.exchange'),
      value: overview.primaryExchange,
    })
  }
  if (overview.sicDescription) {
    facts.push({
      label: t('pairInfo.industry'),
      value: overview.sicDescription,
    })
  }
  if (overview.totalEmployees != null) {
    facts.push({
      label: t('pairInfo.employees'),
      value: overview.totalEmployees.toLocaleString(),
    })
  }
  if (overview.listDate) {
    facts.push({ label: t('pairInfo.listed'), value: overview.listDate })
  }
  if (overview.dateLaunched) {
    facts.push({
      label: t('pairInfo.launched'),
      value: overview.dateLaunched.split('T')[0],
    })
  }
  if (overview.sharesOutstanding != null) {
    facts.push({
      label: t('pairInfo.sharesOutstanding'),
      value: formatLargeNumber(overview.sharesOutstanding),
    })
  }
  if (overview.currencyName) {
    facts.push({ label: t('pairInfo.currency'), value: overview.currencyName })
  }

  return (
    <div className="h-full overflow-y-auto py-1">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{overview.name}</span>
        <Badge variant="outline" className="text-[10px] uppercase">
          {overview.ticker}
        </Badge>
        <Badge
          variant={overview.active ? 'secondary' : 'destructive'}
          className="text-[10px]"
        >
          {overview.active ? t('pairInfo.active') : t('pairInfo.delisted')}
        </Badge>
      </div>

      {/* Description */}
      {overview.description && (
        <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
          {overview.description}
        </p>
      )}

      {/* Facts grid */}
      {facts.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
          {facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-muted-foreground/70">
                {fact.label}
              </span>
              <span className="text-xs font-medium">{fact.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tags */}
      {overview.tags && overview.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {overview.tags.slice(0, 12).map((tag: string) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-[10px] font-normal text-muted-foreground"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Links */}
      {overview.homepageUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href={overview.homepageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" />
            {new URL(overview.homepageUrl).hostname}
          </a>
          {overview.urls?.twitter?.[0] && (
            <a
              href={overview.urls.twitter[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t('pairInfo.twitter')}
            </a>
          )}
          {overview.urls?.reddit?.[0] && (
            <a
              href={overview.urls.reddit[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t('pairInfo.reddit')}
            </a>
          )}
          {overview.urls?.sourceCode?.[0] && (
            <a
              href={overview.urls.sourceCode[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t('pairInfo.source')}
            </a>
          )}
          {overview.urls?.explorer?.[0] && (
            <a
              href={overview.urls.explorer[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t('pairInfo.explorer')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}
