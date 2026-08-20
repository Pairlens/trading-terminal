// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The probability chart, laid out for a phone.
 *
 * Same data and the same refusals as the desktop pane — it shares
 * `usePredictionSeries`, the alignment grid, the palette and the axis
 * formatters, so a contract cannot read as two different markets on two
 * screens. What is different is everything about the arrangement, which is why
 * this is a sibling rather than the desktop component with a `compact` prop.
 *
 * The desktop puts its legend across the top, over a chart that is already
 * 700px wide. At 402px that legend is the whole chart. So here it goes UNDER
 * the plot as one horizontally-scrolling row, the spans go under that in a
 * band the drawing toolbar vacates, and the plot takes whatever is left after
 * the price readout and the event strip have had their fixed slice off the
 * top.
 *
 * Three phone-specific decisions.
 *
 * **It replaces the candle chart rather than layering over it.** The engine
 * would otherwise keep a WebGL context alive and re-rendering behind an opaque
 * panel, which on the one surface that runs on a battery is the wrong trade.
 * `MobileChartSurface` already swaps the chart out for its own empty states,
 * so this is the shape that surface has, not a new one.
 *
 * **Nothing here is a drawing target.** The toolbar and the Trade screen's
 * draggable limit line are both suppressed while this view is up: they convert
 * price to pixels through the chart engine's own scale, and with the engine
 * unmounted a line dragged to "68¢" would be pointing at nothing. Candles are
 * one tap away and they bring both back. The Trade ticket's numeric limit
 * field — the phone's primary price input anyway — is unaffected.
 *
 * **The span is shared with the desktop, deliberately.** It persists to the
 * same key the laptop writes, like the timeframe and the drawings do: a span
 * is a reading habit and it belongs to the trader, not to the device. The
 * lines-or-bands switch rides the same rule and the same key.
 *
 * The bands matter more here than they do on the laptop. Eight lines squeezed
 * into the bottom fifth of a 700px pane are hard to read; on 402px of phone
 * they are one thick smear. Stacking is the same module and the same refusals
 * as the desktop pane: raw probabilities under a grey remainder, and only on a
 * field that is genuinely a partition. See `lib/predictions/stack`.
 */
import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { cn } from '@pairlens/ui'
import { PRESS } from '../primitives/press'
import { useMobileFocus } from '../mobile-focus-context'
import type {
  ChartedRunner,
  PredictionWindowId,
} from '@/hooks/use-prediction-series'
import type { SeriesRow } from '@/lib/predictions/series'
import type { StackRow } from '@/lib/predictions/stack'
import type { PredictionChartView } from '@/lib/predictions/chart-view'

import { haptic } from '@/lib/haptics'
import { track } from '@/lib/analytics-events'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'
import { LivePriceSampler } from '@/components/predictions/live-price-sampler'
import {
  DEFAULT_PREDICTION_WINDOW,
  PREDICTION_WINDOWS,
  usePredictionSeries,
} from '@/hooks/use-prediction-series'
import {
  formatAxisTime,
  formatTooltipTime,
  isDateSpan,
  spanOf,
} from '@/lib/predictions/chart-axis'
import { dayTicks, lastValues, withLivePoint } from '@/lib/predictions/series'
import {
  REST_KEY,
  isPartitionField,
  stackSeries,
} from '@/lib/predictions/stack'
import {
  ACTIVE_BAND_EDGE_WIDTH,
  ACTIVE_BAND_STOPS,
  BAND_EDGE_WIDTH,
  BAND_STOPS,
  REST_STOPS,
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

/**
 * Where the plot starts, in px from the chart top.
 *
 * It clears the hero price readout and the event strip below it, both of which
 * are positioned by constants rather than measured (see the strip's own
 * `STRIP_TOP_PX`, and the reason it gives). A fourth constant in the same
 * column is better than a measurement that reflows a frame after the data
 * lands.
 */
const PLOT_TOP_PX = 142

/** The legend row and the span row, both fixed so the plot never resizes. */
const LEGEND_HEIGHT_PX = 34
const SPANS_HEIGHT_PX = 46

/** Y ticks. Five on a 402px screen is one every 50px, which is readable. */
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1]

