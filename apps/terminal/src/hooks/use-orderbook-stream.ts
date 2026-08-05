// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react'

import type { OrderbookUpdate } from '@pairlens/market-engine/types'
import type { MarketDataStatus } from '@/lib/market-data-provider'
import { useMarketData } from '@/lib/market-data-provider'
import { normalizePairKey } from '@/lib/pairs'

export type OrderBookLevel = {
  price: number
  size: number
}

export type OrderBookSnapshot = {
  bids: Array<OrderBookLevel>
  asks: Array<OrderBookLevel>
  ts: number
  baseTickSize?: number
}

export type OrderbookStreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

type UseOrderbookStreamOptions = {
  market: string
  pairKey: string
  enabled?: boolean
}

type UseOrderbookStreamResult = {
  orderbook: OrderBookSnapshot | null
  baseTickSize: number
  status: OrderbookStreamStatus
  errorMessage: string | null
}

/**
 * Smallest positive gap between adjacent levels of one book side.
 * Levels arrive sorted (bids descending, asks ascending — the pane's spread
 * and cumulative math already rely on this), so adjacent gaps are the finest
 * price distances the venue actually quoted.
 */
const minAdjacentGap = (levels: Array<OrderBookLevel>): number => {
  let min = Infinity
  for (let i = 1; i < levels.length; i++) {
    const gap = Math.abs(levels[i].price - levels[i - 1].price)
    if (gap > 0 && gap < min) min = gap
  }
  return min
}

const mapStatus = (
  mdStatus: MarketDataStatus,
  enabled: boolean,
): OrderbookStreamStatus => {
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

export function useOrderbookStream(
  options: UseOrderbookStreamOptions,
): UseOrderbookStreamResult {
  const { market, pairKey, enabled = true } = options

  const {
    subscribeOrderbook,
    status: mdStatus,
    streamVersion,
  } = useMarketData()

  const normalizedPairKey = useMemo(() => normalizePairKey(pairKey), [pairKey])

  const [orderbook, setOrderbook] = useState<OrderBookSnapshot | null>(null)
  const [baseTickSize, setBaseTickSize] = useState(0)
  const baseTickSizeRef = useRef(0)
  const [streamError, setStreamError] = useState<string | null>(null)

  useEffect(() => {
    setOrderbook(null)
    setBaseTickSize(0)
    // Reset the ref too — the estimator only ever shrinks a non-zero value,
    // so without this a switch to a coarser-tick pair would keep rendering on
    // the previous pair's finer tick grid.
    baseTickSizeRef.current = 0
    setStreamError(null)

    if (!enabled || normalizedPairKey.length === 0) return
    if (mdStatus !== 'connected') return

    // A connector can refuse synchronously when it knows the venue is
    // unreachable from this build (PlatformRestrictedError — CORS-blocked REST
    // with no WS history). Without this the throw escaped the effect and the
    // pane sat on "Loading order book…" forever, which is the same silent hang
    // the chart used to have.
    let unsubscribe: () => void = () => {}
    try {
      unsubscribe = subscribeOrderbook(market, normalizedPairKey, (data) => {
        const update = data as OrderbookUpdate
        if (!update?.bids || !update?.asks) return

        const bids = update.bids.map(([price, size]) => ({ price, size }))
        const asks = update.asks.map(([price, size]) => ({ price, size }))

        // Estimate the venue tick size from the level grid. The gap between
        // the top two levels alone is NOT the tick — on a thin book (Kraken
        // SOL-USDT) it is routinely several ticks wide, and the pane then
        // force-groups the whole book into a few coarse buckets. Take the
        // minimum adjacent gap across both sides instead, and let a later
        // finer gap shrink the estimate — never grow it, so a sparse update
        // can't coarsen the grid mid-session.
        const gap = Math.min(minAdjacentGap(bids), minAdjacentGap(asks))
        if (Number.isFinite(gap)) {
          // Strip float drift (73.7 − 73.6 = 0.0999999…) to a clean tick.
          const tick = Number(gap.toPrecision(2))
          if (
            tick > 0 &&
            (baseTickSizeRef.current === 0 || tick < baseTickSizeRef.current)
          ) {
            baseTickSizeRef.current = tick
            setBaseTickSize(tick)
          }
        }

        setOrderbook({
          bids,
          asks,
          ts: update.ts ?? Date.now(),
        })
        setStreamError(null)
      })
    } catch (err) {
      setStreamError((err as Error)?.message ?? 'Subscription failed')
      return
    }

    return () => {
      unsubscribe()
    }
  }, [
    enabled,
    market,
    normalizedPairKey,
    subscribeOrderbook,
    mdStatus,
    streamVersion,
  ]) // deps intentionally scoped: resubscribe only on pair/market/status/version change

  return {
    orderbook,
    baseTickSize,
    status: mapStatus(mdStatus, enabled),
    errorMessage: streamError,
  }
}
