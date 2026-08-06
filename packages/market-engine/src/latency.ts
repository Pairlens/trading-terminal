// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Latency to each connected venue, measured two ways.
 *
 * MEASURED (`source: 'roundtrip'`) — the WS keepalive. `ReconnectingWsSession`
 * stamps the moment a ping frame goes out, the connector's message handler
 * calls `session.notePong()` from the branch that already recognizes the
 * venue's reply, and the delta lands here. A real round trip over the same
 * socket the market data arrives on. Preferred whenever it exists.
 *
 * INFERRED (`source: 'feed'`) — for venues that answer no ping we can time
 * (Coinbase, HTX and Crypto.com heartbeat server-side; Alpaca and the DEX
 * connectors send no keepalive at all), the age of the messages themselves:
 * `now - event timestamp` off the trade feed, doubled so it lands on the same
 * round-trip scale as the measured number.
 *
 * That raw age is NOT latency. It is
 *
 *     age  =  clock offset  +  one-way delay  +  venue emit lag
 *
 * and the first term is the killer: a machine 2s off its NTP source would
 * report a permanent 2000 ms against a perfectly healthy feed. So the offset
 * is solved for rather than ignored. Any venue reporting BOTH a round trip and
 * a feed age pins it — one-way delay is about rtt/2, so
 *
 *     offset  ≈  age  -  rtt / 2
 *
 * and the offset is a property of THIS MACHINE, not of the venue, so the
 * estimate learned from a measurable venue corrects an unmeasurable one. It is
 * kept as a median over recent pairs and survives venue switches for the life
 * of the session.
 *
 * Two honest limits on the inferred number, both handled rather than hidden:
 * the venue's own emit lag stays folded in (it belongs there — a venue slow to
 * publish IS slow data), and with no offset estimate yet the machine clock is
 * taken at face value, which NTP usually earns. Negative results are clamped
 * to zero, since they only mean the offset estimate overshot.
 *
 * A third measurement this is deliberately NOT: time since the last inbound
 * frame. That is stream health, and on a busy pair it reads the market's tick
 * cadence rather than the network. And candle timestamps are never sampled —
 * a bar's `ts` is its OPEN time, so it would report most of a timeframe.
 *
 * Lives in market-engine rather than the terminal because the producers are
 * the connector plugins and the consumer is the terminal UI. Bundled
 * connectors are statically imported into the app bundle, so both sides share
 * this module instance. A sandboxed third-party connector runs in a worker
 * with its own copy and simply reports no latency — the readout hides itself
 * rather than showing another venue's number.
 *
 * Kept free of React imports so it stays unit-testable on its own; the
 * terminal binds it through the useVenueLatency hook.
 */

/** How a venue's number was arrived at. See the module header. */
export type LatencySource = 'roundtrip' | 'feed'

/**
 * The venue's own emission timestamp for a market-data payload, or null when
 * the payload carries none worth trusting.
 *
 * ONLY trade updates qualify. That is an audit result, not caution — every
 * other stream was checked and rejected for a specific reason:
 * - candles carry the bar's OPEN time, so `now - ts` would report most of a
 *   timeframe as delay
 * - orderbook `ts` is not consistently a venue clock: Coinbase and HTX stamp
 *   it with Date.now(), and Binance puts a sequence number (lastUpdateId) in
 *   the field outright
 * - ticker `ts` is Date.now() on Coinbase and HTX, which would report a
 *   confident ~0 ms on two of the venues this exists to serve (and the chart's
 *   forming-bar logic reads that field, so it is not ours to redefine here)
 *
 * Only the trade parsers take the venue's timestamp on every connector.
 *
 * Snapshot frames are skipped: a tape snapshot replays historical executions,
 * whose age says nothing about the link.
 */
export function feedEventTs(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null
  const update = data as { type?: unknown; trades?: unknown }
  if (update.type !== 'update' || !Array.isArray(update.trades)) return null

  // Newest wins: a frame can batch several executions, and the most recent one
  // is the one whose age reflects the link right now.
  let newest = 0
  for (const trade of update.trades as Array<{ ts?: unknown }>) {
    const ts = trade?.ts
    if (typeof ts === 'number' && ts > newest) newest = ts
  }
  return newest > 0 ? newest : null
}

