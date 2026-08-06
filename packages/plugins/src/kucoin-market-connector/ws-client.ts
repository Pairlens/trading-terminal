// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * KuCoin WebSocket Client — real-time market data via token-based WS.
 *
 * KuCoin requires a token to connect to WebSocket:
 * 1. POST /api/v1/bullet-public → get token + dynamic endpoint
 * 2. Connect to {endpoint}?token={token}&connectId={id}
 * 3. Handle welcome, maintain ping/pong at server-specified interval
 *
 * Connection plumbing lives in ReconnectingWsSession; the token bootstrap is
 * the session's async url() (a failed POST is a failed connect and retries
 * with backoff). Tokens are cached and reused across reconnects for the
 * ~23h refresh window, and a timer restarts the session so a fresh token is
 * obtained before the 24h expiry.
 *
 * All WS data is JSON text (no protobuf).
 * REST is used for initial candle backfill and periodic 24h stats refresh.
 */

import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { latencyMonitor } from '@pairlens/market-engine/latency'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { fetchKucoinCandles, fetchKucoinStats } from './rest-client'
import {
  mapTimeframeToKucoinType,
  normalizePair,
  parseKucoinTrade,
  parseKucoinWsKline,
} from './parser'
import { resolveKucoinRestBase } from './regions'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
  TickerSnapshot,
  TradesCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

const STATS_REFRESH_INTERVAL = 30_000
const TOKEN_REFRESH_INTERVAL = 23 * 60 * 60 * 1000 // ~23h, renew before 24h expiry
const DEFAULT_PING_INTERVAL = 18_000

type CandleSub = {
  pair: string
  timeframe: string
  buffer: CandleBuffer
  topic: string // e.g. /market/candles:BTC-USDT_1hour
}

type TickerSub = {
  pair: string
  topic: string // e.g. /market/ticker:BTC-USDT
  /** Cached 24h stats from REST, merged with WS real-time price/bid/ask */
  stats: TickerSnapshot | null
  statsTimer: ReturnType<typeof setInterval> | null
}

type BookSub = {
  pair: string
  topic: string // e.g. /spotMarket/level2Depth50:BTC-USDT
}

type TradeSub = {
  pair: string
  topic: string // e.g. /market/match:BTC-USDT
}

type BulletToken = {
  token: string
  endpoint: string
  pingInterval: number
  pingTimeout: number
}

export class KucoinWsClient {
  private session: ReconnectingWsSession
  private backfillRetryDelayMs?: number
  private country = ''
  private nextMsgId = 1
  // Server-specified ping cadence, refreshed by every token bootstrap. The
  // session reads it at connect time via the getter below.
  private pingIntervalMs = DEFAULT_PING_INTERVAL
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null
  // Bullet tokens are valid for ~24h, so reconnects within the refresh window
  // reuse the cached token instead of paying a serial POST before every WS
  // connect (the POST added ~300-500ms to each market switch). Invalidated on
  // connect failure so a rejected token falls back to a fresh bootstrap.
  private tokenCache: {
    token: BulletToken
    fetchedAt: number
    country: string
  } | null = null
  // Wire topic → session key, for routing pushed messages.
  private topicToKey = new Map<string, string>()

  constructor(options?: Partial<WsSessionOptions> & BackfillRetryOption) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs

    const self = this
    this.session = new ReconnectingWsSession({
      url: async () => {
        const token = await this.obtainPublicToken(this.country)
        this.pingIntervalMs = token.pingInterval
        const connectId = `kc-${Date.now()}`
        return `${token.endpoint}?token=${token.token}&connectId=${connectId}`
      },
      onMessage: (data) => this.handleMessage(data as string),
      ping: {
        get intervalMs() {
          return self.pingIntervalMs
        },
        frame: () =>
          JSON.stringify({ id: String(this.nextMsgId++), type: 'ping' }),
      },
      onLatencySample: (rttMs) => latencyMonitor.record('kucoin', rttMs),
      onOpen: () => this.armTokenRefresh(),
      onConnectError: () => {
        this.tokenCache = null
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
    this.country = country
    const normalized = normalizePair(pair)
    const kucoinType = mapTimeframeToKucoinType(timeframe)
    const key = `candle:${normalized}:${timeframe}`
    const topic = kucoinType
      ? `/market/candles:${normalized}_${kucoinType}`
      : ''

    const existing = this.session.getState<CandleSub>(key)
    if (existing) {
      const release = this.session.acquire(
        key,
        this.topicSpec(key, existing.topic, existing),
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
      topic,
    }
    const release = this.session.acquire(
      key,
      this.topicSpec(key, topic, sub),
      cb as (data: unknown) => void,
    )

    // REST backfill historical candles, then WS for live updates
    backfillCandles({
      fetch: () => fetchKucoinCandles(pair, timeframe, 300, country),
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

  // ── Ticker subscriptions ──

  subscribeTicker(
    pair: string,
    country: string,
    cb: TickerCallback,
  ): () => void {
    this.country = country
    const normalized = normalizePair(pair)
    const key = `ticker:${normalized}`
    const topic = `/market/ticker:${normalized}`

    const existing = this.session.getState<TickerSub>(key)
    if (existing) {
      const release = this.session.acquire(
        key,
        this.tickerSpec(key, existing),
        cb as (data: unknown) => void,
      )
      // Catch the late subscriber up with the freshest 24h stats we hold.
      if (existing.stats) cb({ type: 'ticker', ticker: existing.stats })
      return release
    }

    const sub: TickerSub = {
      pair: normalized,
      topic,
      stats: null,
      statsTimer: null,
    }
    const release = this.session.acquire(
      key,
      this.tickerSpec(key, sub),
      cb as (data: unknown) => void,
    )

    // Fetch initial 24h stats from REST (WS ticker lacks 24h data), then
    // refresh periodically for as long as the subscription lives.
    this.refreshTickerStats(key, sub)
    sub.statsTimer = setInterval(
      () => this.refreshTickerStats(key, sub),
      STATS_REFRESH_INTERVAL,
    )

    return release
  }

  // ── Orderbook subscriptions ──

  subscribeOrderbook(
    pair: string,
    country: string,
    cb: OrderbookCallback,
  ): () => void {
    this.country = country
    const normalized = normalizePair(pair)
    const key = `book:${normalized}`
    const topic = `/spotMarket/level2Depth50:${normalized}`
    const sub = this.session.getState<BookSub>(key) ?? {
      pair: normalized,
      topic,
    }
    return this.session.acquire(
      key,
      this.topicSpec(key, topic, sub),
      cb as (data: unknown) => void,
    )
  }

  // ── Lifecycle ──

  subscribeTrades(
    pair: string,
    country: string,
    cb: TradesCallback,
  ): () => void {
    this.country = country
    const normalized = normalizePair(pair)
    const key = `trades:${normalized}`
    const topic = `/market/match:${normalized}`
    const sub = this.session.getState<TradeSub>(key) ?? {
      pair: normalized,
      topic,
    }
    return this.session.acquire(
      key,
      this.topicSpec(key, topic, sub),
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
      this.tokenRefreshTimer = null
    }
    // Ticker stats timers live in entry state; the session is being destroyed
    // wholesale, so sweep them via the topic map before the registry clears.
    for (const key of this.topicToKey.values()) {
      const state = this.session.getState<TickerSub>(key)
      if (state?.statsTimer) clearInterval(state.statsTimer)
    }
    this.session.destroy()
    this.topicToKey.clear()
  }

  // ── Subscription specs ──

  private topicSpec<TState>(key: string, topic: string, state: TState) {
    return {
      state,
      subscribe: (_state: TState) => {
        if (!topic) return // unsupported timeframe — entry exists, never wired
        this.topicToKey.set(topic, key)
        this.sendControl('subscribe', topic)
      },
      unsubscribe: (_state: TState) => {
        if (!topic) return
        this.sendControl('unsubscribe', topic)
        this.topicToKey.delete(topic)
      },
    }
  }

  private tickerSpec(key: string, state: TickerSub) {
    const base = this.topicSpec(key, state.topic, state)
    return {
      ...base,
      unsubscribe: (s: TickerSub) => {
        base.unsubscribe(s)
        if (s.statsTimer) {
          clearInterval(s.statsTimer)
          s.statsTimer = null
        }
      },
    }
  }

  // ── Token bootstrap & refresh ──

  /**
   * Obtain a WS token and dynamic endpoint, reusing the cached token while it
   * is fresh (same region, younger than the refresh window). Falls back to
   * POST /api/v1/bullet-public.
   */
  private async obtainPublicToken(country: string): Promise<BulletToken> {
    const cached = this.tokenCache
    if (
      cached &&
      cached.country === country &&
      Date.now() - cached.fetchedAt < TOKEN_REFRESH_INTERVAL
    ) {
      return cached.token
    }

    const restBase = resolveKucoinRestBase(country)
    const resp = await fetch(`${restBase}/api/v1/bullet-public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!resp.ok) throw new Error(`KuCoin bullet-public failed: ${resp.status}`)

    const json = (await resp.json()) as {
      code: string
      data: {
        token: string
        instanceServers: Array<{
          endpoint: string
          pingInterval: number
          pingTimeout: number
        }>
      }
    }

    if (json.code !== '200000' || !json.data?.token) {
      throw new Error(`KuCoin bullet-public error: ${json.code}`)
    }

    const server = json.data.instanceServers[0]
    if (!server) throw new Error('KuCoin: no instance servers returned')

    const token: BulletToken = {
      token: json.data.token,
      endpoint: server.endpoint,
      pingInterval: server.pingInterval || 18000,
      pingTimeout: server.pingTimeout || 10000,
    }
    this.tokenCache = { token, fetchedAt: Date.now(), country }
    return token
  }

  /** Restart before the ~24h token expiry so a fresh token is negotiated. */
  private armTokenRefresh(): void {
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer)
    this.tokenRefreshTimer = setTimeout(() => {
      this.tokenRefreshTimer = null
      this.session.restart()
    }, TOKEN_REFRESH_INTERVAL)
  }

  // ── Wire helpers ──

  private sendControl(type: 'subscribe' | 'unsubscribe', topic: string): void {
    this.session.send(
      JSON.stringify({
        id: String(this.nextMsgId++),
        type,
        topic,
        response: true,
      }),
    )
  }

  // ── Message handling ──

  private handleMessage(text: string): void {
    let msg: {
      type?: string
      topic?: string
      subject?: string
      data?: Record<string, unknown>
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Welcome / pong / subscription ack — no action needed beyond closing the
    // keepalive round trip the pong answers.
    if (msg.type === 'pong') {
      this.session.notePong()
      return
    }
    if (msg.type === 'welcome' || msg.type === 'ack') return

    if (msg.type === 'message' && msg.topic && msg.data) {
      if (msg.topic.startsWith('/market/candles:')) {
        this.handleKline(msg.topic, msg.data)
      } else if (msg.topic.startsWith('/market/ticker:')) {
        this.handleTicker(msg.topic, msg.data)
      } else if (msg.topic.startsWith('/spotMarket/level2Depth')) {
        this.handleOrderbook(msg.topic, msg.data)
      } else if (msg.topic.startsWith('/market/match:')) {
        this.handleTrade(msg.topic, msg.data)
      }
    }
  }

  private handleTrade(topic: string, data: Record<string, unknown>): void {
    const key = this.topicToKey.get(topic)
    if (!key) return
    const trade = parseKucoinTrade(data)
    if (!trade) return
    this.session.emit(key, { type: 'update', trades: [trade] })
  }

  private handleKline(topic: string, data: Record<string, unknown>): void {
    const candles = data['candles'] as Array<unknown> | undefined
    if (!candles) return

    const candle = parseKucoinWsKline(candles)
    if (!candle) return

    const key = this.topicToKey.get(topic)
    if (!key) return
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    sub.buffer.push(candle)
    this.session.emit(key, { type: 'update', candles: [candle] })
  }

  private handleTicker(topic: string, data: Record<string, unknown>): void {
    const key = this.topicToKey.get(topic)
    if (!key) return
    const sub = this.session.getState<TickerSub>(key)
    if (!sub) return

    // WS ticker has real-time price/bid/ask but NOT 24h stats.
    // Merge with cached REST stats.
    const ticker: TickerSnapshot = {
      last: Number(data['price'] ?? 0),
      bid: Number(data['bestBid'] ?? 0),
      ask: Number(data['bestAsk'] ?? 0),
      high24h: sub.stats?.high24h ?? 0,
      low24h: sub.stats?.low24h ?? 0,
      volume24h: sub.stats?.volume24h ?? 0,
      change24h: sub.stats?.change24h ?? 0,
      ts: Number(data['time'] ?? Date.now()),
    }

    this.session.emit(key, { type: 'ticker', ticker })
  }

  private handleOrderbook(topic: string, data: Record<string, unknown>): void {
    const key = this.topicToKey.get(topic)
    if (!key) return
    if (!this.session.getState(key)) return

    const rawAsks = data['asks'] as Array<[string, string]> | undefined
    const rawBids = data['bids'] as Array<[string, string]> | undefined
    const timestamp = Number(data['timestamp'] ?? Date.now())

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

  /** Fetch 24h stats from REST and cache on the ticker subscription. */
  private refreshTickerStats(key: string, sub: TickerSub): void {
    fetchKucoinStats(sub.pair, this.country)
      .then((stats) => {
        // Only update if the subscription is still live
        if (this.session.getState(key) !== sub) return
        sub.stats = stats
        // Emit a full ticker update with fresh stats
        this.session.emit(key, { type: 'ticker', ticker: stats })
      })
      .catch(() => {})
  }
}
