// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pull→push bridge: one `while (running) await exchange.watch*()` loop per
 * subscription key, plus everything ccxt does not do for you.
 *
 * CCXT's `watch*` is a pull API over a socket it owns. When the socket dies it
 * rejects every pending future, deletes the client from `exchange.clients`, and
 * stops — `WsClient.connect()` is guarded by `startedConnecting`, so a client
 * instance never reconnects itself. The next `watch*` call simply builds a new
 * client. That makes the consumer loop the reconnect mechanism, and ccxt's own
 * `backoffDelay` is hardcoded to 0 (`Exchange.js:1425` — "todo"), so a naive
 * loop hammers a down venue as fast as the event loop allows.
 *
 * So this file reproduces `ReconnectingWsSession`'s policy on top of the loop,
 * knob for knob, because that policy is what the terminal's reconnect behavior
 * was tuned to:
 *
 * - equal-jitter backoff, base 1 s, cap `min(base·2^min(attempt,5), 30 s)`,
 *   `delay = cap/2 + rand()·cap/2`
 * - the attempt counter resets only after `stableResetMs` of delivery, so a
 *   connect that immediately drops keeps backing off
 * - a `WakeMonitor` resume/online resets the counter, cancels the pending
 *   backoff and reconnects immediately — the half-open socket a lid-close
 *   leaves behind never fires `close`, so nothing else would notice
 * - an inbound-silence watchdog force-closes the exchange. This is not
 *   belt-and-braces: ccxt's own stall detector is DEAD in a browser
 *   (`Client.onPingInterval` falls through to `this.lastPong = now` when the
 *   runtime has no protocol PING), so `maxPingPongMisses` can never fire in
 *   the Tauri webview or the hosted terminal
 * - subscriptions are refcounted per key with a synchronous release, and the
 *   exchange stays warm for a 60 s grace period after the last one
 *
 * Everything the loop hands out is COPIED. `watchOrderBook` resolves the live,
 * mutating `OrderBook` instance and `ArrayCacheByTimestamp` rewrites the
 * forming candle in place, so a payload that crossed the plugin boundary
 * uncopied would change underneath its reader.
 */

import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import { wakeMonitor } from '@pairlens/market-engine/wake-monitor'
import {
  ccxtBookTimestamp,
  parseCcxtBookLevels,
  parseCcxtOhlcv,
  parseCcxtTicker,
  parseCcxtTrade,
  toCcxtSymbol,
} from './parser'
import type { CcxtExchangeLike, CcxtVenueConfig } from './types'
import type { Candle } from '@pairlens/shared/types'
import type { Trade } from '@pairlens/market-engine/types'
import type { WakeSource } from '@pairlens/market-engine/wake-monitor'

// Mirrors ReconnectingWsSession — see that file for why each number is what
// it is. Reproduced rather than imported because the session is socket-shaped
// and ccxt hands us a promise, not a socket.
const DEFAULT_GRACE_PERIOD_MS = 60_000
const DEFAULT_BASE_BACKOFF_MS = 1_000
const DEFAULT_MAX_BACKOFF_MS = 30_000
const DEFAULT_MAX_BACKOFF_EXPONENT = 5
const DEFAULT_STABLE_RESET_MS = 30_000
const DEFAULT_LIVENESS_TIMEOUT_MS = 90_000
const LIVENESS_CHECK_DIVISOR = 3
const MIN_LIVENESS_CHECK_MS = 1_000
const MAX_LIVENESS_CHECK_MS = 10_000
/** Candles pulled once per key to seed the buffer before live updates. */
const BACKFILL_LIMIT = 300
/**
 * How many consecutive "closed by user" wakeups may re-enter with no delay
 * before the loop treats them as a fault and backs off. A close we asked for
 * should be followed by data; a stream of them is a wedge, not a restart.
 */
const MAX_IMMEDIATE_REENTRIES = 3

export type WatchChannel = 'candles' | 'ticker' | 'orderbook' | 'trades'

/** The slice of CcxtExchangeHost the driver uses — fake-able in tests. */
export type ExchangeHostLike = {
  readonly generation: number
  peek: () => CcxtExchangeLike | null
  setCountry: (country: string) => boolean
  acquire: () => Promise<{ exchange: CcxtExchangeLike; generation: number }>
  close: () => Promise<void>
  destroy: () => Promise<void>
}

