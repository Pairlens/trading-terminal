// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitget Public WebSocket client — real-time market data.
 *
 * Connects to wss://ws.bitget.com/v2/ws/public (no auth for public channels).
 * Connection plumbing (reconnect backoff, ping, grace-period disconnect,
 * refcounted subscriptions, resubscribe-on-open) lives in
 * ReconnectingWsSession; this client owns the Bitget wire format only.
 *
 * Key Bitget WS behaviors:
 * - Ping: send raw string "ping", server responds with raw "pong" (not JSON)
 * - Subscription uses { op, args: [{ instType, channel, instId }] }
 * - Candle channels: candle1m, candle5m, candle1H, candle4H, candle1D, etc.
 * - Ticker channel: "ticker"
 * - Orderbook: "books15" for 15-level snapshots every 150ms (snapshot-only)
 * - Push format: { action: "snapshot"|"update", arg, data: [...], ts }
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import {
  mapTimeframeToWsChannel,
  mapWsChannelToTimeframe,
  normalizePair,
  parseBitgetCandle,
  parseBitgetTicker,
} from './parser'
import { fetchBitgetCandles } from './rest-client'
import { resolveBitgetUrls } from './regions'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

const PING_INTERVAL = 20_000

type CandleSub = {
  pair: string // Bitget format: BTCUSDT
  timeframe: string // Pairlens format: 1h
  wsChannel: string // Bitget WS: candle1H
  buffer: CandleBuffer
}

type TickerSub = { pair: string }
type BookSub = { pair: string }

export class BitgetWsClient {
  private session: ReconnectingWsSession
  private paper = false
  private backfillRetryDelayMs?: number

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      url: () => resolveBitgetUrls(this.paper).wsPublicUrl,
      onMessage: (data) => this.handleMessage(data as string),
      // Bitget ping: raw "ping" string (server replies raw "pong")
      ping: {
        intervalMs: PING_INTERVAL,
        frame: () => 'ping',
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
    const normalized = normalizePair(pair)
    const wsChannel = mapTimeframeToWsChannel(timeframe)
    if (!wsChannel) throw new Error(`Unsupported timeframe: ${timeframe}`)

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
      wsChannel,
      buffer: new CandleBuffer(),
    }
    const release = this.session.acquire(
      key,
      this.candleSpec(sub),
      cb as (data: unknown) => void,
    )

    // REST backfill
    backfillCandles({
      fetch: () => fetchBitgetCandles(pair, timeframe, 300),
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
      subscribe: (s: CandleSub) => this.sendSubscribe(s.wsChannel, s.pair),
      unsubscribe: (s: CandleSub) => this.sendUnsubscribe(s.wsChannel, s.pair),
    }
  }

  subscribeTicker(
    pair: string,
    _country: string,
    cb: TickerCallback,
  ): () => void {
    const normalized = normalizePair(pair)
    return this.session.acquire(
      `ticker:${normalized}`,
      {
        state: { pair: normalized } satisfies TickerSub,
        subscribe: (s: TickerSub) => this.sendSubscribe('ticker', s.pair),
        unsubscribe: (s: TickerSub) => this.sendUnsubscribe('ticker', s.pair),
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeOrderbook(
    pair: string,
    _country: string,
    cb: OrderbookCallback,
  ): () => void {
    const normalized = normalizePair(pair)
    return this.session.acquire(
      `book:${normalized}`,
      {
        state: { pair: normalized } satisfies BookSub,
        subscribe: (s: BookSub) => this.sendSubscribe('books15', s.pair),
        unsubscribe: (s: BookSub) => this.sendUnsubscribe('books15', s.pair),
      },
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    this.session.destroy()
  }

  // ── Wire helpers ──

  private sendSubscribe(channel: string, instId: string): void {
    this.session.send(
      JSON.stringify({
        op: 'subscribe',
        args: [{ instType: 'SPOT', channel, instId }],
      }),
    )
  }

  private sendUnsubscribe(channel: string, instId: string): void {
    this.session.send(
      JSON.stringify({
        op: 'unsubscribe',
        args: [{ instType: 'SPOT', channel, instId }],
      }),
    )
  }

  // ── Message handling ──

  private handleMessage(text: string): void {
    // Pong response — raw string, not JSON — ignore
    if (text === 'pong') return

    let msg: {
      action?: string
      arg?: { channel?: string; instId?: string }
      data?: Array<unknown>
      event?: string
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Subscription ack
    if (msg.event === 'subscribe' || msg.event === 'unsubscribe') return

    const channel = msg.arg?.channel
    const instId = msg.arg?.instId
    const data = msg.data
    if (!channel || !data || data.length === 0) return

    if (channel.startsWith('candle')) {
      this.handleCandle(channel, instId ?? '', data as Array<Array<string>>)
    } else if (channel === 'ticker') {
      this.handleTicker(instId ?? '', data as Array<Record<string, string>>)
    } else if (channel === 'books15' || channel === 'books5') {
      this.handleOrderbook(
        instId ?? '',
        data as Array<{
          bids: Array<[string, string]>
          asks: Array<[string, string]>
        }>,
      )
    }
  }

  private handleCandle(
    wsChannel: string,
    instId: string,
    rows: Array<Array<string>>,
  ): void {
    const timeframe = mapWsChannelToTimeframe(wsChannel)
    if (!timeframe) return

    const key = `candle:${instId}:${timeframe}`
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    for (const row of rows) {
      const candle = parseBitgetCandle(row)
      if (!candle) continue

      sub.buffer.push(candle)
      this.session.emit(key, { type: 'update', candles: [candle] })
    }
  }

  private handleTicker(
    instId: string,
    tickers: Array<Record<string, string>>,
  ): void {
    const key = `ticker:${instId}`
    if (!this.session.getState(key)) return

    for (const data of tickers) {
      this.session.emit(key, {
        type: 'ticker',
        ticker: parseBitgetTicker(data),
      })
    }
  }

  private handleOrderbook(
    instId: string,
    books: Array<{
      bids: Array<[string, string]>
      asks: Array<[string, string]>
    }>,
  ): void {
    const key = `book:${instId}`
    if (!this.session.getState(key) || books.length === 0) return

    const book = books[0]
    const bids: Array<[number, number]> = (book.bids ?? []).map(([p, s]) => [
      Number(p),
      Number(s),
    ])
    const asks: Array<[number, number]> = (book.asks ?? []).map(([p, s]) => [
      Number(p),
      Number(s),
    ])

    bids.sort((a, b) => b[0] - a[0])
    asks.sort((a, b) => a[0] - b[0])

    this.session.emit(key, { type: 'snapshot', bids, asks, ts: Date.now() })
  }
}
