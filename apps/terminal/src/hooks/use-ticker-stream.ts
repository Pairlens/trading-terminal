// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react'

import type { TickerUpdate, TradingStatus } from '@pairlens/market-engine/types'
import type { MarketDataStatus } from '@/lib/market-data-provider'
import { useMarketData } from '@/lib/market-data-provider'
import { normalizePairKey } from '@/lib/pairs'

export type TickerSnapshot = {
  last: number
  /** 24h change in percent, when the connector provides it. */
  change24h?: number
  ts: number
  /**
   * Venue halt state, only from connectors that publish one (Alpaca today).
   * Absent means UNKNOWN, never "trading normally".
   */
  tradingStatus?: TradingStatus
}

export type TickerStreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

type UseTickerStreamOptions = {
  market: string
  pairKey: string
  enabled?: boolean
}

type UseTickerStreamResult = {
  ticker: TickerSnapshot | null
  status: TickerStreamStatus
  errorMessage: string | null
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/**
 * Whether two statuses say the same thing.
 *
 * A halt is republished on every ticker patch, several times a second. Handing
 * a fresh object down each time would defeat every memo keyed on the status and
 * turn a halt badge into a per-tick render across the pane tree, so the
 * previous object is reused whenever nothing about it changed.
 */
const sameTradingStatus = (
  a: TradingStatus | null,
  b: TradingStatus | null,
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.state === b.state &&
    a.reason === b.reason &&
    a.sinceMs === b.sinceMs)

const mapStatus = (
  mdStatus: MarketDataStatus,
  enabled: boolean,
): TickerStreamStatus => {
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

export function useTickerStream(
  options: UseTickerStreamOptions,
): UseTickerStreamResult {
  const { market, pairKey, enabled = true } = options

  const { subscribeTicker, status: mdStatus, streamVersion } = useMarketData()

  const normalizedPairKey = useMemo(() => normalizePairKey(pairKey), [pairKey])

  const [ticker, setTicker] = useState<TickerSnapshot | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  /** Identity-stable trading status; see `sameTradingStatus`. */
  const statusRef = useRef<TradingStatus | null>(null)

  useEffect(() => {
    if (!enabled || normalizedPairKey.length === 0) {
      setTicker(null)
      setStreamError(null)
      statusRef.current = null
      return
    }

    if (mdStatus !== 'connected') return

    setTicker(null)
    setStreamError(null)
    // A halt belongs to the instrument that was halted; carrying it across a
    // pair or venue switch would label the next symbol with the last one's.
    statusRef.current = null

    const unsubscribe = subscribeTicker(market, normalizedPairKey, (data) => {
      const update = data as TickerUpdate
      if (!update?.ticker) return
      const { last, change24h, ts, tradingStatus } = update.ticker
      if (!isFiniteNumber(last)) return
      const status = tradingStatus ?? null
      if (!sameTradingStatus(statusRef.current, status)) {
        statusRef.current = status
      }
      setTicker({
        last,
        ...(isFiniteNumber(change24h) ? { change24h } : {}),
        ts: isFiniteNumber(ts) ? ts : Date.now(),
        ...(statusRef.current ? { tradingStatus: statusRef.current } : {}),
      })
      setStreamError(null)
    })

    return () => {
      unsubscribe()
    }
  }, [
    enabled,
    market,
    normalizedPairKey,
    subscribeTicker,
    mdStatus,
    streamVersion,
  ])

  return {
    ticker,
    status: mapStatus(mdStatus, enabled),
    errorMessage: streamError,
  }
}
