// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'

import type { TickerUpdate } from '@pairlens/market-engine/types'
import type { MarketDataStatus } from '@/lib/market-data-provider'
import { useMarketData } from '@/lib/market-data-provider'
import { normalizePairKey } from '@/lib/pairs'

export type TickerSnapshot = {
  last: number
  /** 24h change in percent, when the connector provides it. */
  change24h?: number
  ts: number
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

  useEffect(() => {
    if (!enabled || normalizedPairKey.length === 0) {
      setTicker(null)
      setStreamError(null)
      return
    }

    if (mdStatus !== 'connected') return

    setTicker(null)
    setStreamError(null)

    const unsubscribe = subscribeTicker(market, normalizedPairKey, (data) => {
      const update = data as TickerUpdate
      if (!update?.ticker) return
      const { last, change24h, ts } = update.ticker
      if (!isFiniteNumber(last)) return
      setTicker({
        last,
        ...(isFiniteNumber(change24h) ? { change24h } : {}),
        ts: isFiniteNumber(ts) ? ts : Date.now(),
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