export default memo(function MobileProbabilityChart({
  onEventless,
}: {
  /**
   * Reports that there is no event behind this contract, so the shell can put
   * the candle chart back. A cold link carries a pair key and nothing else,
   * and a probability chart with no field to draw is a dead end where a price
   * chart would have worked. See `MobileChartSurface` for the fallback.
   */
  onEventless: (missing: boolean) => void
}) {
  const { focusedPair, focusedVenue } = useMobileFocus()
  const context = usePredictionEventContext(focusedPair, focusedVenue)

  // Only once the lookup has settled: reporting mid-flight would bounce the
  // user to candles for the half-second before the event arrives.
  const settled = context.state !== 'loading'
  const fieldEmpty = context.runners.length === 0
  useEffect(() => {
    if (settled && fieldEmpty) onEventless(true)
  }, [settled, fieldEmpty, onEventless])

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
    focusedVenue,
    context.runners,
    focusedPair,
    windowId,
    context.state === 'ready',
  )
  const [live, setLive] = useState<number | null>(null)

  const rows = useMemo(
    () => withLivePoint(series.rows, focusedPair, live),
    [series.rows, focusedPair, live],
  )
  const span = useMemo(() => spanOf(rows), [rows])
  const ticks = useMemo(
    () => (isDateSpan(span) ? dayTicks(rows, 5) : undefined),
    [rows, span],
  )

  const keys = useMemo(
    () => series.runners.map((r) => r.pairKey),
    [series.runners],
  )
  const latest = useMemo(() => lastValues(rows, keys), [rows, keys])
  const visible = useMemo(
    () => series.runners.filter((r) => !hidden.includes(r.pairKey)),
    [series.runners, hidden],
  )

  const stackable = useMemo(
    () => isPartitionField(context.runners),
    [context.runners],
  )
  const visibleKeys = useMemo(() => visible.map((r) => r.pairKey), [visible])
  // Visible runners only: a chip toggled off hands its mass to the remainder
  // rather than leaving a gap in the stack.
  const bands = useMemo(
    () =>
      view === 'stacked' && stackable ? stackSeries(rows, visibleKeys) : null,
    [view, stackable, rows, visibleKeys],
  )
  const byKey = useMemo(
    () => new Map(visible.map((runner) => [runner.pairKey, runner])),
    [visible],
  )
  const scope = paintScope(useId())

  const toggle = useCallback((key: string) => {
    haptic('selection')
    setHidden((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }, [])

  const selectView = useCallback(
    (id: PredictionChartView) => {
      haptic('selection')
      setView(id)
      track('prediction_chart_view_selected', {
        view: id,
        runners: series.runners.length,
      })
    },
    [setView, series.runners.length],
  )

  const selectWindow = useCallback(
    (id: PredictionWindowId) => {
      haptic('selection')
      setWindowId(id)
      track('prediction_chart_window_selected', {
        window: id,
        runners: series.runners.length,
      })
    },
    [setWindowId, series.runners.length],
  )

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Renders nothing; it owns the ticker subscription so the tick never
          re-runs this component. The phone's render rule in one import. */}
      <LivePriceSampler onSample={setLive} />

      <div className="shrink-0" style={{ height: PLOT_TOP_PX }} />

      <div
        className="min-h-0 flex-1 pl-1 pr-2"
        // The plot scrubs on drag. Without this the browser claims the gesture
        // and the crosshair never sees a move past the first few pixels.
        style={{ touchAction: 'none' }}
      >
        {series.state === 'ready' ? (
          <ResponsiveContainer height="100%" width="100%">
            <ComposedChart
              data={bands ? bands.rows : rows}
              margin={{ top: 4, right: 2, bottom: 0, left: 0 }}
            >
              {/* One gradient per band, mapped to that band's own box, at the
                  same stops the desktop uses. See `lib/predictions/band-paint`. */}
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
                        {(runner.active ? ACTIVE_BAND_STOPS : BAND_STOPS).map(
                          (band) => (
                            <stop
                              key={band.offset}
                              offset={band.offset}
                              stopColor={runner.color}
                              stopOpacity={band.opacity}
                            />
                          ),
                        )}
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
                    {/* Runs the other way: gone at the ceiling, strongest
                        where it meets the favourite. */}
                    {REST_STOPS.map((band) => (
                      <stop
                        key={band.offset}
                        offset={band.offset}
                        stopColor="var(--muted-foreground)"
                        stopOpacity={band.opacity}
                      />
                    ))}
                  </linearGradient>
                </defs>
              )}
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="2 4"
                strokeOpacity={0.45}
                vertical={false}
              />
              {/* Even odds, and only where it is a level: in the stacked
                  view 50% is wherever the bands happen to cross it. */}
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
                minTickGap={40}
                scale="time"
                tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
                tickFormatter={(value: number) => formatAxisTime(value, span)}
                tickLine={false}
                ticks={ticks}
                type="number"
              />
              {/* Fixed 0 to 100%, exactly as on the desktop: a field scaled to
                  its own leader reads as a race already decided. The stacked
                  view fills the axis honestly instead, and only lifts the
                  ceiling when the book prices above a dollar. */}
              <YAxis
                axisLine={false}
                domain={[0, bands ? bands.max : 1]}
                tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
                tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
                tickLine={false}
                ticks={Y_TICKS}
                width={28}
              />
              <Tooltip
                content={
                  <TouchReadout
                    gaps={bands?.gaps}
                    runners={visible}
                    showRest={Boolean(bands?.hasRest)}
                    spanMs={span}
                  />
                }
                cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                // Recharts routes touchmove into the same handler as a mouse
                // move, so a finger dragged across the plot scrubs the field.
                isAnimationActive={false}
                wrapperStyle={{ pointerEvents: 'none' }}
              />
              {bands
                ? /* Bottom-first: longest shot on the axis, favourite at the
                     top of the field. */
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
                      connectNulls={false}
                      dataKey={runner.pairKey}
                      dot={false}
                      isAnimationActive={false}
                      stroke={runner.color}
                      strokeWidth={runner.active ? 2.25 : 1.4}
                      type="monotone"
                    />
                  ))}
              {/* Everything the chart is not drawing, drawn. Last, so it caps
                  the stack rather than taking the ceiling off the favourite:
                  a runner strokes the top of its band, and a line at 100%
                  would read as a runner that has already won. */}
              {bands?.hasRest && (
                <Area
                  activeDot={false}
                  dataKey={REST_KEY}
                  fill={`url(#${restGradientId(scope)})`}
                  fillOpacity={1}
                  isAnimationActive={false}
                  stackId="field"
                  // No edge: its top curve is the ceiling of the plot, and
                  // stroking it just draws a border. The boundary that matters
                  // is the favourite's own edge, already drawn.
                  stroke="none"
                  type="monotone"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ChartMessage
            loading={series.state === 'loading' || context.state === 'loading'}
            venueLabel={context.venueLabel}
          />
        )}
      </div>

      <Legend
        hidden={hidden}
        hiddenRunners={series.hidden}
        latest={latest}
        onToggle={toggle}
        runners={series.runners}
        showRest={Boolean(bands?.hasRest)}
      />

      <Spans
        onSelect={selectWindow}
        onView={selectView}
        stackable={stackable}
        view={view}
        windowId={windowId}
      />
    </div>
  )
})

