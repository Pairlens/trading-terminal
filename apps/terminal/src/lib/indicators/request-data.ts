// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fulfilment of a script's `request.security(...)` declarations — the
 * higher-timeframe and cross-symbol data a Python indicator asks for.
 *
 * Scripts declare what they need up front, so the host can fetch it once and
 * hand it over as plain candle buffers instead of letting Python reach out
 * mid-compute (it has no network, and compute() is synchronous).
 *
 * Fetches are cached per (market, pair, timeframe): a 1d series behind a 1h
 * chart must not be re-pulled on every recompute. Entries go stale on a
 * fraction of their own bar duration, so a daily series refreshes rarely and
 * a 1m series stays live.
 */
import type { ChartBar } from '@pairlens/fast-financial-charts/types'
import type { CustomIndicatorRequestSpec } from '@pairlens/shared/plugin-types'
import type { CandleArrays, RequestSeries } from '@/lib/python/python-runtime'
import { fetchHistoryDepth } from '@/lib/indicators/fetch-depth'

/** How the host pulls candle history — supplied by the market data provider. */
export type IndicatorHistoryFetcher = (
  market: string,
  pair: string,
  timeframe: string,
  limit: number,
  /** Fetch candles strictly older than this epoch-ms timestamp. */
  endTs?: number,
) => Promise<Array<ChartBar> | null | undefined>

/** Bars pulled per requested series — enough for a long moving average. */
const REQUEST_BARS = 500

const MINUTE_MS = 60_000
const TIMEFRAME_MS: Record<string, number> = {
  '1m': MINUTE_MS,
  '3m': 3 * MINUTE_MS,
  '5m': 5 * MINUTE_MS,
  '15m': 15 * MINUTE_MS,
  '30m': 30 * MINUTE_MS,
  '1h': 60 * MINUTE_MS,
  '2h': 120 * MINUTE_MS,
  '4h': 240 * MINUTE_MS,
  '6h': 360 * MINUTE_MS,
  '12h': 720 * MINUTE_MS,
  '1d': 1440 * MINUTE_MS,
  '3d': 3 * 1440 * MINUTE_MS,
  '1w': 7 * 1440 * MINUTE_MS,
  '1M': 30 * 1440 * MINUTE_MS,
}

const MIN_TTL_MS = 15_000
const MAX_TTL_MS = 5 * MINUTE_MS

const staleAfter = (timeframe: string): number => {
  const span = TIMEFRAME_MS[timeframe] ?? 60 * MINUTE_MS
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, span / 4))
}

type CacheEntry = {
  bars: Array<ChartBar>
  fetchedAt: number
  /** Coalesces concurrent requests for the same series. */
  inFlight: Promise<Array<ChartBar>> | null
}

const cache = new Map<string, CacheEntry>()

let fetcher: IndicatorHistoryFetcher | null = null

/**
 * Point request fulfilment at the app's market data provider. Passing null
 * detaches it — pending caches are dropped so a venue switch can't serve
 * another market's candles.
 */
export function setIndicatorHistorySource(
  next: IndicatorHistoryFetcher | null,
): void {
  fetcher = next
  if (next === null) cache.clear()
}

/** Drop every cached series — used when the app's data source changes. */
export function clearRequestDataCache(): void {
  cache.clear()
}

/** Column-oriented copy of `bars`, freshly allocated for transfer. */
export function toCandleArrays(bars: Array<ChartBar>): CandleArrays {
  const n = bars.length
  const time = new Float64Array(n)
  const open = new Float64Array(n)
  const high = new Float64Array(n)
  const low = new Float64Array(n)
  const close = new Float64Array(n)
  const volume = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    const bar = bars[i]
    time[i] = bar.ts
    open[i] = bar.open
    high[i] = bar.high
    low[i] = bar.low
    close[i] = bar.close
    volume[i] = bar.volume
  }
  return { time, open, high, low, close, volume }
}

const cacheKey = (market: string, pair: string, timeframe: string): string =>
  `${market}|${pair}|${timeframe}`

async function loadSeries(
  market: string,
  pair: string,
  timeframe: string,
): Promise<Array<ChartBar>> {
  const key = cacheKey(market, pair, timeframe)
  const entry = cache.get(key)
  const now = Date.now()

  if (entry) {
    if (entry.inFlight) return entry.inFlight
    if (now - entry.fetchedAt < staleAfter(timeframe)) return entry.bars
  }

  const source = fetcher
  if (!source) {
    // No data source yet (the chart host wires it on mount). Serve whatever
    // we already have rather than failing the whole compute.
    return entry?.bars ?? []
  }

  // Paged and returned oldest-first: `align()` binary-searches this timeline
  // in Python, and a venue's per-call cap would otherwise silently shorten a
  // higher-timeframe series to a fraction of the requested depth.
  const inFlight = fetchHistoryDepth(
    (limit, endTs) => source(market, pair, timeframe, limit, endTs),
    REQUEST_BARS,
  )

  cache.set(key, {
    bars: entry?.bars ?? [],
    fetchedAt: entry?.fetchedAt ?? 0,
    inFlight,
  })

  try {
    const bars = await inFlight
    cache.set(key, { bars, fetchedAt: Date.now(), inFlight: null })
    return bars
  } catch (err) {
    // Keep the stale copy so a transient venue error doesn't blank the plot.
    cache.set(key, {
      bars: entry?.bars ?? [],
      fetchedAt: Date.now(),
      inFlight: null,
    })
    throw err
  }
}

/**
 * Resolve every declared request against the chart's current context. A spec
 * that omits a field inherits the chart's own market/pair/timeframe, so
 * `request.security('daily', timeframe='1d')` follows whatever pair the user
 * is looking at.
 *
 * A series that fails to load is omitted rather than failing the compute —
 * the script sees `ctx.data(key)` with zero bars and its `align()` yields
 * NaN, which the chart renders as a gap.
 */
export async function resolveRequestSeries(
  specs: Array<CustomIndicatorRequestSpec> | undefined,
  context: { market: string; pair: string; timeframe: string },
): Promise<Array<RequestSeries>> {
  if (!specs || specs.length === 0) return []
  const loaded = await Promise.all(
    specs.map(async (spec) => {
      const market = spec.market ?? context.market
      const pair = spec.pair ?? context.pair
      const timeframe = spec.timeframe ?? context.timeframe
      if (!market || !pair || !timeframe) return null
      try {
        const bars = await loadSeries(market, pair, timeframe)
        return { key: spec.key, candles: toCandleArrays(bars) }
      } catch (err) {
        console.warn(
          `[custom-indicator] request '${spec.key}' (${market} ${pair} ${timeframe}) failed:`,
          err,
        )
        return null
      }
    }),
  )
  return loaded.filter((series): series is RequestSeries => series !== null)
}
