// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * ByBit public WebSocket client — real-time market data via the v5 spot
 * public stream.
 *
 * Connection plumbing (reconnect backoff, ping, grace-period disconnect,
 * refcounted subscriptions, resubscribe-on-open) lives in
 * ReconnectingWsSession; this client owns the ByBit wire format, the local
 * incremental orderbook, and region-change restarts.
 *
 * Key ByBit behaviors:
 * - Public streams require the CLIENT to ping periodically; the server drops
 *   the socket after ~20s without one. (It does not reliably ping first.)
 * - Regional endpoints: resolveBybitUrls(country) — null means blocked (US).
 *   The plugin-level geoCheck prevents subscriptions from blocked regions, so
 *   url() throwing is a connect failure, not a user-visible path.
 * - Orderbook is incremental: snapshot then deltas, size=0 removes a level.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import {
  buildBookTopic,
  buildKlineTopic,
  buildTickerTopic,
  mapBybitIntervalToTimeframe,
  normalizePair,
  parseBybitTicker,
  parseBybitWsKline,
  parseKlineTopic,
} from './parser'
import { fetchBybitCandles } from './rest-client'
import { resolveBybitUrls } from './regions'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

const PING_INTERVAL_MS = 20_000

type CandleSub = {
  pair: string
  timeframe: string
  buffer: CandleBuffer
}

type TickerSub = { pair: string }

/** Local orderbook state for incremental delta updates. */
type BookSub = {
  pair: string
  bids: Map<number, number> // price → size
  asks: Map<number, number>
}

