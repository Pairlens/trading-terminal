// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The history behind every runner in a field, on one time axis.
 *
 * The price chart asks its venue for one pair. A race asks for as many as it
 * draws, which turns three decisions into policy rather than detail:
 *
 * **How many.** A Kalshi strike ladder or a Polymarket nomination market can
 * carry 128 answers, and 128 REST calls for 128 lines is both a rate-limit
 * incident and an unreadable chart. So the field is capped at the leaders,
 * the outcome the route is on is always among them however it is priced, and
 * the count NOT drawn is returned rather than swallowed — the pane states it.
 *
 * **From whom.** `probeVenueHistory`, never `fetchHistory`. The fallback chain
 * behind `fetchHistory` would hand a wildcard provider a Kalshi ticker and get
 * a CORS-blocked round trip per runner before arriving at the same "no data";
 * worse, a partial answer from a second source would put two venues' prices on
 * one axis and invite a comparison that is not real.
 *
 * **How fast.** Runners share a slot limit, so a 8-line chart opens 3 requests
 * at a time instead of 8. A prediction chart is read, not scalped: the extra
 * few hundred milliseconds to the last line costs nothing, and a 429 costs the
 * whole pane.
 *
 * Each runner is its own query, so one outcome the venue cannot chart (a
 * market listed minutes ago, a strike with no prints) leaves a gap in the
 * legend instead of emptying the chart.
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import type { Candle } from '@pairlens/shared/types'
import type { PredictionRunner } from '@/lib/predictions/race'
import type { AlignedSeries, SeriesInput } from '@/lib/predictions/series'

import { useMarketData } from '@/lib/market-data-provider'
import { alignSeries } from '@/lib/predictions/series'
import { byProbability } from '@/lib/predictions/race'
import { assignRunnerColors } from '@/lib/predictions/palette'
import { binarySideOf } from '@/lib/predictions/event-labels'
import { normalizePairKey } from '@/lib/pairs'

/**
 * Lines drawn at once.
 *
 * Eight is where the palette stops being distinguishable at a glance and where
 * a legend stops fitting one row of a docked pane. Past it the outcome ladder
 * is the right surface: it prices every runner in a table, which is a shape
 * that survives 128 rows in a way a chart never does.
 */
export const MAX_CHARTED_RUNNERS = 8

/** Concurrent history requests across every prediction chart on screen. */
const MAX_IN_FLIGHT = 3

let inFlight = 0
const waiting: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++
    return Promise.resolve()
  }
  return new Promise((resolve) => waiting.push(resolve))
}

function releaseSlot(): void {
  const next = waiting.shift()
  if (next) next()
  else inFlight--
}

/** One selectable span of the chart, and the candles it is drawn from. */
export type PredictionChartWindow = {
  id: PredictionWindowId
  /** Translation key for the pill. */
  labelKey: string
  /** A timeframe BOTH venues serve — Kalshi has only 1m, 1h and 1d. */
  timeframe: '1m' | '1h' | '1d'
  limit: number
  intervalMs: number
}

export type PredictionWindowId = '1H' | '6H' | '1D' | '1W' | '1M'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const PREDICTION_WINDOWS: ReadonlyArray<PredictionChartWindow> = [
  {
    id: '1H',
    labelKey: 'predictionChart.window.hour',
    timeframe: '1m',
    limit: 60,
    intervalMs: MINUTE,
  },
  {
    id: '6H',
    labelKey: 'predictionChart.window.sixHours',
    timeframe: '1m',
    limit: 360,
    intervalMs: MINUTE,
  },
  {
    id: '1D',
    labelKey: 'predictionChart.window.day',
    timeframe: '1h',
    limit: 24,
    intervalMs: HOUR,
  },
  {
    id: '1W',
    labelKey: 'predictionChart.window.week',
    timeframe: '1h',
    limit: 168,
    intervalMs: HOUR,
  },
  {
    id: '1M',
    labelKey: 'predictionChart.window.month',
    timeframe: '1d',
    limit: 30,
    intervalMs: DAY,
  },
]

export const DEFAULT_PREDICTION_WINDOW: PredictionWindowId = '1W'

/** The named span, falling back to the default rather than to undefined. */
export function predictionWindow(
  id: PredictionWindowId,
): PredictionChartWindow {
  const found = PREDICTION_WINDOWS.find((w) => w.id === id)
  if (found) return found
  return (
    PREDICTION_WINDOWS.find((w) => w.id === DEFAULT_PREDICTION_WINDOW) ??
    PREDICTION_WINDOWS[0]
  )
}

/** A runner the chart actually draws. */
export type ChartedRunner = {
  pairKey: string
  label: string
  /** Stable per-runner colour, taken from the venue's own ordering. */
  color: string
  /** The route is on this outcome — drawn heavier, listed first. */
  active: boolean
  /** The venue answered with no usable candles for this runner. */
  unavailable: boolean
}

export type PredictionSeriesResult = {
  runners: Array<ChartedRunner>
  rows: AlignedSeries['rows']
  stride: number
  /** Runners in the field that are not on the chart. */
  hidden: number
  state: 'loading' | 'ready' | 'empty'
}

/**
 * Pick the runners to draw: the leaders, plus whatever the route is on.
 *
 * Exported for the test — the "active outcome is always charted" rule is the
 * one a reordering of the field could quietly break, and it is the difference
 * between a chart about the market and a chart about the contract you are
 * about to buy.
 */
