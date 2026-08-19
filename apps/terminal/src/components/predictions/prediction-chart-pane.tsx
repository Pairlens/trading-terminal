// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The probability chart. Every answer to the question, over time, on one axis.
 *
 * A prediction market is not a price series and the candlestick terminal was
 * the wrong instrument for it twice over. A contract that trades between 0 and
 * 1 has no meaningful high/low wick at four decimal places, drawing trendlines
 * and Fibonacci retracements on a probability is numerology, and a WebGL
 * context per pane is a lot of machinery for a line that moves a few times an
 * hour. Worse, the price chart can only ever show ONE outcome — so a race read
 * as "here is the favourite" when the actual question is who is closing on
 * whom.
 *
 * So this pane is deliberately small: plain recharts over the shared chart
 * container, no drawing layer, no indicator stack, no GPU. What it spends its
 * complexity on instead is the thing the price chart cannot do — putting the
 * whole field on one time axis, in the colours the ladder and the basket
 * already use for the same runners, with a crosshair that reads every runner
 * at once so a crossover is visible rather than inferred.
 *
 * Two readings the layout is built around. The legend is the chart: it prices
 * every drawn runner, states its move over the window, and toggles its line,
 * because with eight lines the question "which one is that" has to be
 * answerable without a hover. And the cap is stated in the footer: a field of
 * 128 draws its leaders and says so, rather than implying the other 120 do not
 * exist.
 *
 * Two views, because a fixed 0-100% axis has one bad failure mode and races
 * hit it constantly. When the favourite is at 22%, eight lines share the
 * bottom fifth of the pane and second against third is a two-pixel gap. So a
 * race can also be drawn as bands laid end to end, which fills the axis by
 * construction and turns that comparison into two heights. The bands stack RAW
 * probabilities under a grey remainder rather than normalizing to 100%, and
 * only a field that is genuinely a partition may be stacked at all: see
 * `lib/predictions/stack`.
 *
 * The live tick is throttled to a few seconds on purpose. Everything else on a
 * prediction route (the header's probability, the book, the tape) streams at
 * full rate; a chart whose window is an hour at its narrowest gains nothing
 * from re-laying out eight paths sixty times a second, and recharts re-renders
 * the whole SVG on every data change.
 */
import { memo, useCallback, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import { ChevronRight, TrendingUp } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { ChartContainer, ChartTooltip } from '@pairlens/ui/components/ui/chart'
import type { ChartConfig } from '@pairlens/ui/components/ui/chart'

import type { PredictionEventContext } from '@/hooks/use-prediction-event'
import type {
  ChartedRunner,
  PredictionWindowId,
} from '@/hooks/use-prediction-series'
import type { SeriesRow } from '@/lib/predictions/series'
import type { StackRow } from '@/lib/predictions/stack'

import type { PredictionChartView } from '@/lib/predictions/chart-view'
import { PaneDesktopOnly } from '@/components/layout/pane-desktop-only'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { usePanePair } from '@/lib/layout/pane-context'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'
import {
  DEFAULT_PREDICTION_WINDOW,
  PREDICTION_WINDOWS,
  usePredictionSeries,
} from '@/hooks/use-prediction-series'
import { LivePriceSampler } from '@/components/predictions/live-price-sampler'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import {
  dayTicks,
  lastValues,
  windowChange,
  withLivePoint,
} from '@/lib/predictions/series'
import {
  formatAxisTime,
  formatTooltipTime,
  isDateSpan,
  spanOf,
} from '@/lib/predictions/chart-axis'
import {
  REST_KEY,
  isPartitionField,
  stackSeries,
} from '@/lib/predictions/stack'
import {
  ACTIVE_BAND_EDGE_WIDTH,
  ACTIVE_BAND_FILL_BOTTOM,
  ACTIVE_BAND_FILL_TOP,
  BAND_EDGE_WIDTH,
  BAND_FILL_BOTTOM,
  BAND_FILL_TOP,
  REST_FILL_AT_CEILING,
  REST_FILL_AT_FIELD,
  bandGradientId,
  paintScope,
  restGradientId,
} from '@/lib/predictions/band-paint'
import {
  DEFAULT_PREDICTION_CHART_VIEW,
  PREDICTION_CHART_VIEWS,
  PREDICTION_CHART_VIEW_KEY,
} from '@/lib/predictions/chart-view'
import { formatPredictionPrice } from '@/lib/format-price'
import { track } from '@/lib/analytics-events'

export function PredictionChartPane() {
  const { t } = useTranslation()
  const pane = usePanePair()
  const context = usePredictionEventContext(
    pane?.pairKey ?? '',
    pane?.market ?? '',
  )

  if (!pane) {
    return (
      <PaneEmpty
        body={t('predictionChart.noPairBody')}
        icon={TrendingUp}
        title={t('predictionChart.noPairTitle')}
      />
    )
  }

  if (context.state === 'desktop-only') {
    return (
      <PaneDesktopOnly
        descriptionKey="events.desktopOnlyDescription"
        titleKey="events.desktopOnlyTitle"
      />
    )
  }

  return (
    <PredictionChartBody
      context={context}
      market={pane.market}
      pairKey={pane.pairKey}
    />
  )
}

function PredictionChartBody({
  context,
  market,
  pairKey,
}: {
  context: PredictionEventContext
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  // Persisted, and deliberately not per-pair: a contract expires, so a span
  // remembered against one outcome would be remembered for nothing. The span
  // is a reading habit, and it belongs to the trader.
  const [windowId, setWindowId] = usePersistedState<PredictionWindowId>(
    'predictions.chartWindow',
    DEFAULT_PREDICTION_WINDOW,
  )
  const [view, setView] = usePersistedState<PredictionChartView>(
    PREDICTION_CHART_VIEW_KEY,
    DEFAULT_PREDICTION_CHART_VIEW,
  )
  const [hidden, setHidden] = useState<ReadonlyArray<string>>([])

  const series = usePredictionSeries(
    market,
    context.runners,
    pairKey,
    windowId,
    context.state === 'ready',
  )
  const [live, setLive] = useState<number | null>(null)

  const rows = useMemo(
    () => withLivePoint(series.rows, pairKey, live),
    [series.rows, pairKey, live],
  )

  /**
   * How much clock the chart is actually covering. The tick format keys on
   * this rather than on the bucket size — see `lib/predictions/chart-axis`.
   */
  const span = useMemo(() => spanOf(rows), [rows])

  // Date labels are spaced by day, not by pixel: see `dayTicks`.
  const ticks = useMemo(
    () => (isDateSpan(span) ? dayTicks(rows) : undefined),
    [rows, span],
  )

  const visible = useMemo(
    () => series.runners.filter((r) => !hidden.includes(r.pairKey)),
    [series.runners, hidden],
  )

  const keys = useMemo(
    () => series.runners.map((r) => r.pairKey),
    [series.runners],
  )
  const latest = useMemo(() => lastValues(rows, keys), [rows, keys])
  const change = useMemo(() => windowChange(rows, keys), [rows, keys])

  /**
   * Whether bands are even meaningful here. A nested strike ladder sums to
   * several dollars and a binary is one boundary, so the toggle is offered
   * against the field rather than always: see `isPartitionField`.
   */
  const stackable = useMemo(
    () => isPartitionField(context.runners),
    [context.runners],
  )
  const stacked = view === 'stacked' && stackable

  const visibleKeys = useMemo(() => visible.map((r) => r.pairKey), [visible])
  // Built from the VISIBLE runners: hiding one in the legend has to hand its
  // mass back to the rest band, or the stack would still be reserving room
  // for a line that is not drawn.
  const bands = useMemo(
    () => (stacked ? stackSeries(rows, visibleKeys) : null),
    [stacked, rows, visibleKeys],
  )
  const byKey = useMemo(
    () => new Map(visible.map((runner) => [runner.pairKey, runner])),
    [visible],
  )
  // Namespaced, because two prediction charts can be on one workspace and an
  // SVG gradient id is document-global.
  const scope = paintScope(useId())

  const drawn = series.runners.length
  const selectWindow = useCallback(
    (id: PredictionWindowId) => {
      setWindowId(id)
      track('prediction_chart_window_selected', { window: id, runners: drawn })
    },
    [setWindowId, drawn],
  )

  const selectView = useCallback(
    (id: PredictionChartView) => {
      setView(id)
      track('prediction_chart_view_selected', { view: id, runners: drawn })
    },
    [setView, drawn],
  )

  const toggle = useCallback((key: string) => {
    setHidden((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }, [])

  const config = useMemo<ChartConfig>(() => {
    const out: ChartConfig = {}
    for (const runner of series.runners) {
      out[runner.pairKey] = { label: runner.label, color: runner.color }
    }
    return out
  }, [series.runners])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Renders nothing. It holds the ticker subscription so the tick stops
          at a leaf instead of re-running this component and every memo in it
          sixty times a second. See `LivePriceSampler`. */}
      <LivePriceSampler onSample={setLive} />

      {context.state === 'error' && context.error && (
        <div className="px-2 pt-2">
          <PaneErrorBanner message={context.error} venue={context.venueLabel} />
        </div>
      )}

      <Legend
        change={change}
        context={context}
        hidden={hidden}
        latest={latest}
        onToggle={toggle}
        runners={series.runners}
        showRest={Boolean(bands?.hasRest)}
      />

      <div className="relative min-h-0 flex-1">
        {series.state === 'ready' ? (
          <ChartContainer
            className="aspect-auto size-full [&_.recharts-cartesian-grid_line]:stroke-border/40"
            config={config}
          >
            <ComposedChart
              data={bands ? bands.rows : rows}
              margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
            >
              {/* One gradient per band, mapped to that band's own box. See
                  `lib/predictions/band-paint`. */}
              {bands && (
                <defs>
                  {bands.order.map((key, index) => {
                    const runner = byKey.get(key)
                    if (!runner) return null
                    return (
                      <linearGradient
                        key={key}
                        id={bandGradientId(scope, index)}
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={runner.color}
                          stopOpacity={
                            runner.active ? ACTIVE_BAND_FILL_TOP : BAND_FILL_TOP
                          }
                        />
                        <stop
                          offset="100%"
                          stopColor={runner.color}
                          stopOpacity={
                            runner.active
                              ? ACTIVE_BAND_FILL_BOTTOM
                              : BAND_FILL_BOTTOM
                          }
                        />
                      </linearGradient>
                    )
                  })}
                  <linearGradient
                    id={restGradientId(scope)}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    {/* Runs the other way: faint at the ceiling, strongest
                        where it meets the field. */}
                    <stop
                      offset="0%"
                      stopColor="var(--muted-foreground)"
                      stopOpacity={REST_FILL_AT_CEILING}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--muted-foreground)"
                      stopOpacity={REST_FILL_AT_FIELD}
                    />
                  </linearGradient>
                </defs>
              )}
              <CartesianGrid vertical={false} strokeDasharray="2 4" />
              {/* Even odds. The one horizontal a probability chart earns: on a
                  binary contract it is the line the question flips across, and
                  on a race it is the level a runner becomes the favourite at.
                  Dropped in the stacked view, where 50% is the boundary of
                  whichever bands happen to sit below it and means nothing. */}
              {!bands && (
                <ReferenceLine
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                  y={0.5}
                />
              )}
              <XAxis
                axisLine={false}
                dataKey="ts"
                domain={['dataMin', 'dataMax']}
                minTickGap={44}
                scale="time"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickFormatter={(value: number) => formatAxisTime(value, span)}
                tickLine={false}
                ticks={ticks}
                type="number"
              />
              {/* Fixed 0-100%, never auto-scaled to the field. A race whose
                  leader sits at 12% would otherwise fill the pane and read as
                  a certainty, and two runners two points apart would look like
                  a chasm. In the line view the empty top of the chart IS the
                  reading: nobody in this field is close to winning. The
                  stacked view fills that space honestly instead, and only
                  lifts the ceiling when the book prices above a dollar. */}
              <YAxis
                axisLine={false}
                domain={[0, bands ? bands.max : 1]}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
                tickLine={false}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                width={34}
              />
              <ChartTooltip
                content={
                  <ProbabilityTooltip
                    gaps={bands?.gaps}
                    runners={visible}
                    showRest={Boolean(bands?.hasRest)}
                    spanMs={span}
                  />
                }
                cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
              />
              {bands
                ? /* Bottom-first, richest at the floor. The band the route is
                     on is outlined heavily so it stays findable in a field of
                     eight fills. */
                  bands.order.map((key, index) => {
                    const runner = byKey.get(key)
                    if (!runner) return null
                    return (
                      <Area
                        key={key}
                        activeDot={false}
                        dataKey={key}
                        fill={`url(#${bandGradientId(scope, index)})`}
                        fillOpacity={1}
                        isAnimationActive={false}
                        stackId="field"
                        // An Area strokes only its top curve, which in a stack
                        // is the divider against the band above it.
                        stroke={runner.color}
                        strokeLinejoin="round"
                        strokeWidth={
                          runner.active
                            ? ACTIVE_BAND_EDGE_WIDTH
                            : BAND_EDGE_WIDTH
                        }
                        type="monotone"
                      />
                    )
                  })
                : visible.map((runner) => (
                    <Line
                      key={runner.pairKey}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                      // A runner listed mid-window has no earlier price, and
                      // joining across the hole would draw a probability the
                      // market never quoted.
                      connectNulls={false}
                      dataKey={runner.pairKey}
                      dot={false}
                      isAnimationActive={false}
                      stroke={runner.color}
                      strokeWidth={runner.active ? 2.25 : 1.4}
                      type="monotone"
                    />
                  ))}
              {/* Everything the chart is not drawing, drawn. Declared last so
                  it caps the stack, and kept grey and unlabelled in the plot
                  because it is a residue rather than a runner. */}
              {bands?.hasRest && (
                <Area
                  activeDot={false}
                  dataKey={REST_KEY}
                  // Recessive, but not invisible: on the phone's pure-black
                  // plot a fainter grey read as empty space, which is exactly
                  // the wrong reading for the mass the chart is not drawing.
                  fill={`url(#${restGradientId(scope)})`}
                  fillOpacity={1}
                  isAnimationActive={false}
                  stackId="field"
                  // No edge: its top curve is the ceiling of the plot, and
                  // stroking it just draws a border. The boundary that matters
                  // is the last runner's own edge, already drawn.
                  stroke="none"
                  type="monotone"
                />
              )}
            </ComposedChart>
          </ChartContainer>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="text-xs text-muted-foreground">
              {series.state === 'loading' || context.state === 'loading'
                ? t('predictionChart.loading')
                : t('predictionChart.noHistory', { venue: context.venueLabel })}
            </p>
          </div>
        )}
      </div>

      <Footer
        hiddenRunners={series.hidden}
        onView={selectView}
        onWindow={selectWindow}
        stackable={stackable}
        stride={series.stride}
        view={view}
        windowId={windowId}
      />
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────

/**
 * Every drawn runner, priced, with its move over the window and a switch.
 *
 * Not a recharts legend: it has to carry a number per runner (a colour alone
 * does not answer "which one is winning"), survive being scrolled at eight
 * entries in a docked pane, and pivot the route. The chip toggles the line;
 * the caret opens the outcome, because on a race the chart is where you decide
 * which contract you actually want the book and the ticket pointed at.
 */
const Legend = memo(function Legend({
  change,
  context,
  hidden,
  latest,
  onToggle,
  runners,
  showRest,
}: {
  change: Map<string, number>
  context: PredictionEventContext
  hidden: ReadonlyArray<string>
  latest: Map<string, number>
  onToggle: (key: string) => void
  runners: Array<ChartedRunner>
  /** The stacked view is drawing a remainder band that needs naming. */
  showRest: boolean
}) {
  const { t } = useTranslation()
  const select = usePredictionSelect()

  if (runners.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 overflow-y-auto px-2 py-1.5 [scrollbar-width:thin]">
      {runners.map((runner) => {
        const off = hidden.includes(runner.pairKey)
        const price = latest.get(runner.pairKey)
        const move = change.get(runner.pairKey)
        const source = context.runners.find(
          (r) => r.yes.pairKey === runner.pairKey,
        )
        return (
          <div
            key={runner.pairKey}
            className={cn(
              'group flex h-[22px] items-center rounded-md border pl-1.5 text-[11px] transition-colors',
              runner.active
                ? 'border-primary/40 bg-primary/5'
                : 'border-transparent bg-muted/40',
              off && 'opacity-40',
            )}
          >
            <button
              aria-pressed={!off}
              className="flex min-w-0 items-center gap-1.5 pr-1.5"
              onClick={() => onToggle(runner.pairKey)}
              title={t('predictionChart.toggleLine', { name: runner.label })}
              type="button"
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: runner.color }}
              />
              <span className="max-w-[128px] truncate font-medium">
                {runner.label}
              </span>
              {price !== undefined && (
                <span className="font-mono tabular-nums">
                  {Math.round(price * 100)}%
                </span>
              )}
              {move !== undefined && Math.abs(move) >= 0.005 && (
                <span
                  className={cn(
                    'font-mono tabular-nums',
                    move > 0 ? 'text-up' : 'text-down',
                  )}
                >
                  {move > 0 ? '+' : ''}
                  {(move * 100).toFixed(0)}
                </span>
              )}
              {runner.unavailable && (
                <span className="text-muted-foreground">
                  {t('predictionChart.noLine')}
                </span>
              )}
            </button>
            {source && context.event && !runner.active && (
              <button
                aria-label={t('predictionChart.openOutcome', {
                  name: runner.label,
                })}
                className="flex h-full items-center rounded-r-md px-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() =>
                  select.select({
                    venue: context.venue,
                    event: context.event!,
                    market: source.market,
                    pairKey: source.yes.pairKey,
                    label: source.yes.label,
                  })
                }
                type="button"
              >
                <ChevronRight className="size-3" />
              </button>
            )}
          </div>
        )
      })}
      {/* Names the grey band. Not a switch: the remainder is what is left
          after the others, so there is nothing to toggle. */}
      {showRest && (
        <div className="flex h-[22px] items-center gap-1.5 rounded-md border border-transparent bg-muted/40 px-1.5 text-[11px] text-muted-foreground">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
          />
          <span className="truncate">{t('predictionChart.restBand')}</span>
        </div>
      )}
    </div>
  )
})

// ── Crosshair ─────────────────────────────────────────────────────────

type TooltipPayload = { payload?: SeriesRow | StackRow }

/**
 * Every visible runner at the hovered instant, richest first.
 *
 * Re-sorted per point rather than kept in legend order: reading a crossover
 * off a chart means seeing the order swap as the crosshair passes it, and a
 * tooltip pinned to a fixed order hides exactly that.
 *
 * Read off the hovered ROW rather than off recharts' payload entries, because
 * the two views disagree about what an entry is: a stacked band carries a
 * zero for a runner the venue never quoted, which the payload cannot tell
 * apart from a genuine zero. The row plus `gaps` can, so a runner with no
 * history stays out of the readout in both views instead of being read out at
 * 0%.
 */
function ProbabilityTooltip({
  active,
  gaps,
  payload,
  runners,
  showRest,
  spanMs,
}: {
  active?: boolean
  /** ts → runners with no quote there. Absent in the line view. */
  gaps?: Map<number, Set<string>>
  payload?: Array<TooltipPayload>
  runners: Array<ChartedRunner>
  showRest?: boolean
  spanMs: number
}) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null

  const row = payload[0]?.payload
  if (!row) return null
  const ts = row.ts
  const missing = gaps?.get(ts)

  const rows = runners
    .map((runner) => {
      if (missing?.has(runner.pairKey)) return null
      const value = row[runner.pairKey]
      if (typeof value !== 'number' || !Number.isFinite(value)) return null
      return { runner, value }
    })
    .filter(
      (entry): entry is { runner: ChartedRunner; value: number } =>
        entry !== null,
    )
    .sort((a, b) => b.value - a.value)

  const rest = showRest ? row[REST_KEY] : undefined

  if (rows.length === 0) return null

  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-[11px] shadow-md">
      {typeof ts === 'number' && (
        <p className="mb-1 font-mono text-[10px] text-muted-foreground">
          {formatTooltipTime(ts, spanMs)}
        </p>
      )}
      <div className="flex flex-col gap-0.5">
        {rows.map(({ runner, value }) => (
          <div key={runner.pairKey} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: runner.color }}
            />
            <span className="max-w-[150px] flex-1 truncate">
              {runner.label}
            </span>
            <span className="font-mono tabular-nums">
              {(value * 100).toFixed(1)}%
            </span>
            {/* The probability is the reading; the cents are what it costs.
                Both, because the chart is used to decide and to price. */}
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatPredictionPrice(value)}
            </span>
          </div>
        ))}
        {typeof rest === 'number' && rest > 0.005 && (
          <div className="flex items-center gap-2 border-t pt-0.5 text-muted-foreground">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
            />
            <span className="max-w-[150px] flex-1 truncate">
              {t('predictionChart.restBand')}
            </span>
            <span className="font-mono tabular-nums">
              {(rest * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Footer ────────────────────────────────────────────────────────────

/**
 * The span pills, the view switch, and what the chart is not showing.
 *
 * The cap and the stride are both stated here. A chart that quietly drew every
 * fourth minute, or quietly dropped 120 runners, would read as complete, and
 * "the ladder has the rest" is a one-line answer that keeps it honest.
 *
 * The view switch is hidden rather than disabled on a field that cannot be
 * stacked. A greyed control invites the question "why not", and the answer
 * ("these answers are not mutually exclusive") is not one a footer can give.
 */
function Footer({
  hiddenRunners,
  onView,
  onWindow,
  stackable,
  stride,
  view,
  windowId,
}: {
  hiddenRunners: number
  onView: (id: PredictionChartView) => void
  onWindow: (id: PredictionWindowId) => void
  stackable: boolean
  stride: number
  view: PredictionChartView
  windowId: PredictionWindowId
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-2 border-t px-2 py-1">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {PREDICTION_WINDOWS.map((win) => (
            <button
              key={win.id}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10.5px] font-medium transition-colors',
                win.id === windowId
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onWindow(win.id)}
              type="button"
            >
              {t(win.labelKey)}
            </button>
          ))}
        </div>
        {stackable && (
          <div className="flex gap-0.5 rounded border p-[1px]">
            {PREDICTION_CHART_VIEWS.map((option) => (
              <button
                key={option.id}
                aria-pressed={option.id === view}
                className={cn(
                  'rounded-[3px] px-1.5 py-0.5 text-[10.5px] font-medium transition-colors',
                  option.id === view
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => onView(option.id)}
                type="button"
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="truncate text-[10px] text-muted-foreground">
        {hiddenRunners > 0 &&
          t('predictionChart.capped', { count: hiddenRunners })}
        {hiddenRunners > 0 && stride > 1 && ' · '}
        {stride > 1 && t('predictionChart.strided', { count: stride })}
      </p>
    </div>
  )
}
