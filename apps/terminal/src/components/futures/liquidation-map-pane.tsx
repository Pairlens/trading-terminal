// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Liquidation Map — where size stops being anyone's.
 *
 * Three layers over one price axis, each with a different claim behind it:
 *
 * - **Measured clusters**: what the venue actually liquidated in the selected
 *   window, from the App Server's collector holding Binance Futures' public
 *   force-order stream. These are prints, not a model. Vendors that sell a
 *   liquidation heatmap usually infer one from open interest and assumed
 *   leverage; this one is the tape of positions that were closed.
 * - **Your own liquidation prices**, straight from each venue's position
 *   payload, sized by the notional at risk.
 * - **Leverage reference marks**: where a position opened at the current price
 *   would liquidate at 5x, 10x and 25x, from the same estimator the ticket
 *   uses and labelled as an estimate.
 *
 * The caption says which is which, in the pane, not in a tooltip.
 *
 * Time is a SELECTOR, not a second axis. The wire carries minute buckets, but
 * this pane is a strip over price, so the minutes are summed per price bucket
 * and the window becomes four chips. A real 2D time-by-price heatmap belongs
 * over the chart, where there is already a time axis to hang it on.
 *
 * Absolutely-positioned divs over a plain axis, deliberately: this is a static
 * picture of at most a few dozen markers, and putting a WebGL chart context
 * behind it would cost a second GPU surface under the real chart.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Crosshair, Info } from 'lucide-react'
import { usePanePair } from '@pairlens/plugin-sdk'

import { cn } from '@pairlens/ui/lib/utils'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@pairlens/ui/components/ui/toggle-group'
import type { NormalizedPosition } from '@pairlens/market-engine/types'
import type { LiquidationWindowHours } from '@/lib/futures/liquidation-clusters'

import { PaneEmpty } from '@/components/panes/pane-primitives'
import { formatChartPrice, formatCompactUsd } from '@/lib/format-price'
import {
  useOptionalCandleData,
  useOptionalTickerData,
} from '@/lib/chart-terminal-context'
import {
  axisPosition,
  liquidationDistance,
  priceAxisRange,
} from '@/lib/futures/funding-math'
import { estimateLiquidationPrice } from '@/lib/futures/ticket-math'
import {
  LIQUIDATION_WINDOWS,
  aggregateByPrice,
  clusterIntensity,
  clusterPriceBounds,
  dominantSide,
  liquidationTotals,
  peakNotional,
} from '@/lib/futures/liquidation-clusters'
import {
  useFuturesAccounts,
  useFuturesPositions,
} from '@/hooks/use-futures-positions'
import { useLiquidationClusters } from '@/hooks/use-liquidation-clusters'

/** Leverage tiers the reference marks are drawn for. */
const REFERENCE_LEVERAGE = [5, 10, 25] as const

/**
 * Alpha the densest cluster column is painted at. Low on purpose: the clusters
 * are context behind the two things a trader acts on, and a wash that competed
 * with the position bands would bury the number that is actually theirs.
 */
const MAX_CLUSTER_ALPHA = 0.42
/** Narrowest a column may be drawn, in axis percent, so one print stays visible. */
const MIN_CLUSTER_WIDTH_PCT = 0.5

/**
 * Chip labels as whole literals rather than a built key. `1h` is `1時間` in
 * Japanese, so the chips are translated; and a key assembled from a variable is
 * invisible to the i18n orphan audit, which is how a stale key survives a
 * rename.
 */
const WINDOW_LABEL_KEYS: Record<LiquidationWindowHours, string> = {
  1: 'liquidationMap.windows.h1',
  6: 'liquidationMap.windows.h6',
  24: 'liquidationMap.windows.h24',
  72: 'liquidationMap.windows.h72',
}

type Band = {
  key: string
  price: number
  side: 'long' | 'short'
  /** 0..1 weight driving the band's height. */
  weight: number
  label: string
  venueLabel: string
}

