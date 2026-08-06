// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { latencyMonitor } from '@pairlens/market-engine/latency'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import {
  buildBookStream,
  buildKlineStream,
  buildTickerStream,
  buildTradeStream,
  mapBinanceIntervalToTimeframe,
  normalizePair,
  parseBinanceTicker,
  parseBinanceTrade,
  parseBinanceWsKline,
} from './parser'
import { fetchBinanceCandles } from './rest-client'
import { resolveBinanceUrls } from './regions'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
  TradesCallback,
} from '@pairlens/market-engine/types'
import type { BackfillRetryOption } from '@pairlens/market-engine/candle-backfill'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

// Binance acks every SUBSCRIBE with {result:null,id} well under a second; if
// no ack lands in this window the control message was lost in transit and the
// socket must be recycled. Conservative so slow links never false-positive.
const SUBSCRIBE_ACK_TIMEOUT = 10_000

// Binance keeps the socket alive with PROTOCOL-level ping frames, which the
// browser auto-pongs without ever surfacing them to JS — so a quiet stream
// looks byte-identical to a dead socket. LIST_SUBSCRIPTIONS is the cheapest
// control message that provokes a reply we CAN see ({result:[...],id}), which
// is what arms the session's liveness watchdog. Far inside the 5 msg/sec
// control budget.
const KEEPALIVE_INTERVAL_MS = 20_000

type CandleSub = {
  pair: string
  timeframe: string
  buffer: CandleBuffer
}

type TickerSub = { pair: string }

type TradeSub = { pair: string }

/** Local orderbook state, rebuilt wholesale from each @depth20 snapshot. */
type BookSub = {
  pair: string
  bids: Map<number, number> // price → size
  asks: Map<number, number>
}

/**
 * Binance market-data WebSocket client.
 *
 * Holds ONE long-lived connection to Binance's combined-stream endpoint and
 * adds/removes streams on it with live `SUBSCRIBE`/`UNSUBSCRIBE` control
 * messages. It does NOT tear down and reopen the socket when subscriptions
 * change.
 *
 * Why this matters: the plugin keeps a single BinanceWsClient and reuses it as
 * the user switches markets/pairs/timeframes. An earlier version rebuilt the
 * whole socket on every subscription change, so switching back and forth from
 * Binance opened a new connection each time. Binance enforces a per-IP limit of
 * ~300 new connections / 5 min — heavy switching tripped it, Binance refused the
 * socket, and the connector's exponential backoff (capped at 30s) left the whole
 * terminal blank for ~30s before a retry landed. Reusing one socket and changing
 * streams via control messages keeps connection churn near zero, so the limit is
 * never approached. (The control-message budget is 5 msgs/sec/connection; the
 * microtask reconcile coalesces all three channels of a switch into at most one
 * SUBSCRIBE + one UNSUBSCRIBE, well under it.)
 *
 * The combined endpoint is required (not the raw `/ws`): @depth20 payloads carry
 * no symbol, so routing depends on the `{stream,data}` envelope that only the
 * combined endpoint provides.
 *
 * Connection lifecycle (connect gate, backoff, grace-period disconnect,
 * refcounted subscriptions) lives in ReconnectingWsSession. The session's
 * per-key subscribe/unsubscribe hooks don't send frames directly — they
 * update the desired-stream set and trigger a coalesced reconcile pass that
 * diffs it against what Binance currently holds for this socket.
 *
 * Every SUBSCRIBE is verified against Binance's {result:null,id} ack. The
 * stream tracking is optimistic — if a SUBSCRIBE is lost in transit (e.g. a
 * transport-level send failure the socket survives), the client would
 * otherwise sit on an open-but-silent connection forever. An unacked
 * SUBSCRIBE restarts the session, and the reconnect resubscribes everything.
 */
