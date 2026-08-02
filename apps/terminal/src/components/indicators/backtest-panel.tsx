// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import type {
  BacktestExitReason,
  BacktestResult,
} from '@/lib/indicators/backtest'

type BacktestPanelProps = {
  result: BacktestResult
}

/**
 * Exit reasons are shown per trade because "why did it close?" is the first
 * question a stop-loss raises, and the answer is the only way to tell a
 * strategy that was wrong from one that was merely stopped out early.
 */
const EXIT_REASON_KEYS: Record<BacktestExitReason, string> = {
  signal: 'indicatorsPage.backtestExitSignal',
  'stop-loss': 'indicatorsPage.backtestExitStopLoss',
  'take-profit': 'indicatorsPage.backtestExitTakeProfit',
  'trailing-stop': 'indicatorsPage.backtestExitTrailingStop',
  'max-bars': 'indicatorsPage.backtestExitMaxBars',
  open: 'indicatorsPage.backtestExitOpen',
}

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`

const money = (value: number): string =>
  `${value < 0 ? '-' : ''}${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`

/** Green above zero, red below, muted at exactly zero. */
const signClass = (value: number): string =>
  value > 0
    ? 'text-[--color-up]'
    : value < 0
      ? 'text-[--color-down]'
      : 'text-foreground'

/**
 * Summary of a `strategy(...)` script's replayed signals — the honest numbers
 * (net of fees and slippage, filled at the next bar's open) plus buy-and-hold
 * over the same window, so a strategy has something to beat.
 */
export function BacktestPanel({ result }: BacktestPanelProps) {
  const { t } = useTranslation()
  const { stats } = result

  if (stats.totalTrades === 0) {
    return (
      <div className="border-t border-border px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          {t('indicatorsPage.backtestEmpty')}
        </p>
      </div>
    )
  }

  const cells: Array<{ label: string; value: string; className?: string }> = [
    {
      label: t('indicatorsPage.backtestNetProfit'),
      value: `${money(stats.netProfit)} (${percent(stats.netProfitPercent)})`,
      className: signClass(stats.netProfit),
    },
    {
      label: t('indicatorsPage.backtestBuyHold'),
      value: percent(stats.buyHoldPercent),
      className: signClass(stats.buyHoldPercent),
    },
    {
      label: t('indicatorsPage.backtestTrades'),
      value: `${stats.totalTrades} (${stats.winningTrades}W / ${stats.losingTrades}L)`,
    },
    {
      label: t('indicatorsPage.backtestWinRate'),
      value: percent(stats.winRate),
    },
    {
      label: t('indicatorsPage.backtestProfitFactor'),
      value: Number.isFinite(stats.profitFactor)
        ? stats.profitFactor.toFixed(2)
        : '∞',
    },
    {
      label: t('indicatorsPage.backtestMaxDrawdown'),
      value: percent(stats.maxDrawdownPercent),
      className: stats.maxDrawdownPercent > 0 ? 'text-[--color-down]' : '',
    },
    {
      label: t('indicatorsPage.backtestSharpe'),
      value: stats.sharpeRatio.toFixed(2),
    },
    {
      label: t('indicatorsPage.backtestTimeInMarket'),
      value: percent(stats.timeInMarket),
    },
    {
      label: t('indicatorsPage.backtestFees'),
      value: money(stats.totalFees),
    },
    {
      label: t('indicatorsPage.backtestAvgBars'),
      value: stats.averageBarsHeld.toFixed(1),
    },
  ]

  return (
    <div className="space-y-1.5 border-t border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t('indicatorsPage.backtest')}
        </span>
        <EquitySparkline equity={result.equity} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4 gap-y-0.5">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="flex items-baseline justify-between gap-2 text-[11px]"
          >
            <span className="truncate text-muted-foreground">{cell.label}</span>
            <span
              className={cn('shrink-0 font-mono tabular-nums', cell.className)}
            >
              {cell.value}
            </span>
          </div>
        ))}
      </div>
      <div className="space-y-0.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t('indicatorsPage.backtestTradeLog')}
        </span>
        {/* Capped and scrolled: the panel is a strip above the console, and a
            hundred-trade run must not push everything below it off screen. */}
        <div className="max-h-24 overflow-y-auto">
          {result.trades.map((trade) => (
            <div
              key={`${trade.direction}-${trade.entryIndex}`}
              className="flex items-baseline justify-between gap-2 text-[11px]"
            >
              <span
                className={cn(
                  'shrink-0 font-mono tabular-nums',
                  trade.direction === 'long'
                    ? 'text-[--color-up]'
                    : 'text-[--color-down]',
                )}
              >
                {t(
                  trade.direction === 'long'
                    ? 'indicatorsPage.backtestLong'
                    : 'indicatorsPage.backtestShort',
                )}
              </span>
              <span className="truncate text-muted-foreground">
                {t(EXIT_REASON_KEYS[trade.exitReason])}
              </span>
              <span
                className={cn(
                  'shrink-0 font-mono tabular-nums',
                  signClass(trade.pnl),
                )}
              >
                {percent(trade.pnlPercent)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The equity curve at a glance. Drawn as a plain SVG polyline — a few hundred
 * points, redrawn only when a run finishes, so a canvas would be overkill.
 */
function EquitySparkline({ equity }: { equity: Float64Array }) {
  if (equity.length < 2) return null
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of equity) {
    if (!Number.isFinite(value)) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  const span = Math.max(1e-9, max - min)
  const step = 100 / (equity.length - 1)
  const points = Array.from(equity, (value, index) => {
    const y = 20 - (((Number.isFinite(value) ? value : min) - min) / span) * 20
    return `${(index * step).toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
  const up = equity[equity.length - 1] >= equity[0]

  return (
    <svg
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      className="h-4 flex-1"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className={up ? 'stroke-[--color-up]' : 'stroke-[--color-down]'}
      />
    </svg>
  )
}
