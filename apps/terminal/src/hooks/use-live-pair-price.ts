// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'

import type { TickDirection } from '@/hooks/use-price-tick'
import { useTickerStream } from '@/hooks/use-ticker-stream'
import { usePriceTick } from '@/hooks/use-price-tick'
import { recentTickerPriceCache } from '@/lib/recent-tickers'

export type { TickDirection }

type LivePairPrice = {
  price: number | null
  direction: TickDirection
}

/**
 * Live last-trade price for a pair with a short up/down flash on each tick.
 * Falls back to the shared price cache so re-mounted rows (marquee chips,
 * recent-tickers pane) paint instantly instead of blanking until data flows.
 */
export function useLivePairPrice(
  symbol: string,
  market: string,
): LivePairPrice {
  const { ticker } = useTickerStream({ market, pairKey: symbol })

  // Derived during render (cache fallback covers re-mounts and market
  // switches) — keeping it out of state avoids a second render per tick.
  const price = ticker?.last ?? recentTickerPriceCache.get(symbol) ?? null

  const direction = usePriceTick(ticker?.last)

  useEffect(() => {
    if (ticker?.last == null) return
    recentTickerPriceCache.set(symbol, ticker.last)
  }, [ticker?.last, symbol])

  return { price, direction }
}
