// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Liquidation Map — where size stopped being anyone's, in time and in price.
 *
 * The App Server's collector holds a venue's public force-order stream and
 * buckets it on both axes, minute in time and uniform width in price. This pane
 * paints that grid behind candles of the same contract: a column per candle, a
 * row per price bucket, coloured by which side was liquidated and darkened by
 * how much notional went with it. These are prints, not a model. The vendors
 * selling a liquidation heatmap are inferring one from open interest and
 * assumed leverage, and bars that look like measured depth but are not are the
 * most confident kind of wrong.
 *
 * Three things the pane refuses to do:
 *
 * - **Blend venues.** Binance's stream pushes at most one order per symbol per
 *   second, so its magnitudes undercount exactly during cascades; Bybit's
 *   pushes every one. The source control SWITCHES between collectors, it never
 *   sums them, and the summary row states which feed is on screen and whether
 *   it is a census or a sample.
 * - **Fill a quiet window.** A mature collector with nothing in the window
 *   renders the candles and says so. An illiquid contract genuinely liquidates
 *   nobody for hours, and that is data.
 * - **Estimate.** The old strip carried 5x/10x/25x reference ticks because a
 *   bare price axis had nothing else on it. This one has measured prints and
 *   your own venue-reported liquidation prices, so the estimator is gone and
 *   with it the badge that had to apologise for it. The ticket still shows an
 *   estimated liquidation price while you size a position, which is where the
 *   question is actually asked.
 *
 * Rendering follows `liquidity-heatmap-pane`: the pane hosts its own chart and
 * registers a Canvas2D primitive behind the series. Cells are pre-aggregated on
 * data change, colours come from two 256-entry LUTs rebuilt only when the theme
 * moves, and the paint loop allocates nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Crosshair, Loader2 } from 'lucide-react'

import { FastFinancialChart } from '@pairlens/fast-financial-charts/react'
import { usePanePair } from '@pairlens/plugin-sdk'
import { cn } from '@pairlens/ui/lib/utils'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@pairlens/ui/components/ui/toggle-group'
import { TIMEFRAME_TO_MS } from '@pairlens/shared/timeframe'
import type {
  ChartSeriesInput,
  FastFinancialChartRef,
  PriceLine,
  PrimitivePaneRenderContext,
  Timeframe,
} from '@pairlens/fast-financial-charts/types'
import type { Candle } from '@pairlens/shared/types'
import type {
  LiquidationCompleteness,
  LiquidationSide,
} from '@pairlens/shared/instrument-types'
import type { NormalizedPosition } from '@pairlens/market-engine/types'

import type {
  LiquidationHeatmapGrid,
  LiquidationWindowHours,
} from '@/lib/futures/liquidation-clusters'
import { PANE_FOOTNOTE, PaneEmpty } from '@/components/panes/pane-primitives'
import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { track } from '@/lib/analytics-events'
import { formatCompactUsd } from '@/lib/format-price'
import { liquidationDistance } from '@/lib/futures/funding-math'
import {
  LIQUIDATION_WINDOWS,
  LIQUIDATION_WINDOW_TIMEFRAME,
  barsForWindow,
  buildHeatmapGrid,
  clusterIntensity,
  collectedLiquidationVenues,
  dominantSide,
  liquidationTotals,
} from '@/lib/futures/liquidation-clusters'
import {
  useFuturesAccounts,
  useFuturesPositions,
} from '@/hooks/use-futures-positions'
import { useLiquidationClusters } from '@/hooks/use-liquidation-clusters'
import { usePairlensChartTheme } from '@/hooks/use-chart-theme'
import { useMarketData } from '@/lib/market-data-provider'
import { usePairlens } from '@/lib/pairlens-provider'

/**
 * Chip labels as whole literals rather than a built key. `1h` is `1時間` in
 * Japanese, so the chips are translated; and a key assembled from a variable is
 * invisible to the i18n orphan audit, which is how a stale key survives a
 * rename.
 */
const WINDOW_LABEL_KEYS: Record<LiquidationWindowHours, string> = {
  1: 'liquidationMap.windows.h1',
  6: 'liquidationMap.windows.h6',
  24: 'liquidationMap.windows.h24',
  72: 'liquidationMap.windows.h72',
}

