// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Wraps a ccxt-backed connector so `market-data:candles` and
 * `market-data:history` can be served from something other than the venue's
 * candle feed.
 *
 * This is a decorator rather than a branch inside the bridge on purpose. Three
 * of fourteen venues need it, the terminal-facing contract it has to satisfy is
 * exactly the one the shared shell already implements, and the pieces it
 * borrows — `CandleBuffer`, `backfillCandles`, the snapshot-then-updates
 * emission order — are the same pieces the stream hub uses. Everything else
 * (ticker, orderbook, trades, the platform and geo refusals, credential slots)
 * passes straight through to the plugin underneath, so the refusals still throw
 * synchronously from the same place and there is no second copy of them here.
 *
 * The contract it must not break, from the connector spec:
 *
 * - the first emission for a key is `{type:'snapshot'}` — the terminal gates
 *   live updates behind it, and a connector that never sends one strands the
 *   chart at "no data";
 * - a late subscriber on a warm key gets that snapshot replayed synchronously;
 * - `subscribe` returns a synchronous release, refcounted per key, and
 *   releasing twice is a no-op;
 * - platform/geo refusals throw synchronously out of `subscribe` — which they
 *   do, because the very first thing the derived path does is subscribe to the
 *   underlying stream.
 *
 * Volume is reconciled after every bar close. A bar assembled from the trade
 * tape only counts prints seen since the socket opened, and the venue's own
 * bar is authoritative, so a short delay after the boundary the closed bar is
 * re-read over REST and upserted. That also repairs the forming bar's open on
 * the pair the user just switched to.
 */

import { CandleBuffer } from '@pairlens/market-engine/candle-buffer'
import { backfillCandles } from '@pairlens/market-engine/candle-backfill'
import { olderThan } from '@pairlens/market-engine/candle-paging'
import { timeframeToMs } from '@pairlens/shared'
import { normalizePair } from './parser'
import { TradeCandleAggregator, foldCandles } from './trade-candle-aggregator'
import type { Candle, Timeframe } from '@pairlens/shared/types'
import type { Trade } from '@pairlens/market-engine/types'
import type {
  PluginExecuteParams,
  PluginInstance,
} from '@pairlens/plugin-system/types'

/** Where a timeframe's live bars come from. */
export type LiveCandleSource =
  /** Aggregate the trade tape — the venue streams no candles at all. */
  | { kind: 'trades' }
  /** The venue streams this timeframe itself; hand the subscription over. */
  | { kind: 'passthrough' }
  /** Fold the venue's finer candle stream into this timeframe. */
  | { kind: 'fold'; source: Timeframe }

export type DerivedCandleSpec = {
  /** Timeframes whose REST history is folded from a finer one: target → source. */
  historyFold?: Partial<Record<string, Timeframe>>
  liveSource: (timeframe: string) => LiveCandleSource
  /** Bars requested when a stream seeds itself. */
  backfillLimit?: number
  /** Chained source reads per folded history page. Each one is a venue call. */
  maxSourcePages?: number
  /** Quiet period after a bar closes before re-reading it over REST. 0 disables. */
  reconcileDelayMs?: number
  /** How often to check whether the open bucket has expired. 0 disables. */
  rollCheckMs?: number
  backfillRetryDelayMs?: number
  now?: () => number
}

const DEFAULT_BACKFILL_LIMIT = 300
const DEFAULT_MAX_SOURCE_PAGES = 5
const DEFAULT_RECONCILE_DELAY_MS = 6_000
const DEFAULT_ROLL_CHECK_MS = 5_000
/** Bars pulled to repair a closed bar: itself, the one after, one of slack. */
const RECONCILE_LIMIT = 3

type DerivedStream = {
  key: string
  pair: string
  timeframe: Timeframe
  /** Set in fold mode: the venue timeframe the live bars are built from. */
  sourceTimeframe: Timeframe | null
  aggregator: TradeCandleAggregator
  buffer: CandleBuffer
  callbacks: Map<number, (data: unknown) => void>
  release: (() => void) | null
  rollTimer: ReturnType<typeof setInterval> | null
  reconcileTimer: ReturnType<typeof setTimeout> | null
  /** True once our own REST read landed; a stream-side fold must not clobber it. */
  historyLoaded: boolean
  hasSnapshot: boolean
  disposed: boolean
}

