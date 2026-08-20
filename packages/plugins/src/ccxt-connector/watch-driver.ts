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
import type { CcxtExchangeLike, CcxtTickerLike, CcxtVenueConfig } from './types'
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
/**
 * Releases with no wire unsubscribe tolerated before the exchange is rebuilt.
 *
 * Several venues (Kraken and Upbit expose no `unWatch*` at all; OKX,
 * Crypto.com and Gate cover only some channels; Coinbase's is suppressed as
 * actively harmful — see `CcxtVenueConfig.suppressUnwatch`), and the grace
 * close only arms at zero subscriptions — which never happens while a chart
 * is open. Every pair the user visits would leave its
 * channels subscribed for the whole session, each frame still parsed on the
 * main thread and appended to ccxt's per-symbol caches. Past this many
 * orphans, one forced rebuild clears clients, subscriptions and caches
 * wholesale, at the cost of a single reconnect for the live keys. Twelve is
 * three full pair switches on a four-channel venue: rare enough that the
 * reconnect blip is not part of ordinary switching, soon enough that a
 * long session cannot accumulate dozens of dead channels.
 */
const ORPHANED_CHANNEL_REBUILD_THRESHOLD = 12
/**
 * How long past the threshold the orphan rebuild waits before firing. The
 * threshold is crossed DURING a pair switch (releases are what orphan
 * channels), and rebuilding right then tears down the new pair's streams
 * mid-handshake — measured live 2026-08-14 as a +700-900 ms first-frame
 * penalty on every third switch (OKX, Crypto.com). Five seconds later the
 * panes are painted from their seeds and caches, the reconnect happens
 * against a settled subscription set, and the brief re-watch is invisible.
 */
const ORPHAN_REBUILD_SETTLE_MS = 5_000
/**
 * How long a retired ticker-fan set keeps its wire subscription before the
 * `unWatchTickers` cleanup fires. The new set's SUBSCRIBE goes out first (the
 * next loop iteration), so the delay is what guarantees new-before-old and
 * turns a set change into a handover instead of a gap. One second is far
 * beyond the subscribe round trip and far below what a duplicate ticker
 * stream costs.
 */
const FAN_RETIRE_DELAY_MS = 1_000
/**
 * Pause after a fan set change before resubscribing, so a burst of chip
 * mounts (a watchlist hydrating row by row) coalesces into one SUBSCRIBE
 * instead of one socket per row.
 */
const FAN_COALESCE_MS = 25
/**
 * Poll cadence while every fan pair is unresolvable (markets still loading,
 * or the whole watchlist alien to this venue) — the loop waits rather than
 * exits, and each retry re-primes markets.
 */
const FAN_UNRESOLVABLE_RETRY_MS = 2_000
/**
 * Trade ids remembered per trades key. A reconnect rebuilds the ccxt instance
 * with an empty trade cache, and venues whose subscribe opens with a snapshot
 * (Coinbase's `market_trades`) hand the whole snapshot back as fresh updates —
 * without memory, those prints re-enter the tape and, on trade-derived candle
 * venues, re-add their volume to the forming bar. Sized well above any
 * venue's snapshot depth; the memory is a few KB per subscribed tape.
 */
const RECENT_TRADE_IDS = 500
/**
 * Prints fetched for the tape's REST first-paint seed (`seedTrades`
 * venues). Well under `RECENT_TRADE_IDS`, so every seeded id fits in the
 * dedup memory that fences the stream's overlap.
 */