export type VenueLatency = {
  /** Measured round trip, or inferred from feed timestamps. */
  source: LatencySource
  /**
   * Median of the retained window — the headline number. A median rather than
   * the newest sample because one GC pause or throttled background tab would
   * otherwise park an alarming 800 ms on screen for a whole ping interval.
   */
  medianMs: number
  /** Newest sample. */
  lastMs: number
  /** Lowest in the window — the floor the link is capable of. */
  bestMs: number
  /** How many samples the median was taken over. */
  samples: number
  /** Epoch ms the newest sample landed. */
  updatedAt: number
}

/**
 * Samples retained per venue. Pings arrive every 15-30s depending on the
 * exchange, so five is roughly the last two minutes — long enough to be
 * steady, short enough that a reconnect to a different endpoint stops
 * blending into the reading within a minute or so.
 */
const WINDOW = 5
/**
 * A venue that has not answered a ping this long is no longer being measured
 * (socket down, connector torn down, laptop asleep). The readout blanks rather
 * than showing a number from a connection that no longer exists — comfortably
 * past the slowest bundled keepalive so a healthy venue never flickers out.
 */
const MAX_AGE_MS = 120_000
/**
 * Above this a "round trip" is not a measurement, it is an artifact — a
 * suspended process, a wedged socket whose pong arrives after the watchdog has
 * already given up. The liveness watchdog handles that case; this just refuses
 * to plot it.
 */
const MAX_PLAUSIBLE_RTT_MS = 30_000
const SWEEP_INTERVAL_MS = 15_000

/**
 * Feed ages are sampled off the trade tape, which on BTC-USDT is hundreds of
 * messages a second. One sample per second per venue is plenty for a header
 * readout and keeps the hot path to a timestamp compare.
 */
const FEED_SAMPLE_INTERVAL_MS = 1_000
/**
 * Beyond this a feed age is a broken timestamp (seconds mistaken for millis is
 * the classic), not a slow link. Generous in both directions because the whole
 * point is that the local clock may be wrong — the sign carries information.
 */
const MAX_PLAUSIBLE_AGE_MS = 300_000
/**
 * Paired (age, rtt) observations kept for the clock-offset estimate. The
 * offset is a machine property and barely moves, so this only needs to be long
 * enough to median out jitter — and short enough that an NTP correction
 * mid-session works its way through in a few minutes.
 */
const OFFSET_WINDOW = 10

function median(sorted: Array<number>): number {
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Window stats for whichever sample kind `get()` chose to report. */
function summarize(
  samples: Array<number>,
  updatedAt: number,
  source: LatencySource,
): VenueLatency {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    source,
    medianMs: Math.round(median(sorted)),
    lastMs: Math.round(samples[samples.length - 1]),
    bestMs: Math.round(sorted[0]),
    samples: sorted.length,
    updatedAt,
  }
}

type Entry = {
  /** Measured keepalive round trips, newest last. */
  rtts: Array<number>
  rttAt: number
  /**
   * Raw `now - eventTs` observations, newest last, UNCORRECTED — the clock
   * offset is subtracted at read time so a later, better estimate improves
   * samples already taken. May be negative when the machine clock runs behind.
   */
  ages: Array<number>
  ageAt: number
}

class LatencyMonitor {
  private venues = new Map<string, Entry>()
  private listeners = new Set<() => void>()
  private version = 0
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  /** Paired estimates of this machine's clock offset, newest last. */
  private offsets: Array<number> = []

  private entryFor(venue: string): Entry {
    let entry = this.venues.get(venue)
    if (!entry) {
      entry = { rtts: [], rttAt: 0, ages: [], ageAt: 0 }
      this.venues.set(venue, entry)
    }
    return entry
  }

  /** A keepalive round trip completed. `venue` is the connector's market id. */
  record(venue: string, rttMs: number): void {
    if (!Number.isFinite(rttMs) || rttMs < 0 || rttMs > MAX_PLAUSIBLE_RTT_MS) {
      return
    }
    const entry = this.entryFor(venue)
    entry.rtts.push(rttMs)
    if (entry.rtts.length > WINDOW) entry.rtts.shift()
    entry.rttAt = Date.now()

    // This venue just gave us both halves of the equation, so it can calibrate
    // the clock for every venue that can only give us one. Paired here, on the
    // rare signal, rather than on every feed sample — otherwise one rtt would
    // be reused across hundreds of ages and swamp the window.
    if (entry.ages.length > 0 && Date.now() - entry.ageAt <= MAX_AGE_MS) {
      const observed = median([...entry.ages].sort((a, b) => a - b))
      this.offsets.push(observed - rttMs / 2)
      if (this.offsets.length > OFFSET_WINDOW) this.offsets.shift()
    }

    this.bump()
  }

