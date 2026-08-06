// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * MEXC WebSocket Client — real-time market data via Protobuf WS.
 *
 * MEXC public WS sends binary Protobuf frames for all data pushes.
 * Subscription messages are sent as JSON text. We decode incoming binary
 * frames using our hand-written protobuf decoder (protobuf.ts).
 *
 * Connection plumbing (reconnect backoff, ping, grace-period disconnect,
 * refcounted subscriptions, resubscribe-on-open) lives in
 * ReconnectingWsSession; this client owns the MEXC wire format only.
 *
 * REST is used for initial candle backfill (WS only sends live updates).
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { latencyMonitor } from '@pairlens/market-engine/latency'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import { fetchMexcCandles } from './rest-client'
import { mapTimeframeToWsInterval, normalizePair } from './parser'
import { resolveMexcUrls } from './regions'
import { decodeMexcPush } from './protobuf'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'
import type { MexcKline, MexcLimitDepths, MexcMiniTicker } from './protobuf'

const PING_INTERVAL_MS = 20_000

// Reverse of the parser's TF_TO_WS_INTERVAL — kline pushes carry the WS
// interval name (e.g. 'Min60'), which routes the frame to its candle key.
const WS_INTERVAL_TO_TF: Record<string, string> = {
  Min1: '1m',
  Min5: '5m',
  Min15: '15m',
  Min30: '30m',
  Min60: '1h',
  Hour4: '4h',
  Day1: '1d',
  Week1: '1w',
}

type CandleSub = {
  pair: string
  timeframe: string
  buffer: CandleBuffer
  channel: string
}

type TickerSub = { pair: string; channel: string }
type BookSub = { pair: string; channel: string }