const TRADES_SEED_LIMIT = 100

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
  /**
   * Pairlens pair → ccxt unified symbol. Defaults to the spot mapping.
   *
   * The seam exists for the futures runtime, whose pairs carry a settlement
   * leg (`BTC-USDT-USDT` → `BTC/USDT:USDT`) that the spot mapper cannot
   * produce: `toCcxtSymbol` is `replace('-', '/')`, which rewrites only the
   * FIRST dash. Everything downstream reads `sub.symbol`, so this one call
   * site is the whole conversion.
   */
  toSymbol?: (pair: string) => string
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
  /** Test knob for `FAN_RETIRE_DELAY_MS`. */
  fanRetireDelayMs?: number
  /** Test knob for `ORPHAN_REBUILD_SETTLE_MS`. */
  orphanRebuildSettleMs?: number
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
  /**
   * Candles keys only: the REST backfill has not applied yet, so the buffer
   * holds nothing but the frames the stream has pushed since subscribe —
   * one forming bar, typically. See `replay` for why that matters.
   */
  awaitingBackfill: boolean
  /** Last frame delivered, replayed synchronously to a late joiner. */
  cached: unknown
  /** Trades keys only: delivered ids, so a reconnect snapshot cannot replay. */
  recentTradeIds: Set<string> | null
  recentTradeIdOrder: Array<string> | null
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
  /** Releases the venue could not unsubscribe on the wire, per instance. */
  private orphanedChannels = 0
  private orphanedGeneration = -1
  /** Pending deferred orphan rebuild — see `noteOrphanedChannel`. */
  private orphanRebuildTimer: ReturnType<typeof setTimeout> | null = null
  private releaseWake: (() => void) | null = null
  /** Backoff sleeps that a wake event can cut short. */
  private sleepers = new Set<() => void>()

  // ── Ticker fan (venues with `batchTickers`) ────────────────────────────
  /** Bumped whenever the set of ticker subscriptions changes. */
  private fanEpoch = 0
  private fanLoopActive = false
  /** Resolvers parked on the epoch race in `runFanLoop`. */
  private fanWakers = new Set<() => void>()
  /** Reconnect state, shaped like a Sub's slice so `backoff` is shared. */
  private fanState = {
    key: 'ticker:*',
    attempt: 0,
    firstSuccessAt: null as number | null,
    immediateReentries: 0,
  }
  /** The built exchange turned out to lack `watchTickers` — fall back. */
  private fanUnavailable = false
  /**
   * Last ticker OBJECT delivered per symbol. ccxt replaces the cache entry
   * on every frame, so identity inequality IS the "new frame" signal — no
   * timestamp parsing, no per-venue field knowledge.
   */
  private fanLastSeen = new Map<string, unknown>()
  /** Symbols whose first paint was (or is being) seeded over REST. */
  private fanSeeded = new Set<string>()

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
        symbol: (this.opts.toSymbol ?? toCcxtSymbol)(pair),
        timeframe,
        callbacks: new Map(),
        buffer: request.channel === 'candles' ? new CandleBuffer() : null,
        awaitingBackfill:
          request.channel === 'candles' && this.opts.backfill !== undefined,
        cached: null,
        recentTradeIds: request.channel === 'trades' ? new Set() : null,
        recentTradeIdOrder: request.channel === 'trades' ? [] : null,
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
      if (this.fansTickers(current.channel)) {
        this.bumpFanEpoch()
        this.ensureFanLoop()
      } else {
        void this.runLoop(current)
      }
      if (current.channel === 'candles') this.startBackfill(current)
      if (
        current.channel === 'ticker' &&
        this.opts.venue.seedTicker === true &&
        !this.fansTickers('ticker')
      ) {
        // Batch venues never take this path — the fan runs its own batched
        // REST seed over the whole set.
        void this.seedTickerFirstPaint(current)
      }
      if (
        current.channel === 'orderbook' &&
        (this.opts.venue.seedOrderBook ?? false) !== false
      ) {
        void this.seedBookFirstPaint(current)
      }
      if (
        current.channel === 'trades' &&
        (this.opts.venue.seedTrades ?? false) !== false
      ) {
        void this.seedTradesFirstPaint(current)
      }
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
      if (this.fansTickers(entry.channel)) {
        // The fan owns the wire state for every ticker: the next iteration
        // resubscribes the shrunken set and retires the old one wholesale. A
        // per-symbol `unWatchTicker` here would target a subscription hash
        // that never existed individually — on Binance that OPENS a fresh
        // socket just to send an UNSUBSCRIBE for a stream it never carried.
        // The seed mark goes with it, so a pair revisited later gets its
        // first paint re-seeded instead of waiting on the stream.
        this.fanSeeded.delete(entry.symbol)
        this.bumpFanEpoch()
      } else {
        this.unwatch(entry)
      }
      if (this.subs.size === 0) this.startGrace()
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    for (const sub of this.subs.values()) sub.running = false
    this.subs.clear()
    this.wakeFan()
    this.wakeSleepers()
    this.stopLiveness()
    this.cancelGrace()
    if (this.orphanRebuildTimer) {
      clearTimeout(this.orphanRebuildTimer)
      this.orphanRebuildTimer = null
    }
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

        sub.immediateReentries = 0
        if (sub.firstSuccessAt === null) sub.firstSuccessAt = this.now()
        else if (this.now() - sub.firstSuccessAt >= this.stableResetMs()) {
          sub.attempt = 0
        }
        if (payload !== null) {
          // Only a resolution that carried data counts as inbound — the
          // Kraken guard parks a losing timeframe with `sleep(); return []`,
          // and letting that empty tick refresh the clock would keep the
          // silence watchdog satisfied forever. Real frames already feed the
          // clock through the host's `handleMessage` wrap regardless.
          this.noteInbound()
          this.deliver(sub, payload)
        }
      } catch (error) {
        if (!sub.running || this.destroyed) return
        sub.firstSuccessAt = null

        // A close or an unsubscribe WE asked for rejects the pending watch
        // with a typed error. That is our own teardown working, not a fault —
        // re-enter at once so the socket (or the subscription) comes back
        // without a delay. See isSelfInflictedRejection.
        if (
          isSelfInflictedRejection(error) &&
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
    const trades = this.dedupeTrades(sub, raw)
    if (trades.length === 0) return null
    return { type: 'update' as const, trades }
  }

  /**
   * Parse a batch of raw trades, registering each id in the key's dedup
   * memory and dropping the ones already delivered — shared between the
   * stream loop and the REST tape seed, which is exactly why neither can
   * double a print the other delivered first.
   */
  private dedupeTrades(
    sub: Sub,
    raw: Array<Record<string, unknown>>,
  ): Array<Trade> {
    const trades: Array<Trade> = []
    for (const entry of raw) {
      const trade = parseCcxtTrade(entry)
      if (!trade) continue
      if (sub.recentTradeIds && sub.recentTradeIdOrder) {
        if (sub.recentTradeIds.has(trade.id)) continue
        sub.recentTradeIds.add(trade.id)
        sub.recentTradeIdOrder.push(trade.id)
        if (sub.recentTradeIdOrder.length > RECENT_TRADE_IDS) {
          const evicted = sub.recentTradeIdOrder.shift()
          if (evicted !== undefined) sub.recentTradeIds.delete(evicted)
        }
      }
      trades.push(trade)
    }
    return trades
  }

  // ── Ticker fan ─────────────────────────────────────────────────────────

  /** Whether this channel's wire work is owned by the batched ticker loop. */
  private fansTickers(channel: WatchChannel): boolean {
    return (
      channel === 'ticker' &&
      this.opts.venue.batchTickers === true &&
      !this.fanUnavailable
    )
  }

  private fanSubs(): Array<Sub> {
    const out: Array<Sub> = []
    for (const sub of this.subs.values()) {
      if (sub.channel === 'ticker') out.push(sub)
    }
    return out
  }

  /** Current fan symbol set, deduped, in subscription order. */
  private fanSymbols(): Array<string> {
    const seen = new Set<string>()
    for (const sub of this.fanSubs()) seen.add(sub.symbol)
    return [...seen]
  }

  /**
   * The fan subs whose symbols the exchange can actually resolve right now.
   *
   * The watchlist is user data — it can hold a pair this venue does not
   * list (a recent from another venue's asset class), and `watchTickers`
   * resolves EVERY symbol before subscribing, so one unlisted pair would
   * throw the whole batched call into the error loop and freeze every chip
   * on the venue (measured live 2026-08-14: one alien recent froze the
   * Binance marquee). While the synthetic seeds are in place the pair
   * resolves and simply never ticks; once the real table lands and evicts
   * the seed, it must be excluded — its chip shows '—', exactly what a
   * per-symbol loop would have produced. Membership is re-checked every
   * iteration, so a pair the venue lists later joins the set by itself.
   */
  private fanResolvableSubs(exchange: CcxtExchangeLike): Array<Sub> {
    return this.fanSubs().filter(
      (sub) => exchange.markets?.[sub.symbol] !== undefined,
    )
  }

  private bumpFanEpoch(): void {
    this.fanEpoch++
    this.wakeFan()
  }

  private wakeFan(): void {
    for (const wake of [...this.fanWakers]) wake()
    this.fanWakers.clear()
  }

  private ensureFanLoop(): void {
    if (this.fanLoopActive) return
    this.fanLoopActive = true
    void this.runFanLoop().finally(() => {
      this.fanLoopActive = false
      // A ticker acquired between the loop deciding to exit and this reset
      // would otherwise wait forever for a loop that never restarts. The
      // `fanUnavailable` guard matters: the fallback exit hands its subs to
      // individual loops and MUST NOT restart, or it spawns duplicates
      // forever.
      if (
        !this.destroyed &&
        !this.fanUnavailable &&
        this.fanSymbols().length > 0
      ) {
        this.ensureFanLoop()
      }
    })
  }

  /**
   * One `watchTickers` loop carrying EVERY ticker subscription — the batched
   * counterpart of `runLoop`, sharing its reconnect policy. The await is
   * raced against an epoch bump so a watchlist change re-enters promptly with
   * the new set instead of waiting for a quiet pair to tick.
   */
  private async runFanLoop(): Promise<void> {
    while (!this.destroyed) {
      let lease: { exchange: CcxtExchangeLike; generation: number }
      try {
        lease = await this.opts.host.acquire()
        if (this.destroyed) return
      } catch (error) {
        if (this.destroyed) return
        this.opts.onError?.(`${this.fanState.key}:acquire`, error)
        await this.backoff(this.fanState)
        continue
      }

      // Read the set AFTER the acquire's await: a page load registers its
      // whole watchlist in one synchronous flush, and the microtask boundary
      // above is what lets all of it land before the first SUBSCRIBE — one
      // call for the lot instead of one for the first chip plus a
      // resubscribe for the rest.
      if (this.fanSubs().length === 0) return
      for (const sub of this.fanSubs()) {
        this.opts.primeMarkets?.(lease.exchange, sub.pair)
      }
      const subs = this.fanResolvableSubs(lease.exchange)
      const symbols = [...new Set(subs.map((sub) => sub.symbol))]
      if (symbols.length === 0) {
        // Every wanted pair is currently unresolvable (markets still
        // loading, or all of them alien to this venue). Poll rather than
        // exit — an exit here would fight the restart in `ensureFanLoop`.
        await this.sleep(FAN_UNRESOLVABLE_RETRY_MS)
        continue
      }
      this.seedFanFirstPaint(lease.exchange, subs)

      if (typeof lease.exchange.watchTickers !== 'function') {
        // The flag promised a method the class does not have. Demote every
        // ticker to its own `watchTicker` loop — degraded (one socket per
        // pair on Binance) beats silent.
        this.fanUnavailable = true
        for (const sub of this.fanSubs()) void this.runLoop(sub)
        return
      }

      const epochAtCall = this.fanEpoch
      let cancelEpochWaker: (() => void) | null = null
      try {
        const epochChanged = new Promise<null>((resolve) => {
          const wake = () => resolve(null)
          this.fanWakers.add(wake)
          cancelEpochWaker = () => this.fanWakers.delete(wake)
        })
        const raw = await Promise.race([
          lease.exchange.watchTickers(symbols),
          epochChanged,
        ])
        if (this.destroyed) return

        if (this.fanEpoch !== epochAtCall) {
          // The set changed under the pending watch. Coalesce a mount burst,
          // resubscribe (next iteration), and retire the superseded set once
          // the new SUBSCRIBE has had time to land.
          await this.sleep(FAN_COALESCE_MS)
          this.retireFanSet(lease.exchange, symbols)
          continue
        }
        if (lease.generation !== this.opts.host.generation) continue

        this.fanState.immediateReentries = 0
        if (this.fanState.firstSuccessAt === null) {
          this.fanState.firstSuccessAt = this.now()
        } else if (
          this.now() - this.fanState.firstSuccessAt >=
          this.stableResetMs()
        ) {
          this.fanState.attempt = 0
        }
        if (raw !== null) {
          this.noteInbound()
          this.deliverFan(raw, lease.exchange)
        }
      } catch (error) {
        if (this.destroyed) return
        this.fanState.firstSuccessAt = null
        if (
          isSelfInflictedRejection(error) &&
          this.fanState.immediateReentries < MAX_IMMEDIATE_REENTRIES
        ) {
          this.fanState.immediateReentries++
          await this.sleep(0)
          continue
        }
        this.opts.onError?.(this.fanState.key, error)
        await this.backoff(this.fanState)
      } finally {
        // The race leaves its loser's waker parked; without this, one waker
        // accumulates per delivered frame.
        ;(cancelEpochWaker as (() => void) | null)?.()
      }
    }
  }

  /**
   * First-paint seed for the fan. A venue's per-symbol ticker stream emits
   * only when the symbol has an UPDATE — a quiet pair's first WS frame can
   * be tens of seconds out (measured 25 s on DOT-USDT, 2026-08-14), which
   * is a watchlist chip showing '—' for that long on a fresh load. One
   * batched REST `fetchTickers(symbols)` (weight 2 on Binance for up to 20
   * symbols) paints every unseeded chip at REST latency instead; a WS frame
   * that beats the response wins via the `cached === null` guard. Failure
   * clears the marks so the next loop iteration retries.
   */
  private seedFanFirstPaint(
    exchange: CcxtExchangeLike,
    subs: Array<Sub>,
  ): void {
    if (typeof exchange.fetchTickers !== 'function') return
    const unseeded = subs.filter(
      (sub) => sub.cached === null && !this.fanSeeded.has(sub.symbol),
    )
    if (unseeded.length === 0) return
    for (const sub of unseeded) this.fanSeeded.add(sub.symbol)
    const symbols = [...new Set(unseeded.map((sub) => sub.symbol))]
    void (async () => {
      try {
        const raw = await exchange.fetchTickers(symbols)
        for (const sub of unseeded) {
          if (sub.cached !== null) continue
          if (this.subs.get(sub.key) !== sub) continue
          const entry = raw[sub.symbol]
          if (entry === undefined) continue
          this.deliver(sub, {
            type: 'ticker' as const,
            ticker: parseCcxtTicker(entry),
          })
        }
      } catch {
        for (const sub of unseeded) this.fanSeeded.delete(sub.symbol)
      }
    })()
  }

  /**
   * First-paint seed for a book key on a `seedOrderBook` venue (see the
   * flag's doc for why the stream alone is seconds late on Binance). Runs in
   * parallel with the watch loop's own acquire — the host shares one build —
   * and delivers only while the key has never painted: the stream's synced
   * snapshot always wins from the first live frame onward.
   */
  private async seedBookFirstPaint(sub: Sub): Promise<void> {
    try {
      const lease = await this.opts.host.acquire()
      if (this.destroyed || this.subs.get(sub.key) !== sub) return
      if (typeof lease.exchange.fetchOrderBook !== 'function') return
      this.opts.primeMarkets?.(lease.exchange, sub.pair)
      // A numeric flag overrides the depth: some venues' REST book accepts
      // different limits than their WS subscription (see the flag's doc).
      const seedFlag = this.opts.venue.seedOrderBook
      const book = await lease.exchange.fetchOrderBook(
        sub.symbol,
        typeof seedFlag === 'number'
          ? seedFlag
          : this.opts.venue.orderbookDepth,
      )
      if (this.destroyed || this.subs.get(sub.key) !== sub) return
      if (sub.cached !== null) return
      this.deliver(sub, {
        type: 'snapshot' as const,
        bids: parseCcxtBookLevels(book.bids),
        asks: parseCcxtBookLevels(book.asks),
        ts: ccxtBookTimestamp(book),
      })
    } catch {
      // Purely a first-paint accelerant — the watch loop owns correctness,
      // and its own snapshot is already on the way.
    }
  }

  /**
   * First-paint seed for a per-symbol ticker key on a `seedTicker` venue —
   * the singular counterpart of `seedFanFirstPaint`, for venues whose ticker
   * stream emits only when the pair trades. One REST `fetchTicker` paints
   * the price header at REST latency; a WS frame that beats it wins via the
   * `cached === null` guard, and failure is silent (accelerant only).
   */
  private async seedTickerFirstPaint(sub: Sub): Promise<void> {
    try {
      const lease = await this.opts.host.acquire()
      if (this.destroyed || this.subs.get(sub.key) !== sub) return
      const exchange = lease.exchange
      // The venue may route the seed at a cheaper endpoint than the unified
      // fetchTicker — see `seedTickerFetch` (MEXC's weight-25 ticker/24hr
      // starved the chart backfill queued behind it).
      const venueFetch = this.opts.venue.seedTickerFetch
      let raw: CcxtTickerLike
      if (venueFetch) {
        this.opts.primeMarkets?.(exchange, sub.pair)
        raw = await venueFetch(exchange, sub.symbol)
      } else if (typeof exchange.fetchTicker === 'function') {
        this.opts.primeMarkets?.(exchange, sub.pair)
        raw = await exchange.fetchTicker(sub.symbol)
      } else {
        return
      }
      if (this.destroyed || this.subs.get(sub.key) !== sub) return
      if (sub.cached !== null) return
      this.deliver(sub, {
        type: 'ticker' as const,
        ticker: parseCcxtTicker(raw),
      })
    } catch {
      // The stream owns correctness; its next frame paints the header.
    }
  }

  /**
   * First-paint seed for a tape key on a `seedTrades` venue: the stream
   * opens EMPTY on these venues, so a REST page of recent prints fills the
   * pane immediately. Stands down entirely once any live print has been
   * delivered (the id memory doubles as that signal), and every seeded id
   * enters the same memory, so the stream's overlap dedupes to nothing.
   */
  private async seedTradesFirstPaint(sub: Sub): Promise<void> {
    try {
      // Serial-throttler venues push the seed past the subscribe burst so
      // the chart backfill keeps the first queue slot — see the flag's doc.
      const delayMs = this.opts.venue.seedTradesDelayMs ?? 0
      if (delayMs > 0) {
        await this.sleep(delayMs)
        if (this.destroyed || this.subs.get(sub.key) !== sub) return
        if (sub.recentTradeIds && sub.recentTradeIds.size > 0) return
      }
      const lease = await this.opts.host.acquire()
      if (this.destroyed || this.subs.get(sub.key) !== sub) return
      if (typeof lease.exchange.fetchTrades !== 'function') return
      this.opts.primeMarkets?.(lease.exchange, sub.pair)
      const seedFlag = this.opts.venue.seedTrades
      const raw = await lease.exchange.fetchTrades(
        sub.symbol,
        undefined,
        typeof seedFlag === 'number' ? seedFlag : TRADES_SEED_LIMIT,
      )
      if (this.destroyed || this.subs.get(sub.key) !== sub) return
      if (sub.recentTradeIds && sub.recentTradeIds.size > 0) return
      const trades = this.dedupeTrades(sub, raw)
      if (trades.length === 0) return
      this.deliver(sub, { type: 'update' as const, trades })
    } catch {
      // Accelerant only — the stream fills the tape as prints occur.
    }
  }

  /**
   * Route ticker frames to their subscriptions — the resolved entry AND a
   * sweep of ccxt's ticker cache.
   *
   * The sweep is not an optimization, it is where most frames come from:
   * Binance pushes every subscribed `@ticker` once a second in one burst,
   * the socket dispatches the burst's frames back to back, and ccxt resolves
   * a parked future only for the FIRST — every later frame merely rewrites
   * `exchange.tickers[symbol]` (the future it would resolve is already gone
   * until the loop re-awaits). Delivering only the resolved entry starves
   * whichever symbols consistently lose that race — measured live 2026-08-14:
   * two of twelve watchlist pairs took 20+ s to first paint. The cache entry
   * is replaced per frame, so object identity per symbol is a complete "new
   * data" signal, and one sweep after any resolution drains the whole burst.
   */
  private deliverFan(
    raw: Record<string, unknown>,
    exchange: CcxtExchangeLike,
  ): void {
    const cache = exchange.tickers
    const live = new Set<string>()
    for (const sub of this.subs.values()) {
      if (sub.channel !== 'ticker') continue
      live.add(sub.symbol)
      const entry = raw[sub.symbol] ?? cache?.[sub.symbol]
      if (entry === undefined || this.fanLastSeen.get(sub.symbol) === entry) {
        continue
      }
      this.fanLastSeen.set(sub.symbol, entry)
      this.deliver(sub, {
        type: 'ticker' as const,
        ticker: parseCcxtTicker(entry as CcxtTickerLike),
      })
    }
    // Symbols released from the fan should not pin their last frame forever.
    for (const symbol of this.fanLastSeen.keys()) {
      if (!live.has(symbol)) this.fanLastSeen.delete(symbol)
    }
  }

  /**
   * Unsubscribe a superseded fan set, delayed so the replacement SUBSCRIBE
   * lands first (new-before-old — a set change is a handover, not a gap).
   * Skipped when the instance was discarded meanwhile (the socket died with
   * it) or when the live set is byte-identical to the retiree — Binance
   * memoizes the subscription hash, so unsubscribing an identical set would
   * tear down the LIVE subscription.
   */
  private retireFanSet(
    exchange: CcxtExchangeLike,
    retired: Array<string>,
  ): void {
    if (typeof exchange.unWatchTickers !== 'function') return
    const retiredKey = retired.join(',')
    void (async () => {
      await this.sleep(this.opts.fanRetireDelayMs ?? FAN_RETIRE_DELAY_MS)
      if (this.destroyed) return
      if (this.opts.host.peek() !== exchange) return
      // Compare against the RESOLVABLE set — the same filter the loop
      // subscribes with. An epoch bump whose only change is an unresolvable
      // pair leaves the wire set identical, and the raw comparison would
      // call that a change and unsubscribe the live streams.
      const live = [
        ...new Set(this.fanResolvableSubs(exchange).map((sub) => sub.symbol)),
      ]
      if (live.join(',') === retiredKey) return
      try {
        await exchange.unWatchTickers?.(retired)
      } catch {
        // Expected: ccxt rejects the in-flight watch future on unsubscribe.
      }
    })()
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
   *
   * A candles key whose backfill is still in flight replays NOTHING. Its
   * buffer holds only the bar or two the stream has pushed since subscribe,
   * and a `snapshot` is a claim about history: the terminal seeds its chart
   * from the first one and applies every later frame as a live tick, so a
   * two-bar replay left the chart on two bars for the life of the stream.
   * The pending backfill emits to every callback on the key, this one
   * included, so the late joiner loses nothing but the head start.
   */
  private replay(sub: Sub, callback: (data: unknown) => void): void {
    if (sub.channel === 'candles') {
      if (sub.awaitingBackfill) return
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
        sub.awaitingBackfill = false
        const snapshot = sub.buffer?.snapshot() ?? candles
        this.emit(sub.key, { type: 'snapshot', candles: snapshot })
      },
      // Nothing more is coming, so stop holding late joiners back — the
      // stream's own bars are all this key will ever have.
      onExhausted: () => {
        sub.awaitingBackfill = false
      },
      ...(this.opts.backfillRetryDelayMs !== undefined
        ? { retryDelayMs: this.opts.backfillRetryDelayMs }
        : {}),
    })
  }

  /**
   * Best-effort wire unsubscribe. Where the venue declares no `unWatch*`, the
   * channel keeps arriving into a loop nobody reads — so those releases are
   * COUNTED, and past `ORPHANED_CHANNEL_REBUILD_THRESHOLD` the exchange is
   * rebuilt to shed them (see the constant's doc). Rejections are expected
   * (ccxt rejects the in-flight watch with `UnsubscribeError`) and ignored.
   */
  private unwatch(sub: Sub): void {
    const exchange = this.opts.host.peek()
    if (!exchange) return
    // Some venues' unWatch* is worse than none: Coinbase's poisons the whole
    // instance (see the flag's doc). Orphan-count instead — the threshold
    // rebuild sheds the channels wholesale.
    if (this.opts.venue.suppressUnwatch === true) {
      this.noteOrphanedChannel()
      return
    }
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
    if (!call) {
      this.noteOrphanedChannel()
      return
    }
    try {
      void Promise.resolve(call()).catch(() => {})
    } catch {
      // A synchronous throw from an unsubscribe is never worth surfacing.
    }
  }

  /**
   * A release left its channel subscribed. The count is per instance — a
   * rebuild (any reason) starts a clean socket, so the generation stamp
   * resets it — and a rebuild is only worth one when someone is still
   * listening: with no subscribers the grace close is already on its way.
   *
   * The rebuild itself is DEFERRED, not immediate: the threshold is always
   * crossed by the releases of a pair switch, and firing right then tears
   * down the streams the new pair just opened (see the settle constant's
   * doc). At fire time the rebuild re-checks everything — a wake/region
   * rebuild in the interim already shed the channels (generation moved),
   * and an emptied hub belongs to the grace close.
   */
  private noteOrphanedChannel(): void {
    const generation = this.opts.host.generation
    if (generation !== this.orphanedGeneration) {
      this.orphanedGeneration = generation
      this.orphanedChannels = 0
    }
    this.orphanedChannels++
    if (
      this.orphanedChannels >= ORPHANED_CHANNEL_REBUILD_THRESHOLD &&
      this.orphanRebuildTimer === null
    ) {
      const generationAtSchedule = generation
      const timer = setTimeout(() => {
        this.orphanRebuildTimer = null
        if (this.destroyed || this.subs.size === 0) return
        if (this.opts.host.generation !== generationAtSchedule) return
        this.orphanedChannels = 0
        void this.forceReconnect('orphaned-channels')
      }, this.opts.orphanRebuildSettleMs ?? ORPHAN_REBUILD_SETTLE_MS)
      const unrefable = timer as unknown as { unref?: () => void }
      unrefable.unref?.()
      this.orphanRebuildTimer = timer
    }
  }

  // ── Backoff ────────────────────────────────────────────────────────────

  private stableResetMs(): number {
    return this.opts.stableResetMs ?? DEFAULT_STABLE_RESET_MS
  }

  // Takes the slice both a Sub and the fan's state carry, so the two loops
  // share one policy.
  private async backoff(sub: { attempt: number; key: string }): Promise<void> {
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
    this.fanState.attempt = 0
    this.fanState.immediateReentries = 0
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
 * A rejection THIS driver caused, rather than a fault worth backing off from.
 * Two shapes, both typed by ccxt and both matched by name rather than
 * `instanceof` — the bridge never imports ccxt's error classes (that would
 * pull the barrel into the graph) and a bundler may hand out a second copy
 * anyway:
 *
 * - `ExchangeClosedByUser`: `exchange.close()` sets it on every client before
 *   closing it (liveness, wake, region change), so every pending watch
 *   rejects with it.
 * - `UnsubscribeError`: `cleanUnsubscription` rejects the pending watch for a
 *   channel whose unsubscribe the venue has just confirmed. A release
 *   followed by a re-acquire of the SAME key inside the unsubscribe round
 *   trip — switch timeframe and switch back, which is exactly what a user
 *   does while comparing them — lands the confirmation on the NEW loop's
 *   watch. Treated as a fault it cost a backoff each time, and because the
 *   attempt counter only resets after 30 s of delivery, a few quick toggles
 *   escalated it into a multi-second stall the user reads as a frozen chart.
 *   Re-entering at once re-sends the SUBSCRIBE the confirmation just cleared.
 */
function isSelfInflictedRejection(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'ExchangeClosedByUser' ||
      error.name === 'UnsubscribeError' ||
      error.message.includes('closedByUser'))
  )
}
