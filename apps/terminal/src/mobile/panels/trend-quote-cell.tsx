// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The block every mobile list of pairs ends with: a trend line, then the
 * price.
 *
 * It exists as one component because alignment is the whole point. A price
 * shrink-wraps its digits ($64,934.80 against $0.0₅4659 measured 87px and
 * 68px on the watchlist), and with the trend line sitting to its left every
 * row started that line at a different x — 239px to 258px down a single
 * screen, which reads as a broken column rather than as data. The desktop hit
 * the identical bug and answered it the same way (93fb7970, 95ddf2bd): reserve
 * the price column, then let the trend line fill what is left rather than draw
 * a fixed width and leave a gap.
 *
 * The whole block is a fixed width, so the symbol beside it truncates at the
 * same place on every row too, and the price column is wide enough for a
 * six-figure BTC print plus the tick caret.
 *
 * `PairQuote` is the desktop pane's own cell (`components/discovery/
 * pair-quote.tsx`), so the flash on change, the caret and the em-dash
 * placeholder are the same object here as there — the phone did not get its
 * own price cell to keep in sync.
 */
import { memo } from 'react'

import type { BulkQuote } from '@/hooks/use-bulk-ticker-quotes'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { PairQuote } from '@/components/discovery/pair-quote'

/**
 * Total width of the trend + price block, in px. Reserved rather than derived
 * so `MobileRow`'s flexible title column is the same width on every row.
 */
export const TREND_QUOTE_WIDTH = 172

/** Reserved price column, in px: "$104,382.50" at 13.5px mono plus the caret. */
export const QUOTE_WIDTH = 106

export const TrendQuoteCell = memo(function TrendQuoteCell({
  market,
  pair,
  quote,
}: {
  /** Venue the trend line is drawn from — already resolved for the asset class. */
  market: string | undefined
  pair: string
  quote: BulkQuote | null | undefined
}) {
  return (
    <span
      className="flex items-center gap-2.5"
      style={{ width: TREND_QUOTE_WIDTH }}
    >
      {/* The chart is `shrink-0` by construction, so it gets a flexible parent
          rather than a flexible class of its own. */}
      <span className="flex min-w-0 flex-1 justify-end">
        <MiniPriceChart
          className="h-6 w-full opacity-85"
          market={market}
          pair={pair}
        />
      </span>
      <span
        className="flex shrink-0 justify-end"
        style={{ width: QUOTE_WIDTH }}
      >
        <PairQuote className="w-full" quote={quote} variant="mobile" />
      </span>
    </span>
  )
})
