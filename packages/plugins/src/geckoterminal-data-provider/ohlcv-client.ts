// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { isProviderThrottledError } from '@pairlens/market-engine/errors'
import { resolvePool } from './pool-resolver'
import { geckoFetch as fetch } from './rate-limiter'
import type { Candle } from '@pairlens/shared/types'

const API_BASE = 'https://api.geckoterminal.com/api/v2'

// GeckoTerminal supported aggregates
// Intervals: /ohlcv/minute?aggregate=1|5|15, /ohlcv/hour?aggregate=1|4|12, /ohlcv/day?aggregate=1
const TIMEFRAME_CONFIG: Record<string, { path: string; aggregate: number }> = {
  '1m': { path: 'minute', aggregate: 1 },
  '5m': { path: 'minute', aggregate: 5 },
  '15m': { path: 'minute', aggregate: 15 },
  '30m': { path: 'minute', aggregate: 15 }, // aggregate 2x15m
  '1h': { path: 'hour', aggregate: 1 },
  '4h': { path: 'hour', aggregate: 4 },
  '1d': { path: 'day', aggregate: 1 },
}

type OhlcvBar = [
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
]

/**
 * Fetch OHLCV candle data from GeckoTerminal.
 * Supports up to 1000 candles per request.
 *
 * An empty array means "nothing to chart here" and is a real answer. A THROTTLE
 * is not: it propagates as `ProviderThrottledError` so the caller retries
 * instead of the terminal recording the pair as unlisted. Every other failure
 * still degrades to empty, as it always did.
 */
export async function fetchOhlcv(
  pair: string,
  timeframe: string,
  limit: number,
  network = 'solana',
): Promise<Array<Candle>> {
  const pool = await resolvePool(pair, network)
  if (!pool) return []

  const config = TIMEFRAME_CONFIG[timeframe]
  if (!config) return []

  // 30m: fetch 15m bars and aggregate
  const needs30mAgg = timeframe === '30m'
  const fetchLimit = needs30mAgg
    ? Math.min(limit * 2, 1000)
    : Math.min(limit, 1000)

  try {
    const res = await fetch(
      `${API_BASE}/networks/${network}/pools/${pool.address}/ohlcv/${config.path}?aggregate=${config.aggregate}&limit=${fetchLimit}&currency=usd`,
    )
    if (!res.ok) return []

    const json = (await res.json()) as {
      data?: {
        attributes: {
          ohlcv_list: Array<OhlcvBar>
        }
      }
    }

    const bars = json.data?.attributes.ohlcv_list ?? []
    // GeckoTerminal returns newest first — reverse for chronological
    const sorted = [...bars].sort((a, b) => a[0] - b[0])

    const candles: Array<Candle> = sorted.map((b) => ({
      ts: b[0] * 1000,
      open: b[1],
      high: b[2],
      low: b[3],
      close: b[4],
      volume: b[5],
    }))

    if (!needs30mAgg) return candles.slice(-limit)
    return aggregate(candles, 2).slice(-limit)
  } catch (err) {
    if (isProviderThrottledError(err)) throw err
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