export class MexcWsClient {
  private country = ''
  private session: ReconnectingWsSession
  private backfillRetryDelayMs?: number

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      url: () => {
        const urls = resolveMexcUrls(this.country)
        // Blocked region: fail the connect — the session backs off and
        // retries; geo-restriction detection upstream surfaces the dialog.
        if (!urls) throw new Error('MEXC is not available in this region')
        return `${urls.wsBase}/ws`
      },
      onMessage: (data) => this.handleMessage(data),
      ping: {
        intervalMs: PING_INTERVAL_MS,
        frame: () => JSON.stringify({ method: 'PING' }),
      },
      onLatencySample: (rttMs) => latencyMonitor.record('mexc', rttMs),
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
    this.country = country
    const normalized = normalizePair(pair)
    const wsInterval = mapTimeframeToWsInterval(timeframe)
    const key = `candle:${normalized}:${timeframe}`
    // Unsupported timeframe → empty channel: no wire subscribe is sent, but
    // the REST backfill below still delivers a snapshot (original behavior).
    const channel = wsInterval
      ? `spot@public.kline.v3.api.pb@${normalized}@${wsInterval}`
      : ''

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
      channel,
    }
    const release = this.session.acquire(
      key,
      this.candleSpec(sub),
      cb as (data: unknown) => void,
    )

    // REST backfill historical candles, then WS for live updates
    backfillCandles({
      fetch: () => fetchMexcCandles(pair, timeframe, 300, country),
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
      subscribe: (s: CandleSub) => this.sendSubscribe(s.channel),
      unsubscribe: (s: CandleSub) => this.sendUnsubscribe(s.channel),
    }
  }

  // ── Ticker subscriptions ──

  subscribeTicker(
    pair: string,
    country: string,
    cb: TickerCallback,
  ): () => void {
    this.country = country
    const normalized = normalizePair(pair)
    const channel = `spot@public.miniTicker.v3.api.pb@${normalized}@UTC+0`
    return this.session.acquire(
      `ticker:${normalized}`,
      {
        state: { pair: normalized, channel } satisfies TickerSub,
        subscribe: (s: TickerSub) => this.sendSubscribe(s.channel),
        unsubscribe: (s: TickerSub) => this.sendUnsubscribe(s.channel),
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
    this.country = country
    const normalized = normalizePair(pair)
    const channel = `spot@public.limit.depth.v3.api.pb@${normalized}@20`
    return this.session.acquire(
      `book:${normalized}`,
      {
        state: { pair: normalized, channel } satisfies BookSub,
        subscribe: (s: BookSub) => this.sendSubscribe(s.channel),
        unsubscribe: (s: BookSub) => this.sendUnsubscribe(s.channel),
        // Snapshot-only channel (limit.depth pushes the full top-20 book
        // every frame) — nothing to reset on reconnect.
      },
      cb as (data: unknown) => void,
    )
  }

  // ── Lifecycle ──

  destroy(): void {
    this.session.destroy()
  }

  // ── Wire helpers ──

  private sendSubscribe(channel: string): void {
    if (!channel) return
    this.session.send(
      JSON.stringify({ method: 'SUBSCRIPTION', params: [channel] }),
    )
  }

  private sendUnsubscribe(channel: string): void {
    if (!channel) return
    this.session.send(
      JSON.stringify({ method: 'UNSUBSCRIPTION', params: [channel] }),
    )
  }

  // ── Message handling ──

  private handleMessage(data: string | ArrayBuffer): void {
    // JSON text messages are subscription confirmations / pong. Market data
    // never arrives as text, so a substring test is enough to spot the PING
    // reply ({"id":0,"code":0,"msg":"PONG"}) without parsing every ack.
    if (typeof data === 'string') {
      if (data.includes('PONG')) this.session.notePong()
      return
    }

    // Binary protobuf frame
    const msg = decodeMexcPush(data)
    if (!msg) return

    switch (msg.type) {
      case 'kline':
        this.handleKline(msg.symbol, msg.channel, msg.data)
        break
      case 'miniTicker':
        this.handleTicker(msg.symbol, msg.data)
        break
      case 'limitDepths':
        this.handleDepths(msg.symbol, msg.data)
        break
    }
  }

  private handleKline(symbol: string, channel: string, kline: MexcKline): void {
    // The kline body carries the WS interval; fall back to the wrapper
    // channel (spot@public.kline.v3.api.pb@SYMBOL@Interval) if absent.
    const wsInterval = kline.interval || (channel.split('@').pop() ?? '')
    const tf = WS_INTERVAL_TO_TF[wsInterval]
    if (!tf) return

    const key = `candle:${symbol}:${tf}`
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    const candle = {
      ts: kline.windowStart * 1000,
      open: Number(kline.openingPrice),
      high: Number(kline.highestPrice),
      low: Number(kline.lowestPrice),
      close: Number(kline.closingPrice),
      volume: Number(kline.volume),
    }

    sub.buffer.push(candle)
    this.session.emit(key, { type: 'update', candles: [candle] })
  }

  private handleTicker(symbol: string, ticker: MexcMiniTicker): void {
    const key = `ticker:${symbol}`
    if (!this.session.getState(key)) return

    this.session.emit(key, {
      type: 'ticker',
      ticker: {
        last: Number(ticker.price),
        bid: 0,
        ask: 0,
        high24h: Number(ticker.high),
        low24h: Number(ticker.low),
        volume24h: Number(ticker.quantity),
        change24h: Number(ticker.rate) * 100,
        ts: Date.now(),
      },
    })
  }

  private handleDepths(symbol: string, depths: MexcLimitDepths): void {
    const key = `book:${symbol}`
    if (!this.session.getState(key)) return

    const bids: Array<[number, number]> = depths.bids.map((d) => [
      Number(d.price),
      Number(d.quantity),
    ])
    const asks: Array<[number, number]> = depths.asks.map((d) => [
      Number(d.price),
      Number(d.quantity),
    ])

    bids.sort((a, b) => b[0] - a[0])
    asks.sort((a, b) => a[0] - b[0])

    this.session.emit(key, { type: 'snapshot', bids, asks, ts: Date.now() })
  }
}
