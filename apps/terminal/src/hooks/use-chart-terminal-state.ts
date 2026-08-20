// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  ChartCommand,
  ChartContextMenuPayload,
  ChartType,
  CompareMode,
  CrosshairMode,
  DrawingObject,
  DrawingStyleDefaults,
  DrawingToolMode,
  DrawingToolType,
  FastFinancialChartRef,
  IndicatorInstanceInput,
  LineStyleType,
  PriceLine,
  PriceScaleMode,
  Timeframe,
} from '@pairlens/fast-financial-charts/types'
import type { AssetClass } from '@pairlens/market-engine'
import type { PluginCandle } from '@/hooks/use-candle-stream'
import { track } from '@/lib/analytics-events'
import { trackDrawingToolUse } from '@/lib/chart-drawing-tools'
import { emitWrite, onHydrate, onWrite } from '@/lib/sync/sync-channel'
import {
  chartBucketMs,
  classScopedChartKey,
  defaultChartTypeForAssetClass,
  defaultCompareModeForAssetClass,
  fillPredictionBars,
  primaryAssetClass,
} from '@/lib/chart-defaults'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { usePredictionOutcome } from '@/stores/prediction-directory-store'
import {
  buildCustomIndicatorDefinition,
  setCustomIndicatorMarketContext,
} from '@/lib/indicators/custom-indicator-definitions'
import {
  customIndicatorRegistry,
  customIndicatorSourceKey,
} from '@/lib/indicators/custom-indicator-registry'
import { useMarketData } from '@/lib/market-data-provider'
import { clampTimeframeToVenue } from '@/lib/chart-timeframes'
import {
  MIN_HEALTHY_SEED_BARS,
  mergeDeeperSnapshot,
  shouldBackfillOlderHistory,
  snapshotDeepensSeed,
  viewportAfterPrepend,
} from '@/lib/chart-seed'
import { useNotificationStore } from '@/stores/notification-store'
import { useCandleStream } from '@/hooks/use-candle-stream'
import { useOrderbookStream } from '@/hooks/use-orderbook-stream'
import { useTickerStream } from '@/hooks/use-ticker-stream'
import { CandleCache, candleCache } from '@/lib/candle-cache'
import { STORAGE_PREFIX, usePersistedState } from '@/hooks/use-persisted-state'

const toChartTimeframe = (timeframe: string): Timeframe =>
  timeframe as Timeframe

const INDICATORS_STORAGE_KEY = 'pairlens:terminal.indicators'