/**
 * The alpha the intensity ramp spans, faintest cell to heaviest.
 *
 * Both ends are higher than the old strip's single 0.42 ceiling, because these
 * cells sit BEHIND the candles rather than competing with them: the series
 * draws over the wash, so the wash can carry its own weight. The floor matters
 * more than the ceiling. `clusterIntensity` already refuses to return less than
 * 0.12 so that a cell which exists is never invisible, and multiplying that
 * floor straight into alpha would have handed it 0.08 and undone the promise.
 */
const MIN_CELL_ALPHA = 0.14
const MAX_CELL_ALPHA = 0.85

/** Entries in each side's intensity ramp. Indexed, never interpolated per cell. */
const LUT_SIZE = 256

/** Fallbacks when a theme override hands us a colour we cannot parse. */
const FALLBACK_DOWN_RGB: RGB = [233, 79, 85]
const FALLBACK_UP_RGB: RGB = [64, 199, 134]

/**
 * One series id for the pane's whole life, so the primitive's `seriesId` never
 * has to be re-pointed when the pair changes. The pair travels in `label`.
 */
const SERIES_ID = 'liquidation-map'

/**
 * Candles refresh on the collector's own cadence, not the venue's.
 *
 * The clusters poll once a minute because that is the resolution they are
 * stored at; candles that refreshed faster would put bars on screen the
 * liquidation grid has not caught up to, and the newest column would read as
 * empty when it is merely unaggregated. One clock for both halves of the map.
 */
const CANDLES_REFETCH_MS = 60_000
const CANDLES_STALE_MS = 55_000

type RGB = [number, number, number]

type Band = {
  key: string
  price: number
  side: LiquidationSide
  /** 0..1 weight from the notional at risk, driving the line's thickness. */
  weight: number
  venueLabel: string
}

/** What the primitive reads on every frame. Swapped wholesale, never mutated. */
type HeatmapPaint = {
  grid: LiquidationHeatmapGrid
  bucketWidth: number
  longLut: ReadonlyArray<string>
  shortLut: ReadonlyArray<string>
}

// ── Colour ramps ─────────────────────────────────────────────────────

function parseHexRgb(value: string | undefined, fallback: RGB): RGB {
  if (typeof value !== 'string') return fallback
  const hex = value.trim().replace(/^#/, '')
  if (hex.length !== 6 && hex.length !== 8) return fallback
  const n = Number.parseInt(hex.slice(0, 6), 16)
  if (!Number.isFinite(n)) return fallback
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * 256 prebuilt fill strings for one side, ramping alpha with intensity.
 *
 * Built per theme resolution, never per frame: the paint loop's whole colour
 * decision is one array index, so a cascade window with a few thousand cells
 * allocates no strings and calls no colour maths.
 */
function buildIntensityLut(rgb: RGB): Array<string> {
  const [r, g, b] = rgb
  const span = MAX_CELL_ALPHA - MIN_CELL_ALPHA
  return Array.from({ length: LUT_SIZE }, (_, i) => {
    const alpha = (MIN_CELL_ALPHA + span * ((i + 0.5) / LUT_SIZE)).toFixed(3)
    return `rgba(${r},${g},${b},${alpha})`
  })
}

// ── Primitive renderer ───────────────────────────────────────────────

/**
 * Paints one rectangle per (visible candle × price bucket) cell.
 *
 * The column key is floored from the bar's own timestamp with the same
 * arithmetic the grid was built with, so an exchange whose bars are epoch
 * aligned (every venue, for these intervals) matches exactly, and one that
 * somehow is not degrades to a half-bar shift rather than a blank map.
 */
function renderLiquidationHeatmap(
  renderCtx: PrimitivePaneRenderContext,
  paint: HeatmapPaint,
) {
  const { ctx, bars, viewport, coords } = renderCtx
  const { grid, bucketWidth, longLut, shortLut } = paint
  if (grid.cellCount === 0 || grid.peak <= 0 || bucketWidth <= 0) return
  if (grid.barMs <= 0) return

  // The engine reuses this overlay context for every later draw and does not
  // save/restore around primitives — so start from a known alpha and leave it
  // that way. Per-cell strength lives in the LUT, not in globalAlpha.
  ctx.globalAlpha = 1

  const start = Math.max(0, viewport.startIndex)
  const end = Math.min(bars.length - 1, viewport.endIndex)
  const barMs = grid.barMs

  for (let i = start; i <= end; i++) {
    const bar = bars[i]
    if (!bar) continue
    const cells = grid.columns.get(Math.floor(bar.ts / barMs) * barMs)
    if (!cells) continue

    const x = coords.indexToX(i)
    const rx = Math.round(x)
    const rw = Math.max(1, Math.ceil(coords.indexToX(i + 1) - x))

    // Indexed rather than for-of on purpose: this is the paint loop, and a
    // fresh iterator per visible column is exactly the per-frame allocation
    // the pane's perf budget rules out.
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]
      const yTop = coords.priceToY(cell.price + bucketWidth)
      const yBot = coords.priceToY(cell.price)
      const t = clusterIntensity(cell.total, grid.peak)
      const idx = t >= 1 ? LUT_SIZE - 1 : (t * LUT_SIZE) | 0
      // A cell holding both sides is painted as the heavier one at the
      // COMBINED intensity: at minute resolution a price bucket that
      // liquidated both ways in the same minute is rare, and splitting the
      // rectangle in two would put a colour boundary where there is no price
      // boundary. The combined total is what the intensity is honest about.
      ctx.fillStyle =
        dominantSide(cell) === 'short' ? shortLut[idx] : longLut[idx]
      ctx.fillRect(
        rx,
        Math.round(yTop),
        rw,
        Math.max(1, Math.ceil(yBot - yTop)),
      )
    }
  }
}