export function chartedRunners(
  runners: Array<PredictionRunner>,
  activePairKey: string,
  max: number = MAX_CHARTED_RUNNERS,
): Array<PredictionRunner> {
  const active = normalizePairKey(activePairKey)
  const ranked = byProbability(runners)
  const picked = ranked.slice(0, max)
  if (picked.some((r) => normalizePairKey(r.yes.pairKey) === active)) {
    return picked
  }
  const onRoute = ranked.find((r) => normalizePairKey(r.yes.pairKey) === active)
  if (!onRoute) return picked
  // Drops the weakest leader rather than widening the chart: the cap is what
  // keeps the palette readable, so it has to hold with the swap in it.
  return [...picked.slice(0, Math.max(0, max - 1)), onRoute]
}

export function usePredictionSeries(
  market: string,
  runners: Array<PredictionRunner>,
  activePairKey: string,
  windowId: PredictionWindowId,
  enabled = true,
): PredictionSeriesResult {
  const { probeVenueHistory } = useMarketData()
  const win = predictionWindow(windowId)

  const picked = useMemo(
    () => chartedRunners(runners, activePairKey),
    [runners, activePairKey],
  )

  const results = useQueries({
    queries: picked.map((runner) => ({
      // The window is in the key, not just the timeframe: 1H and 6H share the
      // 1m interval and differ only in depth, and letting them share a cache
      // entry would give whichever mounted second the other's span.
      queryKey: [
        'prediction-series',
        market,
        runner.yes.pairKey,
        win.timeframe,
        win.limit,
      ],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        await acquireSlot()
        try {
          if (signal.aborted) throw new Error('prediction-series: cancelled')
          const request = probeVenueHistory(
            market,
            runner.yes.pairKey,
            win.timeframe,
            win.limit,
          )
          if (!request) return [] as Array<Candle>
          return await request
        } finally {
          releaseSlot()
        }
      },
      enabled: enabled && Boolean(market) && Boolean(runner.yes.pairKey),
      staleTime: 60_000,
      gcTime: 15 * 60_000,
      // One venue declining is an answer. Retrying multiplies it by the size
      // of the field.
      retry: false,
      refetchOnWindowFocus: false,
    })),
  })

  /**
   * What the memo below actually depends on, flattened to a string.
   *
   * `useQueries` returns a fresh array (and fresh result objects) every
   * render, so keying the memo on `results` would rebuild the whole grid on
   * every unrelated re-render of the pane — and rebuilding it hands recharts
   * new data identity, which restarts its line animation. The stamp moves only
   * when a query actually resolves or flips to pending.
   */
  const signature = results
    .map((r) => `${r.dataUpdatedAt}:${r.isPending ? 'p' : 'r'}`)
    .join('|')

  const activeKey = normalizePairKey(activePairKey)

  return useMemo(() => {
    const inputs: Array<SeriesInput> = []
    const charted: Array<ChartedRunner> = []
    let pending = false

    // Distinct per drawn line, venue colour preferred. See `assignRunnerColors`.
    const colors =
      binaryColors(picked) ??
      assignRunnerColors(
        picked.map((runner) =>
          runners.findIndex((r) => r.yes.pairKey === runner.yes.pairKey),
        ),
      )

    picked.forEach((runner, index) => {
      const result = results[index]
      const candles = (result?.data ?? []) as Array<Candle>
      const points = candles
        .map((candle) => ({ ts: candle.ts, close: candle.close }))
        .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.close))
      if (result?.isPending) pending = true
      if (points.length > 0) {
        inputs.push({ key: runner.yes.pairKey, points })
      }
      charted.push({
        pairKey: runner.yes.pairKey,
        label: runner.label,
        color: colors[index] ?? 'var(--muted-foreground)',
        active: normalizePairKey(runner.yes.pairKey) === activeKey,
        unavailable: !result?.isPending && points.length === 0,
      })
    })

    const aligned = alignSeries(inputs, win.intervalMs)
    const state =
      aligned.rows.length > 0 ? 'ready' : pending ? 'loading' : 'empty'

    return {
      // Active first, then in the order they were picked (by probability).
      runners: charted
        .slice()
        .sort((a, b) => Number(b.active) - Number(a.active)),
      rows: aligned.rows,
      stride: aligned.stride,
      hidden: Math.max(0, runners.length - picked.length),
      state,
    }
    // `results` is read inside but deliberately not a dep — `signature` is its
    // stable stand-in, for the reason spelled out above it.
  }, [picked, runners, activeKey, win.intervalMs, signature])
}

/**
 * Yes green, No red — the terminal's long/short colours, on the one shape
 * where they are the right answer.
 *
 * Taking Yes IS the long side, and every other prediction surface already says
 * so: the board's chips, the ticket's submit button, the header's split bar.
 * A binary drawn in two arbitrary palette hues would be the only place in the
 * product where the two sides of a question are not green and red.
 *
 * Null unless the field is exactly a Yes/No pair. A two-candidate race
 * ('Newsom' against 'Field') has no affirmative side, and painting one green
 * would invent a direction the market does not have.
 */
function binaryColors(runners: Array<PredictionRunner>): Array<string> | null {
  if (runners.length !== 2) return null
  const sides = runners.map((runner) => binarySideOf(runner.yes.label))
  if (!sides.includes('yes') || !sides.includes('no')) return null
  return sides.map((side) => (side === 'yes' ? 'var(--up)' : 'var(--down)'))
}
