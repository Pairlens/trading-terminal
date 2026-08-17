// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { connectWs } from '@pairlens/market-engine/ws-adapter'
import { ReconnectingWsSession } from '@pairlens/market-engine/ws-session'
import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import {
  bucketTsFor,
  mergeBarIntoBucket,
  parseAlpacaBar,
  parseAlpacaQuoteBook,
  parseAlpacaTradingStatus,
  parseTs,
  servesAlpacaPair,
  timeframeToMs,
  toAlpacaSymbol,
} from './parser'
import {
  fetchAlpacaCandles,
  fetchAlpacaQuoteBook,
  fetchAlpacaSnapshot,
  missingCredentialsError,
} from './rest-client'
import { ALPACA_DATA_WS } from './regions'
import type { AlpacaCredentials } from './rest-client'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'
import type { Candle } from '@pairlens/shared/types'
import type {
  CandleCallback,
  OrderbookCallback,
  TickerCallback,
  TickerSnapshot,
  TradingStatus,
} from '@pairlens/market-engine/types'

const GRACE_PERIOD = 5_000
const AUTH_TIMEOUT_MS = 10_000
/** Single session entry; Alpaca multiplexes every channel over one socket. */
const STREAM_KEY = 'alpaca-stream'
// Session-stat refresh cadence for ticker subscriptions. Live trades/quotes
// stream over WS; the daily high/low/volume/change come from the REST
// snapshot and only need occasional refresh.
const SNAPSHOT_REFRESH_MS = 30_000

type CandleSub = {
  pair: string // Alpaca symbol, e.g. 'AAPL'
  timeframe: string
  durationMs: number
  buffer: CandleBuffer
  /** Open ts of the bucket currently being aggregated from 1-min bars. */
  current: Candle | null
  /** Anchor for bucket alignment — the open ts of a known venue candle. */
  anchorTs: number | null
  callback: CandleCallback
}

type TickerSub = {
  pair: string
  callback: TickerCallback
  /** Last REST snapshot, patched live by WS trades/quotes. */
  snapshot: TickerSnapshot | null
  /**
   * Last halt/resume message off the `statuses` channel.
   *
   * Held beside the snapshot rather than inside it because the 30-second REST
   * refresh replaces the snapshot wholesale, and a halt that vanished every
   * refresh would flicker "halted" off a pane for the rest of the halt.
   */
  status: TradingStatus | null
  refreshTimer: ReturnType<typeof setInterval> | null
}

type BookSub = { pair: string; callback: OrderbookCallback }

/**
 * Alpaca market-data WebSocket client.
 *
 * One long-lived connection to the IEX feed, shared by all subscriptions.
 * Alpaca allows a single concurrent connection per feed, so the socket is
 * never recycled on subscription changes — channels are added/removed with
 * live subscribe/unsubscribe control messages, coalesced per microtask.
 *
 * Two Alpaca-specific quirks shape this client:
 * - The server requires an auth handshake before any subscribe; the session's
 *   authenticate gate holds every channel change until the `authenticated`
 *   ack lands.
 * - The WS only streams 1-minute bars. Candles for coarser timeframes are
 *   aggregated client-side into buckets anchored to the REST backfill, so
 *   live candles line up with the venue's own bar boundaries.
 *
 * Connection plumbing (connect gate, jittered backoff with stable-reset,
 * grace-period disconnect, suspend/resume recovery, re-auth + reconcile on
 * every reopen) lives in ReconnectingWsSession. Channels are tracked here
 * rather than as session keys because Alpaca wants one coalesced
 * subscribe/unsubscribe per change, not a frame per key.
 *
 * NOTE: deliberately NO liveness watchdog. US equities are legitimately
 * silent for ~16 hours a day, so "no inbound frames" is the normal overnight
 * state and a silence timer would recycle the socket all night. Suspend/resume
 * recovery still applies — that keys off a clock jump, not off traffic.
 */