// ── Legend ────────────────────────────────────────────────────────────

/**
 * Every drawn runner, priced, in one scrolling row.
 *
 * A tap toggles the line rather than opening the outcome. Navigation is the
 * ladder's job on the phone — it is one tap away on the strip above, it ranks
 * the whole field rather than the eight drawn here, and a 34px chip that both
 * toggled and navigated would do the wrong one half the time.
 *
 * The cap rides at the end of this row rather than beside the spans, because
 * what it is about is which runners are drawn — the same subject as every
 * other chip here. It gave the spans row the width the view switch needed.
 */
const Legend = memo(function Legend({
  hidden,
  hiddenRunners,
  latest,
  onToggle,
  runners,
  showRest,
}: {
  hidden: ReadonlyArray<string>
  /** Runners in the field the chart is not drawing at all. */
  hiddenRunners: number
  latest: Map<string, number>
  onToggle: (key: string) => void
  runners: Array<ChartedRunner>
  /** The stacked view is drawing a remainder band that needs naming. */
  showRest: boolean
}) {
  const { t } = useTranslation()
  if (runners.length === 0) return null

  return (
    <div
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ height: LEGEND_HEIGHT_PX }}
    >
      {runners.map((runner) => {
        const off = hidden.includes(runner.pairKey)
        const price = latest.get(runner.pairKey)
        return (
          <button
            key={runner.pairKey}
            aria-pressed={!off}
            className={cn(
              'pl-press flex h-[26px] shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11px]',
              runner.active
                ? 'pl-ring-chart font-semibold'
                : 'text-[color:var(--pl-chart-fg)]',
              off && 'opacity-40',
            )}
            onClick={() => onToggle(runner.pairKey)}
            title={t('predictionChart.toggleLine', { name: runner.label })}
            type="button"
            {...PRESS}
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: runner.color }}
            />
            <span className="max-w-[104px] truncate">{runner.label}</span>
            {price !== undefined ? (
              <span className="font-mono tabular-nums">
                {Math.round(price * 100)}%
              </span>
            ) : null}
          </button>
        )
      })}
      {showRest ? (
        <span className="flex h-[26px] shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted-foreground">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
          />
          {t('predictionChart.restBand')}
        </span>
      ) : null}
      {hiddenRunners > 0 ? (
        <span className="flex h-[26px] shrink-0 items-center px-1 text-[10px] text-muted-foreground">
          {t('predictionChart.capped', { count: hiddenRunners })}
        </span>
      ) : null}
    </div>
  )
})

// ── Spans ─────────────────────────────────────────────────────────────

/**
 * The span pills, and the lines-or-bands switch.
 *
 * They sit in the band the drawing toolbar vacates, which is why the toolbar's
 * reserve is not wasted in this view: same 50px, different control.
 *
 * The switch is hidden rather than disabled on a field that cannot be stacked.
 * A greyed control on a phone invites a tap that does nothing, and the reason
 * ("these answers are not mutually exclusive") does not fit next to it.
 */