export function LiquidationMapPane() {
  const { t } = useTranslation()
  const activePair = usePanePair()
  const accounts = useFuturesAccounts()
  const { data: results } = useFuturesPositions(accounts)
  const [windowHours, setWindowHours] = useState<LiquidationWindowHours>(24)

  // The mark from the position payload where there is one, otherwise the pair's
  // own last candle. Neither opens a subscription this pane owns: the chart
  // beside it is already streaming, and the map reads that context.
  const candle = useOptionalCandleData()
  const ticker = useOptionalTickerData()
  const pairKey = activePair?.pairKey ?? ''
  const market = activePair?.market ?? ''

  const clusters = useLiquidationClusters(market, pairKey, windowHours)

  const positions = useMemo(() => {
    const out: Array<{ position: NormalizedPosition; venueLabel: string }> = []
    for (const result of results) {
      for (const position of result.positions) {
        if (pairKey && position.pair !== pairKey) continue
        out.push({ position, venueLabel: result.account.venueLabel })
      }
    }
    return out
  }, [results, pairKey])

  const current =
    positions[0]?.position.markPrice ??
    candle?.latestCandle?.close ??
    ticker?.bestBid ??
    null

  const bands = useMemo((): Array<Band> => {
    const out: Array<Band> = []
    const notionals = positions.map((p) => notionalOf(p.position))
    const maxNotional = Math.max(...notionals, 1)
    positions.forEach(({ position, venueLabel }, index) => {
      if (position.liquidationPrice == null) return
      out.push({
        key: `pos:${venueLabel}:${position.pair}:${position.side}`,
        price: position.liquidationPrice,
        side: position.side,
        weight: Math.max(notionals[index] / maxNotional, 0.25),
        label: position.pair,
        venueLabel,
      })
    })
    return out
  }, [positions])

  const references = useMemo(() => {
    if (current === null) return []
    const out: Array<{
      leverage: number
      long: number | null
      short: number | null
    }> = []
    for (const leverage of REFERENCE_LEVERAGE) {
      out.push({
        leverage,
        long: estimateLiquidationPrice({
          entryPrice: current,
          leverage,
          side: 'buy',
        }),
        short: estimateLiquidationPrice({
          entryPrice: current,
          leverage,
          side: 'sell',
        }),
      })
    }
    return out
  }, [current])

  const priceClusters = useMemo(
    () => aggregateByPrice(clusters.data?.buckets ?? []),
    [clusters.data],
  )
  const totals = useMemo(
    () => liquidationTotals(clusters.data?.buckets ?? []),
    [clusters.data],
  )
  const peak = useMemo(() => peakNotional(priceClusters), [priceClusters])
  const bucketWidth = clusters.data?.bucketWidth ?? 0

  if (current === null) {
    return (
      <PaneEmpty
        body={t('liquidationMap.noPriceBody')}
        icon={Crosshair}
        title={t('liquidationMap.noPriceTitle')}
      />
    )
  }

  // Cluster bounds widen the axis: a strip whose heaviest column sat off the
  // edge would report that liquidations stopped where the axis did.
  const markers = [
    ...bands.map((b) => b.price),
    ...references.flatMap((r) => [r.long, r.short]),
    ...clusterPriceBounds(priceClusters, bucketWidth),
  ].filter((p): p is number => p !== null)
  const range = priceAxisRange(markers, current)
  if (!range) {
    return (
      <PaneEmpty
        body={t('liquidationMap.emptyBody')}
        icon={Crosshair}
        title={t('liquidationMap.emptyTitle')}
      />
    )
  }

  const currentAt = axisPosition(current, range) * 100
  const span = range.max - range.min
  const clusterWidthPct =
    span > 0 && bucketWidth > 0
      ? Math.max((bucketWidth / span) * 100, MIN_CLUSTER_WIDTH_PCT)
      : MIN_CLUSTER_WIDTH_PCT

  // The chips only exist where a collector does; on an untracked venue they
  // would be four controls that change nothing.
  const showWindows = clusters.unavailable !== 'not_tracked'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="truncate text-[11.5px] text-muted-foreground">
          {t('liquidationMap.subtitle')}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {showWindows && (
            <ToggleGroup
              aria-label={t('liquidationMap.windowLabel')}
              multiple={false}
              onValueChange={(next) => {
                const value = Number(next[0])
                if (
                  LIQUIDATION_WINDOWS.includes(value as LiquidationWindowHours)
                ) {
                  setWindowHours(value as LiquidationWindowHours)
                }
              }}
              size="sm"
              value={[String(windowHours)]}
              variant="outline"
            >
              {LIQUIDATION_WINDOWS.map((hours) => (
                <ToggleGroupItem
                  className="px-1.5 font-mono text-[10px]"
                  key={hours}
                  value={String(hours)}
                >
                  {t(WINDOW_LABEL_KEYS[hours])}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <span className="shrink-0 rounded-md border border-[var(--chart-4)] px-1.5 py-px font-mono text-[9px] uppercase tracking-[.06em] text-[var(--chart-4)]">
            {t('liquidationMap.estimateBadge')}
          </span>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 px-3 pb-6 pt-3">
        {/* Measured clusters first, as a wash under everything: they are the
            context, not the call to action. */}
        {priceClusters.map((cluster) => {
          const left = axisPosition(cluster.price, range) * 100
          const side = dominantSide(cluster)
          const alpha =
            clusterIntensity(cluster.total, peak) * MAX_CLUSTER_ALPHA
          return (
            <span
              className="absolute bottom-6 top-3"
              key={`cluster:${cluster.price}`}
              style={{
                left: `${left}%`,
                width: `${clusterWidthPct}%`,
                backgroundColor: side === 'long' ? 'var(--down)' : 'var(--up)',
                opacity: alpha,
              }}
              title={t('liquidationMap.clusterHint', {
                count: cluster.count,
                notional: formatCompactUsd(cluster.total),
                price: formatChartPrice(cluster.price),
                side:
                  side === 'long'
                    ? t('liquidationMap.sideLong')
                    : t('liquidationMap.sideShort'),
              })}
            />
          )
        })}

        {/* Reference tiers next, so a real position band always draws over
            them: the estimate must never hide the measured number. */}
        {references.map((reference) =>
          (['long', 'short'] as const).map((side) => {
            const price = side === 'long' ? reference.long : reference.short
            if (price === null) return null
            const left = axisPosition(price, range) * 100
            return (
              <span
                className="absolute bottom-6 top-3 w-px bg-muted-foreground/25"
                key={`ref:${reference.leverage}:${side}`}
                style={{ left: `${left}%` }}
                title={t('liquidationMap.referenceHint', {
                  leverage: reference.leverage,
                  side:
                    side === 'long'
                      ? t('liquidationMap.sideLong')
                      : t('liquidationMap.sideShort'),
                  price: formatChartPrice(price),
                })}
              >
                <span className="absolute -top-0.5 left-1 whitespace-nowrap font-mono text-[9px] text-muted-foreground/70">
                  {reference.leverage}x
                </span>
              </span>
            )
          }),
        )}

        {bands.map((band) => {
          const left = axisPosition(band.price, range) * 100
          const distance = liquidationDistance(current, band.price)
          return (
            <span
              className="absolute bottom-6 flex flex-col items-center"
              key={band.key}
              style={{
                left: `${left}%`,
                height: `${20 + band.weight * 55}%`,
                transform: 'translateX(-50%)',
              }}
            >
              <span
                className={cn(
                  'w-2 flex-1 rounded-t-sm',
                  band.side === 'long' ? 'bg-down' : 'bg-up',
                )}
              />
              <span className="mt-1 whitespace-nowrap font-mono text-[9px] text-down">
                {formatChartPrice(band.price)}
              </span>
              <span className="whitespace-nowrap text-[9px] text-muted-foreground">
                {band.venueLabel}
                {distance !== null ? ` · ${(distance * 100).toFixed(1)}%` : ''}
              </span>
            </span>
          )
        })}

        {/* Current price: a dashed rule, because it is the only thing on this
            axis that is neither an estimate nor a liability. */}
        <span
          className="absolute bottom-6 top-3 w-px"
          style={{
            left: `${currentAt}%`,
            backgroundImage:
              'repeating-linear-gradient(180deg, var(--foreground) 0 4px, transparent 4px 9px)',
            opacity: 0.55,
          }}
        />
        <span
          className="absolute bottom-0 whitespace-nowrap font-mono text-[9px] text-foreground"
          style={{ left: `${currentAt}%`, transform: 'translateX(-50%)' }}
        >
          {formatChartPrice(current)}
        </span>
      </div>

      {totals.total > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-1 font-mono text-[10px] [font-variant-numeric:tabular-nums]">
          <span className="flex items-center gap-1 text-down">
            <span className="size-2 rounded-sm bg-down" />
            {t('liquidationMap.legendLong', {
              value: formatCompactUsd(totals.long),
            })}
          </span>
          <span className="flex items-center gap-1 text-up">
            <span className="size-2 rounded-sm bg-up" />
            {t('liquidationMap.legendShort', {
              value: formatCompactUsd(totals.short),
            })}
          </span>
          <span className="ml-auto text-muted-foreground">
            {t('liquidationMap.legendPrints', { count: totals.count })}
          </span>
        </div>
      )}

      <footer className="flex shrink-0 items-start gap-2 border-t border-border px-3 py-1.5">
        <Info className="mt-px size-3 shrink-0 text-muted-foreground/60" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {bands.length === 0
            ? t('liquidationMap.noPositionsCaption')
            : t('liquidationMap.caption')}{' '}
          <ClusterNote
            count={priceClusters.length}
            error={clusters.error}
            isLoading={clusters.isLoading}
            trackedSince={clusters.trackedSince}
            unavailable={clusters.unavailable}
            windowHours={windowHours}
          />
        </p>
      </footer>
    </div>
  )
}

/**
 * The sentence about the cluster layer, which is the only part of the caption
 * that can be wrong on a given venue. Kept honest state by state rather than
 * collapsed into one hedge: "no feed for this venue" and "collecting since
 * 14:02" are different promises.
 */
function ClusterNote({
  count,
  error,
  isLoading,
  trackedSince,
  unavailable,
  windowHours,
}: {
  count: number
  error: string | null
  isLoading: boolean
  trackedSince: number | null
  unavailable: 'not_tracked' | 'collecting' | 'standalone' | null
  windowHours: number
}) {
  const { t } = useTranslation()

  if (unavailable === 'standalone') {
    return <>{t('liquidationMap.standaloneCaption')}</>
  }
  if (unavailable === 'not_tracked') {
    return <>{t('liquidationMap.notTrackedCaption')}</>
  }
  if (unavailable === 'collecting') {
    return (
      <>
        {t('liquidationMap.collectingCaption', {
          since:
            trackedSince === null
              ? t('liquidationMap.collectingJustStarted')
              : new Date(trackedSince).toLocaleString(),
        })}
      </>
    )
  }
  if (error) return <>{t('liquidationMap.clustersErrorCaption')}</>
  if (isLoading) return <>{t('liquidationMap.clustersLoadingCaption')}</>
  if (count === 0) {
    return <>{t('liquidationMap.noClustersCaption', { window: windowHours })}</>
  }
  return <>{t('liquidationMap.clustersCaption', { window: windowHours })}</>
}

/** Notional the position carries, or 0 when the venue priced neither leg. */
function notionalOf(position: NormalizedPosition): number {
  if (position.notionalUsd != null && Number.isFinite(position.notionalUsd)) {
    return Math.abs(position.notionalUsd)
  }
  if (position.markPrice == null) return 0
  return position.contracts * (position.contractSize ?? 1) * position.markPrice
}
