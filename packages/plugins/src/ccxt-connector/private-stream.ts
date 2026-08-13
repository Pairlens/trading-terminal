// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The authenticated half of the bridge: `watchOrders` and `watchBalance` turned
 * into the `CexPrivateWsClient` the shell expects.
 *
 * It is the same shape as the public `CcxtStreamHub` — a `while (running) await
 * watch*()` loop with equal-jitter backoff, a wake listener and an
 * inbound-silence watchdog — for the same reasons: ccxt's `watch*` is a pull
 * API over a socket it owns, `WsClient` never reconnects itself, ccxt's
 * `backoffDelay` is hardcoded to 0, and its stall detector is dead in a browser
 * because the ping loop degrades to `lastPong = now`. Reproduced here rather
 * than shared with the hub because the hub is keyed by market-data
 * subscriptions and this has exactly two loops with no keys at all; the shared
 * part is the policy, which is written down in one place (`ReconnectingWsSession`)
 * and quoted in both.
 *
 * Two deliberate differences from the public side:
 *
 * - **Its own exchange instance.** The private socket must die when the
 *   terminal unsubscribes from `trading:orders`, and the REST trading instance
 *   must not die with it. Separate hosts make `destroy()` unambiguous.
 * - **No `watchMyTrades`.** Fills reach the terminal through order updates —
 *   `PositionLedger.applyFill` is driven from the order-update subscription, so
 *   a second fill stream would double-count realized PnL. The trade stream adds
 *   nothing the unified order does not already carry in `filled`/`average`.
 *
 * Where ccxt has no `watchBalance` at all (Coinbase declares it `false`,
 * Bitvavo does not declare it), the balance side degrades to a gentle REST
 * poll. That is a documented deviation from parity item 69 ("there is no
 * balance/order poller"): the native connectors get balance pushes from a
 * channel ccxt has not wired, and a stale balance in the trade panel is a
 * worse failure than one signed request every 15 s.
 */

import { wakeMonitor } from '@pairlens/market-engine/wake-monitor'
import { CcxtExchangeHost, toCcxtCredentials } from './exchange-host'
import {
  normalizeCcxtBalances,
  normalizeCcxtOrder,
  redactSecrets,
} from './orders'
import type { CcxtExchangeLike, CcxtVenueConfig } from './types'
import type { CexCredentials, CexPrivateWsClient } from '../cex-connector'
import type { WakeSource } from '@pairlens/market-engine/wake-monitor'

// Mirrors ReconnectingWsSession / CcxtStreamHub — see ws-session.ts for why
// each number is what it is.
const DEFAULT_BASE_BACKOFF_MS = 1_000
const DEFAULT_MAX_BACKOFF_MS = 30_000
const DEFAULT_MAX_BACKOFF_EXPONENT = 5
const DEFAULT_STABLE_RESET_MS = 30_000
const DEFAULT_LIVENESS_TIMEOUT_MS = 90_000
const LIVENESS_CHECK_DIVISOR = 3
const MIN_LIVENESS_CHECK_MS = 1_000
const MAX_LIVENESS_CHECK_MS = 10_000
/**
 * Cadence for the REST fallbacks. Deliberately unhurried: it only runs while a
 * private subscription is open, and on the venues that need it (Coinbase) a
 * signed request costs rate-limit budget the order path may want.
 */
const DEFAULT_POLL_MS = 15_000
/** See CcxtStreamHub — a close we asked for is a restart, not a fault. */
const MAX_IMMEDIATE_REENTRIES = 3

export type CcxtPrivateStreamOptions = {
  venue: CcxtVenueConfig
  /** Give the authed instance a market table without a signed `loadMarkets`. */
  ensureMarkets: (exchange: CcxtExchangeLike) => Promise<void>
  onError?: (scope: string, error: unknown) => void
  /** Injectable so the lifecycle suite can drive a fake exchange. */
  createHost?: (
    options: ConstructorParameters<typeof CcxtExchangeHost>[0],
  ) => CcxtExchangeHost
  baseBackoffMs?: number
  maxBackoffMs?: number
  maxBackoffExponent?: number
  stableResetMs?: number
  /** 0 disables the watchdog. */
  livenessTimeoutMs?: number
  pollIntervalMs?: number
  random?: () => number
  now?: () => number
  /** Defaults to the shared wakeMonitor; null opts out. */
  wakeSource?: WakeSource | null
}

type LoopState = {
  attempt: number
  firstSuccessAt: number | null
  immediateReentries: number
}

/** One authenticated ccxt instance, two loops, and the policy around them. */
export class CcxtPrivateStream implements CexPrivateWsClient<CexCredentials> {
  private host: CcxtExchangeHost | null = null
  private credentials: CexCredentials | null = null
  private running = false
  private onOrderUpdate: ((update: unknown) => void) | null = null
  private onBalances: ((balances: unknown) => void) | null = null
  private lastInboundAt = 0
  private livenessTimer: ReturnType<typeof setInterval> | null = null
  private releaseWake: (() => void) | null = null
  private sleepers = new Set<() => void>()

  constructor(private readonly opts: CcxtPrivateStreamOptions) {}

  connect(
    credentials: CexCredentials,
    country: string,
    paper: boolean,
    onOrderUpdate: (update: unknown) => void,
    onBalances: (balances: unknown) => void,
  ): void {
    // The shell creates one client per slot and connects it once; a second
    // connect would leave the first pair of loops running against a host
    // nobody can reach any more.
    if (this.running) return

    const mapped = toCcxtCredentials(credentials)
    if (!mapped) {
      this.opts.onError?.('connect', new Error('No credentials configured'))
      return
    }

    this.running = true
    this.credentials = credentials
    this.onOrderUpdate = onOrderUpdate
    this.onBalances = onBalances
    this.lastInboundAt = this.now()

    const create = this.opts.createHost ?? ((o) => new CcxtExchangeHost(o))
    const host = create({
      venue: this.opts.venue,
      credentials: mapped,
      // The account's home entity (venues that declare one — OKX). The demo
      // sockets are regional too: an EEA key logging in on the global demo
      // host gets 60032, so `applyPaperUrls` needs the entity as much as the
      // live path does.
      entity: credentials['entity'] ?? '',
      paper,
      onInbound: () => this.noteInbound(),
      onError: (scope, error) => this.warn(scope, error),
    })
    host.setCountry(country)
    this.host = host

    const source =
      this.opts.wakeSource === undefined ? wakeMonitor : this.opts.wakeSource
    this.releaseWake = source?.subscribe(() => this.handleWake()) ?? null

    void this.runOrders(host)
    void this.runBalances(host)
  }

  destroy(): void {
    this.running = false
    this.onOrderUpdate = null
    this.onBalances = null
    this.credentials = null
    this.wakeSleepers()
    this.stopLiveness()
    this.releaseWake?.()
    this.releaseWake = null
    const host = this.host
    this.host = null
    if (host) void host.destroy()
  }

  // ── Orders ───────────────────────────────────────────────────────────────

  private async runOrders(host: CcxtExchangeHost): Promise<void> {
    const state: LoopState = {
      attempt: 0,
      firstSuccessAt: null,
      immediateReentries: 0,
    }

    while (this.running && this.host === host) {
      let lease
      try {
        lease = await host.acquire()
        if (!this.isCurrent(host)) return
        await this.opts.ensureMarkets(lease.exchange)
        if (!this.isCurrent(host)) return
      } catch (error) {
        if (!this.isCurrent(host)) return
        this.warn('orders:acquire', error)
        await this.backoff(state)
        continue
      }

      const exchange = lease.exchange
      const streams = exchange.has['watchOrders'] === true
      if (streams) this.startLiveness()

      try {
        const rows = streams
          ? await requireMethod(exchange.watchOrders, exchange, 'watchOrders')()
          : await this.pollOpenOrders(exchange)
        if (!this.isCurrent(host)) return
        if (lease.generation !== host.generation) continue

        this.noteInbound()
        this.noteSuccess(state)
        for (const raw of rows) {
          this.onOrderUpdate?.(normalizeCcxtOrder(raw))
        }
      } catch (error) {
        if (!this.isCurrent(host)) return
        state.firstSuccessAt = null
        if (this.isRestart(error, state)) {
          await this.sleep(0)
          continue
        }
        this.warn('orders', error)
        await this.backoff(state)
      }
    }
  }

  /**
   * Fallback for a venue with no `watchOrders`. Every venue in the fleet has
   * one today, so this exists to keep a `has`-driven bridge honest rather than
   * to serve a known case — resting orders re-delivered on a timer are
   * idempotent in the order store, keyed as they are by order id.
   */
  private async pollOpenOrders(
    exchange: CcxtExchangeLike,
  ): Promise<Array<Record<string, unknown>>> {
    const fetch = exchange.fetchOpenOrders
    if (typeof fetch !== 'function') {
      await this.sleep(this.pollMs())
      return []
    }
    const rows = await fetch.call(exchange)
    await this.sleep(this.pollMs())
    return rows
  }

  // ── Balances ─────────────────────────────────────────────────────────────

  private async runBalances(host: CcxtExchangeHost): Promise<void> {
    const state: LoopState = {
      attempt: 0,
      firstSuccessAt: null,
      immediateReentries: 0,
    }

    while (this.running && this.host === host) {
      let lease
      try {
        lease = await host.acquire()
        if (!this.isCurrent(host)) return
        await this.opts.ensureMarkets(lease.exchange)
        if (!this.isCurrent(host)) return
      } catch (error) {
        if (!this.isCurrent(host)) return
        this.warn('balance:acquire', error)
        await this.backoff(state)
        continue
      }

      const exchange = lease.exchange
      try {
        const raw =
          exchange.has['watchBalance'] === true
            ? await requireMethod(
                exchange.watchBalance,
                exchange,
                'watchBalance',
              )()
            : await this.pollBalance(exchange)
        if (!this.isCurrent(host)) return
        if (lease.generation !== host.generation) continue

        this.noteSuccess(state)
        if (raw) this.onBalances?.(normalizeCcxtBalances(raw))
      } catch (error) {
        if (!this.isCurrent(host)) return
        state.firstSuccessAt = null
        if (this.isRestart(error, state)) {
          await this.sleep(0)
          continue
        }
        this.warn('balance', error)
        await this.backoff(state)
      }
    }
  }

  /** Coinbase (and anything else ccxt cannot stream balances for). */
  private async pollBalance(
    exchange: CcxtExchangeLike,
  ): Promise<Record<string, unknown> | null> {
    const fetch = exchange.fetchBalance
    if (typeof fetch !== 'function') {
      await this.sleep(this.pollMs())
      return null
    }
    const raw = await fetch.call(exchange)
    await this.sleep(this.pollMs())
    return raw
  }

  // ── Policy ───────────────────────────────────────────────────────────────

  private isCurrent(host: CcxtExchangeHost): boolean {
    return this.running && this.host === host
  }

  private noteSuccess(state: LoopState): void {
    state.immediateReentries = 0
    if (state.firstSuccessAt === null) {
      state.firstSuccessAt = this.now()
      return
    }
    // The counter resets only after a genuinely stable run, so a socket that
    // connects and immediately drops keeps climbing the backoff curve.
    if (this.now() - state.firstSuccessAt >= this.stableResetMs()) {
      state.attempt = 0
    }
  }

  /**
   * `exchange.close()` rejects every pending watch with a typed error before
   * the socket goes. That is the liveness watchdog, a wake event or a region
   * change doing its job, so the loop re-enters at once — but only a few times
   * in a row, or a wedged instance becomes a spin.
   */
  private isRestart(error: unknown, state: LoopState): boolean {
    if (state.immediateReentries >= MAX_IMMEDIATE_REENTRIES) return false
    const closed =
      error instanceof Error &&
      (error.name === 'ExchangeClosedByUser' ||
        error.message.includes('closedByUser'))
    if (!closed) return false
    state.immediateReentries++
    return true
  }

  private async backoff(state: LoopState): Promise<void> {
    const base = this.opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS
    const max = this.opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS
    const exponent =
      this.opts.maxBackoffExponent ?? DEFAULT_MAX_BACKOFF_EXPONENT
    const random = this.opts.random ?? Math.random
    const cap = Math.min(base * 2 ** Math.min(state.attempt, exponent), max)
    // Equal jitter — half deterministic, half random.
    const delay = cap / 2 + random() * (cap / 2)
    state.attempt++
    await this.sleep(delay)
  }

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

  private noteInbound(): void {
    this.lastInboundAt = this.now()
  }

  private now(): number {
    return (this.opts.now ?? Date.now)()
  }

  private stableResetMs(): number {
    return this.opts.stableResetMs ?? DEFAULT_STABLE_RESET_MS
  }

  private pollMs(): number {
    return (
      this.opts.pollIntervalMs ??
      this.opts.venue.privatePollMs ??
      DEFAULT_POLL_MS
    )
  }

  private livenessTimeoutMs(): number {
    return (
      this.opts.livenessTimeoutMs ??
      this.opts.venue.livenessTimeoutMs ??
      DEFAULT_LIVENESS_TIMEOUT_MS
    )
  }

  /**
   * Armed only once a real socket is in play. A private feed is quiet by
   * nature — an idle account produces no order events — so the budget is the
   * venue's own keep-alive derivation, and the pong frames ccxt exchanges count
   * as inbound because `handleMessage` is wrapped upstream of the parser.
   */
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
      if (!this.running) return
      const host = this.host
      if (!host || !host.peek()) return
      if (this.now() - this.lastInboundAt <= timeoutMs) return
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

  private handleWake(): void {
    if (!this.running) return
    this.wakeSleepers()
    void this.forceReconnect('wake')
  }

  private async forceReconnect(reason: string): Promise<void> {
    const host = this.host
    if (!host || !this.running) return
    // Reset first, or the watchdog fires again while the new socket is still
    // handshaking.
    this.lastInboundAt = this.now()
    try {
      await host.close()
    } catch (error) {
      this.warn(`reconnect:${reason}`, error)
    }
  }

  private warn(scope: string, error: unknown): void {
    const message = redactSecrets(
      error instanceof Error ? error.message : String(error),
      this.credentials,
    )
    this.opts.onError?.(`private:${scope}`, new Error(message))
  }
}

export function createCcxtPrivateStream(
  options: CcxtPrivateStreamOptions,
): CexPrivateWsClient<CexCredentials> {
  return new CcxtPrivateStream(options)
}

function requireMethod<T extends (...args: Array<never>) => unknown>(
  method: T | undefined,
  self: unknown,
  name: string,
): () => ReturnType<T> {
  if (typeof method !== 'function') {
    return () => {
      throw new Error(`ccxt exchange has no ${name}()`)
    }
  }
  return () => (method as () => ReturnType<T>).call(self as never)
}