export class BybitWsClient {
  private session: ReconnectingWsSession
  private country = ''
  // Country the session last connected with — a change forces a restart so
  // the regional endpoint from resolveBybitUrls takes effect.
  private connectedCountry = ''
  private backfillRetryDelayMs?: number

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      url: () => {
        this.connectedCountry = this.country
        const urls = resolveBybitUrls(this.country)
        // Blocked region (US): plugin-level geoCheck already prevents
        // subscriptions here, so surface as a failed connect.
        if (!urls) throw new Error('ByBit is not available in this region')
        return urls.wsPublic
      },
      onMessage: (data) => this.handleMessage(data as string),
      // ByBit requires client-driven pings or drops the socket after ~20s
      ping: {
        intervalMs: PING_INTERVAL_MS,
        frame: () => JSON.stringify({ op: 'ping' }),
      },
      ...sessionOverrides,
    })
  }

  // ── Candle subscriptions ──

  subscribeCandles(
    pair: string,
    timeframe: string,
    country: string,
    cb: CandleCallback,
  ): () => void {
    this.setCountry(country)
    const normalized = normalizePair(pair)
    const key = `candle:${normalized}:${timeframe}`

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
      pair: normalized,
      timeframe,
      buffer: new CandleBuffer(),
    }
    const release = this.session.acquire(
      key,
      this.candleSpec(sub),
      cb as (data: unknown) => void,
    )

    // REST backfill historical candles; WS delivers live updates
    backfillCandles({
      fetch: () => fetchBybitCandles(normalized, timeframe, 200, country),
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

  private candleSpec(sub: CandleSub) {
    return {
      state: sub,
      subscribe: (s: CandleSub) =>
        this.sendSubscribe(buildKlineTopic(s.pair, s.timeframe)),
      unsubscribe: (s: CandleSub) =>
        this.sendUnsubscribe(buildKlineTopic(s.pair, s.timeframe)),
    }
  }

  // ── Ticker subscriptions ──

  subscribeTicker(
    pair: string,
    country: string,
    cb: TickerCallback,
  ): () => void {
    this.setCountry(country)
    const normalized = normalizePair(pair)
    return this.session.acquire(
      `ticker:${normalized}`,
      {
        state: { pair: normalized } satisfies TickerSub,
        subscribe: (s: TickerSub) =>
          this.sendSubscribe(buildTickerTopic(s.pair)),
        unsubscribe: (s: TickerSub) =>
          this.sendUnsubscribe(buildTickerTopic(s.pair)),
      },
      cb as (data: unknown) => void,
    )
  }

  // ── Orderbook subscriptions ──

  subscribeOrderbook(
    pair: string,
    country: string,
    cb: OrderbookCallback,
  ): () => void {
    this.setCountry(country)
    const normalized = normalizePair(pair)
    const key = `book:${normalized}`
    const sub = this.session.getState<BookSub>(key) ?? {
      pair: normalized,
      bids: new Map<number, number>(),
      asks: new Map<number, number>(),
    }
    return this.session.acquire(
      key,
      {
        state: sub,
        subscribe: (s: BookSub) => this.sendSubscribe(buildBookTopic(s.pair)),
        unsubscribe: (s: BookSub) =>
          this.sendUnsubscribe(buildBookTopic(s.pair)),
        // Clear local state — a fresh snapshot follows the resubscribe
        revive: (s: BookSub) => {
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

  // ── Region handling ──

  private setCountry(country: string): void {
    this.country = country
    // Restart if the session connected under a different region so it picks
    // up the regional endpoint. url() re-reads this.country.
    if (this.session.isOpen && this.connectedCountry !== country) {
      this.session.restart()
    }
  }

  // ── Wire helpers ──

  private sendSubscribe(topic: string | null): void {
    if (!topic) return
    this.session.send(JSON.stringify({ op: 'subscribe', args: [topic] }))
  }

  private sendUnsubscribe(topic: string | null): void {
    if (!topic) return
    this.session.send(JSON.stringify({ op: 'unsubscribe', args: [topic] }))
  }

  // ── Message handling ──

  private handleMessage(text: string): void {
    let msg: {
      topic?: string
      type?: string
      data?: unknown
      op?: string
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Handle ByBit ping
    if (msg.op === 'ping') {
      this.session.send(JSON.stringify({ op: 'pong' }))
      return
    }

    if (!msg.topic || !msg.data) return

    const topic = msg.topic

    // Kline messages
    if (topic.startsWith('kline.')) {
      this.handleKline(topic, msg.data as Array<Record<string, unknown>>)
      return
    }

    // Ticker messages
    if (topic.startsWith('tickers.')) {
      this.handleTicker(topic, msg.data as Record<string, unknown>)
      return
    }

    // Orderbook messages
    if (topic.startsWith('orderbook.')) {
      this.handleBook(topic, msg.type, msg.data as Record<string, unknown>)
      return
    }
  }

  private handleKline(
    topic: string,
    data: Array<Record<string, unknown>>,
  ): void {
    const parsed = parseKlineTopic(topic)
    if (!parsed) return

    const [intervalStr, symbol] = parsed
    const timeframe = mapBybitIntervalToTimeframe(intervalStr)
    if (!timeframe) return

    const key = `candle:${symbol}:${timeframe}`
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    for (const entry of data) {
      const result = parseBybitWsKline(entry)
      if (!result) continue

      const [candle] = result
      sub.buffer.push(candle)
      this.session.emit(key, { type: 'update', candles: [candle] })
    }
  }

  private handleTicker(topic: string, data: Record<string, unknown>): void {
    // topic: "tickers.BTCUSDT"
    const symbol = topic.split('.')[1]
    if (!symbol) return

    const key = `ticker:${symbol}`
    if (!this.session.getState(key)) return

    this.session.emit(key, { type: 'ticker', ticker: parseBybitTicker(data) })
  }

  private handleBook(
    topic: string,
    msgType: string | undefined,
    data: Record<string, unknown>,
  ): void {
    // topic: "orderbook.50.BTCUSDT"
    const parts = topic.split('.')
    const symbol = parts[2]
    if (!symbol) return

    const key = `book:${symbol}`
    const sub = this.session.getState<BookSub>(key)
    if (!sub) return

    const bids = data['b'] as Array<[string, string]> | undefined
    const asks = data['a'] as Array<[string, string]> | undefined
    if (!bids || !asks) return

    const isSnapshot = msgType === 'snapshot'

    // Maintain local orderbook state
    if (isSnapshot) {
      sub.bids.clear()
      sub.asks.clear()
    }

    // Apply levels: size=0 means remove, otherwise upsert
    for (const [priceStr, sizeStr] of bids) {
      const price = Number(priceStr)
      const size = Number(sizeStr)
      if (size === 0) sub.bids.delete(price)
      else sub.bids.set(price, size)
    }
    for (const [priceStr, sizeStr] of asks) {
      const price = Number(priceStr)
      const size = Number(sizeStr)
      if (size === 0) sub.asks.delete(price)
      else sub.asks.set(price, size)
    }

    // Emit full book sorted: bids descending, asks ascending
    const sortedBids = Array.from(sub.bids.entries())
      .map(([price, size]) => [price, size] as [number, number])
      .sort((a, b) => b[0] - a[0])
    const sortedAsks = Array.from(sub.asks.entries())
      .map(([price, size]) => [price, size] as [number, number])
      .sort((a, b) => a[0] - b[0])

    this.session.emit(key, {
      type: 'snapshot',
      bids: sortedBids,
      asks: sortedAsks,
      ts: Number(data['u'] ?? Date.now()),
    })
  }
}
