// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Grid3X3 } from 'lucide-react'
import { ResponsiveContainer, Treemap } from 'recharts'

import {
  usePluginFetch,
  usePluginHost,
  usePluginQuery,
} from '@pairlens/plugin-sdk'
import type {
  HeatmapItem,
  HeatmapResponse,
} from '@pairlens/shared/instrument-types'

import { formatPrice } from '@/lib/format-price'
import { formatRelativeTime } from '@/lib/format-time'
import { fetchHeatmapWithFallback } from '@/lib/public-market-data'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { chartLinkProps } from '@/lib/market-ref/link'

const capFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/** Maps percentChange24h → HSL color. Clamped to [-10%, +10%]. */
function getChangeColor(pct: number): string {
  const clamped = Math.max(-10, Math.min(10, pct))
  const t = (clamped + 10) / 20 // 0 = deep red, 1 = deep green
  if (t < 0.5) {
    const intensity = (0.5 - t) / 0.5
    return `hsl(0, ${60 + intensity * 10}%, ${40 - intensity * 15}%)`
  }
  const intensity = (t - 0.5) / 0.5
  return `hsl(142, ${60 + intensity * 10}%, ${40 - intensity * 15}%)`
}

type TreemapEntry = {
  symbol: string
  name: string
  size: number
  color: string
  item: HeatmapItem
}

function CustomTile(props: {
  x?: number
  y?: number
  width?: number
  height?: number
  symbol?: string
  color?: string
  item?: HeatmapItem
  onTileClick?: (symbol: string) => void
  onTileHover?: (item: HeatmapItem | null) => void
}) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    symbol,
    color,
    item,
    onTileClick,
    onTileHover,
  } = props
  if (!symbol || !item || width === 0 || height === 0) return null

  const gap = 1
  const innerW = Math.max(0, width - gap * 2)
  const innerH = Math.max(0, height - gap * 2)

  // Scale text relative to tile size
  const minDim = Math.min(innerW, innerH)
  const symbolSize = Math.max(8, Math.min(18, minDim * 0.22))
  const pctSize = Math.max(7, Math.min(14, minDim * 0.16))
  const logoSize = Math.max(12, Math.min(28, minDim * 0.28))

  const showLogo = innerW > 50 && innerH > 50 && item.logoUrl
  const showSymbol = innerW > 32 && innerH > 22
  const showPercent = innerW > 40 && innerH > 38

  // Vertical layout: logo + symbol + percent, centered
  const totalElements =
    (showLogo ? 1 : 0) + (showSymbol ? 1 : 0) + (showPercent ? 1 : 0)
  const spacing = Math.min(4, minDim * 0.05)
  const logoBlock = showLogo ? logoSize + spacing : 0
  const symbolBlock = showSymbol ? symbolSize + spacing : 0
  const pctBlock = showPercent ? pctSize : 0
  const totalHeight = logoBlock + symbolBlock + pctBlock
  const startY = y + gap + innerH / 2 - totalHeight / 2

  let currentY = startY
  const logoY = currentY
  if (showLogo) currentY += logoSize + spacing
  const symbolY = currentY + symbolSize * 0.35
  if (showSymbol) currentY += symbolSize + spacing
  const pctY = currentY + pctSize * 0.35

  const clipId = `logo-clip-${symbol}`

  return (
    <g
      onClick={() => onTileClick?.(symbol)}
      onMouseEnter={() => onTileHover?.(item)}
      onMouseLeave={() => onTileHover?.(null)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={x + gap}
        y={y + gap}
        width={innerW}
        height={innerH}
        fill={color}
        rx={2}
      />
      {showLogo && (
        <>
          <defs>
            <clipPath id={clipId}>
              <circle
                cx={x + width / 2}
                cy={logoY + logoSize / 2}
                r={logoSize / 2}
              />
            </clipPath>
          </defs>
          <image
            href={item.logoUrl!}
            x={x + width / 2 - logoSize / 2}
            y={logoY}
            width={logoSize}
            height={logoSize}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      )}
      {showSymbol && totalElements > 0 && (
        <text
          x={x + width / 2}
          y={symbolY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={symbolSize}
          fontWeight="bold"
        >
          {symbol}
        </text>
      )}
      {showPercent && (
        <text
          x={x + width / 2}
          y={pctY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(255,255,255,0.8)"
          fontSize={pctSize}
        >
          {formatPercent(item.percentChange24h)}
        </text>
      )}
    </g>
  )
}

function HeatmapTooltip({
  item,
  containerRef,
}: {
  item: HeatmapItem
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handler = (e: MouseEvent) => {
      const el = ref.current
      if (!el) return
      const rect = container.getBoundingClientRect()
      const tooltipW = el.offsetWidth
      const tooltipH = el.offsetHeight
      let tx = e.clientX - rect.left + 14
      let ty = e.clientY - rect.top - 14
      // Keep tooltip inside container
      if (tx + tooltipW > rect.width) tx = e.clientX - rect.left - tooltipW - 8
      if (ty + tooltipH > rect.height) ty = rect.height - tooltipH - 4
      if (ty < 0) ty = 4
      el.style.transform = `translate(${tx}px, ${ty}px)`
    }
    container.addEventListener('mousemove', handler)
    return () => container.removeEventListener('mousemove', handler)
  }, [containerRef])

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-0 top-0 z-50 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md"
    >
      <div className="mb-1.5 flex items-center gap-2">
        {item.logoUrl && (
          <img
            src={item.logoUrl}
            alt={item.symbol}
            className="size-5 rounded-full"
          />
        )}
        <span className="text-sm font-bold">{item.symbol}</span>
        <span className="text-xs text-muted-foreground">{item.name}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <span className="text-muted-foreground">{t('topCoins.colPrice')}</span>
        <span className="text-right">{formatPrice(item.price)}</span>
        <span className="text-muted-foreground">{t('topCoins.col24h')}</span>
        <span
          className={`text-right ${item.percentChange24h >= 0 ? 'text-green-500' : 'text-red-500'}`}
        >
          {formatPercent(item.percentChange24h)}
        </span>
        <span className="text-muted-foreground">{t('topCoins.colMktCap')}</span>
        <span className="text-right">
          {capFormatter.format(item.marketCap)}
        </span>
        <span className="text-muted-foreground">{t('heatmap.volume')}</span>
        <span className="text-right">
          {capFormatter.format(item.volume24h)}
        </span>
      </div>
    </div>
  )
}

