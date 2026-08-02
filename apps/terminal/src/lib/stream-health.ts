// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Whether the market-data subscriptions the app currently holds are actually
 * delivering.
 *
 * MarketDataProvider's `status` answers a different question — "does any plugin
 * serve market data" — so it reads `connected` even when every socket behind it
 * has gone silent. That is precisely the state a laptop suspend leaves behind,
 * and reporting "Live" over frozen prices is the part of that bug a trader
 * actually gets hurt by. This tracks delivery instead of capability.
 *
 * Deliberately NOT part of the MarketDataProvider context: health flips are
 * rare, but that context is consumed across the whole terminal, and routing
 * them through it would re-render every panel on each transition. Components
 * opt in through the useStreamHealth hook, which binds this store to React.
 *
 * Kept free of React imports so it stays unit-testable on its own.
 */

/**
 * - `idle`  — nothing subscribed, or nothing has ever delivered (a pair that
 *   does not exist on the venue is the pane's empty state, not a fault here)
 * - `live`  — at least one active stream delivered recently
 * - `stale` — streams that HAVE delivered before have all gone quiet
 */
export type StreamHealth = 'idle' | 'live' | 'stale'

// Matches the candle hook's threshold: long enough that a quiet pair between
// trades never trips it.
const STALE_AFTER_MS = 30_000
const CHECK_INTERVAL_MS = 5_000

class StreamHealthStore {
  /** mux key → epoch ms of last delivery, or 0 if it has never delivered. */
  private streams = new Map<string, number>()
  private listeners = new Set<() => void>()
  private snapshot: StreamHealth = 'idle'
  private timer: ReturnType<typeof setInterval> | null = null

  /** A multiplexed subscription started. */
  register(key: string): void {
    if (!this.streams.has(key)) this.streams.set(key, 0)
    this.evaluate()
  }

  /** Its last consumer released. */
  unregister(key: string): void {
    if (this.streams.delete(key)) this.evaluate()
  }

  /** Raw data arrived for `key` (called before throttling, on every message). */
  mark(key: string): void {
    this.streams.set(key, Date.now())
    // Hot path: only recompute when this could be a transition out of stale.
    if (this.snapshot !== 'live') this.evaluate()
  }

  /** Drop all tracking — used when streams are torn down wholesale (pause). */
  clear(): void {
    this.streams.clear()
    this.evaluate()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
    }
  }

  getSnapshot = (): StreamHealth => {
    // Recomputed on read: staleness is a function of elapsed time, so a cached
    // value silently goes wrong whenever the poll below is delayed (a
    // background tab throttles timers to once a minute, and a suspend stops
    // them altogether — the very case this exists for). The interval only
    // pokes listeners; correctness never depends on its cadence.
    this.snapshot = this.compute()
    return this.snapshot
  }

  private start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.evaluate(), CHECK_INTERVAL_MS)
  }

  private stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private evaluate(): void {
    const next = this.compute()
    if (next === this.snapshot) return
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }

  private compute(): StreamHealth {
    if (this.streams.size === 0) return 'idle'

    const cutoff = Date.now() - STALE_AFTER_MS
    let anyProven = false
    for (const lastDataAt of this.streams.values()) {
      if (lastDataAt === 0) continue
      anyProven = true
      // One healthy stream is enough: a single illiquid pair going quiet
      // alongside a busy one is a quiet market, not a broken transport.
      if (lastDataAt >= cutoff) return 'live'
    }
    return anyProven ? 'stale' : 'idle'
  }
}

export const streamHealth = new StreamHealthStore()
