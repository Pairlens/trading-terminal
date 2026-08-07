// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useMarketData } from '@/lib/market-data-provider'

/**
 * The closes behind a discovery row's mini price chart.
 *
 * Hourly candles over the last day: the same window the 24h change beside it
 * refers to, so the line and the percentage can never tell different stories.
 */
const TIMEFRAME = '1h'
const LIMIT = 24

/**
 * Discovery lists hold hundreds of instruments. Virtualization keeps the
 * mounted row count small, but a fast scroll still mounts and unmounts a lot
 * of rows on the way past, and each one would otherwise open its own REST
 * call. Two brakes:
 *
 *   - a settle delay, so a row that scrolls by in a flick never asks at all,
 *   - a global slot limit, so the rows that do settle queue up instead of
 *     firing thirty parallel requests at one venue and earning a 429.
 *
 * Candles are cached for five minutes per (venue, pair), so scrolling back
 * over a row costs nothing.
 */
const SETTLE_MS = 200
const MAX_IN_FLIGHT = 4

let inFlight = 0
const waiting: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waiting.push(resolve)
  })
}

function releaseSlot(): void {
  const next = waiting.shift()
  // Hand the slot straight over rather than releasing and re-taking it —
  // `inFlight` is already correct for the waiter that is about to run.
  if (next) next()
  else inFlight--
}

export type SparklineState = 'loading' | 'ready' | 'unavailable'

export type SparklineResult = {
  /** Oldest-first closes; empty unless `state` is 'ready'. */
  values: Array<number>
  state: SparklineState
}

/** Stable identity so a pending row doesn't invalidate memos every render. */
const NO_VALUES: Array<number> = []

/**
 * A venue that can't answer (no history capability, desktop-only in a
 * browser, a pair it doesn't list) leaves the row without a chart. That is a
 * quiet outcome by design — the row still carries price and change, and the
 * chart slot keeps its size so nothing reflows.
 */
export function useSparkline(
  market: string | undefined,
  pair: string | undefined,
  enabled = true,
): SparklineResult {
  const { probeVenueHistory } = useMarketData()
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [])

  const active = enabled && settled && Boolean(market) && Boolean(pair)

  const query = useQuery({
    queryKey: ['sparkline', market, pair, TIMEFRAME, LIMIT],
    queryFn: async ({ signal }) => {
      await acquireSlot()
      try {
        // The row may have scrolled away while this was queued.
        if (signal.aborted) throw new Error('sparkline: cancelled')
        // Deliberately the no-fallback probe. The row's price and change come
        // from one venue, so its trend line must too — and `fetchHistory`
        // would walk the chain to a wildcard provider, which for a pair the
        // venue does not list means a CORS-blocked round trip per row before
        // arriving at the same "no chart".
        const request = probeVenueHistory(market!, pair!, TIMEFRAME, LIMIT)
        if (!request) return NO_VALUES
        const candles = await request
        return candles
          .slice()
          .sort((a, b) => a.ts - b.ts)
          .map((c) => c.close)
          .filter((close) => Number.isFinite(close))
      } finally {
        releaseSlot()
      }
    },
    enabled: active,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    // One venue declining is an answer, not a blip — retrying just multiplies
    // the request count across a list this long.
    retry: false,
    refetchOnWindowFocus: false,
  })

  if (query.isError) return { values: NO_VALUES, state: 'unavailable' }
  if (!active || query.isPending) {
    return { values: NO_VALUES, state: 'loading' }
  }
  const values = query.data ?? NO_VALUES
  return { values, state: values.length >= 2 ? 'ready' : 'unavailable' }
}