// ── Pane entry point ─────────────────────────────────────────────────

export function LiquidationMapPane() {
  const { t } = useTranslation()
  const activePair = usePanePair()
  const { availableMarkets } = useMarketData()

  const [windowHours, setWindowHours] = useState<LiquidationWindowHours>(24)
  const [sourceOverride, setSourceOverride] = useState<string | null>(null)

  const pairKey = activePair?.pairKey ?? ''
  const market = activePair?.market ?? ''

  const sources = useCollectedVenues(market)

  // The pane's own venue when a collector watches it, otherwise nothing: an
  // alternate venue's prints on this contract's candles is a deliberate choice,
  // never a default that quietly answers a question about the wrong exchange.
  const sourceVenue = sourceOverride ?? (sources[0] === market ? market : null)

  const clusters = useLiquidationClusters(
    sourceVenue ?? market,
    pairKey,
    windowHours,
  )

  const venueLabel = useCallback(
    (venue: string) => marketLabel(venue, availableMarkets),
    [availableMarkets],
  )

  if (!activePair) return <PanePairPicker />

  const hasCollector =
    sources.length > 0 && clusters.unavailable !== 'standalone'
  // The picker appears as soon as there is a choice to make — which includes
  // one alternate on an uncovered venue, where without it the offer in the
  // empty state would point at a control that is not there.
  const showSourcePicker =
    hasCollector && (sources.length > 1 || sourceVenue === null)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* With no picker there is one feed and no choice to make, so its name
          is a metric rather than a control and rides the shell's header. */}
      {!showSourcePicker && sourceVenue !== null && (
        <PaneHeaderMetric>{venueLabel(sourceVenue)}</PaneHeaderMetric>
      )}

      {/* Nothing to draw when there is neither a choice of feed nor a feed:
          the body below is an empty state, and a strip of dead chrome over it
          is exactly what this sweep is removing. */}
      {(showSourcePicker || sourceVenue !== null || hasCollector) && (
        <div className="flex shrink-0 items-center justify-between gap-2 pb-1">
          {showSourcePicker ? (
            <ToggleGroup
              aria-label={t('liquidationMap.sourceLabel')}
              multiple={false}
              onValueChange={(next) => {
                if (next[0]) {
                  track('liquidation_map_source_changed', {
                    venue: next[0],
                    window_hours: windowHours,
                  })
                  setSourceOverride(next[0])
                }
              }}
              size="sm"
              value={sourceVenue === null ? [] : [sourceVenue]}
              variant="outline"
            >
              {sources.map((venue) => (
                <ToggleGroupItem
                  className="h-6 px-1.5 text-[10px]"
                  key={venue}
                  value={venue}
                >
                  {venueLabel(venue)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : (
            <span />
          )}

          {/* The chips only exist where a collector does; on an untracked venue
            with no alternate they would be four controls that change nothing. */}
          {(sourceVenue !== null || hasCollector) && (
            <ToggleGroup
              aria-label={t('liquidationMap.windowLabel')}
              className="shrink-0"
              multiple={false}
              onValueChange={(next) => {
                const value = Number(next[0])
                if (
                  LIQUIDATION_WINDOWS.includes(value as LiquidationWindowHours)
                ) {
                  setWindowHours(value as LiquidationWindowHours)
                }
              }}
              size="sm"
              value={[String(windowHours)]}
              variant="outline"
            >
              {LIQUIDATION_WINDOWS.map((hours) => (
                <ToggleGroupItem
                  className="h-6 px-1.5 font-mono text-[10px]"
                  key={hours}
                  value={String(hours)}
                >
                  {t(WINDOW_LABEL_KEYS[hours])}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </div>
      )}

      <LiquidationMapBody
        clusters={clusters}
        market={market}
        pairKey={pairKey}
        sources={sources}
        sourceVenue={sourceVenue}
        venueLabel={venueLabel}
        windowHours={windowHours}
      />
    </div>
  )
}

// ── Body: one honest state per reason there is no map ────────────────

type ClustersResult = ReturnType<typeof useLiquidationClusters>

function LiquidationMapBody({
  clusters,
  market,
  pairKey,
  sources,
  sourceVenue,
  venueLabel,
  windowHours,
}: {
  clusters: ClustersResult
  market: string
  pairKey: string
  sources: ReadonlyArray<string>
  sourceVenue: string | null
  venueLabel: (venue: string) => string
  windowHours: LiquidationWindowHours
}) {
  const { t } = useTranslation()

  const empty = (title: string, body: string, action?: React.ReactNode) => (
    <div className="min-h-0 flex-1">
      <PaneEmpty action={action} body={body} icon={Crosshair} title={title} />
    </div>
  )

  if (clusters.unavailable === 'standalone') {
    return empty(
      t('liquidationMap.noFeedTitle'),
      t('liquidationMap.standaloneCaption'),
    )
  }

  // No collector for this venue, and none picked. The alternates are offered
  // explicitly rather than substituted: another exchange's liquidations on this
  // contract are useful context and a different claim, and the user makes it.
  if (sourceVenue === null) {
    return empty(
      t('liquidationMap.noFeedTitle'),
      t('liquidationMap.notTrackedCaption'),
      sources.length > 0 ? (
        <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {t('liquidationMap.alternateSourcePrompt', {
            venue: sources.map(venueLabel).join(', '),
          })}
        </p>
      ) : undefined,
    )
  }

  // A fact about the credential, not about the venue: the collector for this
  // source is a BYOK vendor and the configured key cannot reach the endpoint.
  // So the state is actionable, and the action is a link rather than a sentence
  // telling the user to go find one.
  if (clusters.unavailable === 'plan_required') {
    return empty(
      t('liquidationMap.planRequiredTitle'),
      t('liquidationMap.planRequiredCaption'),
      <Link className="mt-3 text-xs text-primary hover:underline" to="/plugins">
        {t('liquidationMap.planRequiredAction')} →
      </Link>,
    )
  }

  if (clusters.unavailable === 'collecting') {
    return empty(
      t('liquidationMap.collectingTitle'),
      t('liquidationMap.collectingCaption', {
        since:
          clusters.trackedSince === null
            ? t('liquidationMap.collectingJustStarted')
            : new Date(clusters.trackedSince).toLocaleString(),
      }),
    )
  }

  if (clusters.error) {
    return empty(
      t('liquidationMap.errorTitle'),
      t('liquidationMap.clustersErrorCaption'),
    )
  }

  return (
    <LiquidationMapChart
      clusters={clusters}
      market={market}
      pairKey={pairKey}
      sourceVenue={sourceVenue}
      venueLabel={venueLabel}
      windowHours={windowHours}
    />
  )
}

// ── Chart + heatmap primitive ────────────────────────────────────────

function LiquidationMapChart({
  clusters,
  market,
  pairKey,
  sourceVenue,
  venueLabel,
  windowHours,
}: {
  clusters: ClustersResult
  market: string
  pairKey: string
  sourceVenue: string
  venueLabel: (venue: string) => string
  windowHours: LiquidationWindowHours
}) {
  const { t } = useTranslation()
  const { probeVenueHistory } = useMarketData()
  const theme = usePairlensChartTheme()
  const accounts = useFuturesAccounts()
  const { data: results } = useFuturesPositions(accounts)

  const chartRef = useRef<FastFinancialChartRef | null>(null)
  const primitiveIdRef = useRef<string | null>(null)

  const timeframe = LIQUIDATION_WINDOW_TIMEFRAME[windowHours]
  const barLimit = barsForWindow(windowHours, TIMEFRAME_TO_MS[timeframe])
  // The chips' own translated literal, reused verbatim in every caption: a bare
  // number would read "in the last 1 hours", and four plural forms across
  // seventeen catalogs is a lot of ceremony for a label that already exists.
  const windowLabel = t(WINDOW_LABEL_KEYS[windowHours])

  const candlesQuery = useQuery({
    queryKey: ['liquidation-map-candles', market, pairKey, timeframe, barLimit],
    queryFn: async (): Promise<Array<Candle> | null> => {
      // The venue's OWN history provider, never the fallback chain: a wildcard
      // provider answering for the exchange would put a different venue's
      // candles under this venue's liquidation prints.
      const pending = probeVenueHistory(market, pairKey, timeframe, barLimit)
      if (!pending) return null
      const candles = await pending
      return [...candles].sort((a, b) => a.ts - b.ts)
    },
    enabled: Boolean(market && pairKey),
    staleTime: CANDLES_STALE_MS,
    refetchInterval: CANDLES_REFETCH_MS,
    gcTime: 10 * 60_000,
    retry: 1,
  })

  const candles = candlesQuery.data ?? null

  /**
   * Column width read off the bars that actually arrived, not off the
   * timeframe that was asked for. A venue that does not serve 15m gets clamped
   * on the way out, and a grid built at the requested width would then land its
   * cells between columns.
   */
  const barMs = useMemo(() => {
    if (!candles || candles.length < 2) return TIMEFRAME_TO_MS[timeframe]
    let smallest = Number.POSITIVE_INFINITY
    for (let i = 1; i < candles.length; i++) {
      const diff = candles[i].ts - candles[i - 1].ts
      if (diff > 0 && diff < smallest) smallest = diff
    }
    return Number.isFinite(smallest) ? smallest : TIMEFRAME_TO_MS[timeframe]
  }, [candles, timeframe])

  const grid = useMemo(
    () => buildHeatmapGrid(clusters.data?.buckets ?? [], barMs),
    [clusters.data, barMs],
  )
  const totals = useMemo(
    () => liquidationTotals(clusters.data?.buckets ?? []),
    [clusters.data],
  )

  const longLut = useMemo(
    () => buildIntensityLut(parseHexRgb(theme.downCandle, FALLBACK_DOWN_RGB)),
    [theme.downCandle],
  )
  const shortLut = useMemo(
    () => buildIntensityLut(parseHexRgb(theme.upCandle, FALLBACK_UP_RGB)),
    [theme.upCandle],
  )

  const paint = useMemo<HeatmapPaint>(
    () => ({
      grid,
      bucketWidth: clusters.data?.bucketWidth ?? 0,
      longLut,
      shortLut,
    }),
    [grid, clusters.data, longLut, shortLut],
  )
  // The primitive closure is registered once and must not capture a stale
  // paint: it reads the ref every frame, and the effect below nudges a repaint
  // whenever the ref's contents are replaced.
  const paintRef = useRef(paint)
  paintRef.current = paint

  const bands = useMemo((): Array<Band> => {
    const out: Array<Band> = []
    const rows: Array<{ position: NormalizedPosition; venueLabel: string }> = []
    for (const result of results) {
      for (const position of result.positions) {
        if (pairKey && position.pair !== pairKey) continue
        rows.push({ position, venueLabel: result.account.venueLabel })
      }
    }
    const notionals = rows.map((row) => notionalOf(row.position))
    const maxNotional = Math.max(...notionals, 1)
    rows.forEach((row, index) => {
      const price = row.position.liquidationPrice
      if (price == null || !Number.isFinite(price)) return
      out.push({
        key: `pos:${row.venueLabel}:${row.position.pair}:${row.position.side}`,
        price,
        side: row.position.side === 'long' ? 'long' : 'short',
        weight: Math.max(notionals[index] / maxNotional, 0.25),
        venueLabel: row.venueLabel,
      })
    })
    return out
  }, [results, pairKey])

  const lastClose = candles?.[candles.length - 1]?.close ?? null

  const series = useMemo<Array<ChartSeriesInput>>(() => {
    const bars = (candles ?? []).map((c) => ({
      ts: c.ts,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
    const priceLines: Array<PriceLine> = bands.map((band) => {
      const distance =
        lastClose === null ? null : liquidationDistance(lastClose, band.price)
      return {
        price: band.price,
        color:
          band.side === 'long'
            ? (theme.downCandle ?? '#e94f55')
            : (theme.upCandle ?? '#40c786'),
        lineWidth: 1 + Math.round(band.weight * 2),
        lineStyle: 'dashed' as const,
        title:
          distance === null
            ? band.venueLabel
            : `${band.venueLabel} · ${(distance * 100).toFixed(1)}%`,
        axisLabelVisible: true,
      }
    })
    return [
      {
        id: SERIES_ID,
        label: pairKey,
        bars,
        pricePrecision: precisionFor(lastClose),
        priceLines,
      },
    ]
  }, [candles, bands, lastClose, pairKey, theme.downCandle, theme.upCandle])

  // Primitives have no invalidation channel of their own: the chart repaints
  // when its data moves, so a repaint is provoked by re-sending the last bar.
  const nudgeRedraw = useCallback(() => {
    const ref = chartRef.current
    if (!ref) return
    const bars = ref.data(SERIES_ID)
    if (!bars.length) return
    const last = bars[bars.length - 1]
    ref.applyTick({
      seriesId: SERIES_ID,
      ts: last.ts,
      price: last.close,
      volume: last.volume,
    })
  }, [])

  const handleReady = useCallback(
    (ref: FastFinancialChartRef) => {
      chartRef.current = ref
      if (primitiveIdRef.current) ref.removePrimitive(primitiveIdRef.current)
      primitiveIdRef.current = ref.addPrimitive({
        seriesId: SERIES_ID,
        zOrder: 'behindSeries',
        paneRenderer: (renderCtx: PrimitivePaneRenderContext) => {
          renderLiquidationHeatmap(renderCtx, paintRef.current)
        },
      })
      // The chart finished its first render before the primitive existed.
      requestAnimationFrame(nudgeRedraw)
    },
    [nudgeRedraw],
  )

  useEffect(() => {
    return () => {
      if (chartRef.current && primitiveIdRef.current) {
        chartRef.current.removePrimitive(primitiveIdRef.current)
      }
    }
  }, [])

  // Unlike the liquidity heatmap, whose samples arrive off a socket the render
  // tree never sees, every input here is React state — so the repaint rides the
  // data change directly instead of a 500 ms polling nudge.
  useEffect(() => {
    nudgeRedraw()
  }, [paint, nudgeRedraw])

  const defaultViewport = useMemo(
    () => ({
      type: 'last-bars' as const,
      bars: Math.max(Math.ceil((windowHours * 3_600_000) / barMs), 20),
    }),
    [windowHours, barMs],
  )
  const timeScale = useMemo(
    () => ({
      rightOffset: 2,
      fixLeftEdge: true,
      shiftVisibleRangeOnNewBar: true,
    }),
    [],
  )
  const interaction = useMemo(
    () => ({ wheelZoom: true, dragPan: true, keyboardShortcuts: true }),
    [],
  )

  if (candlesQuery.isPending) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span>{t('terminal.status.loadingCandles')}</span>
      </div>
    )
  }

  if (!candles || candles.length < 2) {
    return (
      <div className="min-h-0 flex-1">
        <PaneEmpty
          body={t('liquidationMap.noCandlesBody')}
          icon={Crosshair}
          title={t('liquidationMap.noCandlesTitle')}
        />
      </div>
    )
  }

  // Unknown completeness reads as 'sampled', matching the server's own fallback:
  // over-disclaiming a complete feed costs a sentence, under-disclaiming a
  // sampled one presents a sample as a census.
  const completeness: LiquidationCompleteness =
    clusters.data?.completeness ?? 'sampled'
  // Distinguishing "the collector answered and the window was quiet" from "the
  // answer has not arrived": only the first is a fact about the market.
  const emptyWindow = grid.cellCount === 0 && !clusters.isLoading

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <FastFinancialChart
          chartType="candles"
          className="h-full w-full"
          defaultViewport={defaultViewport}
          interaction={interaction}
          onReady={handleReady}
          series={series}
          snapshotThrottleMs={120}
          theme={theme}
          timeframe={timeframe as Timeframe}
          timeScale={timeScale}
        />
        {emptyWindow && (
          // z-10 because the chart stacks its own canvases inside this box; a
          // badge in normal flow lands under the price grid.
          <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md bg-card/85 px-2 py-1 text-[11px] text-muted-foreground">
            {t('liquidationMap.noneInWindow', { window: windowLabel })}
          </p>
        )}
      </div>

      {/* The chart's canvas ends on a hard edge, so this seam is one the board
          sanctions drawing: its own hairline, not a border on the strip. */}
      <div className="h-px shrink-0 bg-(--pane-rule)" />

      <div
        className={cn(
          'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 pt-1',
          PANE_FOOTNOTE,
          '[font-variant-numeric:tabular-nums]',
        )}
      >
        <span className="flex items-center gap-1 text-down">
          <span className="size-2 rounded-sm bg-down" />
          {t('liquidationMap.legendLong', {
            value: formatCompactUsd(totals.long),
          })}
        </span>
        <span className="flex items-center gap-1 text-up">
          <span className="size-2 rounded-sm bg-up" />
          {t('liquidationMap.legendShort', {
            value: formatCompactUsd(totals.short),
          })}
        </span>
        <span className="text-muted-foreground">
          {t('liquidationMap.legendPrints', { count: totals.count })}
        </span>
        <span className="ml-auto truncate text-muted-foreground">
          {t('liquidationMap.sourceLine', {
            feed: t(
              completeness === 'complete'
                ? 'liquidationMap.feedComplete'
                : 'liquidationMap.feedSampled',
            ),
            venue: venueLabel(sourceVenue),
          })}
        </span>
      </div>

      <footer className="shrink-0 pt-1">
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          {clusters.isLoading
            ? t('liquidationMap.clustersLoadingCaption')
            : emptyWindow
              ? t('liquidationMap.noClustersCaption', { window: windowLabel })
              : t('liquidationMap.mapCaption', {
                  venue: venueLabel(sourceVenue),
                  window: windowLabel,
                })}{' '}
          {bands.length === 0
            ? t('liquidationMap.noPositionsCaption')
            : t('liquidationMap.positionsCaption')}
          {completeness === 'sampled' && (
            <> {t('liquidationMap.sampledNote')}</>
          )}
        </p>
      </footer>
    </>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Live manifests into the ordered source list. Derivation lives in the lib. */
function useCollectedVenues(focusedVenue: string): Array<string> {
  const { pluginManager, pluginStateVersion } = usePairlens()
  return useMemo(
    () =>
      collectedLiquidationVenues(
        pluginManager.getActivePlugins().map((plugin) => plugin.manifest),
        focusedVenue,
      ),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion, focusedVenue],
  )
}

/** The connector's own name for a venue, or the venue id made readable. */
function marketLabel(
  venue: string,
  markets: ReadonlyArray<{ marketId: string; displayName: string }>,
): string {
  const known = markets.find((m) => m.marketId === venue)
  if (known) return known.displayName
  return venue
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Decimals the price axis needs, from the magnitude it is showing. */
function precisionFor(price: number | null): number {
  if (price === null || !Number.isFinite(price) || price <= 0) return 2
  return Math.min(Math.max(Math.ceil(-Math.log10(price)) + 4, 2), 8)
}

/** Notional the position carries, or 0 when the venue priced neither leg. */
function notionalOf(position: NormalizedPosition): number {
  if (position.notionalUsd != null && Number.isFinite(position.notionalUsd)) {
    return Math.abs(position.notionalUsd)
  }
  if (position.markPrice == null) return 0
  return position.contracts * (position.contractSize ?? 1) * position.markPrice
}