const Spans = memo(function Spans({
  onSelect,
  onView,
  stackable,
  view,
  windowId,
}: {
  onSelect: (id: PredictionWindowId) => void
  onView: (id: PredictionChartView) => void
  stackable: boolean
  view: PredictionChartView
  windowId: PredictionWindowId
}) {
  const { t } = useTranslation()
  return (
    <div
      className="flex shrink-0 items-center gap-1 px-3"
      style={{ height: SPANS_HEIGHT_PX }}
    >
      {PREDICTION_WINDOWS.map((win) => (
        <button
          key={win.id}
          className={cn(
            // 34px tall with a ±5px expanded hit area: 44px without the chips
            // overlapping each other, the same trick the timeframe grid uses.
            'pl-press relative flex h-[34px] min-w-[38px] items-center justify-center rounded-[10px] font-mono text-[12px] font-semibold after:absolute after:inset-[-5px] after:content-[""]',
            win.id === windowId
              ? 'bg-foreground text-background'
              : 'pl-ring-chart text-[color:var(--pl-chart-fg)]',
          )}
          onClick={() => onSelect(win.id)}
          type="button"
          {...PRESS}
        >
          {t(win.labelKey)}
        </button>
      ))}
      {stackable ? (
        <div className="pl-ring-chart ml-auto flex items-center gap-0.5 rounded-[10px] p-[2px]">
          {PREDICTION_CHART_VIEWS.map((option) => (
            <button
              key={option.id}
              aria-pressed={option.id === view}
              className={cn(
                'pl-press flex h-[30px] items-center rounded-lg px-2 text-[11px] font-semibold',
                option.id === view
                  ? 'bg-foreground text-background'
                  : 'text-[color:var(--pl-chart-fg)]',
              )}
              onClick={() => onView(option.id)}
              type="button"
              {...PRESS}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
})

// ── Crosshair ─────────────────────────────────────────────────────────

type TooltipPayload = { payload?: SeriesRow | StackRow }

/**
 * Every visible runner at the touched instant, richest first.
 *
 * Capped at six rows on a phone, because the card has to stay clear of the
 * finger holding it up. The cap is stated rather than silent: a seventh runner
 * dropping off a tooltip without a word is how a chart starts lying about its
 * own field.
 */
const TOOLTIP_ROWS = 6

function TouchReadout({
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

  // Read off the row rather than off recharts' entries: a stacked band carries
  // a zero for a runner the venue never quoted, and only the row plus `gaps`
  // can tell that apart from a real zero. Same reasoning as the desktop pane.
  const row = payload[0]?.payload
  if (!row) return null
  const ts = row.ts
  const missing = gaps?.get(ts)

  const all = runners
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

  if (all.length === 0) return null
  const rows = all.slice(0, TOOLTIP_ROWS)
  const rest = showRest ? row[REST_KEY] : undefined

  return (
    <div className="pl-glass rounded-xl px-2.5 py-1.5 text-[11px]">
      {typeof ts === 'number' ? (
        <p className="mb-1 font-mono text-[9.5px] text-muted-foreground">
          {formatTooltipTime(ts, spanMs)}
        </p>
      ) : null}
      <div className="flex flex-col gap-0.5">
        {rows.map(({ runner, value }) => (
          <div key={runner.pairKey} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: runner.color }}
            />
            <span className="max-w-[112px] flex-1 truncate">
              {runner.label}
            </span>
            <span className="font-mono tabular-nums">
              {(value * 100).toFixed(1)}%
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatPredictionPrice(value)}
            </span>
          </div>
        ))}
      </div>
      {typeof rest === 'number' && rest > 0.005 ? (
        <div className="mt-0.5 flex items-center gap-2 border-t pt-0.5 text-muted-foreground">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
          />
          <span className="max-w-[112px] flex-1 truncate">
            {t('predictionChart.restBand')}
          </span>
          <span className="font-mono tabular-nums">
            {(rest * 100).toFixed(1)}%
          </span>
        </div>
      ) : null}
      {all.length > rows.length ? (
        <p className="mt-1 text-[9.5px] text-muted-foreground">
          {t('predictionChart.tooltipCapped', {
            count: all.length - rows.length,
          })}
        </p>
      ) : null}
    </div>
  )
}

// ── States ────────────────────────────────────────────────────────────

function ChartMessage({
  loading,
  venueLabel,
}: {
  loading: boolean
  venueLabel: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full items-center justify-center px-8 text-center">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {loading
          ? t('predictionChart.loading')
          : t('predictionChart.noHistory', { venue: venueLabel })}
      </p>
    </div>
  )
}
