// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * ReconnectingWsSession — the shared connection plumbing under exchange WS
 * clients: one endpoint, one socket, owned lifecycle.
 *
 * Owns the parts every connector used to hand-roll (and drift on):
 * - connect gate: at most one in-flight connect, no connects after destroy
 * - reconnect backoff: exponential with equal jitter, and the attempt counter
 *   only resets after the connection has stayed up for `stableResetMs` — a
 *   connect that immediately drops keeps backing off instead of hot-looping
 * - application-level ping timer while connected
 * - liveness watchdog: a socket that stops delivering data is restarted even
 *   though it never fired `close` (see LIVENESS below)
 * - suspend/resume recovery via the shared WakeMonitor
 * - grace-period disconnect after the last subscription is released
 * - subscription registry with DEFINED multi-callback semantics (see below)
 * - revive + resubscribe of every registered subscription on (re)open
 *
 * LIVENESS: reconnect used to be exclusively close-driven, which silently
 * loses to the half-open socket — the state a laptop lid-close leaves behind.
 * The peer drops the TCP connection while the process is frozen, the local end
 * never sees a FIN/RST, and on resume the socket reports OPEN forever while
 * delivering nothing. Two independent guards close that hole: the WakeMonitor
 * (fast, event-driven, catches the suspend case explicitly) and an inbound
 * silence watchdog (slower, catches every other way a socket can go quiet —
 * a dropped route, a wedged proxy, a load balancer that forgot us).
 *
 * The watchdog needs a guaranteed inbound heartbeat to distinguish "dead
 * socket" from "quiet market", so it is only armed when one exists: a
 * configured `ping` (whose pong is inbound traffic) auto-arms it, and venues
 * whose server pushes heartbeats unprompted opt in with `livenessTimeoutMs`.
 * Without either signal it stays off rather than guess — a connector that
 * reconnects an illiquid pair every minute would be a worse bug than the one
 * this fixes.
 *
 * Multi-callback semantics: subscriptions are refcounted per key. The wire
 * subscribe is sent once when the first callback acquires a key; later
 * acquires of the same key share the entry (and its state) and just add a
 * callback; the wire unsubscribe is sent when the last callback releases.
 * This is the OKX-ticker behavior, promoted to the standard — the
 * alternative (replace-on-resubscribe, as Kraken did) silently killed the
 * first subscriber's stream when a second panel subscribed to the same
 * channel (the shipped watchlist bug).
 *
 * A session maps 1:1 to a WS endpoint. Clients with multiple endpoints (e.g.
 * OKX business + public) own one session per endpoint. Message parsing and
 * per-channel wire formats stay in the client; the session only moves bytes
 * and fans decoded payloads out to subscribers via `emit`.
 */

import { connectWs } from './ws-adapter'
import { wakeMonitor } from './wake-monitor'
import type { WsAdapterEvents, WsConnection, WsMessage } from './ws-adapter'
import type { WakeSource } from './wake-monitor'

// Keep the socket warm well past the last release: a trader flipping between
// venues (Binance → KuCoin → Binance) releases every key on each switch, and
// a short grace forced a full reconnect handshake (+ any bootstrap REST, e.g.
// KuCoin's token POST) on every flip back. One idle minute costs a few ping
// frames; a cold reconnect costs ~1-2s of blank UI.
const DEFAULT_GRACE_PERIOD_MS = 60_000
const DEFAULT_BASE_BACKOFF_MS = 1_000
const DEFAULT_MAX_BACKOFF_MS = 30_000
const DEFAULT_MAX_BACKOFF_EXPONENT = 5
const DEFAULT_STABLE_RESET_MS = 30_000

// Liveness watchdog. Derived from the ping interval when the caller doesn't
// pick a timeout: three missed pongs is decisive, and the floor keeps a chatty
// ping (KuCoin's can drop to ~18s) from arming a hair-trigger.
const LIVENESS_PING_MULTIPLIER = 3
const MIN_DERIVED_LIVENESS_TIMEOUT_MS = 45_000
// Check often enough that detection latency is a fraction of the timeout, but
// never faster than 1s — this runs for the life of every open socket.
const LIVENESS_CHECK_DIVISOR = 3
const MIN_LIVENESS_CHECK_MS = 1_000
const MAX_LIVENESS_CHECK_MS = 10_000

