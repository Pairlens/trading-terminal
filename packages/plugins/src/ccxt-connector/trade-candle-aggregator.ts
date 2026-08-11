// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Candles for venues that do not stream the ones we need.
 *
 * Two venues of the fourteen have no usable candle channel at all. Coinbase
 * Advanced Trade has no `handleOHLCV` in ccxt's Pro class — the handler table
 * is `{subscriptions, ticker, ticker_batch, market_trades, user, l2_data,
 * heartbeats}` and there is simply no candles socket wired. Upbit declares
 * `watchOHLCV` but throws `NotSupported` for every timeframe except `1s`, and
 * even that resolves a single row instead of an array. A third case is
 * narrower: a venue streams candles fine but does not have the timeframe the
 * user picked (Bitvavo has no `1w`, Coinbase no `4h` and no `1w`).
 *
 * Both cases are the same problem — build the bar we need out of a finer
 * stream — so both live here:
 *
 * - **trades → candles.** Bucket prints by timeframe width, extend the forming
 *   bar per tick, close it when a print lands in the next bucket.
 * - **candles → candles.** Fold N source bars into one target bar. A forming
 *   source bar updates many times, so contributions are keyed by source
 *   timestamp and the target bar is recomputed from its members — summing per
 *   update would multiply the week's volume by however often the daily bar
 *   ticked.
 *
 * ## Bucket alignment is taken from the venue, not assumed
 *
 * Epoch-aligned bucketing puts the weekly boundary on a Thursday (epoch day 0)
 * and the daily boundary at 00:00 UTC. Exchanges disagree: weekly bars open on
 * Monday nearly everywhere, and some venues run daily bars on a local-time
 * boundary. A bucket that disagrees with the venue's own REST bars produces a
 * forming bar that never merges with the history behind it — a permanent
 * duplicate at the right edge of the chart.
 *
 * So `seed()` derives the anchor from the newest REST bar it is given
 * (`ts % width`), which is correct for whatever convention the venue actually
 * uses. `defaultAnchor` is only the cold-start fallback, and for `1w` it is
 * Monday rather than epoch-Thursday.
 *
 * Everything emitted is a copy: the internal forming bar keeps mutating.
 */

import { aggregateCandles } from '@pairlens/market-engine/candle-aggregator'
import { timeframeToMs } from '@pairlens/shared'
import type { Candle, Timeframe } from '@pairlens/shared/types'

/** Epoch day 0 is a Thursday; exchange weeks open on Monday, four days later. */
export const MONDAY_ANCHOR_MS = 4 * 24 * 60 * 60 * 1000

/** Cold-start bucket phase for a timeframe, used until REST history lands. */
export function defaultAnchor(timeframe: Timeframe): number {
  return timeframe === '1w' ? MONDAY_ANCHOR_MS : 0
}

/** Start of the bucket `ts` falls in, for a width/phase pair. */
export function bucketStart(
  ts: number,
  widthMs: number,
  anchor: number,
): number {
  return Math.floor((ts - anchor) / widthMs) * widthMs + anchor
}

/** The phase a series of candles is aligned to, or null when it cannot tell. */
export function anchorOf(
  candles: Array<Candle>,
  widthMs: number,
): number | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    const ts = candles[i]?.ts
    if (typeof ts !== 'number' || !Number.isFinite(ts)) continue
    return ((ts % widthMs) + widthMs) % widthMs
  }
  return null
}

export type FoldedHistory = {
  /** Target-timeframe bars, ascending. */
  candles: Array<Candle>
  /**
   * The source bars belonging to the newest target bucket. The live folder
   * needs them: without the earlier days of the week, a weekly bar rebuilt
   * from the current day alone reports that day's open as the week's open.
   */
  tail: Array<Candle>
}

/**
 * Fold source-timeframe candles into target-timeframe bars.
 *
 * The oldest bucket is dropped unless the first source bar sits exactly on its
 * boundary: a page that starts mid-bucket produces a bar whose open, high and
 * low are those of a fragment, and one wrong bar at the join is worse than one
 * missing bar at the far edge of the scroll-back.
 */
