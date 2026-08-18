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
 * is a reading habit and it belongs to the trader, not to the device.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CartesianGrid,
  Line,
  LineChart,
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

  const toggle = useCallback((key: string) => {
    haptic('selection')
    setHidden((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }, [])

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
            <LineChart
              data={rows}
              margin={{ top: 4, right: 2, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="2 4"
                strokeOpacity={0.45}
                vertical={false}
              />
              <ReferenceLine
                stroke="var(--border)"
                strokeDasharray="4 4"
                y={0.5}
              />
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
                  its own leader reads as a race already decided. */}
              <YAxis
                axisLine={false}
                domain={[0, 1]}
                tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
                tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
                tickLine={false}
                ticks={Y_TICKS}
                width={28}
              />
              <Tooltip
                content={<TouchReadout runners={visible} spanMs={span} />}
                cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                // Recharts routes touchmove into the same handler as a mouse
                // move, so a finger dragged across the plot scrubs the field.
                isAnimationActive={false}
                wrapperStyle={{ pointerEvents: 'none' }}
              />
              {visible.map((runner) => (
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
            </LineChart>
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
        latest={latest}
        onToggle={toggle}
        runners={series.runners}
      />

      <Spans
        hiddenRunners={series.hidden}
        onSelect={selectWindow}
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
 */
const Legend = memo(function Legend({
  hidden,
  latest,
  onToggle,
  runners,
}: {
  hidden: ReadonlyArray<string>
  latest: Map<string, number>
  onToggle: (key: string) => void
  runners: Array<ChartedRunner>
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
    </div>
  )
})

// ── Spans ─────────────────────────────────────────────────────────────

/**
 * The span pills, and what the chart is not drawing.
 *
 * They sit in the band the drawing toolbar vacates, which is why the toolbar's
 * reserve is not wasted in this view: same 50px, different control.
 */
const Spans = memo(function Spans({
  hiddenRunners,
  onSelect,
  windowId,
}: {
  hiddenRunners: number
  onSelect: (id: PredictionWindowId) => void
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
      {hiddenRunners > 0 ? (
        <span className="ml-auto truncate text-[10px] text-muted-foreground">
          {t('predictionChart.capped', { count: hiddenRunners })}
        </span>
      ) : null}
    </div>
  )
})

// ── Crosshair ─────────────────────────────────────────────────────────

type TooltipPayload = {
  dataKey?: string | number
  value?: number
  payload?: SeriesRow
}

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
  payload,
  runners,
  spanMs,
}: {
  active?: boolean
  payload?: Array<TooltipPayload>
  runners: Array<ChartedRunner>
  spanMs: number
}) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null

  const ts = payload[0]?.payload?.ts
  const all = payload
    .map((entry) => {
      const key = String(entry.dataKey ?? '')
      const runner = runners.find((r) => r.pairKey === key)
      if (!runner || typeof entry.value !== 'number') return null
      return { runner, value: entry.value }
    })
    .filter(
      (row): row is { runner: ChartedRunner; value: number } => row !== null,
    )
    .sort((a, b) => b.value - a.value)

  if (all.length === 0) return null
  const rows = all.slice(0, TOOLTIP_ROWS)

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