export class BinanceWsClient {
  private session: ReconnectingWsSession
  private backfillRetryDelayMs?: number
  private country = ''
  private msgId = 0
  /**
   * Id of the newest keepalive request. Binance has no pong frame — the
   * keepalive is a real LIST_SUBSCRIPTIONS call — so its reply is only
   * recognizable by the id it echoes back.
   */
  private keepaliveId = 0
  private reconcileScheduled = false
  // session key → Binance stream name; the set of values is the desired state.
  private desired = new Map<string, string>()
  // The streams Binance currently holds for this socket. Only meaningful while
  // the socket is OPEN; reset on every open so a reconnect re-subscribes the
  // full desired set from scratch.
  private subscribedStreams = new Set<string>()
  // SUBSCRIBE messages awaiting their {result:null,id} ack (see class docs).
  private pendingAcks = new Map<number, ReturnType<typeof setTimeout>>()

  constructor(
    options?: Partial<WsSessionOptions> & BackfillRetryOption,
    private ackTimeoutMs: number = SUBSCRIBE_ACK_TIMEOUT,
  ) {
    const { backfillRetryDelayMs, ...sessionOverrides } = options ?? {}
    this.backfillRetryDelayMs = backfillRetryDelayMs
    this.session = new ReconnectingWsSession({
      // Connect to the COMBINED endpoint with NO streams in the URL, then
      // activate them with explicit SUBSCRIBE control messages once open.
      // Streams in the URL query worked in the browser but delivered NO live
      // data under the Tauri desktop transport (@tauri-apps/plugin-websocket)
      // — the socket opened but no streams were ever active. Driving
      // subscriptions purely via post-open SUBSCRIBE sidesteps that transport
      // discrepancy and matches every other connector.
      url: () => `${resolveBinanceUrls(this.country).wsStream}/stream`,
      onMessage: (data) => this.handleMessage(data as string),
      onOpen: () => {
        // Fresh socket: Binance holds nothing yet, and acks armed on the old
        // socket will never arrive.
        this.subscribedStreams.clear()
        this.clearPendingAcks()
      },
      ping: {
        intervalMs: KEEPALIVE_INTERVAL_MS,
        frame: () => this.keepaliveFrame(),
      },
      onLatencySample: (rttMs) => latencyMonitor.record('binance', rttMs),
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
    const key = `candle:${normalized}:${timeframe}`

    const existing = this.session.getState<CandleSub>(key)
    if (existing) {
      const release = this.session.acquire(
        key,
        this.streamSpec(key, buildKlineStream(normalized, timeframe), existing),
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
      this.streamSpec(key, buildKlineStream(normalized, timeframe), sub),
      cb as (data: unknown) => void,
    )

    // REST backfill historical candles, then the WS stream delivers live updates.
    backfillCandles({
      fetch: () =>
        fetchBinanceCandles(normalized, timeframe, 300, this.country),
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
    const state =
      this.session.getState<TickerSub>(key) ??
      ({ pair: normalized } satisfies TickerSub)
    return this.session.acquire(
      key,
      this.streamSpec(key, buildTickerStream(normalized), state),
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
    const key = `book:${normalized}`
    const state = this.session.getState<BookSub>(key) ?? {
      pair: normalized,
      bids: new Map<number, number>(),
      asks: new Map<number, number>(),
    }
    // No REST seed: the @depth20 WS stream delivers a full top-20 snapshot
    // within ~100ms and replaces the book wholesale on every tick (see
    // handleBook), so a REST seed would only add levels that immediately go
    // stale and race the first WS frame.
    return this.session.acquire(
      key,
      this.streamSpec(key, buildBookStream(normalized), state),
      cb as (data: unknown) => void,
    )
  }

  // ── Trade subscriptions ──

  subscribeTrades(
    pair: string,
    country: string,
    cb: TradesCallback,
  ): () => void {
    this.country = country
    const normalized = normalizePair(pair)
    const key = `trades:${normalized}`
    const state =
      this.session.getState<TradeSub>(key) ??
      ({ pair: normalized } satisfies TradeSub)
    return this.session.acquire(
      key,
      this.streamSpec(key, buildTradeStream(normalized), state),
      cb as (data: unknown) => void,
    )
  }

  destroy(): void {
    this.clearPendingAcks()
    this.session.destroy()
    this.desired.clear()
    this.subscribedStreams.clear()
  }

  // ── Stream reconciliation ──

  /**
   * Session subscription spec whose hooks maintain the desired-stream set and
   * trigger a reconcile, instead of sending frames directly. `stream` is
   * undefined for unsupported timeframes — the entry still exists (parity with
   * the pre-session client) but never reaches the wire.
   */
  private streamSpec<TState>(
    key: string,
    stream: string | null | undefined,
    state: TState,
  ) {
    return {
      state,
      subscribe: (_state: TState) => {
        if (!stream) return
        this.desired.set(key, stream)
        this.scheduleReconcile()
      },
      unsubscribe: (_state: TState) => {
        this.desired.delete(key)
        this.scheduleReconcile()
      },
    }
  }

  /**
   * Coalesce a burst of subscribe/unsubscribe calls (the three chart channels
   * each fire independently) into a single reconcile pass, so one market switch
   * sends at most one SUBSCRIBE + one UNSUBSCRIBE rather than three of each.
   */
  private scheduleReconcile(): void {
    if (this.reconcileScheduled) return
    this.reconcileScheduled = true
    queueMicrotask(() => {
      this.reconcileScheduled = false
      this.reconcile()
    })
  }

  /**
   * Bring the live socket in line with the desired stream set WITHOUT tearing
   * it down: diff and emit SUBSCRIBE/UNSUBSCRIBE. With no socket this is a
   * no-op — the session's on-open pass re-runs every subscribe hook, which
   * rebuilds `desired` and reconciles against the fresh (empty) baseline.
   */
  private reconcile(): void {
    if (!this.session.isOpen) return
    const desired = new Set(this.desired.values())

    const toAdd = [...desired].filter((s) => !this.subscribedStreams.has(s))
    const toRemove = [...this.subscribedStreams].filter((s) => !desired.has(s))

    if (toAdd.length > 0) {
      const id = ++this.msgId
      this.session.send(
        JSON.stringify({ method: 'SUBSCRIBE', params: toAdd, id }),
      )
      for (const s of toAdd) this.subscribedStreams.add(s)
      this.expectAck(id)
    }
    if (toRemove.length > 0) {
      this.session.send(
        JSON.stringify({
          method: 'UNSUBSCRIBE',
          params: toRemove,
          id: ++this.msgId,
        }),
      )
      for (const s of toRemove) this.subscribedStreams.delete(s)
    }
  }

  /** Arm the lost-SUBSCRIBE watchdog for control message `id`. */
  private expectAck(id: number): void {
    const timer = setTimeout(() => {
      this.pendingAcks.delete(id)
      // A SUBSCRIBE went unacked: a control message was lost somewhere between
      // us and Binance and the socket can no longer be trusted. Restarting
      // drives the normal reconnect path, which resubscribes from scratch.
      this.clearPendingAcks()
      this.session.restart()
    }, this.ackTimeoutMs)
    this.pendingAcks.set(id, timer)
  }

  private clearPendingAcks(): void {
    for (const timer of this.pendingAcks.values()) clearTimeout(timer)
    this.pendingAcks.clear()
  }

  // ── Message handling ──

  /**
   * Binance has no pong frame, so the keepalive is a real request and its
   * reply is only recognizable by the id it echoes. Built here rather than
   * inline in the ping option so the id assignment and the reply match is one
   * pair of moving parts.
   */
  private keepaliveFrame(): string {
    this.keepaliveId = ++this.msgId
    return JSON.stringify({
      method: 'LIST_SUBSCRIPTIONS',
      id: this.keepaliveId,
    })
  }

  private handleMessage(text: string): void {
    let msg: {
      stream?: string
      data?: Record<string, unknown>
      id?: number
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }

    // Control-message ack ({ result, id }): Binance confirmed it received the
    // SUBSCRIBE/UNSUBSCRIBE — disarm the lost-subscribe watchdog for that id.
    if (typeof msg.id === 'number') {
      // The keepalive rides the same id space, and its reply is the only
      // frame that closes a round trip.
      if (msg.id === this.keepaliveId) this.session.notePong()
      const timer = this.pendingAcks.get(msg.id)
      if (timer) {
        clearTimeout(timer)
        this.pendingAcks.delete(msg.id)
      }
    }

    // Combined stream envelope: { stream: "...", data: { ... } }.
    if (!msg.stream || !msg.data) return

    const stream = msg.stream
    const data = msg.data

    if (stream.includes('@kline_')) {
      this.handleKline(data)
      return
    }
    if (stream.includes('@ticker')) {
      this.handleTicker(data)
      return
    }
    if (stream.includes('@depth')) {
      this.handleBook(stream, data)
      return
    }
    // Checked after '@ticker' and '@kline_', which '@trade' cannot collide
    // with — the suffixes are disjoint.
    if (stream.includes('@trade')) {
      this.handleTrade(data)
      return
    }
  }

  private handleTrade(data: Record<string, unknown>): void {
    if (data['e'] !== 'trade') return

    const trade = parseBinanceTrade(data)
    if (!trade) return

    const symbol = String(data['s'] ?? '').toUpperCase()
    // One execution per frame on this stream, unlike OKX's batched rows.
    this.session.emit(`trades:${symbol}`, { type: 'update', trades: [trade] })
  }

  private handleKline(data: Record<string, unknown>): void {
    if (data['e'] !== 'kline') return

    const k = data['k'] as Record<string, unknown> | undefined
    if (!k) return

    const parsed = parseBinanceWsKline(k)
    if (!parsed) return

    const [candle, , interval] = parsed
    const timeframe = mapBinanceIntervalToTimeframe(interval)
    if (!timeframe) return

    const symbol = String(data['s'] ?? '').toUpperCase()
    const key = `candle:${symbol}:${timeframe}`
    const sub = this.session.getState<CandleSub>(key)
    if (!sub) return

    sub.buffer.push(candle)
    this.session.emit(key, { type: 'update', candles: [candle] })
  }

  private handleTicker(data: Record<string, unknown>): void {
    if (data['e'] !== '24hrTicker') return

    const symbol = String(data['s'] ?? '').toUpperCase()
    this.session.emit(`ticker:${symbol}`, {
      type: 'ticker',
      ticker: parseBinanceTicker(data),
    })
  }

  private handleBook(stream: string, data: Record<string, unknown>): void {
    // Extract symbol from stream name: "btcusdt@depth20@100ms"
    const symbolLower = stream.split('@')[0] ?? ''
    const symbol = symbolLower.toUpperCase()
    const key = `book:${symbol}`
    const sub = this.session.getState<BookSub>(key)
    if (!sub) return

    // The @depth20 partial-book stream delivers a COMPLETE top-20 snapshot on
    // every tick (it is not a diff stream). Replace the local book wholesale so
    // it can never drift from the exchange.
    const bids = data['bids'] as Array<[string, string]> | undefined
    const asks = data['asks'] as Array<[string, string]> | undefined
    if (!bids || !asks) return

    sub.bids.clear()
    sub.asks.clear()
    for (const [priceStr, sizeStr] of bids) {
      const size = Number(sizeStr)
      if (size > 0) sub.bids.set(Number(priceStr), size)
    }
    for (const [priceStr, sizeStr] of asks) {
      const size = Number(sizeStr)
      if (size > 0) sub.asks.set(Number(priceStr), size)
    }

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
      ts: Number(data['lastUpdateId'] ?? Date.now()),
    })
  }
}