/** Resolve relative URLs (e.g. `/api/symbol-logo/btc`) against the App Server base */
function resolveLogoUrl(
  url: string | null,
  appServerUrl: string,
): string | null {
  if (!url) return null
  if (url.startsWith('/')) return `${appServerUrl}${url}`
  return url
}

export function HeatmapPane() {
  const { t } = useTranslation()
  const host = usePluginHost()
  const appServerUrl = String(host.config['appServerUrl'] ?? '')
  const apiFetch = usePluginFetch()

  const { data, isLoading, error } = usePluginQuery<HeatmapResponse>({
    queryKey: ['heatmap'],
    queryFn: async () => {
      const result = await fetchHeatmapWithFallback(apiFetch)
      result.items.forEach((item) => {
        item.logoUrl = resolveLogoUrl(item.logoUrl, appServerUrl) ?? null
      })
      return result
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  const items = data?.items ?? []
  const updatedAt = data?.updatedAt ?? null

  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredItem, setHoveredItem] = useState<HeatmapItem | null>(null)

  const treemapData = useMemo(
    () =>
      items.map(
        (item: HeatmapItem): TreemapEntry => ({
          symbol: item.symbol,
          name: item.name,
          size: item.marketCap,
          color: getChangeColor(item.percentChange24h),
          item,
        }),
      ),
    [items],
  )

  // Every tile is a USDT spot pair, so the venue is resolved once for the
  // grid rather than guessed per tile.
  const resolveMarket = usePreferredMarketResolver()
  const cryptoMarket = resolveMarket('crypto-spot')
  const handleTileClick = useCallback(
    (symbol: string) => {
      void navigate(
        chartLinkProps({
          cls: 'spot',
          market: cryptoMarket,
          id: `${symbol}-USDT`,
        }),
      )
    },
    [navigate, cryptoMarket],
  )

  const handleTileHover = useCallback((item: HeatmapItem | null): void => {
    setHoveredItem(item)
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">{t('heatmap.title')}</h2>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-6 grid-rows-4 gap-1 p-2">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (error || items.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">{t('heatmap.title')}</h2>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
          <Grid3X3 className="mb-3 size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {error ? t('heatmap.failed') : t('heatmap.noData')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error ? t('heatmap.tryLater') : t('heatmap.willAppear')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{t('heatmap.title')}</h2>
        {updatedAt && (
          <span className="text-xs text-muted-foreground">
            {t('common.updated', { time: formatRelativeTime(updatedAt) })}
          </span>
        )}
      </header>
      <div ref={containerRef} className="relative min-h-0 flex-1 p-1">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="size"
            type="flat"
            isAnimationActive={false}
            content={
              <CustomTile
                onTileClick={handleTileClick}
                onTileHover={handleTileHover}
              />
            }
          />
        </ResponsiveContainer>
        {hoveredItem && (
          <HeatmapTooltip item={hoveredItem} containerRef={containerRef} />
        )}
      </div>
    </div>
  )
}
