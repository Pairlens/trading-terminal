// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'

import type { TickDirection } from '@/hooks/use-price-tick'
import { useTickerStream } from '@/hooks/use-ticker-stream'
import { usePredictionEventEntry } from '@/stores/prediction-directory-store'
import { usePriceTick } from '@/hooks/use-price-tick'
import { recentTickerPriceCache } from '@/lib/recent-tickers'

export type { TickDirection }

type LivePairPrice = {
  price: number | null
  direction: TickDirection
  /** The answer being priced, on a prediction event. Null for everything else. */
  outcomeLabel: string | null
}

/**
 * Live last-trade price for a pair with a short up/down flash on each tick.
 * Falls back to the shared price cache so re-mounted rows (marquee chips,
 * recent-tickers pane) paint instantly instead of blanking until data flows.
 *
 * A prediction pair is an EVENT, and an event has no single price: it has a
 * field. What a one-line row can honestly show is the FAVOURITE — the answer
 * the market currently rates highest, and what it costs. So the stream follows
 * `leader.pairKey` from the pin and the row is handed the label to say which
 * answer that number belongs to. A bare 63¢ under a question is worse than no
 * number, because it reads as the price of Yes whichever side is leading.
 */
export function useLivePairPrice(
  symbol: string,
  market: string,
): LivePairPrice {
  const eventPin = usePredictionEventEntry(symbol)
  const streamKey = eventPin?.leader?.pairKey ?? symbol
  const { ticker } = useTickerStream({ market, pairKey: streamKey })

  // Derived during render (cache fallback covers re-mounts and market
  // switches) — keeping it out of state avoids a second render per tick.
  const price =
    ticker?.last ??
    recentTickerPriceCache.get(streamKey) ??
    eventPin?.leader?.price ??
    null

  const direction = usePriceTick(ticker?.last)

  useEffect(() => {
    if (ticker?.last == null) return
    recentTickerPriceCache.set(streamKey, ticker.last)
  }, [ticker?.last, streamKey])

  return { price, direction, outcomeLabel: eventPin?.leader?.label ?? null }
}
