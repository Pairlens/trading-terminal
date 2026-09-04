// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { z } from 'zod'
import type { PluginManager } from '@pairlens/plugin-system'

// ---------------------------------------------------------------------------
// Shared copilot tool primitives.
//
// This is a LEAF module (no imports from copilot-brain) so both the brain and
// every tool module can import candle helpers, the timeframe schema, and the
// dependency contract without creating an import cycle.
// ---------------------------------------------------------------------------

export type CopilotCandle = {
  ts: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type CopilotMarketContext = {
  candles?: Array<CopilotCandle>
  ticker?: unknown
  signal?: unknown
}

// ---------------------------------------------------------------------------
// Candle ordering — the two consumers disagree, so normalize explicitly.
//   • summarizeCandles expects NEWEST-first (index 0 = latest).
//   • strategy-engine expects OLDEST-first (progressive prefixes end at latest).
// Sorting defensively means tools work regardless of the connector's order.
// ---------------------------------------------------------------------------

export function toNewestFirst(
  candles: Array<CopilotCandle>,
): Array<CopilotCandle> {
  return [...candles].sort((a, b) => b.ts - a.ts)
}

export function toOldestFirst(
  candles: Array<CopilotCandle>,
): Array<CopilotCandle> {
  return [...candles].sort((a, b) => a.ts - b.ts)
}

// ---------------------------------------------------------------------------
// Candle summarizer (newest-first input)
// ---------------------------------------------------------------------------

function sma(candles: Array<CopilotCandle>, period: number): number | null {
  if (candles.length < period) return null
  return candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
}

export function summarizeCandles(input: Array<CopilotCandle>) {
  const candles = input && input.length > 0 ? toNewestFirst(input) : []
  if (candles.length === 0) {
    return {
      count: 0,
      latestPrice: null,
      high: null,
      low: null,
      shortTermTrend: null,
      mediumTermTrend: null,
      sma20: null,
      sma50: null,
      sma200: null,
      volatility: null,
      recentCandles: [] as Array<CopilotCandle>,
    }
  }

  const latestPrice = candles[0].close
  const high = Math.max(...candles.map((c) => c.high))
  const low = Math.min(...candles.map((c) => c.low))

  const classifyTrend = (
    recent: number,
    older: number,
  ): 'up' | 'down' | 'sideways' => {
    const pct = ((recent - older) / older) * 100
    if (pct > 0.5) return 'up'
    if (pct < -0.5) return 'down'
    return 'sideways'
  }

  let shortTermTrend: 'up' | 'down' | 'sideways' | null = null
  if (candles.length >= 20) {
    const recentAvg = candles.slice(0, 10).reduce((s, c) => s + c.close, 0) / 10
    const olderAvg = candles.slice(10, 20).reduce((s, c) => s + c.close, 0) / 10
    shortTermTrend = classifyTrend(recentAvg, olderAvg)
  }

  let mediumTermTrend: 'up' | 'down' | 'sideways' | null = null
  if (candles.length >= 100) {
    const recentAvg = candles.slice(0, 25).reduce((s, c) => s + c.close, 0) / 25
    const olderAvg =
      candles.slice(75, 100).reduce((s, c) => s + c.close, 0) / 25
    mediumTermTrend = classifyTrend(recentAvg, olderAvg)
  }

  const sma20 = sma(candles, 20)
  const sma50 = sma(candles, 50)
  const sma200 = sma(candles, 200)

  let volatility: { atr14: number; atr14Pct: number } | null = null
  if (candles.length >= 15) {
    let atrSum = 0
    for (let i = 0; i < 14; i++) {
      const curr = candles[i]
      const prev = candles[i + 1]
      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close),
      )
      atrSum += tr
    }
    const atr14 = atrSum / 14
    volatility = {
      atr14: Math.round(atr14 * 100) / 100,
      atr14Pct: Math.round((atr14 / latestPrice) * 10000) / 100,
    }
  }

  return {
    count: candles.length,
    latestPrice,
    high,
    low,
    shortTermTrend,
    mediumTermTrend,
    sma20,
    sma50,
    sma200,
    volatility,
    recentCandles: candles.slice(0, 10),
  }
}

// ---------------------------------------------------------------------------
// Timeframe schema (accepts common aliases, normalizes to canonical form)
// ---------------------------------------------------------------------------

const TIMEFRAME_ALIASES: Record<string, string> = {
  '1m': '1m',
  '1min': '1m',
  '5m': '5m',
  '5min': '5m',
  '15m': '15m',
  '15min': '15m',
  '30m': '30m',
  '30min': '30m',
  '1h': '1h',
  '1hr': '1h',
  '60m': '1h',
  '60min': '1h',
  '2h': '2h',
  '2hr': '2h',
  '120m': '2h',
  '4h': '4h',
  '4hr': '4h',
  '240m': '4h',
  '1d': '1d',
  '1day': '1d',
  daily: '1d',
  d: '1d',
  '1w': '1w',
  '1week': '1w',
  weekly: '1w',
  w: '1w',
}
export const VALID_TIMEFRAMES = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1d',
  '1w',
] as const