export type WsSessionConnect = (
  url: string,
  events: WsAdapterEvents,
) => Promise<WsConnection>

export type WsSessionOptions = {
  /**
   * Resolved at every (re)connect — regional endpoints can change between
   * connects, and some exchanges bootstrap the endpoint asynchronously
   * (e.g. KuCoin's token POST). A rejection is treated as a failed connect
   * and retried with backoff.
   */
  url: () => string | Promise<string>
  onMessage: (data: WsMessage) => void
  /** Application-level keepalive frame, sent every `intervalMs` while connected. */
  ping?: { intervalMs: number; frame: () => string }
  /** Called after the socket opens, before subscriptions are revived/resubscribed. */
  onOpen?: () => void
  /**
   * Async gate between open and (re)subscribe — the private-socket login step.
   * Runs after `onOpen` on EVERY connect and reconnect, and no subscribe frame
   * goes out until it resolves. Send through `session.send()`; the socket is
   * live by this point. A rejection (bad key, timeout) is treated as a failed
   * connect: the socket is retired and the normal backoff retries it, so
   * credentials that stop working back off instead of hot-looping.
   */
  authenticate?: () => Promise<void>
  /** Called when a connect attempt fails (a reconnect is already scheduled). */
  onConnectError?: (error: unknown) => void
  gracePeriodMs?: number
  baseBackoffMs?: number
  maxBackoffMs?: number
  maxBackoffExponent?: number
  /** How long a connection must stay up before the backoff counter resets. */
  stableResetMs?: number
  /**
   * Restart the socket after this long with no inbound frame at all. Only set
   * it when the venue guarantees inbound traffic on an idle connection — a
   * configured `ping` does that implicitly (the pong is inbound) and derives a
   * default, so this is for venues whose SERVER pushes heartbeats unprompted.
   * 0 disables the watchdog; see LIVENESS in the file header.
   */
  livenessTimeoutMs?: number
  /** Transport factory — injectable for tests. Defaults to connectWs. */
  connect?: WsSessionConnect
  /** Jitter source — injectable for tests. Defaults to Math.random. */
  random?: () => number
  /**
   * Suspend/resume + network-restored source. Defaults to the shared
   * wakeMonitor; pass null to opt out entirely.
   */
  wakeSource?: WakeSource | null
}

/** Per-key subscription passed to acquire(). */
export type WsSubscriptionSpec<TState> = {
  /** Client-owned state for this key (candle buffer, local book, ...). */
  state: TState
  /** Send the wire subscribe. Runs on first acquire and on every (re)open. */
  subscribe: (state: TState) => void
  /** Send the wire unsubscribe. Runs when the last callback releases the key. */
  unsubscribe: (state: TState) => void
  /** Reset per-key state before resubscribing on a fresh socket (e.g. clear a local book). */
  revive?: (state: TState) => void
}

type Entry = {
  state: unknown
  subscribe: (state: unknown) => void
  unsubscribe: (state: unknown) => void
  revive?: (state: unknown) => void
  callbacks: Map<number, (data: unknown) => void>
}

export class ReconnectingWsSession {
  private ws: WsConnection | null = null
  private connecting = false
  private destroyed = false
  private reconnectAttempt = 0
  private nextCallbackId = 0
  private entries = new Map<string, Entry>()
  /**
   * Identifies the socket generation. A socket we have already retired can
   * still fire `close` later (or never — the half-open case), so every close
   * carries the id it was opened with and stale ones are ignored.
   */
  private connectionId = 0
  private lastInboundAt = 0

  private pingTimer: ReturnType<typeof setInterval> | null = null
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stableTimer: ReturnType<typeof setTimeout> | null = null
  private livenessTimer: ReturnType<typeof setInterval> | null = null
  private releaseWake: (() => void) | null = null
  /**
   * Woken whenever a generation is retired or the session is destroyed, so a
   * connect attempt blocked on a venue's login round-trip can stop waiting on
   * a socket that no longer exists. See `abandonedOn`.
   */
  private retireWaiters = new Set<() => void>()

