// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The whole market in one strip, above the board that explains it.
 *
 * Every figure here is derived from the top-coins snapshot the movers table
 * and the sector tape already read, so the three panes together cost the board
 * one REST call rather than three. Fear & Greed is the one exception, and it
 * reuses the Fear & Greed pane's own query key — same cache entry, so putting
 * both on a board costs one fetch and they can never disagree.
 *
 * Nothing on the strip streams. It is context for the minute, not the second,
 * and a headline that re-renders at socket rate would put five setState
 * origins above a table of six hundred rows.
 */
import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import { usePluginFetch, usePluginQuery } from '@pairlens/plugin-sdk'
import type { FearGreedResponse } from '@pairlens/shared/instrument-types'

import {
  useTopCoinsSnapshot,
  useTopCoinsSnapshotState,
} from '@/hooks/use-top-coins-snapshot'
import { summarizeMarket } from '@/lib/spot-market-stats'
import { formatCompactUsd } from '@/lib/format-price'
import { fetchFearGreedWithFallback } from '@/lib/public-market-data'
import { PaneEmpty } from '@/components/panes/pane-primitives'

/** Five across on the board's own width, folding to two on a docked rail. */
const TILE_GRID =
  'grid h-full grid-cols-2 @min-[30rem]/pane:grid-cols-3 @min-[44rem]/pane:grid-cols-5'

export function MarketPulsePane() {
  const { t } = useTranslation()
  const coins = useTopCoinsSnapshot()
  const state = useTopCoinsSnapshotState()

  const pulse = useMemo(() => summarizeMarket(coins.values()), [coins])

  if (state === 'unavailable') {
    return (
      <PaneEmpty
        icon={Activity}
        title={t('marketPulse.emptyTitle')}
        body={t('marketPulse.emptyBody')}
      />
    )
  }

  const loading = state === 'loading'

  return (
    <div className={cn(TILE_GRID, 'overflow-hidden')}>
      <Tile label={t('marketPulse.totalCap')} loading={loading}>
        <Value>{formatCompactUsd(pulse.totalCap)}</Value>
        {pulse.capChange24hPct !== null && (
          <Sub
            className={pulse.capChange24hPct >= 0 ? 'text-up' : 'text-down'}
            mono
          >
            {signed(pulse.capChange24hPct)} {t('marketPulse.window24h')}
          </Sub>
        )}
      </Tile>

      <Tile label={t('marketPulse.volume24h')} loading={loading}>
        <Value>{formatCompactUsd(pulse.totalVolume24h)}</Value>
        {pulse.totalCap > 0 && (
          // Not "versus the 30-day average", which no snapshot field can
          // support. Volume over capitalisation is the share of the market
          // that changed hands today, and it is exactly measurable here.
          <Sub mono>
            {t('marketPulse.turnover', {
              pct: ((pulse.totalVolume24h / pulse.totalCap) * 100).toFixed(1),
            })}
          </Sub>
        )}
      </Tile>

      <Tile label={t('marketPulse.dominance')} loading={loading}>
        <Value>
          {pulse.btcDominancePct === null
            ? '—'
            : `${pulse.btcDominancePct.toFixed(1)}%`}
        </Value>
        {pulse.btcDominancePct !== null && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-muted">
            <span
              className="block h-full [background-color:var(--chart-4)]"
              style={{ width: `${pulse.btcDominancePct.toFixed(1)}%` }}
            />
          </div>
        )}
      </Tile>

      <Tile
        label={t('marketPulse.breadth', { total: pulse.breadthCount })}
        loading={loading}
      >
        <p className="mt-0.5 flex items-baseline gap-1.5 font-mono text-[15px] font-semibold tabular-nums">
          <span className="text-up">{pulse.advancing}</span>
          <span className="font-sans text-[11px] font-normal text-muted-foreground">
            {t('marketPulse.up')}
          </span>
          <span className="text-down">{pulse.declining}</span>
          <span className="font-sans text-[11px] font-normal text-muted-foreground">
            {t('marketPulse.down')}
          </span>
        </p>
        {pulse.breadthCount > 0 && (
          // The bar IS the ratio: the down side is the track, the up side is
          // what fills it, so a red-heavy tape is red at a glance.
          <div className="mt-1.5 h-1 overflow-hidden rounded-sm [background-color:var(--down)]">
            <span
              className="block h-full [background-color:var(--up)]"
              style={{
                width: `${((pulse.advancing / pulse.breadthCount) * 100).toFixed(1)}%`,
              }}
            />
          </div>
        )}
      </Tile>

      <FearGreedTile />
    </div>
  )
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function Tile({
  label,
  loading,
  children,
}: {
  label: string
  loading?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center border-b border-r border-border/50 px-4 py-1.5 last:border-r-0">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      {loading ? (
        <div className="mt-1.5 h-4 w-20 animate-pulse rounded bg-muted" />
      ) : (
        children
      )}
    </div>
  )
}

