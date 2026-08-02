// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef, useState } from 'react'

import { useTickerStream } from '@/hooks/use-ticker-stream'
import { recentTickerPriceCache } from '@/lib/recent-tickers'

export type TickDirection = 'up' | 'down' | null

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

  const [direction, setDirection] = useState<TickDirection>(null)
  const prevPriceRef = useRef<number | null>(price)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (ticker?.last == null) return

    const prev = prevPriceRef.current
    if (prev != null && ticker.last !== prev) {
      setDirection(ticker.last > prev ? 'up' : 'down')
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setDirection(null), 700)
    }

    prevPriceRef.current = ticker.last
    recentTickerPriceCache.set(symbol, ticker.last)
  }, [ticker?.last, symbol])

  useEffect(() => {
    return () => clearTimeout(flashTimerRef.current)
  }, [])

  return { price, direction }
}
