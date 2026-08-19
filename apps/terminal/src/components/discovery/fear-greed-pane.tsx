// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Gauge } from 'lucide-react'
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { usePluginFetch, usePluginQuery } from '@pairlens/plugin-sdk'
import type { FearGreedResponse } from '@pairlens/shared/instrument-types'

import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { formatRelativeTime } from '@/lib/format-time'
import { fetchFearGreedWithFallback } from '@/lib/public-market-data'

function getValueColor(value: number): string {
  if (value <= 25) return '#ef4444' // red-500 — Extreme Fear
  if (value <= 45) return '#f97316' // orange-500 — Fear
  if (value <= 55) return '#eab308' // yellow-500 — Neutral
  if (value <= 75) return '#84cc16' // lime-500 — Greed
  return '#22c55e' // green-500 — Extreme Greed
}

/** Map an API classification ("Extreme Fear", "Neutral", …) to a catalog key slug. */
function classificationKey(classification: string): string {
  const slug = classification
    .split(/\s+/)
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join('')
  return `fearGreed.classification.${slug}`
}

function formatDate(timestamp: string): string {
  const n = Number(timestamp)
  const d = Number.isFinite(n) ? new Date(n * 1000) : new Date(timestamp)
  if (isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
}

type ChartPoint = {
  date: string
  value: number
  classification: string
}

export function FearGreedPane() {
  const { t } = useTranslation()
  const apiFetch = usePluginFetch()

  const { data, isLoading, error } = usePluginQuery<FearGreedResponse>({
    queryKey: ['fear-greed'],
    queryFn: () => fetchFearGreedWithFallback(apiFetch),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  const latest = data?.latest ?? null
  const historical = data?.historical
  const fetchedAt = data?.fetchedAt ?? null

  const chartData = useMemo(() => {
    if (!historical?.length) return []
    return [...historical].reverse().map(
      (p): ChartPoint => ({
        date: formatDate(p.timestamp),
        value: p.value,
        classification: p.valueClassification,
      }),
    )
  }, [historical])

  // Three states, and the header strip each of them used to draw is now the
  // shell's single 20px row, so each state renders only what it is about.
  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        <div className="size-16 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error || !latest) {
    return (
      <PaneEmpty
        icon={Gauge}
        title={error ? t('fearGreed.failed') : t('fearGreed.noData')}
        body={error ? t('fearGreed.tryLater') : t('fearGreed.willAppear')}
      />
    )
  }

  const color = getValueColor(latest.value)

  return (
    <div className="flex h-full flex-col">
      {fetchedAt && (
        <PaneHeaderMetric>
          {t('common.updated', { time: formatRelativeTime(fetchedAt) })}
        </PaneHeaderMetric>
      )}

      <div className="pb-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold" style={{ color }}>
              {latest.value}
            </span>
            <span className="text-sm text-muted-foreground">
              {t(
                classificationKey(latest.valueClassification),
                latest.valueClassification,
              )}
            </span>
          </div>
        </div>
        <div className="relative">
          <div
            className="h-2.5 w-full rounded-full"
            style={{
              background:
                'linear-gradient(to right, #ef4444, #f97316, #eab308, #84cc16, #22c55e)',
            }}
          />
          <div
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `${latest.value}%` }}
          >
            <div
              className="mx-auto h-2.5 w-1 rounded-sm"
              style={{
                backgroundColor: 'var(--color-background)',
                boxShadow: '0 0 0 1px var(--color-foreground)',
              }}
            />
            <div
              className="mx-auto -mt-px size-0"
              style={{
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: `5px solid ${color}`,
              }}
            />
          </div>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>
            <span className="@xs/pane:hidden">{t('fearGreed.fear')}</span>
            <span className="hidden @xs/pane:inline">
              {t('fearGreed.extremeFear')}
            </span>
          </span>
          <span>
            <span className="@xs/pane:hidden">{t('fearGreed.greed')}</span>
            <span className="hidden @xs/pane:inline">
              {t('fearGreed.extremeGreed')}
            </span>
          </span>
        </div>
      </div>

      {chartData.length > 0 && (
        <FearGreedChart chartData={chartData} color={color} />
      )}
    </div>
  )
}

function FearGreedChart({
  chartData,
  color,
}: {
  chartData: Array<ChartPoint>
  color: string
}) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [showYAxis, setShowYAxis] = useState(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setShowYAxis(width >= 300)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="min-h-0 flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="fgGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          {showYAxis && (
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
          )}
          <ReferenceLine
            y={50}
            stroke="var(--color-muted-foreground)"
            strokeDasharray="3 3"
            strokeOpacity={0.4}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const p = payload[0].payload as ChartPoint
              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                  <div className="font-medium">{p.date}</div>
                  <div className="flex items-center gap-2">
                    <span
                      className="font-bold"
                      style={{ color: getValueColor(p.value) }}
                    >
                      {p.value}
                    </span>
                    <span className="text-muted-foreground">
                      {t(classificationKey(p.classification), p.classification)}
                    </span>
                  </div>
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill="url(#fgGradient)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