export const timeframeSchema = z
  .string()
  .transform((v) => TIMEFRAME_ALIASES[v.toLowerCase()] ?? v.toLowerCase())
  .pipe(z.enum(VALID_TIMEFRAMES))
  .describe('Candle timeframe (1m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w)')

/** Normalize a pair to dash format (BTC-USDT), tolerant of BTC/USDT, btcusdt etc. */
export function normalizePair(pair: string): string {
  return pair
    .trim()
    .toUpperCase()
    .replace(/[\\/_]/g, '-')
}

/** Normalize a timeframe string (accepting aliases) to a canonical one, or null. */
export function normalizeTimeframe(tf: string): string | null {
  const v = TIMEFRAME_ALIASES[tf.toLowerCase()] ?? tf.toLowerCase()
  return (VALID_TIMEFRAMES as ReadonlyArray<string>).includes(v) ? v : null
}

// ---------------------------------------------------------------------------
// Dependency contract passed into every tool module
// ---------------------------------------------------------------------------

export type MarketInfo = {
  marketId: string
  displayName?: string
  assetClasses?: Array<string>
  supportedTimeframes?: Array<string>
  capabilities?: Array<string>
}

/**
 * Minimal structural view of MarketDataProvider that copilot data tools need.
 * The real MarketDataContextValue is a superset — the panel passes it directly.
 */
export type CopilotMarketDataHandle = {
  availableMarkets: Array<MarketInfo>
  getTimeframes: (market: string) => Array<string>
  getCapabilities: (market: string) => Array<string>
  fetchHistory: (
    market: string,
    pair: string,
    timeframe: string,
    limit: number,
    endTs?: number,
  ) => Promise<Array<CopilotCandle>>
  subscribeOrderbook: (
    market: string,
    pair: string,
    cb: (data: unknown) => void,
  ) => () => void
  /**
   * The public tape. Optional because not every venue publishes one and the
   * CLI's own handle has never carried it — a tool that wants trades checks
   * for the method rather than assuming a provider shape.
   */
  subscribeTrades?: (
    market: string,
    pair: string,
    cb: (data: unknown) => void,
  ) => () => void
}

/** One computed indicator sample. RSI uses `value`; StochRSI uses `k`/`d`; EMACross uses `fast`/`slow`. */
export type CopilotIndicatorPoint = {
  ts: number
  [key: string]: boolean | number | string | undefined
}

export type CopilotChartSnapshot = {
  timeframe?: string
  chartType?: string
  priceScaleMode?: string
  indicators?: Array<{
    id: string
    type: string
    params?: Record<string, unknown>
    /** Last computed point, or null while the engine has not produced values yet. */
    latest?: CopilotIndicatorPoint | null
    /** Most recent computed points, newest last, capped so a long series stays compact. */
    values?: Array<CopilotIndicatorPoint>
  }>
  drawings?: Array<{ id: string; type: string }>
  visibleRange?: { startIndex: number; endIndex: number }
  barCount?: number
  compareSymbols?: Array<string>
}

export type CopilotContextInfo = {
  market?: string
  pair?: string
  timeframe?: string
}

export type CopilotToolDeps = {
  /** Live market context pushed for the on-screen pair. */
  getCtx: () => CopilotMarketContext | null
  /** Pair/market/timeframe the chat is scoped to (used to default tool args). */
  getContextInfo: () => CopilotContextInfo
  /** MarketDataProvider handle — null when the provider is unavailable. */
  getMarketData: () => CopilotMarketDataHandle | null
  /** Plugin manager — discovery/search + web-search capability resolution. */
  pluginManager: PluginManager
  /** Chart snapshot pushed from the terminal for chart-query tools. */
  getChartSnapshot: () => CopilotChartSnapshot | null
}

/**
 * Resolve tool args against the current chat context, normalizing the pair.
 *
 * The last resort is a hardcoded BTC-USDT on okx, and that is the one thing
 * about this function worth knowing: it fires when the model named no pair
 * AND nothing on screen claims an instrument, and the answer it produces is
 * about a market the user never mentioned. So it is FLAGGED. Every tool
 * spreads the target into its result, so `assumed` travels with the numbers
 * and the model can say "you did not name a pair" instead of presenting a
 * BTC read as an answer about whatever they were actually looking at.
 */
export function resolveTarget(
  deps: CopilotToolDeps,
  args: { market?: string; pair?: string; timeframe?: string },
): {
  market: string
  pair: string
  timeframe: string
  /** Set when the pair is the fallback rather than anything real. */
  assumed?: true
} {
  const ctx = deps.getContextInfo()
  const named = args.pair ?? ctx.pair
  return {
    market: (args.market ?? ctx.market ?? 'okx').toLowerCase(),
    pair: normalizePair(named ?? 'BTC-USDT'),
    timeframe: args.timeframe ?? ctx.timeframe ?? '1h',
    ...(named ? {} : { assumed: true as const }),
  }
}

/** True when the requested target matches the live on-screen pair/timeframe. */
export function isCurrentTarget(
  deps: CopilotToolDeps,
  target: { market: string; pair: string; timeframe: string },
): boolean {
  const ctx = deps.getContextInfo()
  return (
    (ctx.market ?? '').toLowerCase() === target.market &&
    normalizePair(ctx.pair ?? '') === target.pair &&
    (ctx.timeframe ?? '') === target.timeframe
  )
}
