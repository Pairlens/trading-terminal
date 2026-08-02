// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A bot's ledger, drawn.
 *
 * The table below these already says what happened; a shape says whether it is
 * working. Three questions, three panels: is it making money, how much has it
 * put through the venue, and is it still trading at all — the last one being
 * the only way to notice a strategy that quietly stopped firing while its P&L
 * line stayed flat and looked fine.
 *
 * Recharts, via the shadcn wrapper, and deliberately not `@pairlens/fast-financial-charts`:
 * that engine exists to stream candles at 60fps and would be a WebGL context
 * per panel to plot a few dozen points that change once a trade.
 */
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'

import { cn } from '@pairlens/ui'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@pairlens/ui/components/ui/chart'

import { bucketBotDays, buildBotSeries, summarizeBotTrades } from './bot-series'
import { formatQuantity, formatSignedPnl, pnlClass } from './bot-display'

import type { ReactNode } from 'react'
import type { ChartConfig } from '@pairlens/ui/components/ui/chart'
import type { BotTrade } from '@/stores/bot-runs-store'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * An axis tick gets about 50px. `25000.00` does not fit in that and `25K`
 * does, and a tick nobody can read is worse than a coarse one.
 */
const compact = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const compactSigned = (value: number): string =>
  value > 0 ? `+${compact.format(value)}` : compact.format(value)

/**
 * The time format that matches the range on screen.
 *
 * A bot that opened and closed five trades this afternoon needs clock times; a
 * bot that has been running for a month needs dates. Printing both is how an
 * axis ends up as a row of overlapping smudges.
 */
function timeTickFormat(span: number): (ts: number) => string {
  const intraday = span < DAY_MS
  return (ts) =>
    intraday
      ? new Date(ts).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })
      : new Date(ts).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
}

/** Recharts hands the tooltip its raw rows; only the x value is wanted here. */
type TooltipRows = Array<{ payload?: Record<string, unknown> }>

function pointLabel(rows: TooltipRows, key: string, withTime: boolean): string {
  const raw = rows[0]?.payload?.[key]
  if (typeof raw !== 'number') return ''
  const date = new Date(raw)
  return withTime ? date.toLocaleString() : date.toLocaleDateString()
}

/** Series names live in config so the tooltip can label a bare number. */
function seriesConfig(key: string, label: string, color: string): ChartConfig {
  return { [key]: { label, color } }
}

const AXIS_TICK = { fontSize: 10 } as const

type BotChartsProps = {
  trades: Array<BotTrade>
}

/**
 * Memoised on the trades array: the run store rewrites its state object on
 * every price tick but keeps `trades` identical until a fill lands, so this
 * whole subtree can sit out the tick storm.
 */
