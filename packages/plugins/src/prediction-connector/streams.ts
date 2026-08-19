// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Live market data for prediction venues, over two transports.
 *
 * The spot bridge's watch driver calls `exchange.watchOHLCV/watchTicker/
 * watchOrderBook/watchTrades` unconditionally. Neither prediction venue can
 * serve that shape:
 *
 * - **Kalshi is `pro: false`.** There is no `watch*` on the class at all, so
 *   every channel is a REST poll. It is also desktop-only (its REST hosts 403
 *   any foreign `Origin`), which means the poll volume lands on the Rust HTTP
 *   client rather than a browser tab, and a 4–5 s cadence against a 200 ms
 *   rate limit is comfortable.
 * - **Polymarket streams ticker, book and trades but has no `watchOHLCV`.**
 *   So candles are seeded from REST and then built forward from the trade
 *   stream, the same `TradeCandleAggregator` the spot bridge uses for Coinbase
 *   and Upbit.
 *
 * Both transports share one loop shell and therefore one set of policies:
 * equal-jitter backoff on failure, a generation guard so work belonging to a
 * discarded instance is dropped rather than delivered, and a hard stop on
 * release. The difference is only what the loop body awaits and whether it
 * sleeps afterwards — a `watch*` call blocks until a frame arrives, a poll
 * returns at once and has to wait.
 */

import { sortCandlesAscending } from '@pairlens/market-engine/candle-buffer'
import { TradeCandleAggregator } from '../ccxt-connector/trade-candle-aggregator'
import {
  parsePredictionBookLevels,
  parsePredictionOhlcvBatch,
  parsePredictionTicker,
  parsePredictionTrade,
  predictionBookTimestamp,
} from './parser'
import type { Candle, Timeframe } from '@pairlens/shared/types'
import type { Trade } from '@pairlens/market-engine/types'
import type { PredictionExchangeHost } from './exchange-host'
import type { OutcomeResolver } from './outcomes'
import type { PredictionExchangeLike, PredictionVenueConfig } from './types'

const BASE_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000
const MAX_BACKOFF_EXPONENT = 5
/** Consecutive successes after which the failure counter is forgiven. */
const STABLE_RESET_MS = 30_000

/**
 * How long a `watch*` await may sit without resolving before the socket behind
 * it is presumed dead.
 *
 * ccxt cannot detect this for us. Its own stall detector degrades to
 * `this.lastPong = now` in a browser, so it can never fire, and a `watch*`
 * promise for a half-open socket — the shape a laptop lid or a middlebox idle
 * timeout leaves behind — simply never settles. Without a race the run loop
 * parks on that await forever: no error, so no backoff and no reconnect, and
 * the book, tape and chart freeze while the UI still reads "connected".
 *
 * 90 s matches the spot driver's default. A venue with a known keepalive
 * cadence overrides it (`livenessTimeoutMs`) — Polymarket pings every 10 s and
 * the venue answers, so a silent minute there really is a dead socket.
 */
const DEFAULT_LIVENESS_TIMEOUT_MS = 90_000

/** Marks a watch await that outlived its liveness budget. */
class StreamSilenceError extends Error {
  constructor(key: string, timeoutMs: number) {
    super(`${key}: no frame in ${Math.round(timeoutMs / 1000)}s`)
    this.name = 'StreamSilenceError'
  }
}

/** Fallback poll cadences, ms. Overridable per venue. */
const DEFAULT_POLL = {
  candles: 5_000,
  ticker: 4_000,
  orderbook: 4_000,
  trades: 5_000,
} as const

/** Bars requested by a candle poll once the snapshot has landed. */
const CANDLE_POLL_LIMIT = 3

/** Bars requested for the initial chart snapshot. */
const CANDLE_SEED_LIMIT = 300

/** Prints requested per trade poll / seed. */
const TRADES_LIMIT = 50

/** Trade ids retained per subscription for dedupe. */
const TRADE_DEDUPE_RING = 500

/**
 * How often the aggregated forming bar is reconciled against the venue's own
 * REST candles. The trade tape is authoritative for the close but not for the
 * volume of a bar that opened before we connected.
 */
const CANDLE_RECONCILE_MS = 30_000

type Channel = 'candles' | 'ticker' | 'orderbook' | 'trades'

type Sub = {
  key: string
  channel: Channel
  pair: string
  timeframe: Timeframe
  callbacks: Set<(data: unknown) => void>
  running: boolean
  attempt: number
  firstSuccessAt: number | null
  /** Candle channel only, and only on venues that build bars from trades. */
  aggregator: TradeCandleAggregator | null
  lastReconcileAt: number
  /** Trades channel only: recently delivered ids, oldest first. */
  seenTrades: Set<string> | null
}

export type PredictionStreamHubOptions = {
  venue: PredictionVenueConfig
  host: PredictionExchangeHost
  resolver: OutcomeResolver
  onError?: (scope: string, error: unknown) => void
  /** Injectable for tests — the loops are otherwise wall-clock bound. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export class PredictionStreamHub {
  private readonly subs = new Map<string, Sub>()
  private destroyed = false
  /** Last raw inbound frame, the clock the liveness watchdog measures. */
  private lastInboundAt: number

  constructor(private readonly opts: PredictionStreamHubOptions) {
    this.lastInboundAt = this.now()
  }

  /**
   * Region for this hub's requests. A change closes the instance rather than
   * mutating it: the REST base is baked into every signature ccxt has already
   * computed, and the geo classifier reads the country off the host.
   */
  setCountry(country: string): void {
    if (this.opts.host.setCountry(country)) void this.opts.host.close()
  }

  subscribeCandles(
    pair: string,
    timeframe: string,
    callback: (data: unknown) => void,
  ): () => void {
    const tf = this.assertTimeframe(timeframe)
    return this.attach('candles', pair, tf, callback)
  }

  subscribeTicker(pair: string, callback: (data: unknown) => void): () => void {
    return this.attach('ticker', pair, '1m', callback)
  }

  subscribeOrderbook(
    pair: string,
    callback: (data: unknown) => void,
  ): () => void {
    return this.attach('orderbook', pair, '1m', callback)
  }

  subscribeTrades(pair: string, callback: (data: unknown) => void): () => void {
    return this.attach('trades', pair, '1m', callback)
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    for (const sub of this.subs.values()) sub.running = false
    this.subs.clear()
    await this.opts.host.destroy()
  }

  /**
   * Reject a timeframe the venue does not publish, BEFORE any network work.
   *
   * ccxt's prediction `fetchOHLCV` throws `BadRequest` naming the raw interval,
   * which reaches the chart as an unexplained failure. The terminal offers a
   * fixed nine-timeframe list unless a manifest says otherwise, so this is a
   * reachable user action rather than a wiring bug.
   */
  private assertTimeframe(timeframe: string): Timeframe {
    const supported = this.opts.venue.timeframes
    if (!supported.includes(timeframe as Timeframe)) {
      throw new Error(
        `${this.opts.venue.displayName} charts ${supported.join(', ')} only: '${timeframe}' is not available on this venue`,
      )
    }
    return timeframe as Timeframe
  }

  private attach(
    channel: Channel,
    pair: string,
    timeframe: Timeframe,
    callback: (data: unknown) => void,
  ): () => void {
    if (this.destroyed) return () => {}
    const key =
      channel === 'candles'
        ? `candles:${pair}:${timeframe}`
        : `${channel}:${pair}`

    let sub = this.subs.get(key)
    if (!sub) {
      sub = {
        key,
        channel,
        pair,
        timeframe,
        callbacks: new Set(),
        running: true,
        attempt: 0,
        firstSuccessAt: null,
        aggregator: null,
        lastReconcileAt: 0,
        seenTrades: channel === 'trades' ? new Set() : null,
      }
      this.subs.set(key, sub)
      void this.runLoop(sub)
    }
    sub.callbacks.add(callback)

    const active = sub
    return () => {
      active.callbacks.delete(callback)
      if (active.callbacks.size > 0) return
      active.running = false
      if (this.subs.get(key) === active) this.subs.delete(key)
    }
  }

  private async runLoop(sub: Sub): Promise<void> {
    const pollMs = this.pollInterval(sub.channel)
    const polling = this.opts.venue.streaming === 'poll'
    let first = true

    while (!this.destroyed && sub.running) {
      let exchange: PredictionExchangeLike
      let generation: number
      try {
        const lease = await this.opts.host.acquire()
        exchange = lease.exchange
        generation = lease.generation
      } catch (error) {
        if (!sub.running || this.destroyed) return
        this.opts.onError?.(`${sub.key}:acquire`, error)
        await this.backoff(sub)
        continue
      }
      if (!sub.running || this.destroyed) return

      try {
        const outcome = await this.opts.resolver.resolve(exchange, sub.pair)
        if (!sub.running || this.destroyed) return
        const payload = await this.withLiveness(
          sub,
          this.readOnce(exchange, sub, outcome, first),
        )
        if (!sub.running || this.destroyed) return
        // A close while the read was in flight: the frame belongs to a socket
        // nobody is listening to any more.
        if (generation !== this.opts.host.generation) continue

        first = false
        if (sub.firstSuccessAt === null) sub.firstSuccessAt = this.now()
        else if (this.now() - sub.firstSuccessAt >= STABLE_RESET_MS) {
          sub.attempt = 0
        }
        if (payload !== null) this.deliver(sub, payload)
      } catch (error) {
        if (!sub.running || this.destroyed) return
        sub.firstSuccessAt = null
        this.opts.onError?.(sub.key, error)
        // A silent socket is not a failed request: the next `watch*` on the
        // SAME instance would re-attach to the same dead client, because ccxt
        // keys `exchange.clients` by URL and never reconnects one itself. So
        // the instance is discarded — which bumps the generation and makes
        // every other channel's in-flight await stale too, exactly as the spot
        // driver's inbound-silence watchdog does.
        if (error instanceof StreamSilenceError) {
          await this.forceReconnect(sub.key, generation)
        }
        await this.backoff(sub)
        continue
      }

      // A `watch*` call already blocked until a frame arrived; sleeping after
      // it would throttle the stream to the poll cadence.
      if (polling || sub.channel === 'candles') {
        if (!(await this.pause(sub, polling ? pollMs : 0))) return
      }
    }
  }

  /**
   * One read for a channel. `null` means "nothing new" — a poll that returned
   * only prints already delivered, which must not refresh the tape.
   */
  private async readOnce(
    exchange: PredictionExchangeLike,
    sub: Sub,
    outcome: string,
    first: boolean,
  ): Promise<unknown> {
    if (sub.channel === 'candles') {
      return this.readCandles(exchange, sub, outcome, first)
    }

    if (sub.channel === 'ticker') {
      const raw =
        this.opts.venue.streaming === 'watch' && exchange.watchTicker
          ? await exchange.watchTicker(outcome)
          : await exchange.fetchTicker(outcome)
      return { type: 'ticker' as const, ticker: parsePredictionTicker(raw) }
    }

    if (sub.channel === 'orderbook') {
      const depth = this.opts.venue.orderbookDepth
      const book =
        this.opts.venue.streaming === 'watch' && exchange.watchOrderBook
          ? await exchange.watchOrderBook(outcome, depth)
          : await exchange.fetchOrderBook(outcome, depth)
      // Copied immediately: a watched book is the live instance and the next
      // frame rewrites it in place.
      return {
        type: 'snapshot' as const,
        bids: parsePredictionBookLevels(book.bids),
        asks: parsePredictionBookLevels(book.asks),
        ts: predictionBookTimestamp(book),
      }
    }

    const raw =
      this.opts.venue.streaming === 'watch' && exchange.watchTrades
        ? await exchange.watchTrades(outcome)
        : await exchange.fetchTrades(outcome, undefined, TRADES_LIMIT)
    const trades = this.dedupeTrades(sub, raw)
    if (trades.length === 0) return null
    return { type: 'update' as const, trades }
  }

  /**
   * Candles, by whichever route the venue leaves open.
   *
   * Poll venues re-read the last few bars: the venue's own aggregation is
   * authoritative, and three bars covers a boundary crossing that happened
   * while a request was in flight.
   *
   * Watch venues have no candle socket, so the first pass seeds the aggregator
   * from REST and the trade stream carries it forward. The periodic reconcile
   * is what keeps the volume of a bar that opened before we connected honest —
   * the tape only knows about prints since the socket opened.
   */
  private async readCandles(
    exchange: PredictionExchangeLike,
    sub: Sub,
    outcome: string,
    first: boolean,
  ): Promise<unknown> {
    if (this.opts.venue.streaming === 'poll') {
      const rows = await exchange.fetchOHLCV(
        outcome,
        sub.timeframe,
        undefined,
        first ? CANDLE_SEED_LIMIT : CANDLE_POLL_LIMIT,
      )
      const candles = sortCandlesAscending(parsePredictionOhlcvBatch(rows))
      if (candles.length === 0) return null
      return first
        ? { type: 'snapshot' as const, candles }
        : { type: 'update' as const, candles }
    }

    if (first || sub.aggregator === null) {
      const rows = await exchange.fetchOHLCV(
        outcome,
        sub.timeframe,
        undefined,
        CANDLE_SEED_LIMIT,
      )
      const candles = sortCandlesAscending(parsePredictionOhlcvBatch(rows))
      sub.aggregator = new TradeCandleAggregator({ timeframe: sub.timeframe })
      sub.aggregator.seed(candles, [], this.now())
      sub.lastReconcileAt = this.now()
      if (candles.length === 0) return null
      return { type: 'snapshot' as const, candles }
    }

    if (this.now() - sub.lastReconcileAt >= CANDLE_RECONCILE_MS) {
      sub.lastReconcileAt = this.now()
      const rows = await exchange.fetchOHLCV(
        outcome,
        sub.timeframe,
        undefined,
        CANDLE_POLL_LIMIT,
      )
      const candles = sortCandlesAscending(parsePredictionOhlcvBatch(rows))
      sub.aggregator.seed(candles, [], this.now())
      if (candles.length > 0) return { type: 'update' as const, candles }
    }

    if (typeof exchange.watchTrades !== 'function') {
      throw new Error(
        `${this.opts.venue.displayName} has no trade stream to build candles from`,
      )
    }
    const raw = await exchange.watchTrades(outcome)
    const prints: Array<{ price: number; size: number; ts: number }> = []
    for (const entry of raw) {
      const trade = parsePredictionTrade(entry)
      if (trade) prints.push(trade)
    }
    if (prints.length === 0) return null
    const { forming, closed } = sub.aggregator.pushTrades(prints)
    const candles: Array<Candle> = [...closed]
    if (forming) candles.push(forming)
    if (candles.length === 0) return null
    return { type: 'update' as const, candles }
  }

  /**
   * Parse trades and drop the ones already delivered.
   *
   * A poll re-reads the same window every few seconds, so without this the
   * tape would repeat its whole tail on every tick; and the seed and the
   * stream on a watch venue overlap by construction.
   */
  private dedupeTrades(
    sub: Sub,
    raw: Array<Record<string, unknown>>,
  ): Array<Trade> {
    const seen = sub.seenTrades
    const out: Array<Trade> = []
    for (const entry of raw) {
      const trade = parsePredictionTrade(entry)
      if (!trade) continue
      if (seen) {
        if (seen.has(trade.id)) continue
        seen.add(trade.id)
      }
      out.push(trade)
    }
    if (seen) {
      while (seen.size > TRADE_DEDUPE_RING) {
        const oldest = seen.values().next()
        if (oldest.done) break
        seen.delete(oldest.value)
      }
    }
    return out
  }

  private deliver(sub: Sub, payload: unknown): void {
    for (const callback of sub.callbacks) {
      try {
        callback(payload)
      } catch (error) {
        // One bad consumer must not stop the loop feeding the others.
        this.opts.onError?.(`${sub.key}:deliver`, error)
      }
    }
  }

  /**
   * Raw inbound frame observed on this venue's socket.
   *
   * Wired from the host's `handleMessage` wrap, so it counts EVERY frame —
   * including the PONGs Polymarket answers its own 10 s text PING with, which
   * are invisible at the `watch*` level. That distinction is the whole point:
   * a market can legitimately go a minute without a ticker update, and a
   * watchdog that could not see pongs would tear down a perfectly healthy
   * socket on every quiet outcome.
   */
  noteInbound(): void {
    this.lastInboundAt = this.now()
  }

  /**
   * Bound a read by the venue's liveness budget.
   *
   * Only the streaming venues need it — a REST poll always settles, and its
   * transport timeout is ccxt's own (15 s, set on the instance).
   *
   * The budget is measured against raw inbound traffic rather than against this
   * await, so the rule is "the SOCKET has said nothing for `timeoutMs`", not
   * "this channel has produced no frame". The timer therefore re-arms whenever
   * the clock is fresh and only rejects once the silence is real.
   *
   * The losing `watch*` is left to settle on its own: rejecting the race cannot
   * cancel it, and the pre-attached catch keeps a late rejection from surfacing
   * as an unhandled rejection after the loop has already moved on.
   */
  private withLiveness<T>(sub: Sub, work: Promise<T>): Promise<T> {
    if (this.opts.venue.streaming !== 'watch') return work
    const timeoutMs = this.livenessTimeoutMs()
    if (timeoutMs <= 0) return work

    let timer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const guard = new Promise<never>((_resolve, reject) => {
      const arm = (delay: number): void => {
        timer = setTimeout(() => {
          if (settled) return
          const quietFor = this.now() - this.lastInboundAt
          if (quietFor < timeoutMs) {
            // Traffic arrived while we waited — re-arm for the remainder
            // rather than declaring a healthy socket dead.
            arm(timeoutMs - quietFor)
            return
          }
          reject(new StreamSilenceError(sub.key, timeoutMs))
        }, delay)
        // Never hold the process open on a watchdog alone.
        ;(timer as unknown as { unref?: () => void }).unref?.()
      }
      arm(timeoutMs)
    })
    work.catch(() => {})
    return Promise.race([work, guard]).finally(() => {
      settled = true
      if (timer !== undefined) clearTimeout(timer)
    }) as Promise<T>
  }

  private livenessTimeoutMs(): number {
    return this.opts.venue.livenessTimeoutMs ?? DEFAULT_LIVENESS_TIMEOUT_MS
  }

  /**
   * Discard the exchange so every channel re-enters against a fresh socket.
   *
   * Guarded on the generation the caller was holding: four channels sharing one
   * dead instance all time out within a moment of each other, and without the
   * guard the second, third and fourth would each tear down the replacement the
   * first just built.
   */
  private async forceReconnect(
    scope: string,
    generation: number,
  ): Promise<void> {
    if (this.destroyed) return
    if (generation !== this.opts.host.generation) return
    // Reset the clock BEFORE the close, or the watchdog fires again on the
    // replacement socket while it is still handshaking.
    this.noteInbound()
    try {
      await this.opts.host.close()
    } catch (error) {
      this.opts.onError?.(`${scope}:reconnect`, error)
    }
  }

  private pollInterval(channel: Channel): number {
    const configured = this.opts.venue.pollIntervals?.[channel]
    return typeof configured === 'number' && configured > 0
      ? configured
      : DEFAULT_POLL[channel]
  }

  /**
   * Equal jitter: half deterministic, half random. Spreads the retries of the
   * four channels a venue switch starts in the same tick, which would
   * otherwise reconnect in lockstep and hit the rate limiter together.
   */
  private async backoff(sub: Sub): Promise<void> {
    const exponent = Math.min(sub.attempt, MAX_BACKOFF_EXPONENT)
    const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS)
    sub.attempt++
    const delay = ceiling / 2 + Math.random() * (ceiling / 2)
    await this.pause(sub, delay)
  }

  /** Sleep, reporting whether the subscription is still worth continuing. */
  private async pause(sub: Sub, ms: number): Promise<boolean> {
    const sleep =
      this.opts.sleep ??
      ((delay: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, delay)))
    await sleep(ms)
    return sub.running && !this.destroyed
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now()
  }
}