function loadIndicatorsForPair(pairKey: string): Array<IndicatorInstanceInput> {
  try {
    const stored = localStorage.getItem(INDICATORS_STORAGE_KEY)
    if (stored) {
      const map = JSON.parse(stored) as Record<
        string,
        Array<IndicatorInstanceInput>
      >
      return map[pairKey] ?? []
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

function saveIndicatorsForPair(
  pairKey: string,
  indicators: Array<IndicatorInstanceInput>,
) {
  try {
    const stored = localStorage.getItem(INDICATORS_STORAGE_KEY)
    const map: Record<string, Array<IndicatorInstanceInput>> = stored
      ? JSON.parse(stored)
      : {}
    if (indicators.length > 0) {
      map[pairKey] = indicators
    } else {
      delete map[pairKey]
    }
    localStorage.setItem(INDICATORS_STORAGE_KEY, JSON.stringify(map))
    emitWrite('terminal.indicators', map)
  } catch {
    // Ignore storage errors
  }
}

export type MarketOption = { value: string; label: string }

// ── Drawing persistence (per market:pair, like TradingView per-symbol) ──

const DRAWINGS_STORAGE_KEY = 'pairlens:terminal.drawings'

function loadDrawingsForKey(key: string): Array<DrawingObject> {
  try {
    const stored = localStorage.getItem(DRAWINGS_STORAGE_KEY)
    if (stored) {
      const map = JSON.parse(stored) as Record<string, Array<DrawingObject>>
      return map[key] ?? []
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

function saveDrawingsForKey(key: string, drawings: Array<DrawingObject>) {
  try {
    const stored = localStorage.getItem(DRAWINGS_STORAGE_KEY)
    const map: Record<string, Array<DrawingObject>> = stored
      ? JSON.parse(stored)
      : {}
    if (drawings.length > 0) {
      map[key] = drawings
    } else {
      delete map[key]
    }
    localStorage.setItem(DRAWINGS_STORAGE_KEY, JSON.stringify(map))
    emitWrite('terminal.drawings', map)
  } catch {
    // Ignore storage errors
  }
}

// ── Per-tool drawing style defaults (global, not per pair) ──

const DRAWING_STYLE_DEFAULTS_KEY = 'pairlens:terminal.drawingStyleDefaults'

function loadDrawingStyleDefaults(): DrawingStyleDefaults {
  try {
    const stored = localStorage.getItem(DRAWING_STYLE_DEFAULTS_KEY)
    if (stored) return JSON.parse(stored) as DrawingStyleDefaults
  } catch {
    // Ignore parse errors
  }
  return {}
}

function saveDrawingStyleDefaults(defaults: DrawingStyleDefaults) {
  try {
    localStorage.setItem(DRAWING_STYLE_DEFAULTS_KEY, JSON.stringify(defaults))
  } catch {
    // Ignore storage errors
  }
}

// ── Symbol compare (TradingView "Compare" overlay) ────────────────────

export type CompareSymbol = { pairKey: string; market: string; color: string }

const COMPARE_STORAGE_KEY = 'pairlens:terminal.compareSymbols'

/** Palette for compare series — first entries mirror the drawing presets. */
const COMPARE_COLORS = [
  '#ffb020',
  '#a855f7',
  '#22c55e',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]

export const compareSeriesId = (entry: {
  market: string
  pairKey: string
}): string => `cmp:${entry.market}:${entry.pairKey}`

function loadCompareSymbolsForPair(pairKey: string): Array<CompareSymbol> {
  try {
    const stored = localStorage.getItem(COMPARE_STORAGE_KEY)
    if (stored) {
      const map = JSON.parse(stored) as Record<string, Array<CompareSymbol>>
      return map[pairKey] ?? []
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

function saveCompareSymbolsForPair(
  pairKey: string,
  symbols: Array<CompareSymbol>,
) {
  try {
    const stored = localStorage.getItem(COMPARE_STORAGE_KEY)
    const map: Record<string, Array<CompareSymbol>> = stored
      ? JSON.parse(stored)
      : {}
    if (symbols.length > 0) {
      map[pairKey] = symbols
    } else {
      delete map[pairKey]
    }
    localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(map))
    emitWrite('terminal.compareSymbols', map)
  } catch {
    // Ignore storage errors
  }
}

// ── Asset class ──────────────────────────────────────────────────────

/**
 * Which class of thing this chart is drawing.
 *
 * Same two signals, in the same order, as the formatter path
 * (`use-prediction-pair.ts`): a pinned outcome IS a prediction, whatever the
 * terminal currently thinks of the venue, and otherwise the venue's own
 * declaration answers. Neither reads a streaming context, so this is safe
 * everywhere including mobile chrome.
 *
 * On a cold load the venue list is still empty for a beat, which is why the
 * preference hook below re-resolves on a class change rather than trusting
 * the first paint.
 */
function useChartAssetClass(pairKey: string, market: string): AssetClass {
  const pinnedOutcome = usePredictionOutcome(pairKey)
  const { markets } = useAvailableMarkets()

  return useMemo(() => {
    if (pinnedOutcome) return 'prediction'
    const venue = markets.find((m) => m.value === market)
    return primaryAssetClass(venue?.assetClasses)
  }, [pinnedOutcome, market, markets])
}

/**
 * A persisted preference whose storage key AND default both move when the
 * asset class does.
 *
 * `usePersistedState` cannot do this. Its state survives a key change with no
 * stored value behind the new key, which is exactly the case here: a cold
 * `/pair/KXBTCD-…` load resolves as crypto-spot for one paint (the plugin
 * manager has not published its venues yet), then flips to prediction. Without
 * the re-resolve below, the chart would sit on the spot default forever and
 * the whole class default would only work on a second visit.
 *
 * Everything else matches `usePersistedState`: same `pairlens:` prefix, same
 * cross-instance write bus, same cloud-hydrate channel.
 */
function useClassScopedPreference<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const storageKey = `${STORAGE_PREFIX}${key}`

  const readStored = useCallback((): T | null => {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) return JSON.parse(stored) as T
    } catch {
      // Unreadable or unparseable — treat as missing.
    }
    return null
  }, [storageKey])

  const [state, setStateRaw] = useState<T>(() => readStored() ?? defaultValue)

  // Key or class changed: adopt what is stored under the NEW key, or fall back
  // to the new class default. No write — a class the user never configured
  // should not gain a stored row just from being looked at.
  useEffect(() => {
    setStateRaw(readStored() ?? defaultValue)
  }, [readStored, defaultValue])

  useEffect(() => {
    return onHydrate((hydratedKey, value) => {
      if (hydratedKey === key) setStateRaw(value as T)
    })
  }, [key])

  useEffect(() => {
    return onWrite((writtenKey, value) => {
      if (writtenKey === key) setStateRaw(value as T)
    })
  }, [key])

  const setState = useCallback(
    (value: T) => {
      setStateRaw(value)
      try {
        localStorage.setItem(storageKey, JSON.stringify(value))
      } catch {
        // Quota or private browsing — the in-memory value still applies.
      }
      // Deferred for the same reason usePersistedState defers it: emitWrite
      // synchronously setStates every sibling instance sharing the key.
      queueMicrotask(() => emitWrite(key, value))
    },
    [storageKey, key],
  )

  return [state, setState]
}

export function useChartTerminalState(
  pairKey: string,
  options?: {
    availableMarkets: Array<MarketOption>
    defaultMarket: string
    defaultTimeframe?: string
    /**
     * Persistence scope for per-chart state. When set (workspace panes pass
     * their pane id), market/timeframe/chart-type/scale settings persist
     * per-pane so multi-chart layouts hold independent state. Unset (the main
     * pair page) keeps the shared global keys. User-preference toggles
     * (crosshair, drawing mode, bid/ask) stay global regardless.
     */
    scope?: string
    /**
     * The venue, when something above owns it. The chart route passes the one
     * in its URL, because a chart is of a specific tape and that has to be in
     * the address: a shared link used to hand the recipient whichever venue
     * they happened to prefer, and switching venue changed the drawing set
     * (keyed `market:pair`) with no history entry, so back could not undo it.
     *
     * Unset for workspace panes, which keep owning their own venue.
     */
    marketOverride?: string
    /** Called on every venue change so the owner can move the URL. */
    onMarketChange?: (market: string) => void
  },
) {
  const defaultMarket = options?.defaultMarket ?? 'okx'
  const scope = options?.scope
  const onMarketChange = options?.onMarketChange
  // Stable per mount — panes never change their id while mounted.
  const scopedKey = (base: string) => (scope ? `${base}::${scope}` : base)
  const [persistedMarket, setPersistedMarket] = usePersistedState<string>(
    scopedKey('terminal.market'),
    defaultMarket,
  )
  const market = options?.marketOverride ?? persistedMarket
  // The persisted value is still written under an override: it is the user's
  // venue PREFERENCE, which discovery panes and pickers read to decide where
  // to price a row they have no venue for. Only the chart's own venue moved
  // into the URL.
  const setMarket = useCallback(
    (next: string) => {
      setPersistedMarket(next)
      onMarketChange?.(next)
    },
    [setPersistedMarket, onMarketChange],
  )
  const [persistedTimeframe, setPersistedTimeframe] = usePersistedState<string>(
    scopedKey('terminal.timeframe'),
    '15m',
  )
  // When a workspace variable provides a timeframe, use it as the active value.
  // The user can still change it via the chart toolbar (which updates the
  // persisted value), but the variable acts as the initial/default timeframe.
  const requestedTimeframe = options?.defaultTimeframe ?? persistedTimeframe

  // What the ACTIVE venue serves, and the interval to actually chart.
  //
  // Not every venue serves the nine the toolbar draws: a prediction venue
  // publishes three or four, and asking one for an interval it does not have
  // fails the history probe — which is also the availability probe, so the
  // pair would then be published as unlisted and every pane would follow the
  // chart into an empty state. The clamp lands BEFORE the subscription; the
  // stored preference is deliberately left alone, so leaving the venue
  // restores the user's own choice rather than the one it was narrowed to.
  const { getTimeframes } = useMarketData()
  const supportedTimeframes = useMemo(
    () => getTimeframes(market),
    [getTimeframes, market],
  )
  const timeframe = useMemo(
    () => clampTimeframeToVenue(requestedTimeframe, supportedTimeframes),
    [requestedTimeframe, supportedTimeframes],
  )
  const setTimeframe = useCallback(
    (tf: string) => {
      track('timeframe_changed', { timeframe: tf })
      setPersistedTimeframe(tf)
    },
    [setPersistedTimeframe],
  )
  // What this chart is drawing, which decides how it opens.
  const assetClass = useChartAssetClass(pairKey, market)
  const isPredictionInstrument = assetClass === 'prediction'

  // Chart type persists PER CLASS: `terminal.chartType.prediction`,
  // `terminal.chartType.crypto-spot`, and so on, with the pane scope appended
  // as before. One user, two habits — candles on BTC, a probability line on an
  // election outcome — and neither setting overwrites the other. The old
  // unscoped `terminal.chartType` row is simply never read again; nothing
  // migrates it, by house rule.
  const [chartType, setPersistedChartType] =
    useClassScopedPreference<ChartType>(
      classScopedChartKey('terminal.chartType', assetClass, scope),
      defaultChartTypeForAssetClass(assetClass),
    )
  const setChartType = useCallback(
    (type: ChartType) => {
      track('chart_type_changed', { chart_type: type, asset_class: assetClass })
      setPersistedChartType(type)
    },
    [assetClass, setPersistedChartType],
  )
  const [crosshairMode, setCrosshairMode] = usePersistedState<CrosshairMode>(
    'terminal.crosshairMode',
    'magnet',
  )
  const [priceScaleMode, setPriceScaleMode] = usePersistedState<PriceScaleMode>(
    scopedKey('terminal.priceScaleMode'),
    'normal',
  )
  const [drawingToolMode, setDrawingToolMode] =
    usePersistedState<DrawingToolMode>('terminal.drawingToolMode', 'sticky')
  // TradingView-style "Bid and Ask" chart lines — off by default, like TV.
  const [showBidAsk, setShowBidAsk] = usePersistedState<boolean>(
    'terminal.showBidAsk',
    false,
  )
  // TradingView-style inverted price scale (higher prices at the bottom).
  const [invertedScale, setInvertedScale] = usePersistedState<boolean>(
    scopedKey('terminal.invertedScale'),
    false,
  )
  // Reset stale market when available markets change (e.g. plugin deactivated)
  useEffect(() => {
    if (
      options?.availableMarkets &&
      options.availableMarkets.length > 0 &&
      !options.availableMarkets.some((m) => m.value === market)
    ) {
      setMarket(options.defaultMarket)
    }
  }, [market, options?.availableMarkets, options?.defaultMarket, setMarket])

  // Per-chart storage key for indicators/compares: scoped panes get their own
  // entry so two panes on the same pair hold independent indicator sets.
  const chartStorageKey = scope ? `${scope}::${pairKey}` : pairKey
  const chartStorageKeyRef = useRef(chartStorageKey)
  chartStorageKeyRef.current = chartStorageKey

  // Compare overlays — per chart, like indicators.
  const [compareSymbols, setCompareSymbols] = useState<Array<CompareSymbol>>(
    () => loadCompareSymbolsForPair(chartStorageKey),
  )
  // Class-scoped for the same reason, and it fixes a real misreading:
  // `indexed` rebases every series to 100, and on an outcome that number then
  // went through the cents formatter and drew `10000¢` up the axis. Outcomes
  // of one event share a single 0..1 domain, so predictions open on the shared
  // price axis. The control itself keeps working on every class — this is the
  // value it starts at, not a lock.
  const [compareScaleMode, setCompareScaleMode] =
    useClassScopedPreference<CompareMode>(
      classScopedChartKey('terminal.compareMode', assetClass, scope),
      defaultCompareModeForAssetClass(assetClass),
    )
  // Seed candles per compare seriesId; live updates flow through applyTicks.
  const [compareSeeds, setCompareSeeds] = useState<
    Record<string, Array<PluginCandle>>
  >({})

  // ── Bar replay (TradingView-style) ──
  // replayBaseIndex: bar count shown when replay began (null = live mode).
  // The cursor advances imperatively via appendBar; only the position number
  // flows through React for the controls UI.
  const [replayBaseIndex, setReplayBaseIndex] = useState<number | null>(null)
  const [replayCursor, setReplayCursor] = useState({
    playing: false,
    speed: 1,
    position: 0,
  })
  const replayActiveRef = useRef(false)
  const replayPosRef = useRef(0)

  const [activeTool, setActiveTool] = useState<DrawingToolType | null>(null)
  const [activeToolMeta, setActiveToolMeta] = useState<Record<
    string,
    unknown
  > | null>(null)
  // Last-used style per drawing tool — flows to the engine as a prop and is
  // applied to newly created drawings ("draw the next fib in purple too").
  const [drawingStyleDefaults, setDrawingStyleDefaults] =
    useState<DrawingStyleDefaults>(() => loadDrawingStyleDefaults())
  const updateDrawingStyleDefault = useCallback(
    (
      type: DrawingToolType,
      style: { color?: string; lineWidth?: number; lineStyle?: LineStyleType },
    ) => {
      setDrawingStyleDefaults((prev) => {
        const next = { ...prev, [type]: { ...prev[type], ...style } }
        saveDrawingStyleDefaults(next)
        return next
      })
    },
    [],
  )
  const [activeIndicators, setActiveIndicators] = useState<
    Array<IndicatorInstanceInput>
  >(() => loadIndicatorsForPair(chartStorageKey))
  const [indicatorPaletteOpen, setIndicatorPaletteOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [contextMenuState, setContextMenuState] = useState<
    (ChartContextMenuPayload & { clientX: number; clientY: number }) | null
  >(null)
  const [textInputDialog, setTextInputDialog] = useState<{
    drawingId: string
    currentText: string
  } | null>(null)

  const chartRef = useRef<FastFinancialChartRef | null>(null)
  // Dev-only debug handle for driving the chart from the browser console.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__plChartRef = chartRef
  }
  const [seedCandles, setSeedCandles] = useState<Array<PluginCandle>>([])
  const lastCandleRef = useRef<PluginCandle | null>(null)

  // Indicator persistence refs
  const currentPairKeyRef = useRef(pairKey)
  currentPairKeyRef.current = pairKey
  const prevIndicatorPairRef = useRef(pairKey)
  // Storage scope + engine generation the indicator set was last applied to.
  const appliedIndicatorsRef = useRef<{
    key: string
    epoch: number
  } | null>(null)

  const {
    candles,
    latestCandle,
    latestSignal,
    signalScan,
    status,
    errorMessage,
    hasSnapshot,
    stale,
    noData,
    desktopOnly,
  } = useCandleStream({
    market,
    pairKey,
    timeframe,
    enabled: true,
  })

  const {
    orderbook,
    baseTickSize,
    status: orderbookStatus,
    errorMessage: orderbookError,
  } = useOrderbookStream({ market, pairKey })

  const { ticker } = useTickerStream({ market, pairKey })
  const { fetchHistory } = useMarketData()

  const bestBid = orderbook?.bids[0]?.price ?? null
  const bestAsk = orderbook?.asks[0]?.price ?? null
  const midPrice =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null

  // Track previous cache key for saving before switching
  const prevCacheKeyRef = useRef<string | null>(null)
  const hasReceivedSnapshotRef = useRef(false)
  /**
   * Oldest bar the STREAM has seeded for the current key (pan-left backfill
   * excluded — that history lives only in `seedCandles`). A later snapshot
   * that reaches further back than this is history the chart does not have,
   * and it re-seeds. See the reseed branch below for why that matters.
   */
  const seededOldestTsRef = useRef<number | null>(null)
  /** Bars in that seed, so a reseed can tell a thin first paint from a full one. */
  const seededBarsRef = useRef(0)
  const pendingViewportResetRef = useRef(false)
  // Pan-left history backfill bookkeeping (reset per stream).
  const backfillRef = useRef({ loading: false, exhausted: false })

  // Save to cache on unmount so navigating away preserves candles
  useEffect(() => {
    return () => {
      if (prevCacheKeyRef.current && seedCandles.length > 0) {
        candleCache.set(prevCacheKeyRef.current, seedCandles)
      }
    }
  }, [seedCandles])

  // Reset on market/pair/timeframe change — synchronous (during render) to avoid
  // a frame where chartSeries pairs new pairKey with stale seedCandles.
  const resetKey = `${market}:${pairKey}:${timeframe}`
  const prevResetKeyRef = useRef(resetKey)

  if (prevResetKeyRef.current !== resetKey) {
    // Save current candles to cache before switching
    if (prevCacheKeyRef.current && seedCandles.length > 0) {
      candleCache.set(prevCacheKeyRef.current, seedCandles)
    }

    const newCacheKey = CandleCache.makeKey(market, pairKey, timeframe)
    prevCacheKeyRef.current = newCacheKey
    hasReceivedSnapshotRef.current = false
    seededOldestTsRef.current = null
    seededBarsRef.current = 0

    // Try to restore from cache for instant display
    const cached = candleCache.get(newCacheKey)
    if (cached && cached.length > 0) {
      setSeedCandles(cached)
      lastCandleRef.current = cached[cached.length - 1] ?? null
    } else {
      setSeedCandles([])
      lastCandleRef.current = null
    }
    pendingViewportResetRef.current = true

    // Handle indicator persistence on pair change
    if (prevIndicatorPairRef.current !== pairKey) {
      prevIndicatorPairRef.current = pairKey
      setActiveIndicators(loadIndicatorsForPair(chartStorageKey))
      setCompareSymbols(loadCompareSymbolsForPair(chartStorageKey))
    }
    // Compare seeds are per market/pair/timeframe — always refetch on switch.
    setCompareSeeds({})
    backfillRef.current = { loading: false, exhausted: false }

    // Replay is bound to one stream — switching exits it.
    if (replayActiveRef.current) {
      replayActiveRef.current = false
      setReplayBaseIndex(null)
      setReplayCursor({ playing: false, speed: 1, position: 0 })
    }

    setContextMenuState(null)

    prevResetKeyRef.current = resetKey
  }

  // ── Candle seeding + live streaming ──
  //
  // Live updates from BOTH the candle stream and the ticker stream flow
  // through the chart engine's `applyTicks`, which buckets each tick by the
  // active timeframe and either refines the current forming bar or rolls a
  // fresh aligned one. This is the single, idempotent live path: an earlier
  // version drove new bars via `appendBar` (a blind, non-deduped push) while
  // the ticker drove the same bar via `applyTicks`, and the two raced — on
  // connectors where the ticker led, the forming bar could be duplicated or
  // frozen ("indicators move but the price chart doesn't"). Routing every
  // live update through `applyTicks` removes that race connector-agnostically.

  useEffect(() => {
    // Wait for the REST snapshot before seeding — individual WS updates
    // arriving before the backfill would show a single candle briefly.
    if (candles.length === 0 || !hasSnapshot) return

    const latest = candles[candles.length - 1]

    // Full (re)seed on the first snapshot for this stream. Keyed on
    // `hasReceivedSnapshotRef` (reset to false in the synchronous
    // market/pair/timeframe reset block above) rather than on candles[0].ts —
    // the latter shifts every time the 500-candle buffer slices its oldest
    // bar, which previously forced a full chart rebuild on every new candle.
    if (!hasReceivedSnapshotRef.current) {
      hasReceivedSnapshotRef.current = true
      setSeedCandles(candles)
      seededOldestTsRef.current = candles[0]?.ts ?? null
      seededBarsRef.current = candles.length
      lastCandleRef.current = latest ?? null
      pendingViewportResetRef.current = true
      return
    }

    const chart = chartRef.current
    if (!chart || !latest) return

    // Replay mode freezes the live path — the chart shows historical bars
    // only. Exit resets hasReceivedSnapshotRef, forcing a full reseed here.
    if (replayActiveRef.current) return

    // A snapshot reaching further back than the one we seeded from is the
    // connector's REST backfill landing late (or a reconnect replay). Live
    // updates never prepend, so a lower first ts can only be a snapshot.
    //
    // Without this branch the FIRST snapshot was final: everything after it
    // took the incremental path below, which applies the newest bars and
    // nothing else. That is fine when the first snapshot is a real backfill
    // and fatal when it is not — a venue whose backfill was rate-limited
    // leaves the terminal to promote raw stream updates into a seed
    // (PROMOTE_UPDATES_AFTER_MS in use-candle-stream), and the chart then
    // held one forming bar until the user switched pair or timeframe.
    // Bars older than the snapshot are kept: they are the user's pan-left
    // backfill, which the connector's 500-bar buffer knows nothing about.
    const incomingOldestTs = candles[0].ts
    if (snapshotDeepensSeed(seededOldestTsRef.current, incomingOldestTs)) {
      const wasThinSeed = seededBarsRef.current < MIN_HEALTHY_SEED_BARS
      seededOldestTsRef.current = incomingOldestTs
      seededBarsRef.current = candles.length
      setSeedCandles((prev) => mergeDeeperSnapshot(prev, candles))
      lastCandleRef.current = latest
      // Re-anchor only when the chart was showing a stub. A healthy chart
      // that gains history on a reconnect keeps whatever window the user is
      // looking at.
      if (wasThinSeed) pendingViewportResetRef.current = true
      return
    }

    const previous = lastCandleRef.current
    if (!previous) {
      lastCandleRef.current = latest
      return
    }

    // Replay every candle at or after the one we last applied. A same-ts
    // candle refines the forming bar in place; a newer ts rolls a new aligned
    // bar (applyTicks computes the bucket from ts, so no blind append).
    const fresh = candles.filter((c) => c.ts >= previous.ts)
    for (const candle of fresh) {
      const sameBar = candle.ts === lastCandleRef.current?.ts
      // Volume is cumulative per bucket; feed only the delta so the bar's
      // accumulated volume tracks the connector's value without double count.
      const volumeDelta = sameBar
        ? Math.max(0, candle.volume - (lastCandleRef.current?.volume ?? 0))
        : candle.volume
      // open first so a freshly-rolled bar takes the candle's true open;
      // high/low/close refine; volume rides on the final tick.
      chart.applyTicks([
        { seriesId: pairKey, ts: candle.ts, price: candle.open, volume: 0 },
        { seriesId: pairKey, ts: candle.ts, price: candle.high, volume: 0 },
        { seriesId: pairKey, ts: candle.ts, price: candle.low, volume: 0 },
        {
          seriesId: pairKey,
          ts: candle.ts,
          price: candle.close,
          volume: volumeDelta,
        },
      ])
      lastCandleRef.current = candle
    }
  }, [candles, hasSnapshot, pairKey])

  // Feed best bid/ask into the chart's quote lines. Imperative (no chart
  // re-render): the engine only redraws its Canvas2D overlay. The orderbook
  // state already updates at the stream throttle cadence, so this adds no new
  // render pressure. Cleared when toggled off or when the book resets on a
  // market/pair switch (bestBid/bestAsk go null).
  useEffect(() => {
    chartRef.current?.executeCommand({
      type: 'setQuoteLines',
      payload:
        showBidAsk && bestBid !== null && bestAsk !== null
          ? { bid: bestBid, ask: bestAsk }
          : null,
    })
  }, [showBidAsk, bestBid, bestAsk])

  // Feed ticker price into the chart between candle updates so the forming bar
  // animates at tick cadence even when a connector's candle stream is slow or
  // close-only. Uses ticker.ts so the engine rolls a new forming bar when the
  // timeframe boundary is crossed (same as TradingView).
  useEffect(() => {
    if (!ticker || !hasReceivedSnapshotRef.current) return
    if (replayActiveRef.current) return
    const chart = chartRef.current
    const last = lastCandleRef.current
    if (!chart || !last) return
    // Only apply if the ticker is at or after the current candle.
    if (ticker.ts < last.ts) return
    chart.applyTicks([
      {
        seriesId: pairKey,
        ts: ticker.ts,
        price: ticker.last,
        volume: 0,
      },
    ])
  }, [ticker, pairKey])

  // ── Drawing persistence + symbol scoping ──
  //
  // Drawings are anchored to the active symbol's time/price coordinates, so
  // they're persisted and restored per market:pair (scoped panes get their
  // own entry). On a symbol switch the whole set is replaced and the undo
  // history reset — without the replace they leak onto the next chart at
  // off-scale positions; without the history reset, undo resurrects the
  // previous symbol's drawings and they'd get saved under the new key.
  // Timeframe switches keep drawings: same symbol, same coordinate space.
  const drawingsScopeKey = scope
    ? `${scope}::${market}:${pairKey}`
    : `${market}:${pairKey}`
  const drawingsScopeKeyRef = useRef(drawingsScopeKey)
  drawingsScopeKeyRef.current = drawingsScopeKey
  // Blocks saves until the restore for the current key has been applied —
  // the restore itself and the pre-restore engine state must never be
  // written back under the new key.
  const drawingsPersistReadyRef = useRef(false)
  const appliedDrawingsRef = useRef<{
    key: string
    chart: FastFinancialChartRef
  } | null>(null)
  const drawingsSaveTimerRef = useRef<{
    timer: ReturnType<typeof setTimeout>
    key: string
    drawings: Array<DrawingObject>
  } | null>(null)

  // Bumped by the chart's onReady on every engine (re)mount. A fresh engine
  // starts with zero drawings, so the restore must re-apply per instance —
  // remounts happen on StrictMode effect cycles, fullscreen toggles, and
  // workspace layout changes, none of which touch the other effect deps.
  const [chartEpoch, setChartEpoch] = useState(0)
  const handleChartReady = useCallback(() => {
    setChartEpoch((epoch) => epoch + 1)
  }, [])

  // Undo/redo availability for the drawing toolbar. Updated from
  // drawingsChange events (every stack mutation is accompanied by one) with a
  // bail-out on unchanged values so drag-move event bursts don't re-render.
  const [drawingHistory, setDrawingHistory] = useState({
    canUndo: false,
    canRedo: false,
  })
  const refreshDrawingHistory = useCallback(() => {
    const snapshot = chartRef.current?.getSnapshot()
    const next = {
      canUndo: snapshot?.canUndo ?? false,
      canRedo: snapshot?.canRedo ?? false,
    }
    setDrawingHistory((prev) =>
      prev.canUndo === next.canUndo && prev.canRedo === next.canRedo
        ? prev
        : next,
    )
  }, [])

  // The applied marker pairs the scope key with the engine instance it was
  // applied to: a key change means new symbol (swap the drawing set), an
  // instance change means new engine (re-apply the same set). seedCandles is
  // a belt-and-braces retry for the mount race. Until the restore has run,
  // drawingsPersistReadyRef stays false and saves are blocked, so a
  // not-yet-restored chart can never overwrite persisted state.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const applied = appliedDrawingsRef.current
    if (
      applied &&
      applied.key === drawingsScopeKey &&
      applied.chart === chart
    ) {
      return
    }
    appliedDrawingsRef.current = { key: drawingsScopeKey, chart }
    drawingsPersistReadyRef.current = false
    chart.executeCommand({
      type: 'setDrawings',
      payload: {
        drawings: loadDrawingsForKey(drawingsScopeKey),
        resetHistory: true,
      },
    })
    drawingsPersistReadyRef.current = true
    // The restore's own drawingsChange fires before the history reset —
    // re-read so the toolbar doesn't show a stale enabled undo button.
    refreshDrawingHistory()
  }, [drawingsScopeKey, seedCandles, chartEpoch, refreshDrawingHistory])

  // Debounced save — drag interactions emit a drawingsChange per pointermove,
  // so writes trail the last change instead of hitting localStorage per move.
  const handleDrawingsChange = useCallback(
    (drawings: Array<DrawingObject>) => {
      refreshDrawingHistory()
      if (!drawingsPersistReadyRef.current) return
      const key = drawingsScopeKeyRef.current
      if (drawingsSaveTimerRef.current) {
        clearTimeout(drawingsSaveTimerRef.current.timer)
      }
      drawingsSaveTimerRef.current = {
        key,
        drawings,
        timer: setTimeout(() => {
          drawingsSaveTimerRef.current = null
          saveDrawingsForKey(key, drawings)
        }, 400),
      }
    },
    [refreshDrawingHistory],
  )

  // Flush a pending debounced save on unmount so the last edit isn't lost.
  useEffect(() => {
    return () => {
      const pending = drawingsSaveTimerRef.current
      if (pending) {
        clearTimeout(pending.timer)
        drawingsSaveTimerRef.current = null
        saveDrawingsForKey(pending.key, pending.drawings)
      }
    }
  }, [])

  // Persist indicator changes to localStorage
  useEffect(() => {
    saveIndicatorsForPair(chartStorageKeyRef.current, activeIndicators)
  }, [activeIndicators])

  // Persist compare symbol changes to localStorage
  useEffect(() => {
    saveCompareSymbolsForPair(chartStorageKeyRef.current, compareSymbols)
  }, [compareSymbols])

  const addCompareSymbol = useCallback(
    (entry: { pairKey: string; market: string }) => {
      if (entry.pairKey === currentPairKeyRef.current) return
      setCompareSymbols((prev) => {
        if (
          prev.some(
            (s) => s.pairKey === entry.pairKey && s.market === entry.market,
          )
        ) {
          return prev
        }
        const used = new Set(prev.map((s) => s.color))
        const color =
          COMPARE_COLORS.find((c) => !used.has(c)) ??
          COMPARE_COLORS[prev.length % COMPARE_COLORS.length]
        return [...prev, { ...entry, color }]
      })
    },
    [],
  )

  const removeCompareSymbol = useCallback((seriesId: string) => {
    setCompareSymbols((prev) =>
      prev.filter((s) => compareSeriesId(s) !== seriesId),
    )
    setCompareSeeds((prev) => {
      if (!(seriesId in prev)) return prev
      const next = { ...prev }
      delete next[seriesId]
      return next
    })
  }, [])

  // Snapshot/live handlers for the per-symbol compare feeds (rendered by the
  // provider). Snapshots replace the seed (chart rebuild); live candles refine
  // the forming bar imperatively via applyTicks — no React re-render.
  const handleCompareSnapshot = useCallback(
    (seriesId: string, snapshot: Array<PluginCandle>) => {
      setCompareSeeds((prev) => ({ ...prev, [seriesId]: snapshot }))
    },
    [],
  )

  const handleCompareCandle = useCallback(
    (seriesId: string, candle: PluginCandle) => {
      // Compare series render as close-value lines; volume stays 0 so the
      // volume pass never mixes venues.
      chartRef.current?.applyTicks([
        { seriesId, ts: candle.ts, price: candle.close, volume: 0 },
      ])
    },
    [],
  )

  // ── Custom (Python) indicator definitions ──
  //
  // Registry-defined custom indicators become engine IndicatorDefinitions on
  // the live chart. Synced (a) per engine instance — a fresh engine starts
  // with no runtime definitions, so chartEpoch resets the bookkeeping — and
  // (b) on every registry change (plugin activation, script save). Late
  // registration is safe: the engine recomputes on register, lighting up
  // persisted instances that were restored before their definition arrived.
  //
  // Python compute calls need the active pair/timeframe (module-level context
  // — the engine's compute context doesn't carry them).
  useEffect(() => {
    setCustomIndicatorMarketContext(pairKey, timeframe, market)
  }, [pairKey, timeframe, market])

  // type -> descriptor source key registered on the current engine instance.
  const registeredCustomDefsRef = useRef(new Map<string, string>())
  useEffect(() => {
    registeredCustomDefsRef.current = new Map()

    const sync = () => {
      const chart = chartRef.current
      if (!chart) return
      const registered = registeredCustomDefsRef.current
      const entries = customIndicatorRegistry.getAll()
      const present = new Set<string>()

      for (const entry of entries) {
        present.add(entry.type)
        const registeredSource = registered.get(entry.type)
        const sourceKey = customIndicatorSourceKey(entry.descriptor)
        if (registeredSource === sourceKey) continue
        // Source change: replace the definition (unregister → register).
        if (registeredSource !== undefined) {
          chart.unregisterIndicatorDefinition(entry.type)
        }
        chart.registerIndicatorDefinition(buildCustomIndicatorDefinition(entry))
        registered.set(entry.type, sourceKey)
      }

      for (const type of Array.from(registered.keys())) {
        if (present.has(type)) continue
        chart.unregisterIndicatorDefinition(type as `custom:${string}`)
        registered.delete(type)
      }
    }

    sync()
    return customIndicatorRegistry.subscribe(sync)
  }, [chartEpoch])

  // Auto-fit viewport + restore indicators after chart receives new data
  useEffect(() => {
    // Reset viewport to show latest bars on pair/timeframe/snapshot change.
    // Applied synchronously: the engine already received the new series in
    // the same commit (the canvas child effect runs before this one), and a
    // deferred reset is a race — in a throttled/hidden tab a queued rAF can
    // fire seconds later against a transient engine state (stream-reconnect
    // reseed, 1-bar forming series) and the reset is silently lost, leaving
    // the chart zoomed into the last few bars. The flag flips false only
    // once the engine confirms it has bars, so the backfill guard below
    // keeps treating the viewport as unsettled until the reset truly lands.
    if (pendingViewportResetRef.current && seedCandles.length > 0) {
      const chart = chartRef.current
      if (chart && (chart.data()?.length ?? 0) > 0) {
        chart.executeCommand({
          type: 'scrollToLatest',
          payload: { bars: 200 },
        })
        pendingViewportResetRef.current = false
      }
    }

    // Indicator restore. The applied marker pairs the storage scope with the
    // engine generation it was applied to, same contract as the drawings
    // restore above: a key change means a new symbol (swap the whole set), an
    // epoch change means a fresh engine that starts with zero instances
    // (re-apply the same set). seedCandles is a belt-and-braces retry for the
    // mount race.
    //
    // Applied synchronously, like the viewport reset above: the engine
    // already received the series in this commit, and a deferred rAF is a
    // race — in a throttled/hidden tab it can stall indefinitely, silently
    // dropping the whole indicator restore (engine left with zero instances
    // while the chips still render from React state).
    const chart = chartRef.current
    if (!chart) return
    const applied = appliedIndicatorsRef.current
    if (
      applied &&
      applied.key === chartStorageKey &&
      applied.epoch === chartEpoch
    ) {
      return
    }
    appliedIndicatorsRef.current = { key: chartStorageKey, epoch: chartEpoch }

    // Replace, never merge. Every instance is bound to a seriesId, so ones
    // left behind by the previous pair would compute against a series the
    // engine no longer holds: they render nothing while still claiming their
    // sub-pane, which squeezes the price pane into a blank-bottomed chart.
    chart.executeCommand({ type: 'removeAllIndicators', payload: {} })

    // Enforce one active instance per type+params — matching addIndicator's
    // toggle rule, so EMA(20) and EMA(50) survive a restore side by side.
    const uniqueByConfig = new Map<string, IndicatorInstanceInput>()
    for (const indicator of loadIndicatorsForPair(chartStorageKey)) {
      uniqueByConfig.set(
        `${indicator.type}:${JSON.stringify(indicator.params ?? {})}`,
        indicator,
      )
    }

    const restoredIndicators: Array<IndicatorInstanceInput> = []
    for (const indicator of uniqueByConfig.values()) {
      const indicatorWithSeries = { ...indicator, seriesId: pairKey }
      const result = chart.executeCommand({
        type: 'addIndicator',
        payload: indicatorWithSeries,
      })
      const resultObject =
        result?.ok &&
        typeof result.result === 'object' &&
        result.result !== null
          ? (result.result as { id?: unknown })
          : null
      const resolvedId =
        typeof resultObject?.id === 'string'
          ? resultObject.id
          : indicatorWithSeries.id

      restoredIndicators.push(
        resolvedId
          ? { ...indicatorWithSeries, id: resolvedId }
          : indicatorWithSeries,
      )
    }

    setActiveIndicators(restoredIndicators)
  }, [seedCandles, pairKey, chartStorageKey, chartEpoch])

  // ── Pan-left history backfill (TradingView-style infinite scroll) ──
  //
  // When the user pans near the left edge, fetch a batch of candles older
  // than the oldest seeded bar and prepend them. The engine's setSeries
  // doesn't shift a non-right-anchored viewport, so after the prepend we
  // re-anchor the visible window imperatively via setViewport.
  const seedCandlesRef = useRef(seedCandles)
  seedCandlesRef.current = seedCandles

  const handleChartViewportChange = useCallback(
    (viewport: { startIndex: number; endIndex: number }) => {
      const BACKFILL_BATCH = 300
      const BACKFILL_MAX_BARS = 5000

      const state = backfillRef.current
      if (state.loading || state.exhausted) return
      if (!hasReceivedSnapshotRef.current) return
      // During a (re)seed the engine transiently reports a near-zero
      // startIndex before the deferred scrollToLatest applies — treating that
      // as a pan-to-left-edge would fire a spurious backfill whose viewport
      // re-anchor then stomps the pending reset (visible as a chart stuck
      // zoomed into the last handful of bars after load).
      if (pendingViewportResetRef.current) return
      // Replay pins the bar indices it steps through — prepending history
      // mid-replay would shift them onto different candles. Backfill first,
      // then start replay.
      if (replayActiveRef.current) return
      const seeds = seedCandlesRef.current
      const oldest = seeds[0]
      if (!oldest) return
      if (!shouldBackfillOlderHistory(seeds.length, viewport.startIndex)) return
      if (seeds.length >= BACKFILL_MAX_BARS) {
        state.exhausted = true
        return
      }

      state.loading = true
      const streamKeyAtStart = prevResetKeyRef.current
      void fetchHistory(
        market,
        currentPairKeyRef.current,
        timeframe,
        BACKFILL_BATCH,
        oldest.ts,
      )
        .then((older) => {
          if (prevResetKeyRef.current !== streamKeyAtStart) return
          const fresh = (older ?? [])
            .filter((c) => c.ts < oldest.ts)
            .sort((a, b) => a.ts - b.ts)
          if (fresh.length === 0) {
            // Connector has no older data (or doesn't support range queries).
            backfillRef.current.exhausted = true
            return
          }
          setSeedCandles((prev) => {
            const prevOldestTs = prev[0]?.ts ?? Number.POSITIVE_INFINITY
            const freshOnly = fresh.filter((c) => c.ts < prevOldestTs)
            if (freshOnly.length === 0) return prev
            // Keep the user's visible time window stable across the prepend.
            // Clamped so the window can never land past the newest bar: the
            // shift is only the right answer while the pre-prepend window lay
            // inside the data, and a window wider than the series (a short
            // seed) would otherwise be pushed off the end.
            const anchored = viewportAfterPrepend(
              viewport,
              freshOnly.length,
              prev.length + freshOnly.length,
            )
            requestAnimationFrame(() => {
              chartRef.current?.executeCommand({
                type: 'setViewport',
                payload: anchored,
              })
            })
            return [...freshOnly, ...prev]
          })
        })
        .catch(() => {
          // Transient fetch failure — allow a later pan to retry.
        })
        .finally(() => {
          backfillRef.current.loading = false
        })
    },
    [fetchHistory, market, timeframe],
  )

  // ── Bar replay actions ──

  const startReplay = useCallback(() => {
    const seeds = seedCandlesRef.current
    if (seeds.length < 20) return
    // Begin a quarter of the way into loaded history (pan-left backfill can
    // load thousands of bars first for deeper replays).
    const start = Math.max(10, Math.floor(seeds.length * 0.25))
    replayActiveRef.current = true
    replayPosRef.current = start
    setReplayBaseIndex(start)
    setReplayCursor({ playing: false, speed: 1, position: start })
  }, [])

  const exitReplay = useCallback(() => {
    replayActiveRef.current = false
    setReplayBaseIndex(null)
    setReplayCursor({ playing: false, speed: 1, position: 0 })
    // Force a full reseed on the next stream update so the live path resyncs
    // (viewport snaps back to the latest bars).
    hasReceivedSnapshotRef.current = false
    lastCandleRef.current = null
  }, [])

  const stepReplay = useCallback(() => {
    const seeds = seedCandlesRef.current
    const pos = replayPosRef.current
    if (pos >= seeds.length) {
      setReplayCursor((prev) =>
        prev.playing ? { ...prev, playing: false } : prev,
      )
      return
    }
    const bar = seeds[pos]
    chartRef.current?.appendBar({
      seriesId: currentPairKeyRef.current,
      bar: {
        ts: bar.ts,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      },
    })
    replayPosRef.current = pos + 1
    setReplayCursor((prev) => ({ ...prev, position: pos + 1 }))
  }, [])

  const toggleReplayPlay = useCallback(() => {
    setReplayCursor((prev) => ({ ...prev, playing: !prev.playing }))
  }, [])

  const setReplaySpeed = useCallback((speed: number) => {
    setReplayCursor((prev) => ({ ...prev, speed }))
  }, [])

  // Playback timer — speed is candles per second.
  useEffect(() => {
    if (replayBaseIndex === null || !replayCursor.playing) return
    const interval = setInterval(
      stepReplay,
      Math.max(50, Math.round(1000 / replayCursor.speed)),
    )
    return () => clearInterval(interval)
  }, [replayBaseIndex, replayCursor.playing, replayCursor.speed, stepReplay])

  // Active price alerts for this pair render as dashed level lines on the
  // chart (TradingView-style). Rules/bindings change on user action only.
  const notificationRules = useNotificationStore((s) => s.rules)
  const notificationBindings = useNotificationStore((s) => s.bindings)
  const alertPriceLines = useMemo(() => {
    const ruleMap = new Map(notificationRules.map((r) => [r.id, r]))
    const lines: Array<PriceLine> = []
    for (const binding of notificationBindings) {
      if (!binding.enabled || binding.pair !== pairKey) continue
      if (binding.market && binding.market !== market) continue
      const rule = ruleMap.get(binding.ruleId)
      if (!rule) continue
      for (const step of rule.steps) {
        if (step.type !== 'price-alert') continue
        const price = Number(step.data.price ?? 0)
        if (price <= 0) continue
        lines.push({
          price,
          color: '#ffb020',
          lineWidth: 1,
          lineStyle: 'dashed',
          title: 'Alert',
          axisLabelVisible: true,
        })
      }
    }
    return lines
  }, [notificationRules, notificationBindings, pairKey, market])

  const chartSeries = useMemo(() => {
    // Replay shows only bars up to the cursor; later bars stream in via
    // appendBar. replayPosRef (not state) keeps mid-replay memo recomputes
    // from rolling the chart back to the start position.
    const mainCandles =
      replayBaseIndex !== null
        ? seedCandles.slice(0, Math.max(replayBaseIndex, replayPosRef.current))
        : seedCandles
    const rawBars = mainCandles.map((c) => ({
      ts: c.ts,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
    // Presentation-layer forward fill, predictions only. The connector's own
    // aggregator refuses to synthesise bars and it is right to (its
    // `rollIfExpired` note: "a flat bar invented from the last close is a lie
    // the chart would draw") — that refusal protects the candle buffer, the
    // signal scan, the CSV export and every consumer downstream of it. None of
    // those see this array. What the chart draws is a probability, and an
    // outcome that last traded at 34¢ is still worth 34¢ in a way a spot price
    // never is, so carrying it across untraded buckets is the truthful
    // rendering rather than a fabrication. Filled buckets carry volume 0, so
    // the volume pane leaves them empty and the quiet stretch stays legible.
    // See `lib/chart-defaults.ts` for the bounds, including the 5000-bucket cap.
    const bars = isPredictionInstrument
      ? fillPredictionBars(rawBars, chartBucketMs(timeframe))
      : rawBars
    const main = {
      id: pairKey,
      label: pairKey,
      color: '#4aa8ff',
      pricePrecision: 8,
      priceLines: alertPriceLines,
      bars,
    }
    const compares = compareSymbols.flatMap((entry) => {
      const seriesId = compareSeriesId(entry)
      const seed = compareSeeds[seriesId]
      if (!seed || seed.length === 0) return []
      return [
        {
          id: seriesId,
          label: entry.pairKey,
          color: entry.color,
          pricePrecision: 8,
          bars: seed.map((c) => ({
            ts: c.ts,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: 0,
          })),
        },
      ]
    })
    return [main, ...compares]
  }, [
    pairKey,
    seedCandles,
    compareSymbols,
    compareSeeds,
    alertPriceLines,
    replayBaseIndex,
    isPredictionInstrument,
    timeframe,
  ])

  const chartTimeframe = toChartTimeframe(timeframe)

  const runCommand = useCallback((command: ChartCommand) => {
    const result = chartRef.current?.executeCommand(command)
    if (!result) return null
    return result
  }, [])

  const applyTool = useCallback(
    (tool: DrawingToolType | null, meta?: Record<string, unknown>) => {
      // Every source of a tool selection lands here — the rail, a keyboard
      // chord, the copilot, the engine re-arming a sticky tool — so this is
      // the one place recents can be recorded from.
      if (tool) {
        track('drawing_tool_selected', { tool })
        trackDrawingToolUse(tool, meta)
      }
      setActiveTool(tool)
      setActiveToolMeta(meta ?? null)
      runCommand({ type: 'setActiveTool', payload: { tool, meta } })
    },
    [runCommand],
  )

  const addIndicator = useCallback(
    (indicator: IndicatorInstanceInput) => {
      const indicatorWithSeries = { ...indicator, seriesId: pairKey }

      // Match on type + params so SMA(50) and SMA(200) can coexist,
      // but adding the exact same config toggles it off.
      const paramsKey = JSON.stringify(indicatorWithSeries.params ?? {})
      const existing = activeIndicators.find(
        (entry) =>
          entry.type === indicatorWithSeries.type &&
          JSON.stringify(entry.params ?? {}) === paramsKey,
      )

      // Toggle-off behavior: selecting an identical indicator removes it.
      if (existing) {
        track('indicator_removed', {
          indicator_type: existing.type,
          source: existing.type.startsWith('custom:') ? 'custom' : 'builtin',
        })
        if (existing.id) {
          runCommand({ type: 'removeIndicator', payload: { id: existing.id } })
        }
        setActiveIndicators((prev) =>
          prev.filter((entry) => entry !== existing),
        )
        return
      }

      const result = runCommand({
        type: 'addIndicator',
        payload: indicatorWithSeries,
      })
      const resultObject =
        result?.ok &&
        typeof result.result === 'object' &&
        result.result !== null
          ? (result.result as { id?: unknown })
          : null
      const resolvedId =
        typeof resultObject?.id === 'string'
          ? resultObject.id
          : indicatorWithSeries.id
      const nextIndicator = resolvedId
        ? { ...indicatorWithSeries, id: resolvedId }
        : indicatorWithSeries

      setActiveIndicators((prev) => [...prev, nextIndicator])
      track('indicator_added', {
        indicator_type: indicatorWithSeries.type,
        source: indicatorWithSeries.type.startsWith('custom:')
          ? 'custom'
          : 'builtin',
      })
    },
    [activeIndicators, pairKey, runCommand],
  )

  const updateIndicator = useCallback(
    (id: string, params: Record<string, boolean | number | string>) => {
      const existing = activeIndicators.find((entry) => entry.id === id)
      if (!existing) return

      // The engine has no in-place param update: remove the old instance and
      // re-add with the new params, then sync the (possibly regenerated) id.
      runCommand({ type: 'removeIndicator', payload: { id } })

      const indicatorWithSeries = { ...existing, params, seriesId: pairKey }
      const result = runCommand({
        type: 'addIndicator',
        payload: indicatorWithSeries,
      })
      const resultObject =
        result?.ok &&
        typeof result.result === 'object' &&
        result.result !== null
          ? (result.result as { id?: unknown })
          : null
      const resolvedId =
        typeof resultObject?.id === 'string'
          ? resultObject.id
          : indicatorWithSeries.id
      const nextIndicator = resolvedId
        ? { ...indicatorWithSeries, id: resolvedId }
        : indicatorWithSeries

      setActiveIndicators((prev) =>
        prev.map((entry) => (entry.id === id ? nextIndicator : entry)),
      )
    },
    [activeIndicators, pairKey, runCommand],
  )

  const removeIndicator = useCallback(
    (id: string) => {
      const target = activeIndicators.find((i) => i.id === id)
      if (target) {
        track('indicator_removed', {
          indicator_type: target.type,
          source: target.type.startsWith('custom:') ? 'custom' : 'builtin',
        })
      }
      setActiveIndicators((prev) => prev.filter((i) => i.id !== id))
      runCommand({ type: 'removeIndicator', payload: { id } })
    },
    [activeIndicators, runCommand],
  )

  const removeAllIndicators = useCallback(() => {
    setActiveIndicators([])
    runCommand({ type: 'removeAllIndicators', payload: {} })
  }, [runCommand])

  // Drawings only — the eraser's default action. Undoable (clearDrawings
  // pushes onto the undo stack), unlike a full clearAll.
  const clearAllDrawings = useCallback(() => {
    runCommand({ type: 'clearDrawings', payload: {} })
  }, [runCommand])

  const clearAll = useCallback(() => {
    setActiveIndicators([])
    setActiveTool(null)
    runCommand({ type: 'removeAllIndicators', payload: {} })
    runCommand({ type: 'clearDrawings', payload: {} })
    runCommand({ type: 'setActiveTool', payload: { tool: null } })
  }, [runCommand])

  return {
    // Market/data config
    market,
    setMarket,
    timeframe,
    setTimeframe,
    /** The active venue's own intervals — what the pickers may offer. */
    supportedTimeframes,
    chartType,
    setChartType,
    crosshairMode,
    setCrosshairMode,
    priceScaleMode,
    setPriceScaleMode,
    drawingToolMode,
    setDrawingToolMode,
    showBidAsk,
    setShowBidAsk,
    invertedScale,
    setInvertedScale,

    // Compare overlays
    compareSymbols,
    compareScaleMode,
    setCompareScaleMode,
    addCompareSymbol,
    removeCompareSymbol,
    handleCompareSnapshot,
    handleCompareCandle,

    // History backfill
    handleChartViewportChange,

    // Bar replay
    replayActive: replayBaseIndex !== null,
    replayCursor,
    replayTotal: seedCandles.length,
    startReplay,
    exitReplay,
    stepReplay,
    toggleReplayPlay,
    setReplaySpeed,

    // Drawing tools
    activeTool,
    activeToolMeta,
    applyTool,
    handleDrawingsChange,
    handleChartReady,
    drawingHistory,
    drawingStyleDefaults,
    updateDrawingStyleDefault,
    clearAllDrawings,

    // Indicators
    activeIndicators,
    addIndicator,
    updateIndicator,
    removeIndicator,
    removeAllIndicators,
    clearAll,
    indicatorPaletteOpen,
    setIndicatorPaletteOpen,
    isFullscreen,
    setIsFullscreen,

    // Context menu
    contextMenuState,
    setContextMenuState,

    // Text input dialog
    textInputDialog,
    setTextInputDialog,

    // Chart
    chartRef,
    chartSeries,
    chartTimeframe,

    // Market data state
    status,
    stale,
    noData,
    desktopOnly,
    latestCandle,
    latestSignal,
    signalScan,
    candles,
    hasSnapshot,
    errorMessage,

    // Orderbook
    orderbook,
    baseTickSize,
    orderbookStatus,
    orderbookError,
    bestBid,
    bestAsk,
    midPrice,
    spread,

    // Ticker
    lastTradePrice: ticker?.last ?? null,
    // Identity-stable across ticks (see useTickerStream), so the ticker
    // context memo below it does not rebuild on every price patch.
    tradingStatus: ticker?.tradingStatus ?? null,

    // Helpers
    runCommand,
  }
}
