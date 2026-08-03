// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * HTX Public WebSocket client — real-time market data.
 *
 * Connects to wss://api.huobi.pro/ws (GZIP compressed binary frames).
 * Connection plumbing (reconnect backoff, grace-period disconnect,
 * refcounted subscriptions, resubscribe-on-open) lives in
 * ReconnectingWsSession; this client owns the HTX wire format only.
 *
 * Key HTX WS behaviors:
 * - ALL messages are GZIP compressed — must decompress before parsing
 * - Ping: server sends {"ping": N}, client must respond {"pong": N}
 *   (no client-initiated ping timer needed)
 * - Subscribe: {"sub": "market.$symbol.kline.$period", "id": "..."}
 * - Push format: {"ch": "market.$symbol.kline.$period", "ts": N, "tick": {...}}
 * - Kline periods: 1min, 5min, 15min, 30min, 60min, 4hour, 1day, 1week
 * - Depth uses step0 (full snapshots, trimmed to 20 levels for UI)
 * - Logical ticker merges TWO wire channels — "detail" (24h stats) + "bbo"
 *   (bid/ask) — into one session entry whose state carries the merged fields
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import {
  fromHtxPeriod,
  fromHtxSymbol,
  parseHtxCandle,
  parseHtxTicker,
  parseHtxTrade,
  toHtxPeriod,
  toHtxSymbol,
} from './parser'
import { fetchHtxCandles } from './rest-client'
import { resolveHtxUrls } from './regions'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
  TradesCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsMessage } from '@pairlens/market-engine/ws-adapter'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

type CandleSub = {
  pair: string
  htxSymbol: string
  timeframe: string
  htxPeriod: string
  buffer: CandleBuffer
}

type TradeSub = { pair: string; htxSymbol: string }

type TickerSub = {
  pair: string
  htxSymbol: string
  // Merged state from bbo + detail channels
  lastBid: number
  lastAsk: number
  lastPrice: number
  high24h: number
  low24h: number
  volume24h: number
  open24h: number
}

type BookSub = {
  pair: string
  htxSymbol: string
}

// ── GZIP decompression ──

async function gunzip(data: ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(new Uint8Array(data))
  writer.close()
  return new Response(ds.readable).text()
}

