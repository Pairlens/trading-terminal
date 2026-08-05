// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'

import { ResearchMarkdown } from '../research-markdown'
import { parseLevels, stripKeyLines } from '../parse-research-details'
import type { ResearchSection } from '../parse-research-sections'
import { useMarketData } from '@/lib/market-data-provider'

type SourceInfo = { url: string; title: string }

type Candle = { ts: number; close: number }

// ---------------------------------------------------------------------------
// Price Action & Structure — the one section that shows the price itself.
// A lightweight SVG sparkline of the last ~120 daily closes (no WebGL — this
// is a report pane, not a trading chart), with the support/resistance levels
// the model called out overlaid as dashed lines so the reader can see whether
// the analysis matches the tape.
// ---------------------------------------------------------------------------

const W = 600
const H = 132
const PAD_Y = 10

function fmtPrice(n: number): string {
  const digits = n >= 1000 ? 0 : n >= 1 ? 2 : 6
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function Sparkline({
  candles,
  support,
  resistance,
}: {
  candles: Array<Candle>
  support: Array<number>
  resistance: Array<number>
}) {
  const { t } = useTranslation()
  const closes = candles.map((c) => c.close)
  const first = closes[0]
  const last = closes[closes.length - 1]
  const changePct = first ? ((last - first) / first) * 100 : 0
  const up = last >= first

  // Scale over closes AND any in-range levels so overlays never clip
  const allLevels = [...support, ...resistance]
  const lo = Math.min(...closes)
  const hi = Math.max(...closes)
  const range = hi - lo || 1
  const visibleLevels = allLevels.filter(
    (p) => p >= lo - range * 0.15 && p <= hi + range * 0.15,
  )
  const min = Math.min(lo, ...visibleLevels)
  const max = Math.max(hi, ...visibleLevels)
  const span = max - min || 1

  const x = (i: number) => (i / (closes.length - 1)) * W
  const y = (price: number) =>
    H - PAD_Y - ((price - min) / span) * (H - PAD_Y * 2)

  const linePath = closes
    .map(
      (c, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(c).toFixed(1)}`,
    )
    .join('')
  const areaPath = `${linePath}L${W},${H}L0,${H}Z`

  const stroke = up ? 'var(--up)' : 'var(--down)'

  return (
    <figure className="border-border/60 bg-muted/20 mb-3 rounded-lg border p-2.5">
      <figcaption className="mb-1.5 flex items-baseline justify-between px-0.5 font-mono text-[11px] tabular-nums">
        <span className="text-muted-foreground">
          {candles.length}d · H {fmtPrice(hi)} · L {fmtPrice(lo)}
        </span>
        <span className={up ? 'text-up' : 'text-down'}>
          {fmtPrice(last)} ({changePct >= 0 ? '+' : ''}
          {changePct.toFixed(1)}%)
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={t('research.sparklineAriaLabel')}
      >
        <path d={areaPath} fill={stroke} fillOpacity={0.07} />
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {resistance
          .filter((p) => p >= min && p <= max)
          .map((p) => (
            <line
              key={`r-${p}`}
              x1={0}
              x2={W}
              y1={y(p)}
              y2={y(p)}
              stroke="var(--down)"
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray="5 4"
            />
          ))}
        {support
          .filter((p) => p >= min && p <= max)
          .map((p) => (
            <line
              key={`s-${p}`}
              x1={0}
              x2={W}
              y1={y(p)}
              y2={y(p)}
              stroke="var(--up)"
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray="5 4"
            />
          ))}
        <circle cx={W} cy={y(last)} r={3} fill={stroke} />
      </svg>
      {(support.length > 0 || resistance.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 px-0.5 font-mono text-[10px] tabular-nums">
          {resistance.map((p) => (
            <span key={`rl-${p}`} className="text-down/90">
              R {fmtPrice(p)}
            </span>
          ))}
          {support.map((p) => (
            <span key={`sl-${p}`} className="text-up/90">
              S {fmtPrice(p)}
            </span>
          ))}
        </div>
      )}
    </figure>
  )
}

export function PriceActionSection({
  section,
  sources,
  market,
  pair,
}: {
  section: ResearchSection
  sources: Array<SourceInfo>
  market?: string
  pair?: string
}) {
  const { fetchHistory } = useMarketData()

  const candlesQuery = useQuery({
    queryKey: ['research-sparkline', market, pair],
    queryFn: async () => {
      const candles = (await fetchHistory(
        market!,
        pair!,
        '1d',
        120,
      )) as Array<Candle>
      return [...candles].sort((a, b) => a.ts - b.ts)
    },
    enabled: Boolean(market && pair),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const candles = candlesQuery.data ?? []
  const levels = parseLevels(section.body)
  const showChart = candles.length >= 2
  // Levels move into the chart + chips — drop the raw key lines from prose
  const prose =
    showChart && (levels.support.length > 0 || levels.resistance.length > 0)
      ? stripKeyLines(section.body, new Set(['support', 'resistance']))
      : section.body

  return (
    <div>
      <h3
        id={section.slug}
        className="mb-3 flex items-center gap-1.5 scroll-mt-4 border-l-2 border-primary pl-2.5 text-[13px] font-bold uppercase tracking-wider text-primary"
      >
        <BarChart3 className="size-3.5" />
        {section.heading}
      </h3>

      {showChart && (
        <Sparkline
          candles={candles}
          support={levels.support}
          resistance={levels.resistance}
        />
      )}

      <ResearchMarkdown text={prose} sources={sources} />
    </div>
  )
}
