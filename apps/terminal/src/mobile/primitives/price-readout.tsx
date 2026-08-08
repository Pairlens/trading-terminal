// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The live price over the chart — and the ONLY always-on-screen component in
 * the mobile shell allowed to subscribe to a per-tick stream context.
 *
 * Three rules make that safe, and they are the reason this file is so short:
 *
 *   1. It is a LEAF. It renders the price span, the change span, and nothing
 *      else. It may never be given children and may never wrap another
 *      component, because everything it wraps would re-render at tick rate.
 *   2. It reads the stream contexts directly — the same isolation shape as
 *      `LivePriceTicker` in `terminal-top-bar.tsx`.
 *   3. Formatting is pure (`lib/format-price.ts`); the flash comes from
 *      `usePriceTick`, which works off the value rather than the stream.
 *
 * If profiling ever shows this leaf costing, the escalation is a render-null
 * sibling writing `textContent` into refs. Do not do that pre-emptively.
 *
 * ## Why BOTH sizes are always in the DOM
 *
 * The readout tracks the sheet: it is the design's 34px hero over a bare chart
 * and its 22px panel line under a docked one, and the trip between them has to
 * follow a finger frame by frame (see `--pl-sheet-dock` in mobile-sheet.tsx).
 * Font size is a layout property and cannot be animated on the compositor, and
 * the two variants do not even carry the same text — the hero states the
 * absolute change and the window, the compact one only the percentage. So both
 * are rendered, stacked at the same origin, and cross-faded by the sheet's own
 * position. The scales are chosen so the PRICE line is pixel-identical in both
 * at every value of the variable (34·(1−0.353d) = 22·(1.545−0.545d) = 34−12d),
 * which is what makes the number read as one element scaling rather than two
 * elements dissolving.
 */
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import type { Candle } from '@pairlens/shared/types'
import {
  useOptionalCandleData,
  useOptionalTickerData,
} from '@/lib/chart-terminal-context'
import { usePriceTick } from '@/hooks/use-price-tick'
import { formatBookPrice } from '@/lib/format-price'

export type PriceReadoutProps = {
  className?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Trailing-24h change from the candle buffer.
 *
 * The ticker stream carries no `change24h` (see TickerStreamValue), and
 * fanning a second bulk-quote request out for one symbol we already stream is
 * the wrong trade. Walking back to the first bar at least 24h old works on any
 * timeframe and degrades to "since the oldest bar we have" on a short buffer.
 */
function change24h(
  candles: Array<Candle>,
  price: number | null,
): { absolute: number; percent: number } | null {
  if (price == null || candles.length < 2) return null
  const last = candles[candles.length - 1]
  if (!last) return null
  const cutoff = last.ts - DAY_MS
  let reference = candles[0].open
  for (let i = candles.length - 1; i >= 0; i--) {
    const candle = candles[i]
    if (candle.ts <= cutoff) {
      reference = candle.close
      break
    }
  }
  if (!Number.isFinite(reference) || reference === 0) return null
  return {
    absolute: price - reference,
    percent: ((price - reference) / reference) * 100,
  }
}

/** Two shadows, not one: the chart scrim behind this was cut back so it stops
 *  erasing candles, which moves the last of the contrast onto the type itself.
 *  The tight layer keeps a thin glyph readable directly over a wick; the wide
 *  one is the halo. Both are made of the chart's own ink (see mobile.css), so
 *  on a light chart they thicken the plot behind the number instead of
 *  printing a black smudge on it. */
const SHADOW_TIGHT = '[text-shadow:var(--pl-halo-tight)]'
const SHADOW_WIDE = '[text-shadow:var(--pl-halo-wide)]'

/** The number sits ON the plot, so it takes the chart's foreground rather than
 *  the UI's: a theme may paint the chart a colour the shell never wears, and
 *  `text-foreground` against it can come out dark-on-dark. `--up`/`--down`
 *  still win when the price is moving — those are P&L, not chrome. */
const INK = 'text-[color:var(--pl-chart-fg)]'

export const PriceReadout = memo(function PriceReadout({
  className,
}: PriceReadoutProps) {
  const { t } = useTranslation()
  const ticker = useOptionalTickerData()
  const candleData = useOptionalCandleData()

  const candles = candleData?.candles ?? []
  const price =
    ticker?.lastTradePrice ??
    ticker?.midPrice ??
    candleData?.latestCandle?.close ??
    candles[candles.length - 1]?.close ??
    null
  const direction = usePriceTick(price)
  const change = change24h(candles, price)
  const text = price == null ? '—' : formatBookPrice(price)
  const percent = change
    ? `${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(2)}%`
    : null
  const tone = change
    ? change.percent >= 0
      ? 'text-up'
      : 'text-down'
    : undefined
  const priceTone =
    direction === 'up' ? 'text-up' : direction === 'down' ? 'text-down' : ''

  return (
    <div className={cn('pl-readout relative', className)}>
      {/* Hero, over a bare chart. In flow, so it owns the box. */}
      <div className="pl-readout-hero flex flex-col items-start">
        <span
          className={cn(
            'font-mono text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums',
            INK,
            SHADOW_WIDE,
            priceTone,
          )}
        >
          {/* No currency symbol: the design's hero price is the number alone,
              and `$` in front of a 34px figure costs two characters of a 402px
              row. `formatBookPrice` carries the separators. */}
          {text}
        </span>
        {change ? (
          <span
            className={cn(
              'mt-1.5 font-mono text-[13.5px] font-medium tabular-nums',
              SHADOW_TIGHT,
              tone,
            )}
          >
            {t('mobile.shell.priceChange', {
              absolute: `${change.absolute >= 0 ? '+' : ''}${change.absolute.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
              percent: percent ?? '',
            })}
          </span>
        ) : null}
      </div>
      {/* Compact, under a docked panel. Out of flow at the same origin. */}
      <div
        aria-hidden
        className="pl-readout-compact absolute left-0 top-0 flex flex-col items-start"
      >
        <span
          className={cn(
            'font-mono text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums',
            INK,
            SHADOW_TIGHT,
            priceTone,
          )}
        >
          {text}
        </span>
        {percent ? (
          <span
            className={cn(
              'mt-1.5 font-mono text-[13px] font-medium tabular-nums',
              SHADOW_TIGHT,
              tone,
            )}
          >
            {percent}
          </span>
        ) : null}
      </div>
    </div>
  )
})