export const BotCharts = memo(function BotCharts({ trades }: BotChartsProps) {
  const { t } = useTranslation()

  const series = useMemo(() => buildBotSeries(trades), [trades])
  const days = useMemo(() => bucketBotDays(trades), [trades])

  const span = useMemo(() => {
    if (series.length === 0) return 0
    return series[series.length - 1].ts - series[0].ts
  }, [series])
  const tickFormat = useMemo(() => timeTickFormat(span), [span])
  const dayTickFormat = useMemo(() => timeTickFormat(DAY_MS), [])

  const last = series[series.length - 1]
  const totalPnl = last?.pnl ?? 0
  const totalVolume = last?.volume ?? 0
  const totalTrades = last?.trades ?? 0

  // The headline chart takes its colour from where the bot ended up, so the
  // panel answers "up or down" before any number is read.
  const pnlColor = totalPnl < 0 ? 'var(--down)' : 'var(--up)'

  const pnlConfig = useMemo(
    () => seriesConfig('pnl', t('botsPage.chartPnlSeries'), pnlColor),
    [t, pnlColor],
  )
  const volumeConfig = useMemo(
    () =>
      seriesConfig('volume', t('botsPage.chartVolumeSeries'), 'var(--primary)'),
    [t],
  )
  const tradesConfig = useMemo(
    () =>
      seriesConfig('trades', t('botsPage.chartTradesSeries'), 'var(--chart-3)'),
    [t],
  )

  return (
    <div className="grid gap-2">
      <ChartPanel
        title={t('botsPage.chartPnlTitle')}
        value={formatSignedPnl(totalPnl)}
        valueClass={pnlClass(totalPnl)}
        empty={t('botsPage.chartPnlEmpty')}
        hasData={series.length > 0}
        height="h-40"
      >
        <ChartContainer config={pnlConfig} className="aspect-auto size-full">
          <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="bot-pnl-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={pnlColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={pnlColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="2 4" />
            {/* Break-even is the only line on this chart that means something
                on its own — without it a scale that never reaches zero reads
                as profit. */}
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={tickFormat}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tick={AXIS_TICK}
            />
            <YAxis
              width={46}
              tickFormatter={compactSigned}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_label, rows) =>
                    pointLabel(rows as TooltipRows, 'ts', true)
                  }
                  formatter={(value) => (
                    <span className="font-mono tabular-nums">
                      {formatSignedPnl(Number(value))}
                    </span>
                  )}
                />
              }
            />
            <Area
              dataKey="pnl"
              type="monotone"
              stroke={pnlColor}
              strokeWidth={1.5}
              fill="url(#bot-pnl-fill)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </ChartPanel>

      <div className="grid gap-2 @xl/panel:grid-cols-2">
        <ChartPanel
          title={t('botsPage.chartVolumeTitle')}
          value={formatQuantity(totalVolume)}
          empty={t('botsPage.chartVolumeEmpty')}
          hasData={series.length > 0}
          height="h-28"
        >
          <ChartContainer
            config={volumeConfig}
            className="aspect-auto size-full"
          >
            <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="2 4" />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={tickFormat}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                tick={AXIS_TICK}
              />
              <YAxis
                width={40}
                tickFormatter={(value: number) => compact.format(value)}
                tickLine={false}
                axisLine={false}
                tick={AXIS_TICK}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, rows) =>
                      pointLabel(rows as TooltipRows, 'ts', true)
                    }
                    formatter={(value) => (
                      <span className="font-mono tabular-nums">
                        {formatQuantity(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <Area
                dataKey="volume"
                type="monotone"
                stroke="var(--primary)"
                strokeWidth={1.5}
                fill="var(--primary)"
                fillOpacity={0.12}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        </ChartPanel>

        <ChartPanel
          title={t('botsPage.chartTradesTitle')}
          value={String(totalTrades)}
          empty={t('botsPage.chartTradesEmpty')}
          hasData={days.length > 0}
          height="h-28"
        >
          <ChartContainer
            config={tradesConfig}
            className="aspect-auto size-full"
          >
            <BarChart data={days} margin={{ top: 6, right: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="2 4" />
              <XAxis
                dataKey="day"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={dayTickFormat}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={AXIS_TICK}
              />
              <YAxis
                width={40}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={AXIS_TICK}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, rows) =>
                      pointLabel(rows as TooltipRows, 'day', false)
                    }
                    // Formatted rather than left to the default: the default
                    // row drops falsy values, so a quiet day would pop a
                    // tooltip with a label and no count.
                    formatter={(value) => (
                      <span className="font-mono tabular-nums">
                        {String(value)}
                      </span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="trades"
                fill="var(--chart-3)"
                radius={2}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
        </ChartPanel>
      </div>
    </div>
  )
})

type ChartPanelProps = {
  title: string
  value: string
  valueClass?: string
  /** Shown instead of the plot — says what would fill it, not just "no data". */
  empty: string
  hasData: boolean
  /** One height for both states, so an empty panel keeps the layout honest. */
  height: string
  children: ReactNode
}

/**
 * The frame around one plot, plus its current reading.
 *
 * The number in the corner is not decoration: these panels are small enough
 * that the last point is hard to read off the line, and it is the value the
 * user actually came for.
 */
function ChartPanel({
  title,
  value,
  valueClass,
  empty,
  hasData,
  height,
  children,
}: ChartPanelProps) {
  return (
    <div className="min-w-0 rounded-lg border border-border">
      <div className="flex items-baseline justify-between gap-2 px-2.5 pt-2">
        <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {hasData && (
          <span className={cn('font-mono text-xs tabular-nums', valueClass)}>
            {value}
          </span>
        )}
      </div>
      {hasData ? (
        <div className={cn('w-full px-1 pb-1', height)}>{children}</div>
      ) : (
        <div
          className={cn(
            'flex items-center justify-center px-4 pb-2 text-center text-[11px] text-balance text-muted-foreground',
            height,
          )}
        >
          {empty}
        </div>
      )}
    </div>
  )
}

/**
 * The counts the charts cannot show: how many trades are still open, how often
 * the strategy is right, and how bad its worst call was.
 *
 * Worst matters more than best. A win rate hides the one trade that gave back
 * a month, and that trade is the reason to change the guards.
 */
export const BotSummaryStrip = memo(function BotSummaryStrip({
  trades,
}: BotChartsProps) {
  const { t } = useTranslation()
  const summary = useMemo(() => summarizeBotTrades(trades), [trades])

  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-2 rounded-lg border border-border px-3 py-2 @xl/panel:grid-cols-6">
      {/* The open count is a hint under the closed count, not a cell of its
          own: "3 closed, 1 open" is one fact about the ledger. The placeholder
          is named `open` rather than `count` so i18next does not switch into
          plural mode and cost every locale a second key. */}
      <SummaryCell
        label={t('botsPage.summaryClosed')}
        value={String(summary.closed)}
        hint={t('botsPage.summaryOpen', { open: summary.open })}
      />
      <SummaryCell
        label={t('botsPage.summaryWinRate')}
        value={
          summary.closed === 0 ? '—' : `${Math.round(summary.winRate * 100)}%`
        }
        hint={t('botsPage.summaryWinLoss', {
          wins: summary.wins,
          losses: summary.losses,
        })}
      />
      {/* Zero volume is a dash, not `0.000`: the quantity formatter is built
          for sizes and renders nothing-happened as a suspiciously precise
          number. */}
      <SummaryCell
        label={t('botsPage.summaryVolume')}
        value={summary.volume === 0 ? '—' : formatQuantity(summary.volume)}
      />
      <SummaryCell
        label={t('botsPage.summaryAverage')}
        value={summary.closed === 0 ? '—' : formatSignedPnl(summary.averagePnl)}
        valueClass={pnlClass(summary.averagePnl)}
      />
      <SummaryCell
        label={t('botsPage.summaryBest')}
        value={summary.closed === 0 ? '—' : formatSignedPnl(summary.bestPnl)}
        valueClass={pnlClass(summary.bestPnl)}
      />
      <SummaryCell
        label={t('botsPage.summaryWorst')}
        value={summary.closed === 0 ? '—' : formatSignedPnl(summary.worstPnl)}
        valueClass={pnlClass(summary.worstPnl)}
      />
    </div>
  )
})

function SummaryCell({
  label,
  value,
  valueClass,
  hint,
}: {
  label: string
  value: string
  valueClass?: string
  hint?: string
}) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn('truncate font-mono text-xs tabular-nums', valueClass)}
      >
        {value}
      </span>
      {hint && (
        <span className="truncate text-[10px] text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  )
}
