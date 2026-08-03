// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Gate.io WebSocket Client — real-time market data via standard JSON WS.
 *
 * Gate.io public WS requires no token — just connect and subscribe.
 * All messages are JSON text (no binary).
 *
 * Connection plumbing (reconnect backoff, ping, grace-period disconnect,
 * refcounted subscriptions, resubscribe-on-open) lives in
 * ReconnectingWsSession; this client owns the Gate.io wire format only.
 *
 * Subscribe format: { time, channel, event: "subscribe", payload: [...] }
 * Ping: { time, channel: "spot.ping" } every 15s
 *
 * Gate.io ticker includes full 24h stats — no REST supplement needed.
 * Orderbook is snapshot-only (spot.order_book, 50 levels @ 1000ms) — no
 * local book state needed beyond routing.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import { fetchGateCandles } from './rest-client'
import {
  mapGateIntervalToTimeframe,
  mapTimeframeToGateInterval,
  normalizePair,
  parseGateTicker,
  parseGateTrade,
  parseGateWsKline,
} from './parser'
import { resolveGateWsUrl } from './regions'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
  TradesCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

const PING_INTERVAL = 15_000

type CandleSub = {
  pair: string // Gate format: BTC_USDT
  timeframe: string // Pairlens format: 1h
  gateInterval: string // Gate format: 1h, 7d
  buffer: CandleBuffer
}

type TickerSub = { pair: string }

type TradeSub = { pair: string }

type BookSub = { pair: string }

export class GateWsClient {
  private session: ReconnectingWsSession
  private paper = false
  private backfillRetryDelayMs?: number

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      url: () => resolveGateWsUrl(this.paper),
      onMessage: (data) => this.handleMessage(data as string),
      // Gate.io uses channel-based ping
      ping: {
        intervalMs: PING_INTERVAL,
        frame: () =>
          JSON.stringify({
            time: Math.floor(Date.now() / 1000),
            channel: 'spot.ping',
          }),
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
    const normalized = normalizePair(pair)
    const gateInterval = mapTimeframeToGateInterval(timeframe)
    if (!gateInterval) throw new Error(`Unsupported timeframe: ${timeframe}`)

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
      gateInterval,
      buffer: new CandleBuffer(),
    }
    const release = this.session.acquire(
      key,
      this.candleSpec(sub),
      cb as (data: unknown) => void,
    )

    // REST backfill historical candles; WS delivers live updates
    backfillCandles({
      fetch: () => fetchGateCandles(pair, timeframe, 300, country, this.paper),
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
        this.sendSubscribe('spot.candlesticks', [s.gateInterval, s.pair]),
      unsubscribe: (s: CandleSub) =>
        this.sendUnsubscribe('spot.candlesticks', [s.gateInterval, s.pair]),
    }
  }

  // ── Ticker subscriptions ──

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
        subscribe: (s: TickerSub) =>
          this.sendSubscribe('spot.tickers', [s.pair]),
        unsubscribe: (s: TickerSub) =>
          this.sendUnsubscribe('spot.tickers', [s.pair]),
      },
      cb as (data: unknown) => void,
    )
  }

  // ── Orderbook subscriptions ──

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
        subscribe: (s: BookSub) =>
          this.sendSubscribe('spot.order_book', [s.pair, '50', '1000ms']),
        unsubscribe: (s: BookSub) =>
          this.sendUnsubscribe('spot.order_book', [s.pair, '50', '1000ms']),
      },
      cb as (data: unknown) => void,
    )
  }

  subscribeTrades(
    pair: string,
    _country: string,
    cb: TradesCallback,
  ): () => void {
    const normalized = normalizePair(pair)
    return this.session.acquire(
      `trades:${normalized}`,
      {
        state: { pair: normalized } satisfies TradeSub,
        subscribe: (s: TradeSub) => this.sendSubscribe('spot.trades', [s.pair]),
        unsubscribe: (s: TradeSub) =>
          this.sendUnsubscribe('spot.trades', [s.pair]),
      },
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    this.session.destroy()
  }

  // ── Wire helpers ──

  private sendSubscribe(channel: string, payload: Array<string>): void {
    this.session.send(
      JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel,
        event: 'subscribe',
        payload,
      }),
    )
  }

  private sendUnsubscribe(channel: string, payload: Array<string>): void {
    this.session.send(
      JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel,
        event: 'unsubscribe',
        payload,
      }),
    )
  }

  // ── Message handling ──

  private handleMessage(text: string): void {
    let msg: {
      time?: number
      channel?: string
      event?: string
      result?: Record<string, unknown>
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Pong — keep-alive response
    if (msg.channel === 'spot.pong') return

    // Subscription ack
    if (msg.event === 'subscribe' || msg.event === 'unsubscribe') return

    // Data updates
    if (msg.event === 'update' && msg.channel && msg.result) {
      if (msg.channel === 'spot.candlesticks') {
        this.handleKline(msg.result)
      } else if (msg.channel === 'spot.tickers') {
        this.handleTicker(msg.result)
      } else if (msg.channel === 'spot.order_book') {
        this.handleOrderbook(msg.result)
      } else if (msg.channel === 'spot.trades') {
        this.handleTrade(msg.result)
      }
    }
  }

  private handleTrade(data: Record<string, unknown>): void {
    const pair = String(data['currency_pair'] ?? '')
    const trade = parseGateTrade(data)
    if (!pair || !trade) return
    this.session.emit(`trades:${pair}`, { type: 'update', trades: [trade] })
  }

  private handleKline(data: Record<string, unknown>): void {
    const parsed = parseGateWsKline(data)
    if (!parsed) return

    const [candle] = parsed

    // Extract pair and interval from the `n` field: "1h_BTC_USDT"
    const name = String(data['n'] ?? '')
    const underscoreIdx = name.indexOf('_')
    if (underscoreIdx < 0) return

    const interval = name.slice(0, underscoreIdx)
    const pair = name.slice(underscoreIdx + 1)

    const timeframe = mapGateIntervalToTimeframe(interval)
    if (!timeframe) return

    const key = `candle:${pair}:${timeframe}`
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    sub.buffer.push(candle)
    this.session.emit(key, { type: 'update', candles: [candle] })
  }

  private handleTicker(data: Record<string, unknown>): void {
    const pair = String(data['currency_pair'] ?? '')
    if (!pair) return

    const key = `ticker:${pair}`
    if (!this.session.getState(key)) return

    // Gate.io ticker includes full 24h stats
    this.session.emit(key, { type: 'ticker', ticker: parseGateTicker(data) })
  }

  private handleOrderbook(data: Record<string, unknown>): void {
    const pair = String(data['s'] ?? '')
    if (!pair) return

    const key = `book:${pair}`
    if (!this.session.getState(key)) return

    const rawBids = data['bids'] as Array<[string, string]> | undefined
    const rawAsks = data['asks'] as Array<[string, string]> | undefined
    const timestamp = Number(data['t'] ?? Date.now())

    const bids: Array<[number, number]> = (rawBids ?? []).map(([p, s]) => [
      Number(p),
      Number(s),
    ])
    const asks: Array<[number, number]> = (rawAsks ?? []).map(([p, s]) => [
      Number(p),
      Number(s),
    ])

    bids.sort((a, b) => b[0] - a[0])
    asks.sort((a, b) => a[0] - b[0])

    this.session.emit(key, { type: 'snapshot', bids, asks, ts: timestamp })
  }
}
