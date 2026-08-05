// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react'

import { validateCandle } from '@pairlens/market-engine/validation'
import { sortCandlesAscending } from '@pairlens/market-engine/candle-buffer'
import { StalenessTracker } from '@pairlens/market-engine/staleness'
import {
  isGeoRestrictedError,
  isPlatformRestrictedError,
} from '@pairlens/market-engine/errors'
import { scanSignals } from '@pairlens/strategy-engine'
import type { SignalScan } from '@pairlens/strategy-engine'
import type { CandleUpdate } from '@pairlens/market-engine/types'
import type { Candle, SignalPayload } from '@pairlens/shared/types'
import type { MarketDataStatus } from '@/lib/market-data-provider'
import { useGeoRestrictionStore } from '@/stores/geo-restriction-store'
import { useMarketData } from '@/lib/market-data-provider'
import { normalizePairKey } from '@/lib/pairs'

// A connected stream that delivers no candle updates for this long is flagged
// stale ("no recent market activity"). Conservative so quiet pairs don't flap.
const STALE_THRESHOLD_MS = 30_000
const STALE_CHECK_INTERVAL_MS = 5_000
// Once the transport is connected we expect the REST backfill snapshot quickly.
// If none arrives within this window the pair is almost certainly unavailable
// on this connector (no such market, or a region/listing gap). We surface that
// as a graceful empty state instead of an indefinite spinner.
const NO_DATA_TIMEOUT_MS = 12_000
// Live WS updates flowing with no snapshot means the connector's REST
// backfill died (rate limit, outage) even after its retry. The chart gates
// on hasSnapshot, so without this guard it would stay empty/stale forever
// while the ticker and orderbook stream on. After this window we promote the
// accumulated updates to a seed — a short live chart beats a dead one.
// Venue-agnostic: covers third-party connectors that never emit a snapshot.
const PROMOTE_UPDATES_AFTER_MS = 8_000

