// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { resolvePool } from './pool-resolver'
import type { Candle } from '@pairlens/shared/types'

const API_BASE = 'https://api.dexpaprika.com'

// DexPaprika supported intervals
const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '10m': '10m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '6h': '6h',
  '12h': '12h',
  '1d': '24h',
}

type OhlcvBar = {
  time_open: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Fetch OHLCV candle data from DexPaprika.
 * For 4h: aggregates from 1h bars.
 */
export async function fetchOhlcv(
  pair: string,
  timeframe: string,
  limit: number,
  network = 'solana',
): Promise<Array<Candle>> {
  const pool = await resolvePool(pair, network)
  if (!pool) return []

  // 4h is not supported natively — aggregate from 1h
  const needsAggregation = timeframe === '4h'
  const interval = needsAggregation ? '1h' : INTERVAL_MAP[timeframe]
  if (!interval) return []

  const fetchLimit = needsAggregation ? limit * 4 : limit

  try {
    const res = await fetch(
      `${API_BASE}/networks/${network}/pools/${pool.id}/ohlcv?interval=${interval}&limit=${fetchLimit}`,
    )
    if (!res.ok) return []

    const bars = (await res.json()) as Array<OhlcvBar>
    const candles: Array<Candle> = bars.map((b) => ({
      ts: new Date(b.time_open).getTime(),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }))

    if (!needsAggregation) return candles.slice(-limit)

    // Aggregate 1h bars into 4h bars
    return aggregate(candles, 4).slice(-limit)
  } catch {
    return []
  }
}

function aggregate(candles: Array<Candle>, factor: number): Array<Candle> {
  const result: Array<Candle> = []
  for (let i = 0; i < candles.length; i += factor) {
    const group = candles.slice(i, i + factor)
    if (group.length === 0) continue
    result.push({
      ts: group[0].ts,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + c.volume, 0),
    })
  }
  return result
}