export class HtxWsClient {
  private session: ReconnectingWsSession
  private backfillRetryDelayMs?: number

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      url: () => resolveHtxUrls().wsPublicUrl,
      onMessage: (data) => this.handleRawMessage(data),
      // No ping option — HTX pings from the server side; we echo the pong.
      // Those server pings are a guaranteed inbound heartbeat (~5s), so total
      // silence for a minute means the socket is dead, not the market quiet.
      livenessTimeoutMs: 60_000,
      ...sessionOverrides,
    })
  }

  // ── Public subscribe methods ──

  subscribeCandles(
    pair: string,
    timeframe: string,
    _country: string,
    cb: CandleCallback,
  ): () => void {
    const htxSymbol = toHtxSymbol(pair)
    const htxPeriod = toHtxPeriod(timeframe)
    if (!htxPeriod) throw new Error(`Unsupported timeframe: ${timeframe}`)

    const key = `candle:${pair}:${timeframe}`

    const existing = this.session.getState<CandleSub>(key)
    if (existing) {
      // Shared stream: join the live subscription and replay the buffered
      // history so the late subscriber still gets its snapshot.
      const release = this.session.acquire(
        key,
        this.candleSpec(existing),
        cb as (data: unknown) => void,
      )
      const candles = existing.buffer.snapshot()
      if (candles.length > 0) cb({ type: 'snapshot', candles })
      return release
    }

    const sub: CandleSub = {
      pair,
      htxSymbol,
      timeframe,
      htxPeriod,
      buffer: new CandleBuffer(),
    }
    const release = this.session.acquire(
      key,
      this.candleSpec(sub),
      cb as (data: unknown) => void,
    )

    // REST backfill
    backfillCandles({
      fetch: () => fetchHtxCandles(pair, timeframe, 300),
      isLive: () => this.session.getState(key) !== undefined,
      apply: (candles) => {
        sub.buffer.load(candles)
        this.session.emit(key, {
          type: 'snapshot',
          candles: sub.buffer.snapshot(),
        })
      },
      retryDelayMs: this.backfillRetryDelayMs,
    })

    return release
  }

  subscribeTicker(
    pair: string,
    _country: string,
    cb: TickerCallback,
  ): () => void {
    const htxSymbol = toHtxSymbol(pair)
    const key = `ticker:${pair}`
    // One logical ticker = TWO wire channels (detail + bbo); the merged
    // fields live in the shared entry state.
    const sub = this.session.getState<TickerSub>(key) ?? {
      pair,
      htxSymbol,
      lastBid: 0,
      lastAsk: 0,
      lastPrice: 0,
      high24h: 0,
      low24h: 0,
      volume24h: 0,
      open24h: 0,
    }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) => {
          this.sendSub(`market.${s.htxSymbol}.detail`)
          this.sendSub(`market.${s.htxSymbol}.bbo`)
        },
        unsubscribe: (s) => {
          this.sendUnsub(`market.${s.htxSymbol}.detail`)
          this.sendUnsub(`market.${s.htxSymbol}.bbo`)
        },
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeOrderbook(
    pair: string,
    _country: string,
    cb: OrderbookCallback,
  ): () => void {
    const htxSymbol = toHtxSymbol(pair)
    const key = `book:${pair}`
    const sub = this.session.getState<BookSub>(key) ?? { pair, htxSymbol }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) => this.sendSub(`market.${s.htxSymbol}.depth.step0`),
        unsubscribe: (s) => this.sendUnsub(`market.${s.htxSymbol}.depth.step0`),
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeTrades(
    pair: string,
    _country: string,
    cb: TradesCallback,
  ): () => void {
    const htxSymbol = toHtxSymbol(pair)
    const key = `trades:${pair}`
    return this.session.acquire(
      key,
      {
        state: { pair, htxSymbol } satisfies TradeSub,
        subscribe: (s: TradeSub) =>
          this.sendSub(`market.${s.htxSymbol}.trade.detail`),
        unsubscribe: (s: TradeSub) =>
          this.sendUnsub(`market.${s.htxSymbol}.trade.detail`),
      },
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    this.session.destroy()
  }

  // ── Wire helpers ──

  private candleSpec(sub: CandleSub) {
    return {
      state: sub,
      subscribe: (s: CandleSub) =>
        this.sendSub(`market.${s.htxSymbol}.kline.${s.htxPeriod}`),
      unsubscribe: (s: CandleSub) =>
        this.sendUnsub(`market.${s.htxSymbol}.kline.${s.htxPeriod}`),
    }
  }

  private sendSub(topic: string): void {
    this.session.send(JSON.stringify({ sub: topic, id: topic }))
  }

  private sendUnsub(topic: string): void {
    this.session.send(JSON.stringify({ unsub: topic, id: topic }))
  }

  // ── Message handling (GZIP decompression) ──

  private handleRawMessage(data: WsMessage): void {
    if (data instanceof ArrayBuffer) {
      // GZIP compressed binary — decompress asynchronously
      gunzip(data)
        .then((text) => this.processMessage(text))
        .catch(() => {})
    } else {
      // Fallback for text frames (shouldn't happen for HTX /ws)
      this.processMessage(data)
    }
  }

  private processMessage(text: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Handle server ping — must respond with pong using same value
    if ('ping' in msg) {
      this.session.send(JSON.stringify({ pong: msg['ping'] }))
      return
    }

    // Subscription ack
    if ('subbed' in msg || 'unsubbed' in msg) return

    const ch = msg['ch'] as string | undefined
    const tick = msg['tick'] as Record<string, unknown> | undefined
    if (!ch || !tick) return

    if (ch.includes('.kline.')) {
      this.handleKline(ch, tick)
    } else if (ch.includes('.trade.detail')) {
      // MUST precede the '.detail' branch below: the trade channel is
      // `market.{sym}.trade.detail`, so a plain '.detail' test swallows it
      // and the tape silently receives nothing.
      this.handleTrades(ch, tick)
    } else if (ch.includes('.depth.')) {
      this.handleDepth(ch, tick)
    } else if (ch.includes('.detail')) {
      this.handleDetail(ch, tick)
    } else if (ch.includes('.bbo')) {
      this.handleBbo(ch, tick)
    }
  }

  private handleTrades(ch: string, tick: Record<string, unknown>): void {
    // ch = "market.btcusdt.trade.detail"
    const htxSymbol = ch.split('.')[1] ?? ''
    const pair = fromHtxSymbol(htxSymbol)
    const rows = tick['data'] as Array<Record<string, unknown>> | undefined
    if (!pair || !rows?.length) return

    const trades = []
    for (const row of rows) {
      const trade = parseHtxTrade(row)
      if (trade) trades.push(trade)
    }
    if (trades.length === 0) return
    this.session.emit(`trades:${pair}`, { type: 'update', trades })
  }

  private handleKline(ch: string, tick: Record<string, unknown>): void {
    // ch = "market.btcusdt.kline.1min"
    const parts = ch.split('.')
    if (parts.length < 4) return
    const htxSymbol = parts[1]
    const htxPeriod = parts[3]

    const timeframe = fromHtxPeriod(htxPeriod)
    if (!timeframe) return

    const key = `candle:${fromHtxSymbol(htxSymbol)}:${timeframe}`
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    const candle = parseHtxCandle(
      tick as {
        id: number
        open: number
        high: number
        low: number
        close: number
        amount: number
      },
    )

    sub.buffer.push(candle)
    this.session.emit(key, { type: 'update', candles: [candle] })
  }

  private handleDepth(ch: string, tick: Record<string, unknown>): void {
    // ch = "market.btcusdt.depth.step0"
    const parts = ch.split('.')
    if (parts.length < 3) return
    const htxSymbol = parts[1]

    const key = `book:${fromHtxSymbol(htxSymbol)}`
    if (!this.session.getState(key)) return

    const rawBids = (tick['bids'] ?? []) as Array<[number, number]>
    const rawAsks = (tick['asks'] ?? []) as Array<[number, number]>

    // step0 returns 150 levels; trim to 20 for UI
    const bids: Array<[number, number]> = rawBids
      .slice(0, 20)
      .map(([p, s]) => [p, s])
    const asks: Array<[number, number]> = rawAsks
      .slice(0, 20)
      .map(([p, s]) => [p, s])

    // HTX depth is already sorted (bids desc, asks asc)
    this.session.emit(key, { type: 'snapshot', bids, asks, ts: Date.now() })
  }

  private handleDetail(ch: string, tick: Record<string, unknown>): void {
    // ch = "market.btcusdt.detail"
    const parts = ch.split('.')
    if (parts.length < 3) return
    const htxSymbol = parts[1]

    const key = `ticker:${fromHtxSymbol(htxSymbol)}`
    const sub = this.session.getState<TickerSub>(key)
    if (!sub) return

    sub.lastPrice = (tick['close'] as number) ?? sub.lastPrice
    sub.high24h = (tick['high'] as number) ?? sub.high24h
    sub.low24h = (tick['low'] as number) ?? sub.low24h
    sub.volume24h = (tick['amount'] as number) ?? sub.volume24h
    sub.open24h = (tick['open'] as number) ?? sub.open24h
    this.emitTicker(key, sub)
  }

  private handleBbo(ch: string, tick: Record<string, unknown>): void {
    // ch = "market.btcusdt.bbo"
    const parts = ch.split('.')
    if (parts.length < 3) return
    const htxSymbol = parts[1]

    const key = `ticker:${fromHtxSymbol(htxSymbol)}`
    const sub = this.session.getState<TickerSub>(key)
    if (!sub) return

    sub.lastBid = (tick['bid'] as number) ?? sub.lastBid
    sub.lastAsk = (tick['ask'] as number) ?? sub.lastAsk
    this.emitTicker(key, sub)
  }

  private emitTicker(key: string, sub: TickerSub): void {
    this.session.emit(key, {
      type: 'ticker',
      ticker: parseHtxTicker(
        {
          open: sub.open24h,
          close: sub.lastPrice,
          high: sub.high24h,
          low: sub.low24h,
          amount: sub.volume24h,
        },
        { bid: sub.lastBid, ask: sub.lastAsk },
      ),
    })
  }
}