export type PluginCandle = {
  ts: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type CandleStreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

type UseCandleStreamOptions = {
  market: string
  pairKey: string
  timeframe?: string
  enabled?: boolean
}

type UseCandleStreamResult = {
  candles: Array<PluginCandle>
  latestCandle: PluginCandle | null
  latestSignal: SignalPayload | null
  /**
   * Historical signal scan over the candle buffer: regime plus every signal
   * run detected in the recent lookback window, newest-first. Recomputed on
   * snapshot arrival and on bar close — never per tick.
   */
  signalScan: SignalScan | null
  status: CandleStreamStatus
  errorMessage: string | null
  hasSnapshot: boolean
  /** Connected but no candle updates within the staleness threshold. */
  stale: boolean
  /**
   * Connected but no snapshot arrived within NO_DATA_TIMEOUT_MS — the pair is
   * effectively unavailable on this connector. Drives a graceful empty state.
   */
  noData: boolean
  /**
   * The connector cannot work in this build at all (browser + a venue whose
   * REST is CORS-blocked and whose WS carries no history). Distinct from
   * `noData`: nothing is wrong with the pair, so the UI offers the desktop app
   * rather than another pair.
   */
  desktopOnly: boolean
}

const MAX_CANDLES = 500

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

const isCandle = (v: unknown): v is PluginCandle =>
  typeof v === 'object' &&
  v !== null &&
  isFiniteNumber((v as PluginCandle).ts) &&
  isFiniteNumber((v as PluginCandle).open) &&
  isFiniteNumber((v as PluginCandle).high) &&
  isFiniteNumber((v as PluginCandle).low) &&
  isFiniteNumber((v as PluginCandle).close) &&
  isFiniteNumber((v as PluginCandle).volume)

// Reasons we've already warned about, so a misbehaving connector logs once
// rather than on every tick.
const loggedDropReasons = new Set<string>()

/**
 * Accept a candle only if it is structurally a candle AND passes the shared
 * runtime contract (epoch-ms ts, positive OHLC, low <= open/close <= high).
 * Corrupt candles are dropped before they reach the chart or signal engine —
 * this is the single chokepoint every connector's candles flow through.
 */
const acceptCandle = (v: unknown): v is PluginCandle => {
  if (!isCandle(v)) return false
  const result = validateCandle(v)
  if (!result.ok) {
    const reason = result.errors[0] ?? 'invalid candle'
    if (!loggedDropReasons.has(reason)) {
      loggedDropReasons.add(reason)
      console.warn(`[candle-stream] dropped invalid candle: ${reason}`)
    }
    return false
  }
  return true
}

const upsertCandle = (candles: Array<PluginCandle>, incoming: PluginCandle) => {
  const len = candles.length

  if (len > 0 && candles[len - 1].ts === incoming.ts) {
    const next = candles.slice()
    next[len - 1] = incoming
    return next
  }

  if (len === 0 || incoming.ts > candles[len - 1].ts) {
    const next = len >= MAX_CANDLES ? candles.slice(1) : candles.slice()
    next.push(incoming)
    return next
  }

  const next = candles.slice()
  const idx = next.findIndex((c) => c.ts === incoming.ts)
  if (idx >= 0) {
    next[idx] = incoming
  } else {
    const insertAt = next.findIndex((c) => c.ts > incoming.ts)
    if (insertAt === -1) next.push(incoming)
    else next.splice(insertAt, 0, incoming)
  }
  return next.length > MAX_CANDLES ? next.slice(-MAX_CANDLES) : next
}

// How many recent bar positions the signal scan evaluates. With the 500-candle
// buffer this covers hours-to-weeks depending on timeframe while keeping the
// scan around a few ms — and it only runs on snapshot/bar close.
const SIGNAL_SCAN_LOOKBACK = 150

// Last scan per stream key, so switching back to a pair shows its signals
// instantly while the fresh snapshot (and rescan) is in flight.
const signalScanCache = new Map<string, SignalScan>()
const SIGNAL_SCAN_CACHE_MAX = 64

const cacheSignalScan = (key: string, scan: SignalScan) => {
  signalScanCache.delete(key)
  signalScanCache.set(key, scan)
  if (signalScanCache.size > SIGNAL_SCAN_CACHE_MAX) {
    const oldest = signalScanCache.keys().next().value
    if (oldest !== undefined) signalScanCache.delete(oldest)
  }
}

const mapStatus = (
  mdStatus: MarketDataStatus,
  enabled: boolean,
): CandleStreamStatus => {
  switch (mdStatus) {
    case 'connected':
      return 'connected'
    case 'connecting':
      return 'connecting'
    case 'disconnected':
    default:
      return enabled ? 'reconnecting' : 'idle'
  }
}

export function useCandleStream(
  options: UseCandleStreamOptions,
): UseCandleStreamResult {
  const { market, pairKey, timeframe = '15m', enabled = true } = options

  const {
    subscribe,
    fetchHistory,
    status: mdStatus,
    streamVersion,
  } = useMarketData()

  const normalizedPairKey = useMemo(() => normalizePairKey(pairKey), [pairKey])

  const [candles, setCandles] = useState<Array<PluginCandle>>([])
  const [signalScan, setSignalScan] = useState<SignalScan | null>(null)
  // ts of the forming bar the last scan ran against — the bail that keeps the
  // scan off the per-tick path. null forces a rescan (fresh stream).
  const lastScannedTsRef = useRef<number | null>(null)
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [noData, setNoData] = useState(false)
  const [desktopOnly, setDesktopOnly] = useState(false)
  const stalenessRef = useRef(new StalenessTracker())

  const prevStreamKeyRef = useRef(`${market}:${normalizedPairKey}:${timeframe}`)
  const streamKey = `${market}:${normalizedPairKey}:${timeframe}`
  if (prevStreamKeyRef.current !== streamKey) {
    setCandles([])
    setHasSnapshot(false)
    setSignalScan(signalScanCache.get(streamKey) ?? null)
    lastScannedTsRef.current = null
    setStreamError(null)
    setNoData(false)
    setDesktopOnly(false)
    prevStreamKeyRef.current = streamKey
  }

  useEffect(() => {
    if (!enabled || normalizedPairKey.length === 0) {
      setCandles([])
      setSignalScan(null)
      lastScannedTsRef.current = null
      setHasSnapshot(false)
      setStreamError(null)
      setNoData(false)
      setDesktopOnly(false)
      return
    }

    if (mdStatus !== 'connected') return

    const sk = `${market}:${normalizedPairKey}:${timeframe}`
    setCandles([])
    setSignalScan(signalScanCache.get(sk) ?? null)
    lastScannedTsRef.current = null
    setHasSnapshot(false)
    setStreamError(null)
    setNoData(false)
    setDesktopOnly(false)

    const staleness = stalenessRef.current
    staleness.reset()
    setStale(false)

    // If no snapshot arrives in time, the pair is unavailable on this
    // connector — flag it so the UI can show an empty state with a CTA.
    let noDataTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      noDataTimer = null
      setNoData(true)
    }, NO_DATA_TIMEOUT_MS)
    const clearNoDataTimer = () => {
      if (noDataTimer) {
        clearTimeout(noDataTimer)
        noDataTimer = null
      }
    }

    // Snapshot-promotion guard: see PROMOTE_UPDATES_AFTER_MS.
    let sawSnapshot = false
    let promoteTimer: ReturnType<typeof setTimeout> | null = null
    const clearPromoteTimer = () => {
      if (promoteTimer) {
        clearTimeout(promoteTimer)
        promoteTimer = null
      }
    }

    let unsubscribe: () => void = () => {}
    try {
      unsubscribe = subscribe(market, normalizedPairKey, timeframe, (data) => {
        const update = data as CandleUpdate
        if (!update?.candles) return

        // Any delivered data means the pair is live on this connector — so it
        // is reachable from this region. Clear any prior geo-block for it.
        clearNoDataTimer()
        setNoData(false)
        useGeoRestrictionStore.getState().clearForMarket(market)

        // Any delivered update counts as activity for staleness detection.
        staleness.mark(Date.now())
        setStale(false)

        if (update.type === 'snapshot') {
          sawSnapshot = true
          clearPromoteTimer()
          // Defense in depth: a misbehaving/contract-drifted connector may
          // backfill candles out of order. The chart engine assumes ascending
          // ts, so normalize here too (connectors also sort at the source).
          const valid = sortCandlesAscending(
            update.candles.filter(acceptCandle),
          )
          setCandles(valid.slice(-MAX_CANDLES))
          setHasSnapshot(true)
          setStreamError(null)
        } else {
          // Single candle update
          for (const c of update.candles) {
            if (acceptCandle(c)) {
              setCandles((prev) => upsertCandle(prev, c))
            }
          }
          // Updates are flowing but no snapshot yet — arm the promotion
          // timer once. If a real snapshot lands first it wins; otherwise
          // the accumulated updates become the seed.
          if (!sawSnapshot && promoteTimer === null) {
            promoteTimer = setTimeout(() => {
              promoteTimer = null
              if (!sawSnapshot) setHasSnapshot(true)
            }, PROMOTE_UPDATES_AFTER_MS)
          }
          setStreamError(null)
        }
      })
    } catch (err) {
      // A connector can throw synchronously on subscribe when it statically
      // knows the venue is unavailable for the user's region (proactive geo
      // block, e.g. ByBit in the US). Surface it as a region restriction.
      clearNoDataTimer()
      // The venue is unreachable from a browser build (CORS + no WS history).
      // Surfaced as its own state so the UI can offer the desktop app instead
      // of implying the pair or the region is the problem.
      if (isPlatformRestrictedError(err)) {
        setDesktopOnly(true)
        setStreamError(null)
        return
      }
      if (isGeoRestrictedError(err)) {
        useGeoRestrictionStore.getState().report({
          exchange: err.exchange,
          market,
          region: err.region,
        })
      }
      setStreamError((err as Error)?.message ?? 'Subscription failed')
      return
    }

    // Periodically re-evaluate staleness, since "no data" produces no events.
    const staleTimer = setInterval(() => {
      setStale(staleness.isStale(Date.now(), STALE_THRESHOLD_MS))
    }, STALE_CHECK_INTERVAL_MS)

    return () => {
      unsubscribe()
      clearInterval(staleTimer)
      clearNoDataTimer()
      clearPromoteTimer()
      staleness.reset()
      setStale(false)
    }
  }, [
    enabled,
    market,
    normalizedPairKey,
    subscribe,
    mdStatus,
    timeframe,
    streamVersion,
  ])

  // Reactive geo-block detection. When the stream connects but no snapshot
  // arrives (noData), the WS may have been silently refused at the network
  // layer — which looks identical to an unsupported pair. A connector blocked
  // for the region, however, returns a clean 451/403 over REST. Probe once with
  // a single-candle history fetch: a GeoRestrictedError confirms a region block
  // (the proactive path already covers connectors that throw on subscribe).
  useEffect(() => {
    if (!noData || !enabled || normalizedPairKey.length === 0) return
    let cancelled = false
    fetchHistory(market, normalizedPairKey, timeframe, 1).catch((err) => {
      if (cancelled) return
      if (isGeoRestrictedError(err)) {
        useGeoRestrictionStore.getState().report({
          exchange: err.exchange,
          market,
          region: err.region,
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [noData, enabled, market, normalizedPairKey, timeframe, fetchHistory])

  // Signal scan: recompute when the snapshot lands and on every bar close.
  // The newest bar is the forming one, so keying on its ts means this fires
  // exactly once per bar rollover (plus once per snapshot) — the O(lookback×n)
  // scan never runs on the per-tick path. Signals confirm on close, so the
  // forming bar itself is excluded from the evaluated window.
  useEffect(() => {
    if (!hasSnapshot || candles.length < 2) return
    const formingTs = candles[candles.length - 1].ts
    if (formingTs === lastScannedTsRef.current) return
    lastScannedTsRef.current = formingTs
    const closed: ReadonlyArray<Candle> = candles.slice(0, -1)
    const scan = scanSignals(closed, SIGNAL_SCAN_LOOKBACK)
    setSignalScan(scan)
    cacheSignalScan(streamKey, scan)
  }, [candles, hasSnapshot, streamKey])

  const latestCandle = useMemo(
    () => candles[candles.length - 1] ?? null,
    [candles],
  )

  const latestSignal: SignalPayload | null =
    signalScan?.signals[0]?.signal ?? null

  return {
    candles,
    latestCandle,
    latestSignal,
    signalScan,
    status: mapStatus(mdStatus, enabled),
    errorMessage: streamError,
    hasSnapshot,
    stale,
    noData,
    desktopOnly,
  }
}
