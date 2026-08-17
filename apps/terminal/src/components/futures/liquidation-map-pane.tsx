// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Liquidation Map — where your size stops being yours.
 *
 * The honest version of a pane the reference design drew as a venue-wide
 * liquidation heatmap. **No exchange in the fleet publishes aggregate
 * liquidation clusters**, and the vendors that sell one are modelling it from
 * open interest and leverage assumptions rather than observing it. Drawing bars
 * that look like measured depth would be the most confident kind of wrong, so
 * this pane draws only two things it can stand behind:
 *
 * - **Your own liquidation prices**, straight from each venue's position
 *   payload, sized by the notional at risk.
 * - **Leverage reference marks**: where a position opened at the current price
 *   would liquidate at 5x, 10x and 25x, computed by the same estimator the
 *   ticket uses and labelled as an estimate.
 *
 * The caption says which is which, in the pane, not in a tooltip.
 *
 * Absolutely-positioned divs over a plain axis, deliberately: this is a
 * fifteen-marker static picture, and putting a WebGL chart context behind it
 * would cost a second GPU surface under the real chart.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Crosshair, Info } from 'lucide-react'
import { usePanePair } from '@pairlens/plugin-sdk'

import { cn } from '@pairlens/ui/lib/utils'
import type { NormalizedPosition } from '@pairlens/market-engine/types'

import { PaneEmpty } from '@/components/panes/pane-primitives'
import { formatChartPrice } from '@/lib/format-price'
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
  useFuturesAccounts,
  useFuturesPositions,
} from '@/hooks/use-futures-positions'

/** Leverage tiers the reference marks are drawn for. */
const REFERENCE_LEVERAGE = [5, 10, 25] as const

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

  // The mark from the position payload where there is one, otherwise the pair's
  // own last candle. Neither opens a subscription this pane owns: the chart
  // beside it is already streaming, and the map reads that context.
  const candle = useOptionalCandleData()
  const ticker = useOptionalTickerData()
  const pairKey = activePair?.pairKey ?? ''

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

  if (current === null) {
    return (
      <PaneEmpty
        body={t('liquidationMap.noPriceBody')}
        icon={Crosshair}
        title={t('liquidationMap.noPriceTitle')}
      />
    )
  }

  const markers = [
    ...bands.map((b) => b.price),
    ...references.flatMap((r) => [r.long, r.short]),
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="truncate text-[11.5px] text-muted-foreground">
          {t('liquidationMap.subtitle')}
        </span>
        <span className="shrink-0 rounded-md border border-[var(--chart-4)] px-1.5 py-px font-mono text-[9px] uppercase tracking-[.06em] text-[var(--chart-4)]">
          {t('liquidationMap.estimateBadge')}
        </span>
      </header>

      <div className="relative min-h-0 flex-1 px-3 pb-6 pt-3">
        {/* Reference tiers first, so a real position band always draws over
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

      <footer className="flex shrink-0 items-start gap-2 border-t border-border px-3 py-1.5">
        <Info className="mt-px size-3 shrink-0 text-muted-foreground/60" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {bands.length === 0
            ? t('liquidationMap.noPositionsCaption')
            : t('liquidationMap.caption')}
        </p>
      </footer>
    </div>
  )
}

/** Notional the position carries, or 0 when the venue priced neither leg. */
function notionalOf(position: NormalizedPosition): number {
  if (position.notionalUsd != null && Number.isFinite(position.notionalUsd)) {
    return Math.abs(position.notionalUsd)
  }
  if (position.markPrice == null) return 0
  return position.contracts * (position.contractSize ?? 1) * position.markPrice
}
