// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kraken Public WebSocket client — real-time market data via WS v2.
 *
 * Connects to wss://ws.kraken.com/v2 (no auth for public channels).
 * Connection plumbing (reconnect backoff, ping, grace-period disconnect,
 * refcounted subscriptions, resubscribe-on-open) lives in
 * ReconnectingWsSession; this client owns the Kraken wire format only.
 *
 * Key Kraken WS v2 behaviors:
 * - Ping: JSON { method: "ping" }, response { method: "pong" }
 * - Subscribe: { method: "subscribe", params: { channel, symbol: [...], ... } }
 * - Push format: { channel, type: "snapshot"|"update", data: [...] }
 * - OHLC intervals: 1, 5, 15, 30, 60, 240, 1440, 10080 (minutes)
 * - Book depths: 10, 25, 100, 500, 1000
 * - Book updates: qty=0 means remove price level (incremental)
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import {
  fromInterval,
  fromWsPair,
  parseWsCandle,
  parseWsTicker,
  toInterval,
  toWsPair,
} from './parser'
import { fetchKrakenCandles } from './rest-client'
import { resolveKrakenUrls } from './regions'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

const PING_INTERVAL = 20_000
// Must match the `depth` requested on the book subscription. Kraken streams
// deltas only within this window and does not explicitly delete a level that
// falls out of it, so the local book must be trimmed to this depth each update.
const BOOK_DEPTH = 25

type CandleSub = {
  pair: string // Pairlens: BTC-USDT
  wsPair: string // Kraken WS: BTC/USDT
  timeframe: string // Pairlens: 1h
  interval: number // Kraken: 60
  buffer: CandleBuffer
}

type TickerSub = { pair: string; wsPair: string }
type BookSub = {
  pair: string
  wsPair: string
  bids: Map<number, number>
  asks: Map<number, number>
}