export class AlpacaWsClient {
  private session: ReconnectingWsSession
  // Keyed by PAIR, never by Alpaca symbol. Several pair keys reduce to one
  // symbol — 'AAPL' from the shared instruments catalog and 'AAPL-USD' from
  // this connector's own pair form both become 'AAPL' — and a symbol-keyed
  // map let the second subscriber overwrite the first's entry. The first then
  // received nothing, and whichever unsubscribed first deleted the other's
  // subscription. `sub.pair` still holds the SYMBOL, which is what the WS
  // channel sets and the inbound dispatch match on.
  private candleSubs = new Map<string, CandleSub>() // key: PAIR:tf
  private tickerSubs = new Map<string, TickerSub>() // key: PAIR
  private bookSubs = new Map<string, BookSub>() // key: PAIR
  private destroyed = false
  private authenticated = false
  private reconcileScheduled = false
  /** Held while anything is subscribed; releasing it starts the grace timer. */
  private release: (() => void) | null = null
  private pendingAuth: {
    resolve: () => void
    reject: (err: Error) => void
  } | null = null
  // Channel sets the server currently holds. Cleared on every (re)open so a
  // reconnect re-subscribes the full desired set.
  private subscribedBars = new Set<string>()
  private subscribedQuotes = new Set<string>()
  private subscribedTrades = new Set<string>()
  private subscribedStatuses = new Set<string>()

  constructor(
    private getCredentials: () => AlpacaCredentials | null,
    connectFn: typeof connectWs = connectWs,
    wsUrl: string = ALPACA_DATA_WS,
    options?: Partial<WsSessionOptions>,
  ) {
    this.session = new ReconnectingWsSession({
      url: () => wsUrl,
      connect: connectFn,
      onMessage: (data) => this.handleMessage(data as string),
      authenticate: () => this.authenticate(),
      gracePeriodMs: GRACE_PERIOD,
      ...options,
    })
  }

  // ── Session entry ──

  /** Acquire the keepalive entry on the first subscription. */
  private ensureAcquired(): void {
    if (this.release) return
    this.release = this.session.acquire(
      STREAM_KEY,
      {
        state: null,
        // Runs after the auth gate on every (re)open — the server holds
        // nothing on a fresh socket, so this re-sends the full desired set.
        subscribe: () => this.reconcile(),
        revive: () => this.clearServerState(),
        unsubscribe: () => {},
      },
      () => {},
    )
  }

  /** Release once nothing is subscribed; the session's grace timer closes it. */
  private releaseIfIdle(): void {
    if (this.hasDesired()) return
    this.release?.()
    this.release = null
  }

  // ── Candle subscriptions ──

  subscribeCandles(
    pair: string,
    timeframe: string,
    cb: CandleCallback,
  ): () => void {
    const credentials = this.getCredentials()
    if (!credentials) throw missingCredentialsError()

    // Refused rather than approximated — see `servesAlpacaPair`. Silence is
    // the right answer here: the terminal's availability probe asks REST,
    // which refuses the same pair, and the pane says the venue does not carry
    // it instead of drawing an unrelated instrument's candles.
    if (!servesAlpacaPair(pair)) return () => {}

    const symbol = toAlpacaSymbol(pair)
    const durationMs = timeframeToMs(timeframe)
    if (!durationMs) throw new Error(`Unsupported timeframe: ${timeframe}`)
    const key = `${pair}:${timeframe}`

    const sub: CandleSub = {
      pair: symbol,
      timeframe,
      durationMs,
      buffer: new CandleBuffer(),
      current: null,
      anchorTs: null,
      callback: cb,
    }
    this.candleSubs.set(key, sub)

    // REST backfill, then live 1-min bars aggregate into the last bucket.
    fetchAlpacaCandles(symbol, timeframe, 300, credentials)
      .then((candles) => {
        if (!this.candleSubs.has(key)) return // unsubscribed during fetch
        sub.buffer.load(candles)
        const last = candles[candles.length - 1]
        if (last) {
          sub.anchorTs = last.ts
          sub.current = last
        }
        sub.callback({ type: 'snapshot', candles })
      })
      .catch(() => {
        // Backfill failed — live WS bars will still build candles.
      })

    this.ensureAcquired()
    this.scheduleReconcile()

    return () => {
      this.candleSubs.delete(key)
      this.scheduleReconcile()
      this.releaseIfIdle()
    }
  }

  // ── Ticker subscriptions ──

