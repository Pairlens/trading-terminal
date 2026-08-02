// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crypto.com Public WebSocket client — real-time market data.
 *
 * Connects to wss://stream.crypto.com/exchange/v1/market (plain JSON).
 * Connection plumbing (reconnect backoff, grace-period disconnect,
 * refcounted subscriptions, resubscribe-on-open) lives in
 * ReconnectingWsSession; this client owns the Crypto.com wire format only.
 *
 * Key Crypto.com WS behaviors:
 * - Heartbeat: server sends {"method":"public/heartbeat","id":N} every 30s,
 *   client must respond {"method":"public/respond-heartbeat","id":N} within 5s
 * - Subscribe: {"id":N,"method":"subscribe","params":{"channels":["ticker.BTC_USDT"]},"nonce":N}
 * - Push: {"id":-1,"method":"subscribe","result":{"channel":"ticker.BTC_USDT","data":[...]}}
 * - Candle channel: candlestick.{timeframe}.{instrument}
 * - Ticker channel: ticker.{instrument}
 * - Book channel: book.{instrument}.{depth}
 * - Rate limit: Crypto.com recommends waiting 1s after connecting before
 *   subscribing — see sendSubAfterConnectDelay.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import {
  fromCryptocomSymbol,
  fromCryptocomTimeframe,
  parseCryptocomCandle,
  parseCryptocomTicker,
  toCryptocomSymbol,
  toCryptocomTimeframe,
} from './parser'
import { fetchCryptocomCandles } from './rest-client'
import { resolveCryptocomUrls } from './regions'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

// Crypto.com recommends a 1s sleep after connecting before subscribing.
const POST_CONNECT_DELAY_MS = 1_000

type CandleSub = {
  pair: string
  instrument: string
  timeframe: string
  ccTimeframe: string
  buffer: CandleBuffer
}

type TickerSub = { pair: string; instrument: string }
type BookSub = { pair: string; instrument: string }

let msgId = 1

export class CryptocomWsClient {
  private session: ReconnectingWsSession
  private backfillRetryDelayMs?: number
  // Timestamp of the last socket open — sends within POST_CONNECT_DELAY_MS
  // of this are deferred (Crypto.com rate-limit guidance).
  private openedAt = 0

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      // Single global endpoint — no country routing (paper flag only).
      url: () => resolveCryptocomUrls(false).wsMarketUrl,
      onMessage: (data) => this.handleMessage(data as string),
      onOpen: () => {
        this.openedAt = Date.now()
      },
      // No ping frame — the server's public/heartbeat (every 30s) is the
      // guaranteed inbound signal, so silence past two of them is a dead
      // socket rather than a quiet market.
      livenessTimeoutMs: 75_000,
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
    const instrument = toCryptocomSymbol(pair)
    const ccTimeframe = toCryptocomTimeframe(timeframe)
    if (!ccTimeframe) throw new Error(`Unsupported timeframe: ${timeframe}`)

    const key = `candle:${pair}:${timeframe}`

    const existing = this.session.getState<CandleSub>(key)
    if (existing) {
      // Shared stream: join the live subscription and replay the buffered
      // history so the late subscriber still gets its snapshot.
      const release = this.session.acquire(
        key,
        this.candleSpec(key, existing),
        cb as (data: unknown) => void,
      )
      const candles = existing.buffer.snapshot()
      if (candles.length > 0) cb({ type: 'snapshot', candles })
      return release
    }

    const sub: CandleSub = {
      pair,
      instrument,
      timeframe,
      ccTimeframe,
      buffer: new CandleBuffer(),
    }
    const release = this.session.acquire(
      key,
      this.candleSpec(key, sub),
      cb as (data: unknown) => void,
    )

