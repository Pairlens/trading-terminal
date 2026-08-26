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
 * - `idle`     — nothing subscribed, or nothing has ever delivered (a pair that
 *   does not exist on the venue is the pane's empty state, not a fault here)
 * - `live`     — data is arriving, or nothing is yet overdue
 * - `degraded` — a stream has broken a rhythm it had established, and nothing
 *   at all has arrived in seconds, but the sockets are still plausibly alive.
 *   A slow or lossy link, not a dead one.
 * - `stale`    — streams that HAVE delivered before have all gone quiet
 */
export type StreamHealth = 'idle' | 'live' | 'degraded' | 'stale'

/**
 * Hard ceiling. Long enough that a quiet pair between trades never trips it,
 * and past this the honest answer is that the transport is gone rather than
 * slow. Matches the candle hook's own threshold.
 */
const STALE_AFTER_MS = 30_000
/**
 * Detection latency has to be a fraction of LAG_FLOOR_MS below, or a link that
 * dies at t=0 gets its warning at t=10s and the warning stops being worth
 * reading. The sweep walks a handful of map entries, so the cost of doing it
 * more often is nil; correctness never depends on the cadence, because
 * getSnapshot recomputes on read.
 */
const CHECK_INTERVAL_MS = 2_000

// ── Per-stream cadence ────────────────────────────────────────────────
//
// The 30s ceiling alone is a binary that a degraded mobile link walks straight
// past: frames still trickle in, one every few seconds, so SOME stream is
// always inside the window and the dot stays green over a tape that is
// visibly behind. It only went amber once the socket died outright — which is
// the last moment the warning is useful.
//
// So a stream is judged against ITS OWN observed rhythm rather than against
// one number. BTC's order book ticks several times a second and has no
// business being quiet for five; a thin altcoin's tape legitimately goes a
// minute between prints, and calling that a fault would train people to
// ignore the colour. The baseline separates the two without a venue table.

/** Weight of the newest gap in the cadence average. Slow on purpose. */
const CADENCE_ALPHA = 0.1
/**
 * How many times its own typical gap a stream may be silent before it counts
 * as late. Wide enough to absorb ordinary jitter (a GC pause, a throttled
 * background tab, a venue batching frames) and still trip within seconds on a
 * feed that normally never stops.
 */
const CADENCE_MULTIPLE = 6
/**
 * Floor under the derived window. A busy stream's cadence is measured in
 * hundreds of milliseconds, and six of those is a threshold that would fire on
 * every hiccup. Five seconds of nothing on a feed that ticks continuously is
 * the point where a trader would want to know.
 */
const LAG_FLOOR_MS = 5_000
/**
 * Gaps needed before the baseline is trusted. Until then the stream is judged
 * by the hard ceiling alone: a cadence of one sample is a guess, and guessing
 * low here is how a healthy quiet pair gets accused of lagging.
 */
const MIN_CADENCE_SAMPLES = 5
/**
 * Once `degraded` is showing it holds for at least this long, even if a frame
 * lands. A stalling link does not fail cleanly, it arrives in bursts, and
 * without this the warning strobes green/amber at exactly the moment it most
 * needs to be read. Downgrades are never held back, and recovery from a full
 * stall is still instant.
 */
const DEGRADED_DWELL_MS = 5_000

type Tracked = {
  /** Epoch ms of the last delivery, or 0 if it has never delivered. */
  lastAt: number
  /** Running average of the gap between deliveries, ms. */
  cadenceMs: number
  /** Gaps folded into `cadenceMs` so far. */
  gaps: number
}

/** How long this stream may be silent before it counts as late. */
function lateAfter(tracked: Tracked): number {
  if (tracked.gaps < MIN_CADENCE_SAMPLES) return STALE_AFTER_MS
  const window = tracked.cadenceMs * CADENCE_MULTIPLE
  if (window < LAG_FLOOR_MS) return LAG_FLOOR_MS
  return window > STALE_AFTER_MS ? STALE_AFTER_MS : window
}

class StreamHealthStore {
  /** mux key → what we know about that stream's delivery. */
  private streams = new Map<string, Tracked>()
  private listeners = new Set<() => void>()
  private snapshot: StreamHealth = 'idle'
  private degradedAt = 0
  private timer: ReturnType<typeof setInterval> | null = null

  /** A multiplexed subscription started. */
  register(key: string): void {
    if (!this.streams.has(key)) {
      this.streams.set(key, { lastAt: 0, cadenceMs: 0, gaps: 0 })
    }
    this.evaluate()
  }

  /** Its last consumer released. */
  unregister(key: string): void {
    if (this.streams.delete(key)) this.evaluate()
  }

  /** Raw data arrived for `key` (called before throttling, on every message). */
  mark(key: string): void {
    const now = Date.now()
    const tracked = this.streams.get(key)
    if (!tracked) {
      this.streams.set(key, { lastAt: now, cadenceMs: 0, gaps: 0 })
    } else {
      if (tracked.lastAt > 0) {
        // Capped at this stream's own lateness threshold. Uncapped, the one
        // enormous gap a stall produces teaches the baseline that stalling is
        // normal, and the NEXT stall goes unreported — the failure mode is
        // self-concealing, which is the worst kind. A market that is genuinely
        // slowing down still gets there: the cap rises with the baseline, so
        // the window grows geometrically over a handful of samples.
        const gap = Math.min(now - tracked.lastAt, lateAfter(tracked))
        tracked.cadenceMs =
          tracked.gaps === 0
            ? gap
            : tracked.cadenceMs + (gap - tracked.cadenceMs) * CADENCE_ALPHA
        tracked.gaps++
      }
      tracked.lastAt = now
    }
    // Hot path: only recompute when this could be a transition back up.
    if (this.snapshot !== 'live') this.evaluate()
  }

  /** Drop all tracking — used when streams are torn down wholesale (pause). */
  clear(): void {
    this.streams.clear()
    this.degradedAt = 0
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
    //
    // A READ, never a commit. Publishing from here looks harmless and is not:
    // whoever reads first swallows the transition, and `evaluate` then finds
    // nothing changed and notifies nobody. React survived that by calling this
    // during render, so the value it got was still fresh — but any caller
    // outside a render (a probe, a devtool, a future consumer) would silently
    // freeze the header. Publishing belongs to `evaluate` alone.
    return this.resolve()
  }

  /**
   * Epoch ms of the newest delivery across every tracked stream, or 0 when
   * nothing has ever delivered.
   *
   * Read on demand rather than published: the connection indicator's tooltip
   * wants to say HOW far behind the tape is, and a number that moves every
   * second has no business re-rendering the header to prove it.
   */
  getLastDeliveryAt(): number {
    let newest = 0
    for (const tracked of this.streams.values()) {
      if (tracked.lastAt > newest) newest = tracked.lastAt
    }
    return newest
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

  /** The one place the published value moves, and the only one that notifies. */
  private evaluate(): void {
    const next = this.resolve()
    if (next === this.snapshot) return
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }

  private resolve(): StreamHealth {
    const raw = this.compute()
    const now = Date.now()
    if (raw === 'degraded') {
      // Stamped from whichever path saw it first, read or sweep. The published
      // `snapshot` cannot carry this: it only moves when `evaluate` runs, and
      // a render can reach the transition a beat earlier.
      if (this.degradedAt === 0) this.degradedAt = now
      return raw
    }
    if (raw === 'live' && this.degradedAt !== 0) {
      if (now - this.degradedAt < DEGRADED_DWELL_MS) return 'degraded'
    }
    // Anything else retires the dwell, downgrades included: `stale` is worse
    // news than `degraded` and is never held back.
    this.degradedAt = 0
    return raw
  }

  /**
   * Two questions, deliberately kept apart, because the obvious single one
   * gets this wrong. "Is any stream still inside its own window" sounds like
   * the health check and is not: a stream whose window is thirty seconds is
   * not EVIDENCE of health at second six, it simply has not been asked yet.
   * Measured against a live OKX board, one such stream held the dot green
   * through the entire outage while the order book beside it sat frozen.
   *
   * So the warning needs a stream that IS overdue by a rhythm it had actually
   * established, and it needs nothing at all to have arrived recently in plain
   * elapsed time. The second half is what keeps the colour worth reading: any
   * board with something chatty on it (an order book, a busy tape) answers
   * within the floor, so an ordinary long gap on one slow stream can never
   * raise the alarm on its own. Both together are the signature of a link that
   * has gone soft rather than a market that has gone quiet.
   */
  private compute(): StreamHealth {
    if (this.streams.size === 0) return 'idle'

    const now = Date.now()
    let anyProven = false
    /** Something arrived recently, in plain elapsed time. */
    let anyFresh = false
    /** Something is still inside the hard ceiling. */
    let anyWithinCeiling = false
    /** A stream with an established rhythm has broken it. */
    let anyOverdue = false
    for (const tracked of this.streams.values()) {
      if (tracked.lastAt === 0) continue
      anyProven = true
      const silence = now - tracked.lastAt
      if (silence < LAG_FLOOR_MS) anyFresh = true
      if (silence < STALE_AFTER_MS) anyWithinCeiling = true
      if (
        tracked.gaps >= MIN_CADENCE_SAMPLES &&
        silence >= lateAfter(tracked)
      ) {
        anyOverdue = true
      }
    }
    if (!anyProven) return 'idle'
    if (!anyWithinCeiling) return 'stale'
    return anyOverdue && !anyFresh ? 'degraded' : 'live'
  }
}

export const streamHealth = new StreamHealthStore()
