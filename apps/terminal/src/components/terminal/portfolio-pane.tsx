// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import { Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePaneWallet } from '@/lib/layout/pane-context'
import { usePortfolioValue } from '@/hooks/use-portfolio-value'
import { formatAmount, formatValue } from '@/lib/format-price'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'

export function PortfolioPane() {
  const { t } = useTranslation()
  const wallet = usePaneWallet()
  const { holdings, totalValue, currencySymbol, displayCurrency } =
    usePortfolioValue(wallet?.walletId)

  if (holdings.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Wallet className="size-7 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">
          {t('positions.noBalances', 'No balance data')}
        </p>
      </div>
    )
  }

  // Use value for chart if available, otherwise amount
  const chartData = holdings
    .filter((h) => h.amount > 0)
    .map((h) => ({
      ...h,
      chartValue: h.value ?? h.amount,
    }))
    .sort((a, b) => b.chartValue - a.chartValue)

  return (
    <div className="flex h-full flex-col gap-0 overflow-hidden">
      {/* Hero total value */}
      <div className="flex items-start justify-between border-b border-border/60 px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
            {t('panes.portfolio', 'Portfolio')}
          </span>
          {totalValue > 0 && (
            <span className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatValue(currencySymbol, totalValue)}
            </span>
          )}
        </div>
        <button
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => useSettingsDialogStore.getState().open('currency')}
        >
          {displayCurrency}
        </button>
      </div>

      {/* Allocation bar */}
      {totalValue > 0 && (
        <div className="px-3 pt-2.5">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/60">
            {chartData.map((d) => {
              const pct = d.value != null ? (d.value / totalValue) * 100 : 0
              if (pct <= 0) return null
              return (
                <div
                  key={d.currency}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${pct}%`, backgroundColor: d.color }}
                  title={`${d.currency} ${pct.toFixed(1)}%`}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Donut chart */}
      <div className="flex items-center justify-center py-3">
        <div className="relative">
          <PieChart width={160} height={160}>
            <Pie
              data={chartData}
              dataKey="chartValue"
              nameKey="currency"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              strokeWidth={1}
              stroke="var(--background)"
            >
              {chartData.map((entry) => (
                <Cell key={entry.currency} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null
                const d = payload[0].payload as (typeof chartData)[0]
                return (
                  <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <p className="font-medium">{d.currency}</p>
                    <p className="font-mono">{formatAmount(d.amount)}</p>
                    {d.value != null && (
                      <p className="text-muted-foreground">
                        {formatValue(currencySymbol, d.value)}
                      </p>
                    )}
                  </div>
                )
              }}
            />
          </PieChart>
          {/* Center label */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            {totalValue > 0 ? (
              <>
                <span className="font-mono text-[9px] uppercase tracking-[.16em] text-muted-foreground">
                  {t('positions.total', 'Total')}
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                  {formatValue(currencySymbol, totalValue)}
                </span>
              </>
            ) : (
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {chartData.length} assets
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Holdings legend table */}
      <div className="flex-1 overflow-auto px-3 pb-2 pt-2">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-1.5 pr-3 text-left font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                {t('positions.asset', 'Asset')}
              </th>
              <th className="pb-1.5 pr-3 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                {t('positions.total', 'Total')}
              </th>
              <th className="pb-1.5 pr-3 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                {currencySymbol}
              </th>
              <th className="pb-1.5 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d) => {
              const pct =
                totalValue > 0 && d.value != null
                  ? (d.value / totalValue) * 100
                  : 0
              return (
                <tr
                  key={d.currency}
                  className="border-b border-border/40 last:border-0"
                >
                  <td className="py-1.5 pr-3">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="font-medium text-foreground">
                        {d.currency}
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                    {formatAmount(d.amount)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-foreground">
                    {d.value != null
                      ? formatValue(currencySymbol, d.value)
                      : '—'}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                    {pct > 0 ? `${pct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