  subscribeTicker(pair: string, cb: TickerCallback): () => void {
    const credentials = this.getCredentials()
    if (!credentials) return () => {}

    if (!servesAlpacaPair(pair)) return () => {}

    const symbol = toAlpacaSymbol(pair)

    const sub: TickerSub = {
      pair: symbol,
      callback: cb,
      snapshot: null,
      status: null,
      refreshTimer: null,
    }
    this.tickerSubs.set(pair, sub)

    const refresh = () => {
      const creds = this.getCredentials()
      if (!creds) return
      fetchAlpacaSnapshot(symbol, creds)
        .then((snapshot) => {
          if (this.tickerSubs.get(pair) !== sub) return
          this.emitTicker(sub, snapshot)
        })
        .catch(() => {
          // Keep the previous snapshot; WS quotes/trades still patch it.
        })
    }
    refresh()
    sub.refreshTimer = setInterval(refresh, SNAPSHOT_REFRESH_MS)

    this.ensureAcquired()
    this.scheduleReconcile()

    return () => {
      if (sub.refreshTimer) clearInterval(sub.refreshTimer)
      this.tickerSubs.delete(pair)
      this.scheduleReconcile()
      this.releaseIfIdle()
    }
  }

  // ── Orderbook subscriptions ──

  subscribeOrderbook(pair: string, cb: OrderbookCallback): () => void {
    const credentials = this.getCredentials()
    if (!credentials) return () => {}

    if (!servesAlpacaPair(pair)) return () => {}

    const symbol = toAlpacaSymbol(pair)
    const sub: BookSub = { pair: symbol, callback: cb }
    this.bookSubs.set(pair, sub)
    this.ensureAcquired()
    this.scheduleReconcile()

    // Seed with the REST quote so the book renders before the first WS tick.
    // Sizes come from the quote itself: seeding from a TickerSnapshot would
    // report both levels at size zero, which reads as a broken book rather
    // than a one-level one.
    fetchAlpacaQuoteBook(symbol, credentials)
      .then((book) => {
        if (this.bookSubs.get(pair) !== sub || !book) return
        sub.callback({
          type: 'snapshot',
          bids: book.bids,
          asks: book.asks,
          ts: book.ts,
        })
      })
      .catch(() => {
        // WS quotes will populate the book.
      })

    return () => {
      this.bookSubs.delete(pair)
      this.scheduleReconcile()
      this.releaseIfIdle()
    }
  }

  destroy(): void {
    this.destroyed = true
    this.release = null
    this.authenticated = false
    for (const sub of this.tickerSubs.values()) {
      if (sub.refreshTimer) clearInterval(sub.refreshTimer)
    }
    this.pendingAuth?.reject(new Error('alpaca: destroyed'))
    this.session.destroy()
    this.clearServerState()
    this.candleSubs.clear()
    this.tickerSubs.clear()
    this.bookSubs.clear()
  }

  // ── Desired channel sets ──

  private desiredBars(): Set<string> {
    const set = new Set<string>()
    for (const sub of this.candleSubs.values()) set.add(sub.pair)
    return set
  }

  private desiredQuotes(): Set<string> {
    const set = new Set<string>()
    for (const sub of this.tickerSubs.values()) set.add(sub.pair)
    for (const sub of this.bookSubs.values()) set.add(sub.pair)
    return set
  }

  private desiredTrades(): Set<string> {
    const set = new Set<string>()
    for (const sub of this.tickerSubs.values()) set.add(sub.pair)
    return set
  }

  /**
   * Halt/resume messages, for ticker subscribers only.
   *
   * Tied to the ticker set rather than to bars or books because the status
   * rides on the ticker payload: a candle stream has nowhere to put it, and a
   * book subscriber that is not also a ticker subscriber would pay for frames
   * nothing reads. The channel is cheap (a handful of messages a day per
   * symbol) but it is not free.
   */
  private desiredStatuses(): Set<string> {
    const set = new Set<string>()
    for (const sub of this.tickerSubs.values()) set.add(sub.pair)
    return set
  }

  private hasDesired(): boolean {
    return (
      this.candleSubs.size > 0 ||
      this.tickerSubs.size > 0 ||
      this.bookSubs.size > 0
    )
  }

  private clearServerState(): void {
    this.subscribedBars.clear()
    this.subscribedQuotes.clear()
    this.subscribedTrades.clear()
    this.subscribedStatuses.clear()
  }

  // ── Reconcile ──

  private scheduleReconcile(): void {
    if (this.reconcileScheduled) return
    this.reconcileScheduled = true
    queueMicrotask(() => {
      this.reconcileScheduled = false
      this.reconcile()
    })
  }