  constructor(private readonly opts: WsSessionOptions) {
    const source = opts.wakeSource === undefined ? wakeMonitor : opts.wakeSource
    this.releaseWake = source?.subscribe(() => this.handleWake()) ?? null
  }

  // ── Subscriptions ──

  /**
   * Register a callback under `key`. Returns a release function. The wire
   * subscribe is only sent for the first callback on a key; if the key is
   * already registered, `spec` is ignored and the existing entry (and its
   * state) is shared — check `getState(key)` before acquiring when the new
   * subscriber needs a replay of already-buffered data.
   */
  acquire<TState>(
    key: string,
    spec: WsSubscriptionSpec<TState>,
    callback: (data: unknown) => void,
  ): () => void {
    let entry = this.entries.get(key)
    if (!entry) {
      entry = {
        state: spec.state,
        subscribe: spec.subscribe as (state: unknown) => void,
        unsubscribe: spec.unsubscribe as (state: unknown) => void,
        revive: spec.revive as ((state: unknown) => void) | undefined,
        callbacks: new Map(),
      }
      this.entries.set(key, entry)
      // Send now if the socket is already open (send() no-ops when closed;
      // a pending/absent connection covers this entry in the on-open loop).
      entry.subscribe(entry.state)
    }
    const id = this.nextCallbackId++
    entry.callbacks.set(id, callback)
    void this.ensureConnected()

    return () => {
      const current = this.entries.get(key)
      if (!current || !current.callbacks.delete(id)) return
      if (current.callbacks.size === 0) {
        this.entries.delete(key)
        current.unsubscribe(current.state)
        this.maybeDisconnect()
      }
    }
  }

  /** State registered for `key`, or undefined if nothing is subscribed. */
  getState<TState>(key: string): TState | undefined {
    return this.entries.get(key)?.state as TState | undefined
  }

  /** Fan a decoded payload out to every callback registered under `key`. */
  emit(key: string, payload: unknown): void {
    const entry = this.entries.get(key)
    if (!entry) return
    for (const callback of entry.callbacks.values()) callback(payload)
  }

  // ── Socket ──

  /** Send a frame; silently dropped when the socket is not open. */
  send(data: string): void {
    this.ws?.send(data)
  }

  get isOpen(): boolean {
    return this.ws !== null
  }

  /**
   * Force-close the current socket and reconnect (with backoff) while
   * subscriptions remain — e.g. after a regional endpoint change, or when a
   * watchdog decides the socket can no longer be trusted.
   */
  restart(): void {
    if (this.destroyed) return
    this.retireSocket()
    if (this.entries.size > 0) this.scheduleReconnect()
  }

  /**
   * Retire the current generation: drop the socket reference and its timers,
   * scheduling nothing and closing nothing. Bumping the id is what lets work
   * already in flight for this socket — a pending connect, a login round-trip
   * — notice it has been superseded and stop instead of talking to a
   * connection nobody is listening to any more.
   */
  private retireGeneration(): void {
    this.ws = null
    this.connectionId++
    this.stopPingTimer()
    this.stopStableTimer()
    this.stopLivenessTimer()
    this.wakeRetireWaiters()
  }

  /** Release every connect attempt parked on a login round-trip. */
  private wakeRetireWaiters(): void {
    if (this.retireWaiters.size === 0) return
    for (const wake of [...this.retireWaiters]) wake()
    this.retireWaiters.clear()
  }

  /**
   * Resolves once `connectionId` is no longer the caller's — i.e. the socket
   * it is working on has been retired, or the session was destroyed.
   *
   * This exists so a login is something we can WALK AWAY from, not something
   * we have to outlive. Venues settle `authenticate()` on their own terms: an
   * auth ack, or a timeout measured in seconds. Waiting for that after the
   * socket is already gone pins `connecting` for the whole interval, and
   * `ensureConnected()` refuses every reconnect while it is set — so a
   * watchdog restart during login used to cost a private feed the venue's
   * entire auth timeout before it could try again.
   */
  private abandonedOn(connectionId: number): {
    promise: Promise<void>
    release: () => void
  } {
    if (this.destroyed || connectionId !== this.connectionId) {
      return { promise: Promise.resolve(), release: () => {} }
    }
    let wake!: () => void
    const promise = new Promise<void>((resolve) => {
      wake = resolve
    })
    this.retireWaiters.add(wake)
    return { promise, release: () => this.retireWaiters.delete(wake) }
  }