export type CcxtStreamHubOptions = {
  venue: CcxtVenueConfig
  host: ExchangeHostLike
  /** Seeds a candle key's buffer over REST before live updates start. */
  backfill?: (
    pair: string,
    timeframe: string,
    limit: number,
    country: string,
  ) => Promise<Array<Candle>>
  /** Applied to a freshly built exchange before the first watch call. */
  primeMarkets?: (exchange: CcxtExchangeLike, pair: string) => void
  gracePeriodMs?: number
  baseBackoffMs?: number
  maxBackoffMs?: number
  maxBackoffExponent?: number
  stableResetMs?: number
  /** 0 disables the watchdog. */
  livenessTimeoutMs?: number
  backfillRetryDelayMs?: number
  random?: () => number
  now?: () => number
  /** Defaults to the shared wakeMonitor; null opts out. */
  wakeSource?: WakeSource | null
  onReconnectScheduled?: (delayMs: number, attempt: number, key: string) => void
  onError?: (scope: string, error: unknown) => void
}

type Sub = {
  key: string
  channel: WatchChannel
  pair: string
  symbol: string
  timeframe: string
  callbacks: Map<number, (data: unknown) => void>
  buffer: CandleBuffer | null
  /** Last frame delivered, replayed synchronously to a late joiner. */
  cached: unknown
  running: boolean
  attempt: number
  /** When the current uninterrupted run of successes began. */
  firstSuccessAt: number | null
  immediateReentries: number
}

export class CcxtStreamHub {
  private subs = new Map<string, Sub>()
  private nextCallbackId = 0
  private destroyed = false
  private country = ''
  private lastInboundAt = 0
  private livenessTimer: ReturnType<typeof setInterval> | null = null
  private graceTimer: ReturnType<typeof setTimeout> | null = null
  private releaseWake: (() => void) | null = null
  /** Backoff sleeps that a wake event can cut short. */
  private sleepers = new Set<() => void>()

  constructor(private readonly opts: CcxtStreamHubOptions) {
    const source = opts.wakeSource === undefined ? wakeMonitor : opts.wakeSource
    this.releaseWake = source?.subscribe(() => this.handleWake()) ?? null
  }

  /** Raw inbound frame seen on the socket — the liveness signal. */
  noteInbound(): void {
    this.lastInboundAt = this.now()
  }

  /**
   * A REST-only caller finished with the exchange. Without this a lone
   * `market-data:history` probe — which the terminal fans across every venue
   * to answer "does THIS venue list this pair" — would build a ccxt instance
   * per venue and hold all of them forever. Arms the same grace timer a stream
   * release does, so an instance that nothing came back for is dropped.
   */
  touchIdle(): void {
    if (this.destroyed || this.subs.size > 0) return
    this.startGrace()
  }