  private reconcile(): void {
    if (this.destroyed) return
    // Nothing to send yet — the session's on-open subscribe hook calls back
    // here once the socket is up and the auth gate has cleared.
    if (!this.session.isOpen) return
    // The socket is assigned before the auth gate resolves, so isOpen alone
    // is not enough: Alpaca rejects any subscribe sent ahead of the ack.
    if (!this.authenticated) return

    const diff = (
      desired: Set<string>,
      subscribed: Set<string>,
    ): { add: Array<string>; remove: Array<string> } => {
      const add: Array<string> = []
      const remove: Array<string> = []
      for (const s of desired) if (!subscribed.has(s)) add.push(s)
      for (const s of subscribed) if (!desired.has(s)) remove.push(s)
      return { add, remove }
    }

    const bars = diff(this.desiredBars(), this.subscribedBars)
    const quotes = diff(this.desiredQuotes(), this.subscribedQuotes)
    const trades = diff(this.desiredTrades(), this.subscribedTrades)
    const statuses = diff(this.desiredStatuses(), this.subscribedStatuses)

    if (
      bars.add.length ||
      quotes.add.length ||
      trades.add.length ||
      statuses.add.length
    ) {
      this.send({
        action: 'subscribe',
        ...(bars.add.length ? { bars: bars.add } : {}),
        ...(quotes.add.length ? { quotes: quotes.add } : {}),
        ...(trades.add.length ? { trades: trades.add } : {}),
        ...(statuses.add.length ? { statuses: statuses.add } : {}),
      })
      for (const s of bars.add) this.subscribedBars.add(s)
      for (const s of quotes.add) this.subscribedQuotes.add(s)
      for (const s of trades.add) this.subscribedTrades.add(s)
      for (const s of statuses.add) this.subscribedStatuses.add(s)
    }
    if (
      bars.remove.length ||
      quotes.remove.length ||
      trades.remove.length ||
      statuses.remove.length
    ) {
      this.send({
        action: 'unsubscribe',
        ...(bars.remove.length ? { bars: bars.remove } : {}),
        ...(quotes.remove.length ? { quotes: quotes.remove } : {}),
        ...(trades.remove.length ? { trades: trades.remove } : {}),
        ...(statuses.remove.length ? { statuses: statuses.remove } : {}),
      })
      for (const s of bars.remove) this.subscribedBars.delete(s)
      for (const s of quotes.remove) this.subscribedQuotes.delete(s)
      for (const s of trades.remove) this.subscribedTrades.delete(s)
      for (const s of statuses.remove) this.subscribedStatuses.delete(s)
    }
  }

  private send(msg: Record<string, unknown>): void {
    this.session.send(JSON.stringify(msg))
  }

  // ── Handshake ──

