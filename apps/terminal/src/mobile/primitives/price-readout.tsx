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
  /** 34px/600 mono over the bare chart · 22px/600 mono under a panel. */
  size: 'hero' | 'compact'
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

export const PriceReadout = memo(function PriceReadout({
  size,
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
  const hero = size === 'hero'

  return (
    <div className={cn('flex flex-col items-start', className)}>
      <span
        className={cn(
          // Two shadows, not one: the chart scrim behind this was cut back so
          // it stops erasing candles, which moves the last of the contrast
          // onto the type itself. The tight layer is what keeps a thin glyph
          // readable directly over a wick; the wide one is the halo.
          'font-mono font-semibold tabular-nums text-foreground',
          hero
            ? 'text-[34px] leading-none tracking-[-0.03em] [text-shadow:0_1px_3px_rgba(0,0,0,.92),0_2px_14px_rgba(0,0,0,.8)]'
            : 'text-[22px] leading-none tracking-[-0.02em] [text-shadow:0_1px_3px_rgba(0,0,0,.92),0_2px_10px_rgba(0,0,0,.8)]',
          direction === 'up' && 'text-up',
          direction === 'down' && 'text-down',
        )}
      >
        {/* No currency symbol: the design's hero price is the number alone,
            and `$` in front of a 34px figure costs two characters of a 402px
            row. `formatBookPrice` is the repo's separator-carrying formatter. */}
        {price == null ? '—' : formatBookPrice(price)}
      </span>
      {change ? (
        <span
          className={cn(
            'mt-1.5 font-mono font-medium tabular-nums [text-shadow:0_1px_3px_rgba(0,0,0,.92),0_2px_10px_rgba(0,0,0,.8)]',
            hero ? 'text-[13.5px]' : 'text-[13px]',
            change.percent >= 0 ? 'text-up' : 'text-down',
          )}
        >
          {hero
            ? t('mobile.shell.priceChange', {
                absolute: `${change.absolute >= 0 ? '+' : ''}${change.absolute.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                percent: `${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(2)}%`,
              })
            : `${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(2)}%`}
        </span>
      ) : null}
    </div>
  )
})
