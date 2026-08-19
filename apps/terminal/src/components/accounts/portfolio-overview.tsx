// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { Cell, Pie, PieChart, Tooltip as RechartsTooltip } from 'recharts'
import { TrendingUp } from 'lucide-react'

import { EXCHANGE_THEME } from './exchange-theme'
import { venuePosterSrc } from './venue-art'
import type { HoldingValue } from '@/hooks/use-portfolio-value'
import type { ExchangeCredential } from '@/stores/credentials-store'
import { formatAmount, formatValue } from '@/lib/format-price'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'

// ---------------------------------------------------------------------------
// Portfolio overview
// ---------------------------------------------------------------------------

const WALLET_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--muted-foreground)',
]

export function PortfolioOverview({
  holdings,
  totalValue,
  currencySymbol,
  displayCurrency,
  credentials,
}: {
  holdings: Array<HoldingValue>
  totalValue: number
  currencySymbol: string
  displayCurrency: string
  credentials: Array<ExchangeCredential>
}) {
  const { t } = useTranslation()
  const chartData = holdings
    .filter((h) => h.amount > 0)
    .map((h) => ({
      ...h,
      chartValue: h.value ?? h.amount,
    }))
    .sort((a, b) => b.chartValue - a.chartValue)

  // Per-wallet value distribution
  const walletValues = credentials.map((cred, i) => {
    // Per-wallet holdings filtering will use usePortfolioValue(cred.id) when
    // that is available
    void holdings
    // For now, all holdings come from the aggregate: show the total per wallet
    // When per-credential filtering is available, this will use usePortfolioValue(cred.id)
    return {
      id: cred.id,
      label: cred.label,
      market: cred.market,
      color: WALLET_COLORS[i % WALLET_COLORS.length],
    }
  })

  const topHoldings = chartData.slice(0, 8)
  const hasMore = chartData.length > 8

  return (
    <div className="overflow-hidden rounded-[14px] bg-card">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
        {/* Left: Donut chart + total. Stacked on a narrow window, which is the
            one arrangement that earns a rule; side by side they are two
            regions of one card and the gap does the work. */}
        <div className="flex flex-col items-center justify-center border-b border-(--pane-rule) p-6 lg:border-b-0">
          <div className="relative">
            <PieChart width={200} height={200}>
              <Pie
                data={chartData}
                dataKey="chartValue"
                nameKey="currency"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                strokeWidth={1.5}
                stroke="var(--card)"
              >
                {chartData.map((entry) => (
                  <Cell key={entry.currency} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null
                  const d = payload[0].payload
                  const pct =
                    totalValue > 0 && d.value != null
                      ? ((d.value / totalValue) * 100).toFixed(1)
                      : null
                  return (
                    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                      <p className="font-medium">{d.currency}</p>
                      <p className="font-mono">{formatAmount(d.amount)}</p>
                      {d.value != null && (
                        <p className="text-muted-foreground">
                          {formatValue(currencySymbol, d.value)}
                          {pct && ` · ${pct}%`}
                        </p>
                      )}
                    </div>
                  )
                }}
              />
            </PieChart>
            {/* Center label */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              {totalValue > 0 ? (
                <>
                  <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">
                    {t('accounts.portfolioTotal')}
                  </span>
                  <span className="font-mono text-lg font-semibold tracking-tight tabular-nums text-foreground">
                    {formatValue(currencySymbol, totalValue)}
                  </span>
                  <button
                    className="pointer-events-auto rounded-sm px-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() =>
                      useSettingsDialogStore.getState().open('currency')
                    }
                  >
                    {displayCurrency}
                  </button>
                </>
              ) : (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {t('accounts.assetCount', { count: chartData.length })}
                </span>
              )}
            </div>
          </div>

          {/* Wallet distribution badges */}
          {credentials.length > 1 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {walletValues.map((w) => {
                const theme = EXCHANGE_THEME[w.market]
                const mark = venuePosterSrc(w.market) ?? theme?.logoUrl
                return (
                  <div
                    key={w.id}
                    className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2 py-0.5 text-[10px]"
                  >
                    {mark ? (
                      <img
                        src={mark}
                        alt={w.market}
                        className="size-3 rounded-sm object-contain"
                      />
                    ) : (
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: w.color }}
                      />
                    )}
                    <span className="text-muted-foreground">{w.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Holdings table */}
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
                {t('accounts.assetAllocationLabel')}
              </span>
            </div>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {t('accounts.assetCount', { count: chartData.length })}
            </span>
          </div>

          {/* Stacked allocation bar */}
          {totalValue > 0 && (
            <div className="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-muted/60">
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
          )}

          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pb-2 pr-3 text-left font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                  {t('accounts.tableAsset')}
                </th>
                <th className="pb-2 pr-3 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                  {t('accounts.tableAmount')}
                </th>
                <th className="pb-2 pr-3 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                  {t('accounts.tableValue')}
                </th>
                <th className="pb-2 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em]">
                  {t('accounts.tableShare')}
                </th>
              </tr>
            </thead>
            <tbody>
              {topHoldings.map((d) => {
                const pct =
                  totalValue > 0 && d.value != null
                    ? (d.value / totalValue) * 100
                    : 0
                return (
                  <tr key={d.currency}>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block size-2.5 rounded-full"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="font-medium text-foreground">
                          {d.currency}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatAmount(d.amount)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-foreground">
                      {d.value != null
                        ? formatValue(currencySymbol, d.value)
                        : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {pct > 0 ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden h-1 w-12 overflow-hidden rounded-full bg-muted/60 sm:block">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                backgroundColor: d.color,
                              }}
                            />
                          </div>
                          <span className="font-mono tabular-nums text-muted-foreground">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {hasMore && (
            <p className="mt-2 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
              {t('accounts.moreAssets', { count: chartData.length - 8 })}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