export function withDerivedCandles(
  base: PluginInstance,
  spec: DerivedCandleSpec,
): PluginInstance {
  const streams = new Map<string, DerivedStream>()
  const now = spec.now ?? Date.now
  /** Source bars of the newest folded bucket, handed from fetch to apply. */
  const pendingTail = new Map<string, Array<Candle>>()
  /** Latest context seen on a subscribe — reconciliation runs outside a call. */
  let lastContext: PluginExecuteParams['context'] | null = null
  let nextCallbackId = 0

  // ── History ────────────────────────────────────────────────────────────

  function baseHistory(
    pair: string,
    timeframe: string,
    limit: number,
    context: PluginExecuteParams['context'],
    endTs?: number,
  ): Promise<Array<Candle>> {
    return base
      .execute({
        capability: 'market-data:history',
        params: {
          pair,
          timeframe,
          limit,
          ...(endTs !== undefined ? { endTs } : {}),
        },
        context,
      })
      .then((rows) => (Array.isArray(rows) ? (rows as Array<Candle>) : []))
  }

  /**
   * A page of a timeframe the venue does not serve, built out of one it does.
   *
   * Source reads are chained rather than issued at once: each page's oldest bar
   * is the next page's cursor, which is the only way to walk back through a
   * venue whose per-call cap (Coinbase 300) is smaller than one screen of
   * folded bars.
   */
  async function foldedHistory(
    pair: string,
    timeframe: Timeframe,
    sourceTf: Timeframe,
    limit: number,
    context: PluginExecuteParams['context'],
    endTs?: number,
  ): Promise<{ candles: Array<Candle>; tail: Array<Candle> }> {
    const factor = Math.max(
      1,
      Math.round(timeframeToMs(timeframe) / timeframeToMs(sourceTf)),
    )
    const need = limit * factor
    const maxPages = spec.maxSourcePages ?? DEFAULT_MAX_SOURCE_PAGES
    let collected: Array<Candle> = []
    let cursor = endTs

    for (let page = 0; page < maxPages && collected.length < need; page++) {
      const rows = await baseHistory(pair, sourceTf, need, context, cursor)
      if (rows.length === 0) break
      collected = [...rows, ...collected]
      const oldest = rows[0]
      if (oldest === undefined) break
      // No progress means the venue is replaying its boundary bar; another
      // page would loop on the same data forever.
      if (cursor !== undefined && oldest.ts >= cursor) break
      cursor = oldest.ts
    }

    const folded = foldCandles(collected, sourceTf, timeframe)
    const candles = olderThan(folded.candles, endTs).slice(-limit)
    return { candles, tail: folded.tail }
  }

  /** History for one timeframe, folded or straight through. */
  async function loadHistory(
    pair: string,
    timeframe: string,
    limit: number,
    context: PluginExecuteParams['context'],
    endTs?: number,
  ): Promise<{ candles: Array<Candle>; tail: Array<Candle> }> {
    const sourceTf = spec.historyFold?.[timeframe]
    if (sourceTf === undefined) {
      const candles = await baseHistory(pair, timeframe, limit, context, endTs)
      return { candles, tail: [] }
    }
    return foldedHistory(
      pair,
      timeframe as Timeframe,
      sourceTf,
      limit,
      context,
      endTs,
    )
  }

  async function execute(params: PluginExecuteParams): Promise<unknown> {
    if (params.capability !== 'market-data:history') return base.execute(params)
    const timeframe = String(
      params.params['timeframe'] ?? params.context.timeframe,
    )
    if (spec.historyFold?.[timeframe] === undefined) return base.execute(params)

    const pair = normalizePair(
      String(params.params['pair'] ?? params.context.pair),
    )
    const limit =
      typeof params.params['limit'] === 'number'
        ? params.params['limit']
        : DEFAULT_BACKFILL_LIMIT
    const endTs =
      typeof params.params['endTs'] === 'number'
        ? params.params['endTs']
        : undefined
    const loaded = await loadHistory(
      pair,
      timeframe,
      limit,
      params.context,
      endTs,
    )
    return loaded.candles
  }

  // ── Streams ────────────────────────────────────────────────────────────

  function emit(stream: DerivedStream, payload: unknown): void {
    for (const callback of stream.callbacks.values()) callback(payload)
  }

  function emitSnapshot(stream: DerivedStream): void {
    stream.hasSnapshot = true
    emit(stream, { type: 'snapshot', candles: stream.buffer.snapshot() })
  }

  function emitCandles(stream: DerivedStream, candles: Array<Candle>): void {
    if (candles.length === 0) return
    for (const candle of candles) stream.buffer.push(candle)
    emit(stream, { type: 'update', candles })
  }

  function applyLive(
    stream: DerivedStream,
    forming: Candle | null,
    closed: Array<Candle>,
  ): void {
    const out = [...closed]
    if (forming) out.push(forming)
    emitCandles(stream, out)
    if (closed.length > 0) scheduleReconcile(stream)
  }

  /**
   * Re-read a bar the venue has now finished, and upsert it.
   *
   * Only one repair is ever in flight per stream: a burst of closes (a
   * reconnect replaying several buckets) collapses into the single read that
   * covers all of them, because the read is by recency, not by timestamp.
   */
  function scheduleReconcile(stream: DerivedStream): void {
    const delay = spec.reconcileDelayMs ?? DEFAULT_RECONCILE_DELAY_MS
    if (delay <= 0 || stream.reconcileTimer !== null) return
    stream.reconcileTimer = setTimeout(() => {
      stream.reconcileTimer = null
      if (stream.disposed) return
      void reconcile(stream)
    }, delay)
    unref(stream.reconcileTimer)
  }

  async function reconcile(stream: DerivedStream): Promise<void> {
    const context = lastContext
    if (!context) return
    try {
      const loaded = await loadHistory(
        stream.pair,
        stream.timeframe,
        RECONCILE_LIMIT,
        context,
      )
      if (stream.disposed || loaded.candles.length === 0) return
      // The venue's own bars win over what the tape added up to; the forming
      // bar is re-seeded from the same read so its open stops drifting.
      emitCandles(stream, loaded.candles)
      stream.aggregator.seed(loaded.candles, loaded.tail, now())
    } catch {
      // A failed repair leaves the aggregated bar in place. It is close
      // enough to keep drawing, and the next close tries again.
    }
  }

  function startBackfill(
    stream: DerivedStream,
    context: PluginExecuteParams['context'],
  ): void {
    backfillCandles({
      fetch: () =>
        loadHistory(
          stream.pair,
          stream.timeframe,
          spec.backfillLimit ?? DEFAULT_BACKFILL_LIMIT,
          context,
        ).then((loaded) => {
          pendingTail.set(stream.key, loaded.tail)
          return loaded.candles
        }),
      isLive: () => streams.get(stream.key) === stream,
      apply: (candles) => {
        const tail = pendingTail.get(stream.key) ?? []
        pendingTail.delete(stream.key)
        stream.historyLoaded = true
        mergeHistory(stream, candles, tail)
      },
      ...(spec.backfillRetryDelayMs !== undefined
        ? { retryDelayMs: spec.backfillRetryDelayMs }
        : {}),
    })
  }

  /**
   * Fold REST history under whatever the live stream already built.
   *
   * The live bar is not discarded: `seed` merges the two and the merged result
   * is pushed back over the loaded buffer, so a chart that has been open for
   * ten minutes does not lose those ten minutes to its own backfill.
   */
  function mergeHistory(
    stream: DerivedStream,
    candles: Array<Candle>,
    tail: Array<Candle>,
  ): void {
    if (candles.length === 0) {
      if (!stream.hasSnapshot) emitSnapshot(stream)
      return
    }
    const live = stream.aggregator.current()
    stream.buffer.load(candles)
    stream.aggregator.seed(candles, tail, now())
    if (live !== null) {
      const merged = stream.aggregator.current()
      if (merged !== null) stream.buffer.push(merged)
    }
    emitSnapshot(stream)
  }

  function onTrades(stream: DerivedStream, data: unknown): void {
    const trades = (data as { trades?: Array<Trade> } | null)?.trades
    if (!Array.isArray(trades) || trades.length === 0) return
    const result = stream.aggregator.pushTrades(trades)
    applyLive(stream, result.forming, result.closed)
  }

  function onSourceCandles(stream: DerivedStream, data: unknown): void {
    const frame = data as { type?: string; candles?: Array<Candle> } | null
    const candles = frame?.candles
    if (!Array.isArray(candles) || candles.length === 0) return

    const sourceTf = stream.sourceTimeframe
    if (sourceTf === null) return

    if (frame?.type === 'snapshot') {
      // The underlying stream's own REST backfill, already on the wire. Fold
      // it for a first paint; our deeper read replaces it when it lands.
      const folded = foldCandles(candles, sourceTf, stream.timeframe)
      if (!stream.historyLoaded) {
        stream.buffer.load(folded.candles)
        stream.aggregator.seed(folded.candles, folded.tail, now())
        emitSnapshot(stream)
      }
      return
    }

    const closed: Array<Candle> = []
    let forming: Candle | null = null
    for (const candle of candles) {
      const result = stream.aggregator.pushSourceCandle(candle)
      if (result.closed) closed.push(result.closed)
      if (result.forming) forming = result.forming
    }
    applyLive(stream, forming, closed)
  }

  function startStream(
    stream: DerivedStream,
    source: Exclude<LiveCandleSource, { kind: 'passthrough' }>,
    context: PluginExecuteParams['context'],
  ): void {
    const request: PluginExecuteParams =
      source.kind === 'trades'
        ? {
            capability: 'market-data:trades',
            params: { pair: stream.pair },
            context,
          }
        : {
            capability: 'market-data:candles',
            params: { pair: stream.pair, timeframe: source.source },
            context,
          }
    const onData =
      source.kind === 'trades'
        ? (data: unknown) => onTrades(stream, data)
        : (data: unknown) => onSourceCandles(stream, data)
    stream.release = base.subscribe?.(request, onData) ?? null

    startBackfill(stream, context)

    const rollMs = spec.rollCheckMs ?? DEFAULT_ROLL_CHECK_MS
    if (rollMs > 0) {
      stream.rollTimer = setInterval(() => {
        const closed = stream.aggregator.rollIfExpired(now())
        if (closed) applyLive(stream, null, [closed])
      }, rollMs)
      unref(stream.rollTimer)
    }
  }

  function dispose(stream: DerivedStream): void {
    stream.disposed = true
    stream.release?.()
    stream.release = null
    if (stream.rollTimer) clearInterval(stream.rollTimer)
    if (stream.reconcileTimer) clearTimeout(stream.reconcileTimer)
    stream.rollTimer = null
    stream.reconcileTimer = null
    pendingTail.delete(stream.key)
  }

  function subscribe(
    params: PluginExecuteParams,
    callback: (data: unknown) => void,
  ): () => void {
    if (params.capability !== 'market-data:candles') {
      return base.subscribe?.(params, callback) ?? (() => {})
    }
    const timeframe = String(
      params.params['timeframe'] ?? params.context.timeframe,
    )
    const source = spec.liveSource(timeframe)
    if (source.kind === 'passthrough') {
      return base.subscribe?.(params, callback) ?? (() => {})
    }

    const pair = normalizePair(
      String(params.params['pair'] ?? params.context.pair),
    )
    const key = `${pair}:${timeframe}`
    lastContext = params.context

    let stream = streams.get(key)
    const fresh = stream === undefined
    if (!stream) {
      stream = {
        key,
        pair,
        timeframe: timeframe as Timeframe,
        sourceTimeframe: source.kind === 'fold' ? source.source : null,
        aggregator: new TradeCandleAggregator({
          timeframe: timeframe as Timeframe,
          ...(source.kind === 'fold' ? { sourceTimeframe: source.source } : {}),
        }),
        buffer: new CandleBuffer(),
        callbacks: new Map(),
        release: null,
        rollTimer: null,
        reconcileTimer: null,
        historyLoaded: false,
        hasSnapshot: false,
        disposed: false,
      }
      streams.set(key, stream)
    }

    const id = nextCallbackId++
    const current = stream
    current.callbacks.set(id, callback)

    if (fresh) {
      try {
        // Refusals (desktop-only, geo) surface from the underlying subscribe
        // and must stay synchronous — the terminal reads them to decide
        // between the desktop notice and the region dialog.
        startStream(current, source, params.context)
      } catch (error) {
        streams.delete(key)
        dispose(current)
        throw error
      }
    } else if (current.buffer.length > 0) {
      callback({ type: 'snapshot', candles: current.buffer.snapshot() })
    }

    let released = false
    return () => {
      if (released) return
      released = true
      const entry = streams.get(key)
      if (!entry || !entry.callbacks.delete(id)) return
      if (entry.callbacks.size > 0) return
      streams.delete(key)
      dispose(entry)
    }
  }

  async function destroy(): Promise<void> {
    for (const stream of streams.values()) dispose(stream)
    streams.clear()
    await base.destroy?.()
  }

  return { ...base, execute, subscribe, destroy }
}

function unref(timer: ReturnType<typeof setTimeout>): void {
  ;(timer as unknown as { unref?: () => void }).unref?.()
}
