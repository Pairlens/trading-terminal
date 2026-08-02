// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { tool } from 'ai'
import { z } from 'zod'
import {
  computeSignalsWithRegime,
  findRecentSignal,
} from '@pairlens/strategy-engine'
import {
  isCurrentTarget,
  resolveTarget,
  summarizeCandles,
  timeframeSchema,
  toNewestFirst,
  toOldestFirst,
} from './tool-deps'
import type { CopilotCandle, CopilotToolDeps } from './tool-deps'
import type { Candle } from '@pairlens/shared/types'

// ---------------------------------------------------------------------------
// Phase 1 — "give it sight": real market-data reads for ANY pair / timeframe /
// market, plus order book, multi-timeframe confluence, compare, and discovery.
// All execute in the transport and return data.
// ---------------------------------------------------------------------------

const NO_PROVIDER =
  'Market data provider unavailable — only the current on-screen pair can be read right now.'

/** Load candles for a target, preferring live context, else fetching history. */
async function loadCandles(
  deps: CopilotToolDeps,
  target: { market: string; pair: string; timeframe: string },
  limit: number,
): Promise<Array<CopilotCandle>> {
  if (isCurrentTarget(deps, target)) {
    const ctx = deps.getCtx()
    if (ctx?.candles && ctx.candles.length > 0) return ctx.candles
  }
  const md = deps.getMarketData()
  if (!md) throw new Error(NO_PROVIDER)
  const candles = await md.fetchHistory(
    target.market,
    target.pair,
    target.timeframe,
    limit,
  )
  return candles ?? []
}

function computeSignal(candles: Array<CopilotCandle>) {
  const oldest = toOldestFirst(candles) as unknown as Array<Candle>
  const [regime, signal] = computeSignalsWithRegime(oldest)
  const recent = signal ? null : findRecentSignal(oldest, 40)
  return { regime, signal: signal ?? recent ?? null }
}

/** Derive a lightweight ticker from candles when the live ticker isn't loaded. */
function tickerFromCandles(candles: Array<CopilotCandle>) {
  const newest = toNewestFirst(candles)
  if (newest.length === 0) return null
  const last = newest[0].close
  const prev = newest.length > 1 ? newest[1].close : last
  return {
    last,
    change: last - prev,
    changePct: prev ? ((last - prev) / prev) * 100 : 0,
    high: Math.max(...newest.map((c) => c.high)),
    low: Math.min(...newest.map((c) => c.low)),
    volume: newest.reduce((s, c) => s + c.volume, 0),
    note: 'Derived from candles — 24h stats require the live ticker for the on-screen pair.',
  }
}