  /**
   * Retire the generation AND close the socket. For callers that are walking
   * away from a connection still believed to be open: a half-open socket may
   * never fire `onClose` at all, and one that fires it late must not tear down
   * the replacement or queue a second reconnect.
   */
  private retireSocket(): void {
    const ws = this.ws
    this.retireGeneration()
    ws?.close()
  }

  destroy(): void {
    this.destroyed = true
    // Anything parked on a login round-trip is released here too: teardown
    // must not have to outlive a venue's auth timeout either.
    this.wakeRetireWaiters()
    this.stopPingTimer()
    this.stopStableTimer()
    this.stopLivenessTimer()
    this.releaseWake?.()
    this.releaseWake = null
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer)
      this.disconnectTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.entries.clear()
  }

  // ── Lifecycle internals ──

  private async ensureConnected(): Promise<void> {
    if (this.ws || this.connecting || this.destroyed) return
    // Nothing wants this socket. A reconnect scheduled just before the last
    // release would otherwise open a connection with zero subscriptions and
    // leave it open — nothing runs maybeDisconnect again to clean it up. On a
    // private socket that meant an authenticated connection outliving the
    // credentials that opened it.
    if (this.entries.size === 0) return
    this.connecting = true
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer)
      this.disconnectTimer = null
    }

    const connectionId = ++this.connectionId

    try {
      const connect = this.opts.connect ?? connectWs
      const ws = await connect(await this.opts.url(), {
        onMessage: (data) => {
          this.lastInboundAt = Date.now()
          this.opts.onMessage(data)
        },
        onOpen: () => {},
        onClose: () => this.handleClose(connectionId),
        onError: () => {},
      })

      // A restart() while this connect was in flight already retired it.
      if (this.destroyed || connectionId !== this.connectionId) {
        ws.close()
        return
      }

      this.ws = ws
      this.startStableTimer()
      this.startPingTimer()
      this.startLivenessTimer()
      this.opts.onOpen?.()

      // Authenticated sockets log in here. `send` already works (this.ws is
      // assigned) but no subscribe has gone out yet, which is exactly the
      // ordering every private endpoint requires.
      if (this.opts.authenticate) {
        // Race, don't just await: if this socket is retired mid-login we stop
        // waiting immediately rather than outliving the venue's auth timeout.
        // A login that loses the race still has handlers attached here, so a
        // late rejection is handled rather than surfacing as an unhandled one.
        const abandoned = this.abandonedOn(connectionId)
        try {
          await Promise.race([this.opts.authenticate(), abandoned.promise])
        } finally {
          abandoned.release()
        }
        // A restart()/destroy() during the login round-trip retired this
        // socket — subscribing on it now would talk to a dead connection.
        if (this.destroyed || connectionId !== this.connectionId) return
      }

      for (const entry of this.entries.values()) {
        entry.revive?.(entry.state)
        entry.subscribe(entry.state)
      }
    } catch (error) {
      // authenticate() can reject AFTER the socket was assigned, so retire it
      // here — a half-authenticated socket must never be left live or reused.
      if (connectionId === this.connectionId) this.retireSocket()
      // After destroy the failure IS the teardown (a pending authenticate is
      // rejected on purpose) — reporting it would be a false alarm.
      if (!this.destroyed) this.opts.onConnectError?.(error)
      if (!this.destroyed && this.entries.size > 0) this.scheduleReconnect()
    } finally {
      this.connecting = false
      // Anything that wanted a reconnect WHILE this attempt was in flight had
      // it swallowed: ensureConnected() returns early on `connecting`, and the
      // reconnect timer clears itself before making that call, so the intent
      // is gone and nothing else is left to retry. The window is real on every
      // authenticated venue — a close arriving during the auth round-trip (or
      // the liveness watchdog calling restart()) left the session with no
      // socket and no pending retry, permanently. Re-arm here, where the
      // in-flight attempt is finally out of the way.
      if (
        !this.destroyed &&
        !this.ws &&
        this.entries.size > 0 &&
        !this.reconnectTimer
      ) {
        this.scheduleReconnect()
      }
    }
  }

  private handleClose(connectionId: number): void {
    // A retired socket's late close must not tear down its replacement or
    // queue a duplicate reconnect — restart() already handled that generation.
    if (connectionId !== this.connectionId) return
    // Retire, don't just drop: a close can land while this generation's login
    // round-trip is still in flight, and without the id bump that login would
    // resolve and run the whole resubscribe loop against the socket that just
    // died. Retiring without closing, because this socket closed itself — that
    // is why we are here, and the transports are not all reliably idempotent
    // about a second close.
    this.retireGeneration()
    if (!this.destroyed && this.entries.size > 0) this.scheduleReconnect()
  }

  /**
   * The host was frozen (lid closed, VM paused) or the network came back.
   * Any socket that survived on paper is almost certainly half-open, and any
   * backoff we were sitting in was measured against a clock that stopped — so
   * drop the attempt counter and recover on the base delay instead of up to
   * maxBackoffMs later.
   */
  private handleWake(): void {
    if (this.destroyed || this.entries.size === 0) return
    this.reconnectAttempt = 0
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) this.restart()
    else this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    const base = this.opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS
    const max = this.opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS
    const maxExponent =
      this.opts.maxBackoffExponent ?? DEFAULT_MAX_BACKOFF_EXPONENT
    const random = this.opts.random ?? Math.random

    const cap = Math.min(
      base * 2 ** Math.min(this.reconnectAttempt, maxExponent),
      max,
    )
    // Equal jitter: half deterministic, half random — spreads the reconnect
    // stampede when many clients lose the same endpoint at once.
    const delay = cap / 2 + random() * (cap / 2)
    this.reconnectAttempt++

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.ensureConnected()
    }, delay)
  }

  private maybeDisconnect(): void {
    if (this.entries.size > 0) return
    // Drop any retry queued for the socket we are about to let go; a later
    // acquire() reconnects on its own.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer)
    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = null
      if (this.entries.size === 0) {
        const ws = this.ws
        this.ws = null
        this.stopPingTimer()
        this.stopStableTimer()
        this.stopLivenessTimer()
        ws?.close()
      }
    }, this.opts.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS)
  }

  private startStableTimer(): void {
    this.stableTimer = setTimeout(() => {
      this.stableTimer = null
      this.reconnectAttempt = 0
    }, this.opts.stableResetMs ?? DEFAULT_STABLE_RESET_MS)
  }

  private stopStableTimer(): void {
    if (this.stableTimer) {
      clearTimeout(this.stableTimer)
      this.stableTimer = null
    }
  }

  private startPingTimer(): void {
    const ping = this.opts.ping
    if (!ping) return
    this.pingTimer = setInterval(() => {
      this.ws?.send(ping.frame())
    }, ping.intervalMs)
  }

  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  /** 0 when no inbound heartbeat is guaranteed — see LIVENESS in the header. */
  private resolveLivenessTimeoutMs(): number {
    const explicit = this.opts.livenessTimeoutMs
    if (explicit !== undefined) return explicit
    const ping = this.opts.ping
    if (!ping) return 0
    return Math.max(
      ping.intervalMs * LIVENESS_PING_MULTIPLIER,
      MIN_DERIVED_LIVENESS_TIMEOUT_MS,
    )
  }

  private startLivenessTimer(): void {
    const timeoutMs = this.resolveLivenessTimeoutMs()
    if (timeoutMs <= 0) return

    // A fresh socket starts its clock now: the first frame may legitimately be
    // a whole ping interval away.
    this.lastInboundAt = Date.now()

    // Never check less often than the timeout itself — that would double the
    // worst-case detection latency.
    const checkMs = Math.min(
      Math.max(timeoutMs / LIVENESS_CHECK_DIVISOR, MIN_LIVENESS_CHECK_MS),
      MAX_LIVENESS_CHECK_MS,
      timeoutMs,
    )
    this.livenessTimer = setInterval(() => {
      if (!this.ws) return
      if (Date.now() - this.lastInboundAt <= timeoutMs) return
      // Silent past the point where a pong or server heartbeat was due: the
      // socket is open on paper only. restart() does not wait on its close.
      this.restart()
    }, checkMs)
  }

  private stopLivenessTimer(): void {
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer)
      this.livenessTimer = null
    }
  }
}