export class KrakenWsClient {
  private session: ReconnectingWsSession
  private backfillRetryDelayMs?: number

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      url: () => resolveKrakenUrls().wsPublicUrl,
      onMessage: (data) => this.handleMessage(data as string),
      // Kraken WS v2: application-level JSON ping
      ping: {
        intervalMs: PING_INTERVAL,
        frame: () => JSON.stringify({ method: 'ping' }),
      },
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
    const wsPair = toWsPair(pair)
    const interval = toInterval(timeframe)
    if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`)

    const key = `ohlc:${pair}:${timeframe}`

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
      wsPair,
      timeframe,
      interval,
      buffer: new CandleBuffer(),
    }
    const release = this.session.acquire(
      key,
      this.candleSpec(sub),
      cb as (data: unknown) => void,
    )

    // REST backfill for deep history. Kraken's public REST is the most
    // aggressively rate-limited of our venues (~1 req/s) and returns errors
    // inside HTTP 200 — a swallowed failure here used to strand the chart on
    // stale data forever (the hasSnapshot gate blocks live WS updates until a
    // snapshot arrives). backfillCandles retries once; the WS ohlc snapshot
    // (see candleSpec/handleOhlc) is the independent fallback seeder.
    backfillCandles({
      fetch: () => fetchKrakenCandles(pair, timeframe, 300),
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
    const wsPair = toWsPair(pair)
    const key = `ticker:${pair}`
    const sub = this.session.getState<TickerSub>(key) ?? { pair, wsPair }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) =>
          this.sendSubscribe('ticker', [s.wsPair], { snapshot: true }),
        unsubscribe: (s) => this.sendUnsubscribe('ticker', [s.wsPair]),
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeOrderbook(
    pair: string,
    _country: string,
    cb: OrderbookCallback,
  ): () => void {
    const wsPair = toWsPair(pair)
    const key = `book:${pair}`
    const sub = this.session.getState<BookSub>(key) ?? {
      pair,
      wsPair,
      bids: new Map<number, number>(),
      asks: new Map<number, number>(),
    }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s) =>
          this.sendSubscribe('book', [s.wsPair], {
            depth: BOOK_DEPTH,
            snapshot: true,
          }),
        unsubscribe: (s) => this.sendUnsubscribe('book', [s.wsPair]),
        // Reset local book on reconnect — a fresh snapshot follows
        revive: (s) => {
          s.bids.clear()
          s.asks.clear()
        },
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
      // Always request the WS snapshot. It seeds the buffer independently of
      // the REST backfill, so a rate-limited/failed REST call no longer
      // strands the chart without history (handleOhlc emits the merged
      // buffer when the snapshot lands). On reconnect it also repopulates
      // the gap, which the old needsSnapshot flag existed for.
      subscribe: (s: CandleSub) =>
        this.sendSubscribe('ohlc', [s.wsPair], {
          interval: s.interval,
          snapshot: true,
        }),
      unsubscribe: (s: CandleSub) =>
        this.sendUnsubscribe('ohlc', [s.wsPair], { interval: s.interval }),
    }
  }

  private sendSubscribe(
    channel: string,
    symbol: Array<string>,
    extra?: Record<string, unknown>,
  ): void {
    this.session.send(
      JSON.stringify({
        method: 'subscribe',
        params: { channel, symbol, ...extra },
      }),
    )
  }

  private sendUnsubscribe(
    channel: string,
    symbol: Array<string>,
    extra?: Record<string, unknown>,
  ): void {
    this.session.send(
      JSON.stringify({
        method: 'unsubscribe',
        params: { channel, symbol, ...extra },
      }),
    )
  }

  // ── Message handling ──

  private handleMessage(text: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Pong or subscription ack
    const method = msg['method'] as string | undefined
    if (method === 'pong' || method === 'subscribe' || method === 'unsubscribe')
      return

    // Heartbeat
    if (msg['channel'] === 'heartbeat') return

    const channel = msg['channel'] as string | undefined
    const type = msg['type'] as string | undefined
    const data = msg['data'] as Array<unknown> | undefined
    if (!channel || !data || data.length === 0) return

    if (channel === 'ohlc') {
      this.handleOhlc(type ?? 'update', data)
    } else if (channel === 'ticker') {
      this.handleTicker(data)
    } else if (channel === 'book') {
      this.handleBook(type ?? 'snapshot', data)
    }
  }

  private handleOhlc(type: string, data: Array<unknown>): void {
    // Keys that received WS-snapshot rows in this message — emitted once per
    // key below, as a full merged-buffer snapshot.
    const snapshotKeys = new Set<string>()

    for (const item of data) {
      const d = item as {
        symbol: string
        interval_begin: string
        interval: number
        open: number
        high: number
        low: number
        close: number
        volume: number
      }

      const tf = fromInterval(d.interval)
      if (!tf) continue

      const pairlensPair = fromWsPair(d.symbol)
      const key = `ohlc:${pairlensPair}:${tf}`
      const sub = this.session.getState<CandleSub>(key)
      if (!sub) continue

      const candle = parseWsCandle(d)

      sub.buffer.push(candle)

      if (type === 'snapshot') {
        snapshotKeys.add(key)
      } else {
        this.session.emit(key, { type: 'update', candles: [candle] })
      }
    }

    // Emit the WS snapshot as a full buffer replay. The chart gates live
    // updates behind the first snapshot, so this seeds it even when the REST
    // backfill fails (Kraken rate limit) — whichever source lands first wins,
    // and the buffer merges both.
    for (const key of snapshotKeys) {
      const sub = this.session.getState<CandleSub>(key)
      if (!sub) continue
      const candles = sub.buffer.snapshot()
      if (candles.length > 0) {
        this.session.emit(key, { type: 'snapshot', candles })
      }
    }
  }

  private handleTicker(data: Array<unknown>): void {
    for (const item of data) {
      const d = item as {
        symbol: string
        last: number
        bid: number
        ask: number
        high: number
        low: number
        volume: number
        change: number
        change_pct: number
        timestamp?: string
      }

      const pairlensPair = fromWsPair(d.symbol)
      const key = `ticker:${pairlensPair}`
      if (!this.session.getState(key)) continue

      this.session.emit(key, { type: 'ticker', ticker: parseWsTicker(d) })
    }
  }

  private handleBook(type: string, data: Array<unknown>): void {
    for (const item of data) {
      const d = item as {
        symbol: string
        bids: Array<{ price: number; qty: number }>
        asks: Array<{ price: number; qty: number }>
      }

      const pairlensPair = fromWsPair(d.symbol)
      const key = `book:${pairlensPair}`
      const sub = this.session.getState<BookSub>(key)
      if (!sub) continue

      if (type === 'snapshot') {
        // Replace entire local book
        sub.bids.clear()
        sub.asks.clear()
        for (const b of d.bids ?? []) sub.bids.set(b.price, b.qty)
        for (const a of d.asks ?? []) sub.asks.set(a.price, a.qty)
      } else {
        // Incremental update: qty=0 means remove
        for (const b of d.bids ?? []) {
          if (b.qty === 0) sub.bids.delete(b.price)
          else sub.bids.set(b.price, b.qty)
        }
        for (const a of d.asks ?? []) {
          if (a.qty === 0) sub.asks.delete(a.price)
          else sub.asks.set(a.price, a.qty)
        }
      }

      // Emit sorted arrays, trimmed to the subscribed depth. Kraken does not
      // send an explicit delete when a level falls out of the top-N (a better
      // level simply pushes it out), so without trimming the local book grows
      // unbounded with stale edge levels — the "Kraken frozen/stale book" bug.
      // Prune the backing maps too so they stay bounded.
      const bids: Array<[number, number]> = Array.from(sub.bids.entries()).sort(
        (a, b) => b[0] - a[0],
      )
      const asks: Array<[number, number]> = Array.from(sub.asks.entries()).sort(
        (a, b) => a[0] - b[0],
      )
      if (bids.length > BOOK_DEPTH) {
        for (const [price] of bids.slice(BOOK_DEPTH)) sub.bids.delete(price)
        bids.length = BOOK_DEPTH
      }
      if (asks.length > BOOK_DEPTH) {
        for (const [price] of asks.slice(BOOK_DEPTH)) sub.asks.delete(price)
        asks.length = BOOK_DEPTH
      }

      this.session.emit(key, { type: 'snapshot', bids, asks, ts: Date.now() })
    }
  }
}
