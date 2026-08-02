// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Fragment, useEffect } from 'react'
import { Ban, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@pairlens/ui/lib/utils'

import { useRiskConfigStore } from '@/stores/risk-config-store'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'
import { usePortfolioValue } from '@/hooks/use-portfolio-value'

// ---------------------------------------------------------------------------
// Risk metrics
// ---------------------------------------------------------------------------

type RiskMetric = {
  labelKey: string
  current: number
  max: number
  format: 'percent' | 'count'
}

function formatValue(m: RiskMetric) {
  if (m.format === 'count') return `${m.current} / ${m.max}`
  return `${m.current.toFixed(1)}% / ${m.max}%`
}

function statusColor(ratio: number) {
  if (ratio >= 1) return { dot: 'bg-red-400', bar: 'bg-red-400' }
  if (ratio >= 0.75) return { dot: 'bg-amber-400', bar: 'bg-amber-400' }
  return { dot: 'bg-emerald-400', bar: 'bg-emerald-400' }
}

function overallStatus(metrics: Array<RiskMetric>) {
  if (metrics.length === 0) {
    return { labelKey: 'risk.allClear', color: 'text-emerald-400' }
  }
  const maxRatio = Math.max(
    ...metrics.map((m) => (m.max > 0 ? m.current / m.max : 0)),
  )
  if (maxRatio >= 1) return { labelKey: 'risk.limitHit', color: 'text-red-400' }
  if (maxRatio >= 0.75)
    return { labelKey: 'risk.caution', color: 'text-amber-400' }
  return { labelKey: 'risk.allClear', color: 'text-emerald-400' }
}

// ---------------------------------------------------------------------------
// Risk pane
// ---------------------------------------------------------------------------

export function RiskPane() {
  const { t } = useTranslation()
  const store = useRiskConfigStore()
  const { holdings, totalValue } = usePortfolioValue()

  // Current exposure = the largest single holding as a % of total portfolio,
  // which is exactly what maxPositionSize caps.
  const largestExposurePct =
    totalValue > 0
      ? (Math.max(0, ...holdings.map((h) => h.value ?? 0)) / totalValue) * 100
      : 0

  // Check for window reset on mount
  useEffect(() => {
    store.checkWindowReset()
  }, []) // mount-only: window-reset check must not re-run on store updates

  const isLocked = store.ordersLocked || store.buyOrdersLocked

  // Build metrics from live config — only include limits that are configured
  const metrics: Array<RiskMetric> = []
  if (store.maxDailyLoss > 0) {
    metrics.push({
      labelKey: 'risk.risk',
      current: Math.abs(store.dailyPnl),
      max: store.maxDailyLoss,
      format: 'percent',
    })
  }
  if (store.maxDailyTrades > 0) {
    metrics.push({
      labelKey: 'risk.trades',
      current: store.dailyTradeCount,
      max: store.maxDailyTrades,
      format: 'count',
    })
  }
  if (store.maxPositionSize > 0) {
    metrics.push({
      labelKey: 'risk.exposure',
      current: largestExposurePct,
      max: store.maxPositionSize,
      format: 'percent',
    })
  }

  const hasLimits = metrics.length > 0
  const riskStatus = isLocked
    ? { labelKey: 'risk.limitHit', color: 'text-red-400' }
    : overallStatus(metrics)

  return (
    <div className="flex h-full items-center px-3 py-1.5">
      {/* Risk section */}
      <div className="mr-3 flex items-center gap-1.5">
        <ShieldCheck className={cn('size-3.5', riskStatus.color)} />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t('risk.title')}
        </span>
      </div>

      {/* Lock indicator */}
      {isLocked && (
        <div className="mr-3 flex items-center gap-1.5">
          <Ban className="size-3 text-red-400" />
          <span className="text-[10px] font-medium text-red-400">
            {store.ordersLocked ? t('risk.ordersLocked') : t('risk.buysLocked')}
          </span>
        </div>
      )}

      {/* Risk metrics or configure prompt */}
      {hasLimits ? (
        <div className="hidden @3xs/pane:flex flex-wrap items-center">
          {metrics.map((metric, i) => {
            const ratio = metric.max > 0 ? metric.current / metric.max : 0
            const pct = Math.min(ratio * 100, 100)
            const colors = statusColor(ratio)

            return (
              <Fragment key={metric.labelKey}>
                {i > 0 && <div className="mx-3 h-3 w-px bg-border/60" />}
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'size-[5px] rounded-full',
                      colors.dot,
                      ratio >= 0.75 &&
                        'shadow-[0_0_6px_1px] shadow-current animate-pulse',
                    )}
                  />
                  <span className="hidden @xs/pane:inline text-[11px] text-muted-foreground">
                    {t(metric.labelKey)}
                  </span>
                  <span className="text-[11px] font-mono font-medium tabular-nums">
                    {formatValue(metric)}
                  </span>
                  <div className="hidden @sm/pane:block h-[3px] w-10 overflow-hidden rounded-full bg-muted/40">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-700 ease-out',
                        colors.bar,
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Fragment>
            )
          })}
        </div>
      ) : (
        <button
          className="hidden @3xs/pane:inline text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => useSettingsDialogStore.getState().open('risk')}
        >
          {t('risk.configurePrompt')}
        </button>
      )}

      {/* Right side: overall risk status */}
      <div className="ml-auto flex items-center gap-1.5">
        <span
          className={cn(
            'size-[5px] rounded-full',
            riskStatus.color.replace('text-', 'bg-'),
          )}
        />
        <span className={cn('text-[10px] font-medium', riskStatus.color)}>
          {t(riskStatus.labelKey)}
        </span>
      </div>
    </div>
  )
}