  /**
   * Register `callback` under a channel/pair(/timeframe) key and return a
   * SYNCHRONOUS release. The wire work starts on the first acquire of a key;
   * later acquires share the loop and get an immediate replay of whatever the
   * key already holds.
   */
  acquire(
    request: { channel: WatchChannel; pair: string; timeframe?: string },
    country: string,
    callback: (data: unknown) => void,
  ): () => void {
    const pair = request.pair.trim().replace(/[/_]/g, '-').toUpperCase()
    const timeframe = request.timeframe ?? ''
    const key = `${request.channel}:${pair}${timeframe ? `:${timeframe}` : ''}`

    if (this.setCountry(country)) void this.forceReconnect('region')
    this.cancelGrace()

    let sub = this.subs.get(key)
    const isNew = sub === undefined
    if (!sub) {
      sub = {
        key,
        channel: request.channel,
        pair,
        symbol: toCcxtSymbol(pair),
        timeframe,
        callbacks: new Map(),
        buffer: request.channel === 'candles' ? new CandleBuffer() : null,
        cached: null,
        running: true,
        attempt: 0,
        firstSuccessAt: null,
        immediateReentries: 0,
      }
      this.subs.set(key, sub)
    }

    const id = this.nextCallbackId++
    sub.callbacks.set(id, callback)
    const current = sub

    if (isNew) {
      this.startLiveness()
      void this.runLoop(current)
      if (current.channel === 'candles') this.startBackfill(current)
    } else {
      this.replay(current, callback)
    }

    let released = false
    return () => {
      if (released) return
      released = true
      const entry = this.subs.get(key)
      if (!entry || !entry.callbacks.delete(id)) return
      if (entry.callbacks.size > 0) return
      entry.running = false
      this.subs.delete(key)
      this.unwatch(entry)
      if (this.subs.size === 0) this.startGrace()
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    for (const sub of this.subs.values()) sub.running = false
    this.subs.clear()
    this.wakeSleepers()
    this.stopLiveness()
    this.cancelGrace()
    this.releaseWake?.()
    this.releaseWake = null
    await this.opts.host.destroy()
  }

  // ── Region ─────────────────────────────────────────────────────────────

  private setCountry(country: string): boolean {
    this.country = country
    return this.opts.host.setCountry(country)
  }

  // ── The loop ───────────────────────────────────────────────────────────

  private async runLoop(sub: Sub): Promise<void> {
    while (!this.destroyed && sub.running) {
      let lease: { exchange: CcxtExchangeLike; generation: number }
      try {
        lease = await this.opts.host.acquire()
        if (!sub.running || this.destroyed) return
        this.opts.primeMarkets?.(lease.exchange, sub.pair)
      } catch (error) {
        if (!sub.running || this.destroyed) return
        this.opts.onError?.(`${sub.key}:acquire`, error)
        await this.backoff(sub)
        continue
      }

      try {
        const payload = await this.watchOnce(lease.exchange, sub)
        // A release, a destroy or a retired generation while the promise was
        // in flight: the data belongs to a subscription or a socket nobody is
        // listening to any more.
        if (!sub.running || this.destroyed) return
        if (lease.generation !== this.opts.host.generation) continue

        this.noteInbound()
        sub.immediateReentries = 0
        if (sub.firstSuccessAt === null) sub.firstSuccessAt = this.now()
        else if (this.now() - sub.firstSuccessAt >= this.stableResetMs()) {
          sub.attempt = 0
        }
        if (payload !== null) this.deliver(sub, payload)
      } catch (error) {
        if (!sub.running || this.destroyed) return
        sub.firstSuccessAt = null

        // A close WE asked for (liveness, wake, region change) rejects every
        // pending watch with a typed error. That is the restart working, not a
        // fault — re-enter at once so the new socket opens without a delay.
        if (
          isClosedByUser(error) &&
          sub.immediateReentries < MAX_IMMEDIATE_REENTRIES
        ) {
          sub.immediateReentries++
          // Yield so a close that somehow repeats can never spin the loop
          // synchronously.
          await this.sleep(0)
          continue
        }

        this.opts.onError?.(sub.key, error)
        await this.backoff(sub)
      }
    }
  }

  private async watchOnce(
    exchange: CcxtExchangeLike,
    sub: Sub,
  ): Promise<unknown> {
    if (sub.channel === 'candles') {
      const rows = await exchange.watchOHLCV(sub.symbol, sub.timeframe)
      return this.buildCandleUpdate(sub, rows)
    }
    if (sub.channel === 'ticker') {
      const raw = await exchange.watchTicker(sub.symbol)
      return { type: 'ticker' as const, ticker: parseCcxtTicker(raw) }
    }
    if (sub.channel === 'orderbook') {
      const book = await exchange.watchOrderBook(
        sub.symbol,
        this.opts.venue.orderbookDepth,
      )
      // Copied here, immediately: `book` is the live instance and the next
      // frame rewrites it in place.
      return {
        type: 'snapshot' as const,
        bids: parseCcxtBookLevels(book.bids),
        asks: parseCcxtBookLevels(book.asks),
        ts: ccxtBookTimestamp(book),
      }
    }
    const raw = await exchange.watchTrades(sub.symbol)
    const trades: Array<Trade> = []
    for (const entry of raw) {
      const trade = parseCcxtTrade(entry)
      if (trade) trades.push(trade)
    }
    if (trades.length === 0) return null
    return { type: 'update' as const, trades }
  }

  /**
   * ccxt resolves a DELTA slice, not the buffer — normally one forming bar,
   * two across a bar boundary. Each row goes through the shared CandleBuffer
   * (upsert-or-append, 5-entry late scan) and out as an `update`; `snapshot`
   * stays reserved for the REST backfill, which is what the terminal gates
   * live updates behind.
   */
  private buildCandleUpdate(
    sub: Sub,
    rows: Array<Array<number | string | undefined>>,
  ): unknown {
    const candles: Array<Candle> = []
    for (const row of rows) {
      const candle = parseCcxtOhlcv(row)
      if (!candle) continue
      sub.buffer?.push(candle)
      candles.push(candle)
    }
    if (candles.length === 0) return null
    return { type: 'update' as const, candles }
  }

  private deliver(sub: Sub, payload: unknown): void {
    if (sub.channel !== 'trades') sub.cached = payload
    this.emit(sub.key, payload)
  }

  private emit(key: string, payload: unknown): void {
    const sub = this.subs.get(key)
    if (!sub) return
    for (const callback of sub.callbacks.values()) callback(payload)
  }

  /**
   * A late subscriber on a warm key must not stare at an empty pane until the
   * next frame. Candles replay the whole buffer as a `snapshot` (the terminal
   * will not accept updates before one arrives); ticker and orderbook replay
   * their last frame. Trades deliberately do not — a replayed print would be
   * a duplicate execution in the tape.
   */
  private replay(sub: Sub, callback: (data: unknown) => void): void {
    if (sub.channel === 'candles') {
      const candles = sub.buffer?.snapshot() ?? []
      if (candles.length > 0) callback({ type: 'snapshot', candles })
      return
    }
    if (sub.cached !== null) callback(sub.cached)
  }

  private startBackfill(sub: Sub): void {
    const fetchHistory = this.opts.backfill
    if (!fetchHistory) return
    const country = this.country
    backfillCandles({
      fetch: () =>
        fetchHistory(sub.pair, sub.timeframe, BACKFILL_LIMIT, country),
      isLive: () => this.subs.get(sub.key) === sub,
      apply: (candles) => {
        sub.buffer?.load(candles)
        const snapshot = sub.buffer?.snapshot() ?? candles
        this.emit(sub.key, { type: 'snapshot', candles: snapshot })
      },
      ...(this.opts.backfillRetryDelayMs !== undefined
        ? { retryDelayMs: this.opts.backfillRetryDelayMs }
        : {}),
    })
  }

  /**
   * Best-effort wire unsubscribe. Only Binance of the two PoC venues declares
   * `unWatch*`; OKX does not, and there the channel simply keeps arriving into
   * a loop nobody reads until the grace-period close. Rejections are expected
   * (ccxt rejects the in-flight watch with `UnsubscribeError`) and ignored.
   */
  private unwatch(sub: Sub): void {
    const exchange = this.opts.host.peek()
    if (!exchange) return
    const call =
      sub.channel === 'candles'
        ? exchange.has['unWatchOHLCV'] === true
          ? () => exchange.unWatchOHLCV?.(sub.symbol, sub.timeframe)
          : null
        : sub.channel === 'ticker'
          ? exchange.has['unWatchTicker'] === true
            ? () => exchange.unWatchTicker?.(sub.symbol)
            : null
          : sub.channel === 'orderbook'
            ? exchange.has['unWatchOrderBook'] === true
              ? () => exchange.unWatchOrderBook?.(sub.symbol)
              : null
            : exchange.has['unWatchTrades'] === true
              ? () => exchange.unWatchTrades?.(sub.symbol)
              : null
    if (!call) return
    try {
      void Promise.resolve(call()).catch(() => {})
    } catch {
      // A synchronous throw from an unsubscribe is never worth surfacing.
    }
  }

  // ── Backoff ────────────────────────────────────────────────────────────

  private stableResetMs(): number {
    return this.opts.stableResetMs ?? DEFAULT_STABLE_RESET_MS
  }

  private async backoff(sub: Sub): Promise<void> {
    const base = this.opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS
    const max = this.opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS
    const exponent =
      this.opts.maxBackoffExponent ?? DEFAULT_MAX_BACKOFF_EXPONENT
    const random = this.opts.random ?? Math.random

    const cap = Math.min(base * 2 ** Math.min(sub.attempt, exponent), max)
    // Equal jitter: half deterministic, half random — spreads the reconnect
    // stampede when every client loses the same endpoint at once.
    const delay = cap / 2 + random() * (cap / 2)
    this.opts.onReconnectScheduled?.(delay, sub.attempt, sub.key)
    sub.attempt++
    await this.sleep(delay)
  }

  /** Sleep that a wake event can cut short. */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        this.sleepers.delete(finish)
        resolve()
      }
      const timer = setTimeout(finish, ms)
      this.sleepers.add(finish)
    })
  }

  private wakeSleepers(): void {
    for (const wake of [...this.sleepers]) wake()
    this.sleepers.clear()
  }

  // ── Liveness, wake, grace ──────────────────────────────────────────────

  private now(): number {
    return (this.opts.now ?? Date.now)()
  }

  private livenessTimeoutMs(): number {
    return (
      this.opts.livenessTimeoutMs ??
      this.opts.venue.livenessTimeoutMs ??
      DEFAULT_LIVENESS_TIMEOUT_MS
    )
  }

  private startLiveness(): void {
    if (this.livenessTimer) return
    const timeoutMs = this.livenessTimeoutMs()
    if (timeoutMs <= 0) return
    this.lastInboundAt = this.now()
    const checkMs = Math.min(
      Math.max(timeoutMs / LIVENESS_CHECK_DIVISOR, MIN_LIVENESS_CHECK_MS),
      MAX_LIVENESS_CHECK_MS,
      timeoutMs,
    )
    const timer = setInterval(() => {
      if (this.subs.size === 0) return
      if (!this.opts.host.peek()) return
      if (this.now() - this.lastInboundAt <= timeoutMs) return
      // Silent past the point where a pong or a market frame was due. ccxt
      // cannot tell us this in a browser, so the close is ours to make.
      void this.forceReconnect('silence')
    }, checkMs)
    const unrefable = timer as unknown as { unref?: () => void }
    unrefable.unref?.()
    this.livenessTimer = timer
  }

  private stopLiveness(): void {
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer)
      this.livenessTimer = null
    }
  }

  /**
   * The host was frozen (lid closed, VM paused) or the network came back. Any
   * socket that survived on paper is almost certainly half-open, and the
   * backoff we were sitting in was measured against a clock that stopped.
   */
  private handleWake(): void {
    if (this.destroyed || this.subs.size === 0) return
    for (const sub of this.subs.values()) {
      sub.attempt = 0
      sub.immediateReentries = 0
    }
    this.wakeSleepers()
    void this.forceReconnect('wake')
  }

  /**
   * Discard the exchange so every loop re-enters against a fresh one. The
   * inbound clock is reset first, or the watchdog fires again immediately
   * while the new socket is still handshaking.
   */
  private async forceReconnect(reason: string): Promise<void> {
    if (this.destroyed) return
    this.lastInboundAt = this.now()
    try {
      await this.opts.host.close()
    } catch (error) {
      this.opts.onError?.(`reconnect:${reason}`, error)
    }
  }

  private startGrace(): void {
    this.cancelGrace()
    const graceMs = this.opts.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null
      if (this.subs.size > 0 || this.destroyed) return
      this.stopLiveness()
      void this.opts.host.close()
    }, graceMs)
    const unrefable = this.graceTimer as unknown as { unref?: () => void }
    unrefable.unref?.()
  }

  private cancelGrace(): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer)
      this.graceTimer = null
    }
  }
}

/**
 * `exchange.close()` sets `ExchangeClosedByUser` on every client before closing
 * it, so a pending watch rejects with a typed, distinguishable error. Matched
 * by name rather than `instanceof` — the bridge never imports ccxt's error
 * classes (that would pull the barrel into the graph) and a bundler may hand
 * out a second copy anyway.
 */
function isClosedByUser(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'ExchangeClosedByUser' ||
      error.message.includes('closedByUser'))
  )
}
