// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react'

import type { Trade, TradesUpdate } from '@pairlens/market-engine/types'
import type { MarketDataStatus } from '@/lib/market-data-provider'
import { useMarketData } from '@/lib/market-data-provider'
import { normalizePairKey } from '@/lib/pairs'

export type { Trade }

export type TradesStreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unsupported'

/** Prints retained for the tape. Deeper than any pane renders at once. */
const MAX_TRADES = 200

/**
 * Frame budget for flushing arrivals into React state.
 *
 * A busy pair prints far faster than it is worth re-rendering — BTC can burst
 * dozens of executions a second, and every one of them would otherwise be a
 * setState. Arrivals land in a ref-backed buffer and a single interval
 * publishes them, so render cost is bounded by this interval rather than by
 * venue activity. 100ms still reads as a live tape.
 */
const FLUSH_INTERVAL_MS = 100

type UseTradesStreamOptions = {
  market: string
  pairKey: string
  enabled?: boolean
}

type UseTradesStreamResult = {
  trades: Array<Trade>
  status: TradesStreamStatus
}

const mapStatus = (
  mdStatus: MarketDataStatus,
  enabled: boolean,
): TradesStreamStatus => {
  switch (mdStatus) {
    case 'connected':
      return 'connected'
    case 'connecting':
      return 'connecting'
    case 'disconnected':
    default:
      return enabled ? 'reconnecting' : 'idle'
  }
}

/**
 * Subscribe to a venue's public trade feed (time and sales).
 *
 * Deliberately NOT routed through ChartTerminalProvider like the book and
 * ticker are: those tick a few times a second and the whole terminal can
 * afford to see them, whereas trades are the fastest feed in the app. Keeping
 * the subscription local to the consuming pane means a burst re-renders one
 * leaf instead of every pane bound to the shared context.
 */
export function useTradesStream(
  options: UseTradesStreamOptions,
): UseTradesStreamResult {
  const { market, pairKey, enabled = true } = options

  const {
    subscribeTrades,
    hasCapability,
    pluginsReady,
    status: mdStatus,
    streamVersion,
  } = useMarketData()

  const normalizedPairKey = useMemo(() => normalizePairKey(pairKey), [pairKey])

  // Recomputed once plugins finish activating — before that every venue would
  // otherwise report "no trade feed" and the pane would latch unsupported.
  const supported = useMemo(
    () => pluginsReady && hasCapability('market-data:trades', market),
    [hasCapability, market, pluginsReady],
  )

  const [trades, setTrades] = useState<Array<Trade>>([])

  // Newest-first, mirroring how the tape renders. Held in a ref so an arrival
  // costs an array splice, not a render.
  const bufferRef = useRef<Array<Trade>>([])
  // Ids already shown, so a resubscribe replaying its last few executions
  // doesn't duplicate rows. Bounded alongside the buffer.
  const seenRef = useRef<Set<string>>(new Set())
  const dirtyRef = useRef(false)

  useEffect(() => {
    bufferRef.current = []
    seenRef.current = new Set()
    dirtyRef.current = false
    setTrades([])

    if (!enabled || !supported || normalizedPairKey.length === 0) return
    if (mdStatus !== 'connected') return

    const unsubscribe = subscribeTrades(market, normalizedPairKey, (data) => {
      const update = data as TradesUpdate
      if (!update?.trades?.length) return

      for (const trade of update.trades) {
        if (seenRef.current.has(trade.id)) continue
        seenRef.current.add(trade.id)
        bufferRef.current.unshift(trade)
      }

      if (bufferRef.current.length > MAX_TRADES) {
        for (const dropped of bufferRef.current.splice(MAX_TRADES)) {
          seenRef.current.delete(dropped.id)
        }
      }
      dirtyRef.current = true
    })

    // Publish at a fixed cadence rather than per arrival. `slice()` hands
    // React a new identity only when something actually landed, so a quiet
    // pair costs one comparison per tick and no render at all.
    const timer = setInterval(() => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      setTrades(bufferRef.current.slice())
    }, FLUSH_INTERVAL_MS)

    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [
    enabled,
    supported,
    market,
    normalizedPairKey,
    subscribeTrades,
    mdStatus,
    streamVersion,
  ]) // deps intentionally scoped: resubscribe only on pair/market/status/version change

  return {
    trades,
    status: !pluginsReady
      ? 'connecting'
      : supported
        ? mapStatus(mdStatus, enabled)
        : 'unsupported',
  }
}