export function foldCandles(
  source: Array<Candle>,
  sourceTf: Timeframe,
  targetTf: Timeframe,
): FoldedHistory {
  if (source.length === 0) return { candles: [], tail: [] }
  const sourceMs = timeframeToMs(sourceTf)
  const targetMs = timeframeToMs(targetTf)
  // Two offsets compose. The target's own convention decides the coarse
  // boundary (weeks open on Monday, not on epoch-Thursday), and the source
  // series' phase within its own width carries into it — a daily series
  // stamped 15:00 UTC folds into weeks that open Monday 15:00, which is what
  // the venue's own weekly bars would do.
  const phase = anchorOf(source, sourceMs) ?? 0
  const foldAnchor =
    (((defaultAnchor(targetTf) + phase) % targetMs) + targetMs) % targetMs
  const candles = aggregateCandles(source, sourceMs, targetMs, foldAnchor)
  const first = source[0]
  if (
    candles.length > 0 &&
    first !== undefined &&
    bucketStart(first.ts, targetMs, foldAnchor) !== first.ts
  ) {
    candles.shift()
  }
  const newest = candles[candles.length - 1]
  const tail =
    newest === undefined
      ? []
      : source.filter(
          (candle) =>
            bucketStart(candle.ts, targetMs, foldAnchor) === newest.ts,
        )
  return { candles, tail }
}

/** What one input produced: the (copied) forming bar and any bar it closed. */
export type AggregateResult = {
  forming: Candle | null
  closed: Candle | null
}

const NOTHING: AggregateResult = { forming: null, closed: null }

export type TradeCandleAggregatorOptions = {
  timeframe: Timeframe
  /** Fold mode keeps per-source-bar members so a re-tick replaces, not adds. */
  sourceTimeframe?: Timeframe
}

/**
 * One (pair, timeframe)'s forming bar, fed by trades or by finer candles.
 *
 * Not a buffer: it owns exactly the bucket that is open right now. History is
 * the `CandleBuffer`'s job, and everything this emits is pushed through one.
 */
export class TradeCandleAggregator {
  private readonly widthMs: number
  private anchor: number
  private bar: Candle | null = null
  /** Fold mode only: the source bars that make up the current target bar. */
  private members: Map<number, Candle> | null

  constructor(opts: TradeCandleAggregatorOptions) {
    this.widthMs = timeframeToMs(opts.timeframe)
    this.anchor = defaultAnchor(opts.timeframe)
    this.members = opts.sourceTimeframe === undefined ? null : new Map()
  }

  /** The bucket phase in use — visible so tests can assert the seed adopted it. */
  get bucketAnchor(): number {
    return this.anchor
  }

  /** Copy of the bar currently open, or null before the first input. */
  current(): Candle | null {
    return this.bar === null ? null : { ...this.bar }
  }

  /**
   * Adopt the venue's own bar boundaries and its authoritative view of the bar
   * in progress.
   *
   * Called with REST history, which usually lands AFTER the live stream has
   * already opened a bar from whatever it saw since connect. That live bar
   * knows about prints the REST call was too early to include, and the REST
   * bar knows about the ones from before we connected, so the merge keeps the
   * REST open (the only correct one), the wider extremes, the live close, and
   * the larger volume rather than their sum — which would double-count the
   * overlap.
   */
  seed(
    candles: Array<Candle>,
    sourceTail: Array<Candle> = [],
    nowMs: number = Date.now(),
  ): void {
    const adopted = anchorOf(candles, this.widthMs)
    if (adopted !== null) this.anchor = adopted

    const newest = candles[candles.length - 1]
    if (newest === undefined) return
    const bucket = bucketStart(newest.ts, this.widthMs, this.anchor)
    // Only the bucket the clock is in can be the forming bar. A venue whose
    // newest bar is hours old (a pair that has not traded) must leave the
    // aggregator empty rather than adopt a stale bar and then "close" it.
    if (bucket !== bucketStart(nowMs, this.widthMs, this.anchor)) return

    if (this.bar !== null && this.bar.ts > bucket) return

    if (this.members) {
      for (const candle of sourceTail) {
        if (bucketStart(candle.ts, this.widthMs, this.anchor) !== bucket)
          continue
        // A live source bar already seen is fresher than the REST copy.
        if (!this.members.has(candle.ts))
          this.members.set(candle.ts, { ...candle })
      }
    }

    if (this.bar === null || this.bar.ts < bucket) {
      this.bar = { ...newest, ts: bucket }
      if (this.members) this.rebuildFromMembers(bucket)
      return
    }

    this.bar = {
      ts: bucket,
      open: newest.open,
      high: Math.max(this.bar.high, newest.high),
      low: Math.min(this.bar.low, newest.low),
      close: this.bar.close,
      volume: Math.max(this.bar.volume, newest.volume),
    }
    if (this.members) this.rebuildFromMembers(bucket)
  }