/** Subscribe, capture the first order-book snapshot, unsubscribe. */
function fetchOrderbookSnapshot(
  deps: CopilotToolDeps,
  market: string,
  pair: string,
  timeoutMs = 4000,
): Promise<{
  bids: Array<[number, number]>
  asks: Array<[number, number]>
  ts?: number
} | null> {
  const md = deps.getMarketData()
  if (!md) return Promise.resolve(null)
  return new Promise((resolve) => {
    let done = false
    let unsub: (() => void) | null = null
    const finish = (
      value: {
        bids: Array<[number, number]>
        asks: Array<[number, number]>
        ts?: number
      } | null,
    ) => {
      if (done) return
      done = true
      clearTimeout(timer)
      // Defer unsub so a synchronous replay doesn't unsub before assignment.
      setTimeout(() => unsub?.(), 0)
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    try {
      unsub = md.subscribeOrderbook(market, pair, (data) => {
        const d = data as {
          type?: string
          bids?: Array<[number, number]>
          asks?: Array<[number, number]>
          ts?: number
        }
        if (d && (d.bids?.length || d.asks?.length)) {
          finish({ bids: d.bids ?? [], asks: d.asks ?? [], ts: d.ts })
        }
      })
    } catch {
      finish(null)
    }
  })
}

export function buildMarketTools(deps: CopilotToolDeps) {
  return {
    get_market_snapshot: tool({
      description:
        'Get a full market snapshot for ANY pair/timeframe: candle summary (SMA 20/50/200, ATR14, trend), a derived/live ticker, and the latest strategy signal + regime. Defaults to the on-screen pair when args are omitted.',
      inputSchema: z.object({
        market: z
          .string()
          .optional()
          .describe('Exchange id, e.g. okx, binance'),
        pair: z.string().optional().describe('Trading pair, e.g. BTC-USDT'),
        timeframe: timeframeSchema.optional(),
      }),
      execute: async (args) => {
        const target = resolveTarget(deps, args)
        try {
          const candles = await loadCandles(deps, target, 300)
          const current = isCurrentTarget(deps, target)
          const ctx = deps.getCtx()
          const { regime, signal } = computeSignal(candles)
          return {
            target,
            candles: summarizeCandles(candles),
            ticker:
              current && ctx?.ticker ? ctx.ticker : tickerFromCandles(candles),
            regime,
            latestSignal: signal,
          }
        } catch (err) {
          return {
            target,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),

    get_candles: tool({
      description:
        'Get OHLCV candle data for any pair/timeframe. Returns an aggregate summary plus the most recent candles (not the full raw history, to stay concise).',
      inputSchema: z.object({
        market: z.string().optional(),
        pair: z.string().optional(),
        timeframe: timeframeSchema.optional(),
        limit: z.number().int().min(20).max(1000).optional().default(300),
      }),
      execute: async (args) => {
        const target = resolveTarget(deps, args)
        try {
          const candles = await loadCandles(deps, target, args.limit ?? 300)
          const newest = toNewestFirst(candles)
          return {
            target,
            summary: summarizeCandles(candles),
            recentCandles: newest.slice(0, 30),
          }
        } catch (err) {
          return {
            target,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),

    get_ticker: tool({
      description:
        'Get the current price and stats for a pair. Live 24h stats for the on-screen pair; derived last/high/low/volume for others.',
      inputSchema: z.object({
        market: z.string().optional(),
        pair: z.string().optional(),
      }),
      execute: async (args) => {
        const target = resolveTarget(deps, { ...args, timeframe: undefined })
        if (isCurrentTarget(deps, { ...target })) {
          const ctx = deps.getCtx()
          if (ctx?.ticker) return { target, ticker: ctx.ticker }
        }
        try {
          const candles = await loadCandles(deps, target, 60)
          return { target, ticker: tickerFromCandles(candles) }
        } catch (err) {
          return {
            target,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),

    get_signals: tool({
      description:
        'Compute the deterministic strategy signal (breakout / EMA pullback / mean reversion) and market regime for any pair/timeframe.',
      inputSchema: z.object({
        market: z.string().optional(),
        pair: z.string().optional(),
        timeframe: timeframeSchema.optional(),
      }),
      execute: async (args) => {
        const target = resolveTarget(deps, args)
        try {
          const candles = await loadCandles(deps, target, 300)
          const { regime, signal } = computeSignal(candles)
          return { target, regime, signal }
        } catch (err) {
          return {
            target,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),

    get_orderbook: tool({
      description:
        'Get a live order-book snapshot (top bids/asks) with spread and bid/ask imbalance for liquidity analysis. Some venues (many DEXs) provide no order book.',
      inputSchema: z.object({
        market: z.string().optional(),
        pair: z.string().optional(),
        depth: z.number().int().min(1).max(50).optional().default(15),
      }),
      execute: async (args) => {
        const target = resolveTarget(deps, { ...args, timeframe: undefined })
        const snap = await fetchOrderbookSnapshot(
          deps,
          target.market,
          target.pair,
        )
        if (!snap || (!snap.bids.length && !snap.asks.length)) {
          return {
            target,
            available: false,
            message: 'No order book is available for this market.',
          }
        }
        const depth = args.depth ?? 15
        const bids = snap.bids.slice(0, depth)
        const asks = snap.asks.slice(0, depth)
        const bestBid = bids[0]?.[0] ?? null
        const bestAsk = asks[0]?.[0] ?? null
        const bidVol = bids.reduce((s, [, v]) => s + v, 0)
        const askVol = asks.reduce((s, [, v]) => s + v, 0)
        const totalVol = bidVol + askVol
        return {
          target,
          available: true,
          bestBid,
          bestAsk,
          spread: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
          spreadPct:
            bestBid != null && bestAsk != null && bestBid > 0
              ? ((bestAsk - bestBid) / bestBid) * 100
              : null,
          bidVolume: bidVol,
          askVolume: askVol,
          imbalance: totalVol > 0 ? (bidVol - askVol) / totalVol : 0,
          bids,
          asks,
        }
      },
    }),

    get_multi_timeframe: tool({
      description:
        'Analyze a pair across several timeframes at once to gauge confluence. Returns trend, regime and signal per timeframe.',
      inputSchema: z.object({
        market: z.string().optional(),
        pair: z.string().optional(),
        timeframes: z
          .array(timeframeSchema)
          .min(1)
          .max(6)
          .optional()
          .describe('Defaults to 15m, 1h, 4h, 1d'),
      }),
      execute: async (args) => {
        const base = resolveTarget(deps, args)
        const tfs = args.timeframes ?? ['15m', '1h', '4h', '1d']
        const results = await Promise.all(
          tfs.map(async (tf) => {
            try {
              const candles = await loadCandles(
                deps,
                { ...base, timeframe: tf },
                300,
              )
              const summary = summarizeCandles(candles)
              const { regime, signal } = computeSignal(candles)
              return {
                timeframe: tf,
                trend: summary.shortTermTrend,
                latestPrice: summary.latestPrice,
                regime,
                signal,
              }
            } catch (err) {
              return {
                timeframe: tf,
                error: err instanceof Error ? err.message : String(err),
              }
            }
          }),
        )
        return { market: base.market, pair: base.pair, timeframes: results }
      },
    }),

    compare_pairs: tool({
      description:
        'Compare multiple pairs on one timeframe — percentage change over a lookback window and trend — to rank relative strength.',
      inputSchema: z.object({
        market: z.string().optional(),
        pairs: z
          .array(z.string())
          .min(2)
          .max(8)
          .describe(
            'Pairs to compare, e.g. ["BTC-USDT","ETH-USDT","SOL-USDT"]',
          ),
        timeframe: timeframeSchema.optional(),
        lookback: z
          .number()
          .int()
          .min(2)
          .max(500)
          .optional()
          .default(24)
          .describe('Number of candles to measure change over'),
      }),
      execute: async (args) => {
        const base = resolveTarget(deps, { market: args.market })
        const tf = args.timeframe ?? base.timeframe
        const lookback = args.lookback ?? 24
        const rows = await Promise.all(
          args.pairs.map(async (rawPair) => {
            try {
              const target = resolveTarget(deps, {
                market: args.market,
                pair: rawPair,
                timeframe: tf,
              })
              const candles = await loadCandles(deps, target, lookback + 5)
              const newest = toNewestFirst(candles)
              if (newest.length < 2)
                return { pair: target.pair, error: 'insufficient data' }
              const last = newest[0].close
              const past = newest[Math.min(lookback, newest.length - 1)].close
              const summary = summarizeCandles(candles)
              return {
                pair: target.pair,
                lastPrice: last,
                changePct: past ? ((last - past) / past) * 100 : 0,
                trend: summary.shortTermTrend,
                atr14Pct: summary.volatility?.atr14Pct ?? null,
              }
            } catch (err) {
              return {
                pair: rawPair,
                error: err instanceof Error ? err.message : String(err),
              }
            }
          }),
        )
        const pctOf = (r: { changePct?: number }): number =>
          typeof r.changePct === 'number' ? r.changePct : -Infinity
        const ranked = [...rows].sort((a, b) => pctOf(b) - pctOf(a))
        return { market: base.market, timeframe: tf, lookback, ranked }
      },
    }),

    list_markets: tool({
      description:
        'List the exchanges/markets currently available in this session, with their asset classes, supported timeframes and capabilities (read/trade/orderbook).',
      inputSchema: z.object({}),
      execute: async () => {
        const md = deps.getMarketData()
        if (!md) return { markets: [], message: NO_PROVIDER }
        return {
          markets: md.availableMarkets.map((m) => ({
            market: m.marketId,
            name: m.displayName ?? m.marketId,
            assetClasses: m.assetClasses ?? [],
            timeframes: md.getTimeframes(m.marketId),
            capabilities: md.getCapabilities(m.marketId),
          })),
        }
      },
    }),

    search_instruments: tool({
      description:
        'Search for tradeable instruments/pairs by name or symbol across the active venues (finds long-tail tokens and new listings).',
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe('Symbol or name fragment, e.g. "sol"'),
        market: z.string().optional(),
      }),
      execute: async (args) => {
        const market = (
          args.market ??
          deps.getContextInfo().market ??
          ''
        ).toLowerCase()
        try {
          deps.pluginManager.setContext({ market: market || undefined })
          let page: unknown
          try {
            page = await deps.pluginManager.execute(
              'market-data:discovery:search' as never,
              { query: args.query },
            )
          } catch {
            page = await deps.pluginManager.execute(
              'market-data:discovery' as never,
              { q: args.query, limit: 25 },
            )
          }
          const items =
            (page as { items?: Array<Record<string, unknown>> })?.items ?? []
          return {
            query: args.query,
            count: items.length,
            instruments: items.slice(0, 25),
          }
        } catch (err) {
          return {
            query: args.query,
            instruments: [],
            error:
              err instanceof Error
                ? err.message
                : 'Instrument discovery is not available.',
          }
        }
      },
    }),
  }
}