  /**
   * A message arrived carrying the venue's own event timestamp. Only pass
   * emission-time stamps — trades and tickers. NOT candles: a bar's `ts` is
   * its open time, so it would report most of a timeframe as delay.
   *
   * Self-throttling, because this sits on the tape's hot path.
   */
  recordFeedAge(venue: string, eventTs: number): void {
    if (!Number.isFinite(eventTs) || eventTs <= 0) return
    const now = Date.now()
    const entry = this.entryFor(venue)
    if (now - entry.ageAt < FEED_SAMPLE_INTERVAL_MS) return

    const age = now - eventTs
    if (Math.abs(age) > MAX_PLAUSIBLE_AGE_MS) return

    entry.ages.push(age)
    if (entry.ages.length > WINDOW) entry.ages.shift()
    entry.ageAt = now

    // Only a venue actually being READ this way needs to repaint; one that has
    // a measured round trip ignores its ages entirely.
    if (entry.rtts.length === 0 || now - entry.rttAt > MAX_AGE_MS) this.bump()
  }

  /**
   * This machine's estimated clock offset against the exchanges, in ms
   * (positive = local clock ahead). Null until a venue has reported a round
   * trip and a feed age close enough together to pin it.
   */
  getClockOffsetMs(): number | null {
    if (this.offsets.length === 0) return null
    return Math.round(median([...this.offsets].sort((a, b) => a - b)))
  }

  /** Forget a venue — its connector is being destroyed. */
  reset(venue: string): void {
    if (this.venues.delete(venue)) this.bump()
  }

  /** Forget everything. */
  clear(): void {
    this.offsets = []
    if (this.venues.size === 0) return
    this.venues.clear()
    this.bump()
  }

  /** Null when the venue has never reported, or has stopped reporting. */
  get(venue: string): VenueLatency | null {
    const entry = this.venues.get(venue)
    if (!entry) return null

    // Expiry is checked on read as well as on the sweep: staleness is a
    // function of elapsed time, and the sweep interval stops in a background
    // tab and freezes entirely on suspend — exactly when a stale number would
    // be most misleading.
    const now = Date.now()
    if (entry.rtts.length > 0 && now - entry.rttAt <= MAX_AGE_MS) {
      return summarize(entry.rtts, entry.rttAt, 'roundtrip')
    }
    if (entry.ages.length > 0 && now - entry.ageAt <= MAX_AGE_MS) {
      const offset = this.getClockOffsetMs() ?? 0
      const corrected = entry.ages.map(
        // Clamped at zero: a negative result means the offset estimate
        // overshot, not that data arrived before it was sent.
        //
        // Doubled because `age - offset` is a ONE-WAY delay, and every other
        // number this store hands out is a round trip. Left as-is, a venue on
        // the inferred path would read half of what the same link measures on
        // the keepalive path — Coinbase looking three times closer than
        // Binance when it is really about half as far — and the UI's colour
        // thresholds, which are calibrated on round trips, would mean
        // different things on different venues. Symmetric-path assumption,
        // the same one that produced the offset in the first place.
        (age) => Math.max(0, age - offset) * 2,
      )
      return summarize(corrected, entry.ageAt, 'feed')
    }
    return null
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.startSweep()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stopSweep()
    }
  }

  /**
   * Version counter, not a snapshot object: `get()` allocates, and
   * useSyncExternalStore compares snapshots by identity — returning a fresh
   * object per read would loop forever.
   */
  getVersion = (): number => this.version

  /** Neither kind of sample is still current. */
  private isExpired(entry: Entry): boolean {
    const cutoff = Date.now() - MAX_AGE_MS
    return entry.rttAt < cutoff && entry.ageAt < cutoff
  }

  private bump(): void {
    this.version++
    for (const listener of [...this.listeners]) listener()
  }

  /**
   * A venue that goes quiet produces no event to re-render on, so nothing
   * would ever clear the last number it reported. This is that event.
   */
  private startSweep(): void {
    if (this.sweepTimer) return
    this.sweepTimer = setInterval(() => {
      let pruned = false
      for (const [venue, entry] of this.venues) {
        if (!this.isExpired(entry)) continue
        this.venues.delete(venue)
        pruned = true
      }
      if (pruned) this.bump()
    }, SWEEP_INTERVAL_MS)
  }

  private stopSweep(): void {
    if (!this.sweepTimer) return
    clearInterval(this.sweepTimer)
    this.sweepTimer = null
  }
}

export const latencyMonitor = new LatencyMonitor()