  /** One print. Prints older than the open bucket are dropped, not backfilled. */
  pushTrade(trade: {
    price: number
    size: number
    ts: number
  }): AggregateResult {
    if (!Number.isFinite(trade.price) || trade.price <= 0) return NOTHING
    if (!Number.isFinite(trade.ts) || trade.ts <= 0) return NOTHING
    const size = Number.isFinite(trade.size) && trade.size > 0 ? trade.size : 0
    const bucket = bucketStart(trade.ts, this.widthMs, this.anchor)
    if (this.bar !== null && bucket < this.bar.ts) return NOTHING

    const closed = this.rollTo(bucket)
    if (this.bar === null) {
      this.bar = {
        ts: bucket,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: 0,
      }
    }
    if (trade.price > this.bar.high) this.bar.high = trade.price
    if (trade.price < this.bar.low) this.bar.low = trade.price
    this.bar.close = trade.price
    this.bar.volume += size
    return { forming: { ...this.bar }, closed }
  }

  /** One finer-timeframe bar (fold mode). */
  pushSourceCandle(candle: Candle): AggregateResult {
    if (!this.members) {
      throw new Error('TradeCandleAggregator: not constructed in fold mode')
    }
    if (!Number.isFinite(candle.ts) || candle.ts <= 0) return NOTHING
    const bucket = bucketStart(candle.ts, this.widthMs, this.anchor)
    if (this.bar !== null && bucket < this.bar.ts) return NOTHING

    const closed = this.rollTo(bucket)
    this.members.set(candle.ts, { ...candle })
    this.rebuildFromMembers(bucket)
    return { forming: this.current(), closed }
  }

  /** Batch helper: last forming bar plus every bar the batch closed. */
  pushTrades(trades: Array<{ price: number; size: number; ts: number }>): {
    forming: Candle | null
    closed: Array<Candle>
  } {
    let forming: Candle | null = null
    const closed: Array<Candle> = []
    for (const trade of trades) {
      const result = this.pushTrade(trade)
      if (result.closed) closed.push(result.closed)
      if (result.forming) forming = result.forming
    }
    return { forming, closed }
  }

  /**
   * Close the open bar once the clock has left its bucket.
   *
   * A pair with no prints for an hour would otherwise never produce a bar
   * close, and bar close is what drives the volume reconciliation and the
   * terminal's signal scan. The next bucket is left empty rather than
   * synthesised: a flat bar invented from the last close is a lie the chart
   * would draw.
   */
  rollIfExpired(nowMs: number): Candle | null {
    if (this.bar === null) return null
    const bucket = bucketStart(nowMs, this.widthMs, this.anchor)
    if (bucket <= this.bar.ts) return null
    const closed = this.bar
    this.bar = null
    this.members?.clear()
    return closed
  }

  private rollTo(bucket: number): Candle | null {
    if (this.bar === null || bucket === this.bar.ts) return null
    const closed = this.bar
    this.bar = null
    this.members?.clear()
    return closed
  }

  private rebuildFromMembers(bucket: number): void {
    if (!this.members || this.members.size === 0) return
    const ordered = [...this.members.values()].sort((a, b) => a.ts - b.ts)
    const first = ordered[0]
    const last = ordered[ordered.length - 1]
    if (first === undefined || last === undefined) return
    let high = first.high
    let low = first.low
    let volume = 0
    for (const member of ordered) {
      if (member.high > high) high = member.high
      if (member.low < low) low = member.low
      volume += member.volume
    }
    // A seeded bar came from the venue's own target-timeframe candle, so it
    // covers source bars we never received (the days of the week before we
    // connected). Its open is the only correct one and its volume is a floor,
    // not a competitor to be summed with.
    const seeded = this.bar !== null && this.bar.ts === bucket ? this.bar : null
    this.bar = {
      ts: bucket,
      open: seeded ? seeded.open : first.open,
      high: seeded ? Math.max(high, seeded.high) : high,
      low: seeded ? Math.min(low, seeded.low) : low,
      close: last.close,
      volume: seeded ? Math.max(volume, seeded.volume) : volume,
    }
  }
}