  /**
   * Runs in the session's authenticate gate on every (re)connect. Alpaca
   * expects auth within seconds of the socket opening (it answers 404
   * otherwise), and rejects any subscribe sent before the ack.
   */
  private authenticate(): Promise<void> {
    const credentials = this.getCredentials()
    if (!credentials) return Promise.reject(missingCredentialsError())

    this.authenticated = false
    this.clearServerState()

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAuth = null
        reject(new Error('alpaca: auth timeout'))
      }, AUTH_TIMEOUT_MS)

      this.pendingAuth = {
        resolve: () => {
          clearTimeout(timer)
          this.pendingAuth = null
          this.authenticated = true
          resolve()
        },
        reject: (err) => {
          clearTimeout(timer)
          this.pendingAuth = null
          reject(err)
        },
      }

      this.send({
        action: 'auth',
        key: credentials.apiKey,
        secret: credentials.apiSecret,
      })
    })
  }

  // ── Message handling ──

  private handleMessage(text: string): void {
    let msgs: unknown
    try {
      msgs = JSON.parse(text)
    } catch {
      return
    }
    // Alpaca delivers every frame as a JSON array of messages.
    if (!Array.isArray(msgs)) return

    for (const raw of msgs) {
      if (!raw || typeof raw !== 'object') continue
      const msg = raw as Record<string, unknown>
      const type = String(msg['T'] ?? '')

      if (type === 'success' && msg['msg'] === 'authenticated') {
        // Settles the gate, which then drives the reconcile.
        this.pendingAuth?.resolve()
        continue
      }

      if (type === 'error') {
        // 402 auth failed / 406 connection limit. Failing the gate turns
        // these into a backed-off retry instead of a socket that sits open
        // and never subscribes.
        this.pendingAuth?.reject(
          new Error(`alpaca: ${String(msg['msg'] ?? 'stream error')}`),
        )
        continue
      }

      if (type === 'b' || type === 'u') {
        // 1-minute bar (b) or corrected bar (u)
        this.handleBar(msg)
        continue
      }

      if (type === 'q') {
        this.handleQuote(msg)
        continue
      }

      if (type === 't') {
        this.handleTrade(msg)
        continue
      }

      if (type === 's') {
        this.handleStatus(msg)
        continue
      }
    }
  }

  private handleBar(msg: Record<string, unknown>): void {
    const symbol = String(msg['S'] ?? '').toUpperCase()
    const bar = parseAlpacaBar(msg)
    if (!bar) return

    for (const sub of this.candleSubs.values()) {
      if (sub.pair !== symbol) continue

      const anchor = sub.anchorTs ?? bar.ts
      if (sub.anchorTs === null) sub.anchorTs = anchor
      const bucketTs = bucketTsFor(bar.ts, anchor, sub.durationMs)

      const wasBucket = sub.current?.ts ?? null
      const merged = mergeBarIntoBucket(
        wasBucket === bucketTs ? sub.current : null,
        bar,
        bucketTs,
      )
      sub.current = merged
      sub.buffer.push(merged)
      sub.callback({ type: 'update', candles: [merged] })
    }
  }

  private handleQuote(msg: Record<string, unknown>): void {
    const symbol = String(msg['S'] ?? '').toUpperCase()
    const book = parseAlpacaQuoteBook(msg)
    if (!book) return

    // Fan out: one symbol can back several pair keys, and `handleBar` above
    // has always matched this way.
    for (const bookSub of this.bookSubs.values()) {
      if (bookSub.pair !== symbol) continue
      bookSub.callback({
        type: 'snapshot',
        bids: book.bids,
        asks: book.asks,
        ts: book.ts,
      })
    }

    for (const tickerSub of this.tickerSubs.values()) {
      if (tickerSub.pair !== symbol || !tickerSub.snapshot) continue
      this.emitTicker(tickerSub, {
        ...tickerSub.snapshot,
        bid: book.bids[0]?.[0] ?? tickerSub.snapshot.bid,
        ask: book.asks[0]?.[0] ?? tickerSub.snapshot.ask,
        ts: book.ts,
      })
    }
  }

  private handleTrade(msg: Record<string, unknown>): void {
    const symbol = String(msg['S'] ?? '').toUpperCase()
    const price = Number(msg['p'] ?? 0)
    if (!Number.isFinite(price) || price <= 0) return
    const ts = parseTs(msg['t']) ?? Date.now()

    for (const sub of this.tickerSubs.values()) {
      if (sub.pair !== symbol || !sub.snapshot) continue
      this.emitTicker(sub, {
        ...sub.snapshot,
        last: price,
        high24h: Math.max(sub.snapshot.high24h, price),
        low24h: Math.min(sub.snapshot.low24h, price),
        ts,
      })
    }
  }

  /**
   * A halt, a volatility pause or a resumption off the `statuses` channel.
   *
   * The status is remembered on the subscription even when no snapshot has
   * landed yet: a halt carries no price, so it commonly arrives before the
   * first REST snapshot for a symbol opened during one, and it then rides out
   * attached to that snapshot instead of being dropped.
   */
  private handleStatus(msg: Record<string, unknown>): void {
    const symbol = String(msg['S'] ?? '').toUpperCase()
    const status = parseAlpacaTradingStatus(msg)
    if (!status) return

    for (const sub of this.tickerSubs.values()) {
      if (sub.pair !== symbol) continue
      sub.status = status
      if (sub.snapshot) this.emitTicker(sub, sub.snapshot)
    }
  }

  /**
   * Publish a ticker with the subscription's current trading status attached.
   *
   * The status is attached at emit time rather than stored on the snapshot, so
   * every path that rebuilds a snapshot (REST refresh, quote patch, trade
   * patch) carries it without having to remember to.
   */
  private emitTicker(sub: TickerSub, snapshot: TickerSnapshot): void {
    sub.snapshot = snapshot
    sub.callback({
      type: 'ticker',
      ticker: sub.status
        ? { ...snapshot, tradingStatus: sub.status }
        : snapshot,
    })
  }

  /** Close only after a grace period with no subscriptions. */
}