    // REST backfill
    backfillCandles({
      fetch: () => fetchCryptocomCandles(pair, timeframe, 300),
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
    const instrument = toCryptocomSymbol(pair)
    const key = `ticker:${pair}`
    return this.session.acquire(
      key,
      {
        state: { pair, instrument } satisfies TickerSub,
        subscribe: (s: TickerSub) =>
          this.sendSubAfterConnectDelay(key, [`ticker.${s.instrument}`]),
        unsubscribe: (s: TickerSub) =>
          this.sendUnsub([`ticker.${s.instrument}`]),
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeOrderbook(
    pair: string,
    _country: string,
    cb: OrderbookCallback,
  ): () => void {
    const instrument = toCryptocomSymbol(pair)
    const key = `book:${pair}`
    return this.session.acquire(
      key,
      {
        state: { pair, instrument } satisfies BookSub,
        subscribe: (s: BookSub) =>
          this.sendSubAfterConnectDelay(key, [`book.${s.instrument}.10`]),
        unsubscribe: (s: BookSub) =>
          this.sendUnsub([`book.${s.instrument}.10`]),
        // Snapshot channel (book.{instrument}.10 pushes full depth each
        // frame) — nothing to reset on reconnect.
      },
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    this.session.destroy()
  }

  // ── Wire helpers ──

  private candleSpec(key: string, sub: CandleSub) {
    return {
      state: sub,
      subscribe: (s: CandleSub) =>
        this.sendSubAfterConnectDelay(key, [
          `candlestick.${s.ccTimeframe}.${s.instrument}`,
        ]),
      unsubscribe: (s: CandleSub) =>
        this.sendUnsub([`candlestick.${s.ccTimeframe}.${s.instrument}`]),
    }
  }

  /**
   * Send a subscribe frame, deferred while inside the post-connect window.
   *
   * Crypto.com's docs recommend waiting 1s after connecting before
   * subscribing (rate-limit guidance) — the original client slept 1s before
   * resubscribing on (re)connect. The session calls spec.subscribe
   * synchronously on every (re)open, so a send within 1s of the open is
   * deferred with setTimeout instead; the guard re-checks that the key is
   * still held when the timer fires (released during the wait → no frame).
   * The frame (id/nonce) is built at actual send time, as the original did.
   */
  private sendSubAfterConnectDelay(key: string, channels: Array<string>): void {
    const wait = this.openedAt + POST_CONNECT_DELAY_MS - Date.now()
    if (this.session.isOpen && wait > 0) {
      setTimeout(() => {
        if (!this.session.getState(key)) return
        this.sendSub(channels)
      }, wait)
      return
    }
    this.sendSub(channels)
  }

  private sendSub(channels: Array<string>): void {
    this.session.send(
      JSON.stringify({
        id: msgId++,
        method: 'subscribe',
        params: { channels },
        nonce: Date.now(),
      }),
    )
  }

  private sendUnsub(channels: Array<string>): void {
    this.session.send(
      JSON.stringify({
        id: msgId++,
        method: 'unsubscribe',
        params: { channels },
        nonce: Date.now(),
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

    const method = msg['method'] as string | undefined

    // Handle heartbeat — must respond within 5 seconds (never deferred)
    if (method === 'public/heartbeat') {
      this.session.send(
        JSON.stringify({
          id: msg['id'],
          method: 'public/respond-heartbeat',
        }),
      )
      return
    }

    // Subscription ack or error
    if (msg['code'] !== undefined && msg['code'] !== 0) return

    // Push data from subscriptions
    const result = msg['result'] as Record<string, unknown> | undefined
    if (!result) return

    // Crypto.com uses "channel" for the type (e.g. "ticker") and
    // "subscription" for the full channel path (e.g. "ticker.BTC_USDT").
    const subscription = (result['subscription'] as string | undefined) ?? ''
    const data = result['data'] as Array<unknown> | undefined
    if (!subscription || !data) return

    if (subscription.startsWith('candlestick.')) {
      this.handleCandle(subscription, data)
    } else if (subscription.startsWith('ticker.')) {
      this.handleTicker(subscription, data)
    } else if (subscription.startsWith('book.')) {
      this.handleBook(subscription, result)
    }
  }

  private handleCandle(subscription: string, data: Array<unknown>): void {
    // subscription = "candlestick.1h.BTC_USDT"
    const parts = subscription.split('.')
    if (parts.length < 3) return
    const ccTimeframe = parts[1]
    const instrument = parts.slice(2).join('.')

    const timeframe = fromCryptocomTimeframe(ccTimeframe)
    if (!timeframe) return

    const key = `candle:${fromCryptocomSymbol(instrument)}:${timeframe}`
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    for (const raw of data) {
      const tick = raw as {
        t: number
        o: number | string
        h: number | string
        l: number | string
        c: number | string
        v: number | string
      }
      const candle = parseCryptocomCandle(tick)

      sub.buffer.push(candle)
      this.session.emit(key, { type: 'update', candles: [candle] })
    }
  }

  private handleTicker(subscription: string, data: Array<unknown>): void {
    // subscription = "ticker.BTC_USDT"
    const instrument = subscription.slice('ticker.'.length)
    const key = `ticker:${fromCryptocomSymbol(instrument)}`
    if (!this.session.getState(key)) return

    for (const raw of data) {
      const tick = raw as {
        a: number | string
        b: number | string
        k: number | string
        h: number | string
        l: number | string
        v: number | string
        vv?: number | string
        c: number | string
        t: number
      }
      this.session.emit(key, {
        type: 'ticker',
        ticker: parseCryptocomTicker(tick),
      })
    }
  }

  private handleBook(
    subscription: string,
    result: Record<string, unknown>,
  ): void {
    // subscription = "book.BTC_USDT.10"
    const parts = subscription.split('.')
    if (parts.length < 3) return
    const instrument = parts[1]
    const key = `book:${fromCryptocomSymbol(instrument)}`
    if (!this.session.getState(key)) return

    const data = result['data'] as
      | Array<{
          bids: Array<[string, string, string]>
          asks: Array<[string, string, string]>
          t: number
        }>
      | undefined
    if (!data || data.length === 0) return

    const snap = data[0]
    const bids: Array<[number, number]> = snap.bids.map(([p, s]) => [
      Number(p),
      Number(s),
    ])
    const asks: Array<[number, number]> = snap.asks.map(([p, s]) => [
      Number(p),
      Number(s),
    ])

    this.session.emit(key, {
      type: 'snapshot',
      bids,
      asks,
      ts: snap.t ?? Date.now(),
    })
  }
}
