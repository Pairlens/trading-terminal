// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The price cell every list of pairs shares: a reserved column, a flash on
 * change, and the 24h number under it.
 *
 * Lifted out of `markets-pane.tsx` unchanged so the phone can render the same
 * cell as the desktop rather than a second one that drifts. The desktop
 * markup is preserved exactly — `variant` only adds the mobile type scale,
 * and `variant="pane"` (the default, which is what every desktop call site
 * uses) reproduces the original class strings verbatim.
 */
import { cn } from '@pairlens/ui'

import type { TopCoin } from '@pairlens/shared/instrument-types'
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import type { BulkQuote } from '@/hooks/use-bulk-ticker-quotes'
import { usePriceTick } from '@/hooks/use-price-tick'
import { TickArrow } from '@/components/tick-arrow'
import { formatPrice } from '@/lib/format-price'

/** Live exchange quote by exact pair symbol; top-coins base join as fallback. */
export function quoteForPair(
  pair: PairEntry,
  liveQuotes: Map<string, BulkQuote>,
  coinsBySymbol: Map<string, TopCoin>,
): BulkQuote | undefined {
  const live = liveQuotes.get(pair.symbol)
  if (live) return live
  const coin = coinsBySymbol.get(pair.base.toUpperCase())
  return coin
    ? { price: coin.price, change24h: coin.percentChange24h }
    : undefined
}

/**
 * `pane` is the desktop scale. `mobile` is the phone's: mono numerals at the
 * design's 14.5/11.5, because every numeric on the mobile terminal is mono and
 * a sans price in a mono list reads as a different kind of number.
 */
export type PairQuoteVariant = 'pane' | 'mobile'

const PRICE_CLASS: Record<PairQuoteVariant, string> = {
  pane: 'tick-cell flex items-center justify-end gap-0.5 text-sm font-medium transition-colors duration-700',
  mobile:
    'tick-cell flex items-center justify-end gap-0.5 font-mono text-[13.5px] font-medium leading-none transition-colors duration-700',
}

const CHANGE_CLASS: Record<PairQuoteVariant, string> = {
  pane: 'text-xs',
  mobile: 'mt-0.5 font-mono text-[11px] leading-none',
}

export function PairQuote({
  quote,
  className,
  variant = 'pane',
}: {
  quote: BulkQuote | null | undefined
  className?: string
  variant?: PairQuoteVariant
}) {
  // These prices come from the 60s bulk snapshots, not a per-row stream —
  // fanning a ticker subscription over two thousand instruments is the thing
  // the bulk endpoint exists to avoid. So the flash marks a refresh rather
  // than a trade, which is still exactly when the number on screen moved.
  const direction = usePriceTick(quote?.price)
  const change = quote?.change24h
  return (
    // A reserved column, not a shrink-wrapped one. Digit count varies per
    // pair ($64,570.60 against $0.1984) and a venue with no price at all used
    // to collapse the slot entirely — either way the chart beside it moved,
    // and a list of charts that each start at a different x reads as broken
    // alignment rather than as data.
    <div className={cn('min-w-24 text-right tabular-nums', className)}>
      <p
        className={cn(
          PRICE_CLASS[variant],
          direction === 'up'
            ? 'tick-up text-up'
            : direction === 'down'
              ? 'tick-down text-down'
              : undefined,
        )}
      >
        <TickArrow direction={direction} />
        {quote ? (
          formatPrice(quote.price)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </p>
      {change != null && (
        <p
          className={cn(
            CHANGE_CLASS[variant],
            change >= 0 ? 'text-up' : 'text-down',
          )}
        >
          {change >= 0 ? '+' : ''}
          {change.toFixed(2)}%
        </p>
      )}
    </div>
  )
}