function Value({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-0.5 truncate font-mono text-[15px] font-semibold tabular-nums">
      {children}
    </p>
  )
}

function Sub({
  children,
  className,
  mono,
}: {
  children: React.ReactNode
  className?: string
  mono?: boolean
}) {
  return (
    <p
      className={cn(
        'truncate text-[11px] text-muted-foreground',
        mono && 'font-mono tabular-nums',
        className,
      )}
    >
      {children}
    </p>
  )
}

/**
 * The one tile with its own source.
 *
 * Same query key as the Fear & Greed pane (both panes belong to the same
 * plugin, so `usePluginQuery` namespaces them identically), which is what
 * makes putting both on one board free. When neither the App Server nor the
 * public fallback answers, the tile is omitted rather than showing a gauge
 * with no needle — the other four still say something.
 */
function FearGreedTile() {
  const { t } = useTranslation()
  const apiFetch = usePluginFetch()

  const { data, isLoading } = usePluginQuery<FearGreedResponse>({
    queryKey: ['fear-greed'],
    queryFn: () => fetchFearGreedWithFallback(apiFetch),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  })

  const latest = data?.latest ?? null
  if (!latest && !isLoading) return null

  return (
    <Tile label={t('marketPulse.fearGreed')} loading={isLoading || !latest}>
      {latest && (
        <>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <span
              className="font-mono text-[15px] font-semibold tabular-nums"
              style={{ color: fearGreedColor(latest.value) }}
            >
              {latest.value}
            </span>
            <span className="truncate text-[11px]">
              {t(
                `fearGreed.classification.${classificationSlug(latest.valueClassification)}`,
                latest.valueClassification,
              )}
            </span>
          </p>
          <Tooltip>
            <TooltipTrigger
              render={<div className="relative mt-1.5 h-1 rounded-sm" />}
            >
              <div
                className="h-1 rounded-sm"
                style={{
                  background:
                    'linear-gradient(90deg,#ef4444,#f97316,#eab308,#84cc16,#22c55e)',
                }}
              />
              <span
                className="absolute -top-0.5 h-2 w-0.5 bg-foreground"
                style={{ left: `${Math.min(99, Math.max(0, latest.value))}%` }}
              />
            </TooltipTrigger>
            <TooltipContent>{t('marketPulse.fearGreedTooltip')}</TooltipContent>
          </Tooltip>
        </>
      )}
    </Tile>
  )
}

/** The gauge's five bands, matching the Fear & Greed pane exactly. */
function fearGreedColor(value: number): string {
  if (value <= 25) return '#ef4444'
  if (value <= 45) return '#f97316'
  if (value <= 55) return '#eab308'
  if (value <= 75) return '#84cc16'
  return '#22c55e'
}

/** "Extreme Fear" → "extremeFear", the catalog's key shape. */
function classificationSlug(classification: string): string {
  return classification
    .split(/\s+/)
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('')
}
