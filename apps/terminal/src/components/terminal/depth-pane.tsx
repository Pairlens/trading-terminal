// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useMemo, useRef } from 'react'
import { Loader2 } from 'lucide-react'

import { DARK_DEPTH_THEME } from '@pairlens/fast-financial-charts/depth-chart'
import { DepthChart } from '@pairlens/fast-financial-charts/react'
import { usePanePair } from '@pairlens/plugin-sdk'
import type { DepthChartHoverInfo } from '@pairlens/fast-financial-charts/depth-chart'
import type { OrderbookStreamValue } from '@/lib/chart-terminal-context'
import {
  useOptionalChartConfig,
  useOptionalOrderbookData,
} from '@/lib/chart-terminal-context'
import { formatBookPrice } from '@/lib/format-price'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneTransition } from '@/components/layout/pane-transition'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useSwitchTransition } from '@/hooks/use-switch-transition'

function formatSize(size: number): string {
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(2)}M`
  if (size >= 1_000) return `${(size / 1_000).toFixed(2)}K`
  if (size >= 1) return size.toFixed(2)
  return size.toPrecision(3)
}

export function DepthPane() {
  const activePair = usePanePair()
  const orderbookData = useOptionalOrderbookData()

  if (!activePair || !orderbookData) {
    return <PanePairPicker />
  }

  return <DepthPaneInner orderbookData={orderbookData} />
}

function DepthPaneInner({
  orderbookData,
}: {
  orderbookData: OrderbookStreamValue
}) {
  const { orderbook, orderbookStatus, orderbookError } = orderbookData

  // Connector-switch transition: retain the previous book and dim it until the
  // new connector's first snapshot arrives (`book` is what we actually render).
  const chartConfig = useOptionalChartConfig()
  const market = chartConfig?.market ?? ''
  const { markets } = useAvailableMarkets()
  const marketLabel = markets.find((m) => m.value === market)?.label ?? market
  const { phase, display: book } = useSwitchTransition(market, orderbook)

  const hoverPanelRef = useRef<HTMLDivElement>(null)
  const hoverBadgeRef = useRef<HTMLSpanElement>(null)
  const hoverPriceRef = useRef<HTMLSpanElement>(null)
  const hoverCumRef = useRef<HTMLSpanElement>(null)

  const handleHover = useCallback((info: DepthChartHoverInfo | null) => {
    const panel = hoverPanelRef.current
    if (!panel) return

    if (!info) {
      panel.style.display = 'none'
      return
    }

    panel.style.display = ''
    panel.style.transform = `translate(${info.x + 12}px,${info.y - 36}px)`

    const badge = hoverBadgeRef.current
    const price = hoverPriceRef.current
    const cum = hoverCumRef.current
    if (!badge || !price || !cum) return

    const isBid = info.side === 'bid'
    badge.textContent = isBid ? 'Bid' : 'Ask'
    badge.style.background = isBid
      ? 'rgba(34,197,94,0.15)'
      : 'rgba(239,68,68,0.15)'
    badge.style.color = isBid ? '#4ade80' : '#f87171'
    price.textContent = formatBookPrice(info.price)
    cum.textContent = formatSize(info.cumulative)
    cum.style.color = isBid ? '#4ade80' : '#f87171'
  }, [])

  // Trim orderbook to a symmetric price range around the mid-price.
  // Without this, exchanges with deep asymmetric books (e.g. 400 bid levels
  // but only 50 ask levels) cause the depth chart to look heavily biased.
  const trimmedOrderbook = useMemo(() => {
    if (!book?.bids.length || !book?.asks.length) return book

    const bestBid = book.bids[0]!.price
    const bestAsk = book.asks[0]!.price
    const mid = (bestBid + bestAsk) / 2

    // Compute price range of each side
    const bidRange = bestBid - book.bids[book.bids.length - 1]!.price
    const askRange = book.asks[book.asks.length - 1]!.price - bestAsk

    // Use the smaller side's range so the chart stays balanced,
    // capped at 2% of mid-price to prevent stale deep levels from
    // stretching the chart. Minimum 0.2% to avoid being too zoomed-in.
    const maxRange = mid * 0.02
    const minRange = mid * 0.002
    const symmetricRange = Math.max(
      Math.min(bidRange, askRange, maxRange),
      minRange,
    )

    return {
      bids: book.bids.filter((l) => l.price >= mid - symmetricRange),
      asks: book.asks.filter((l) => l.price <= mid + symmetricRange),
      ts: book.ts,
    }
  }, [book])

  if (orderbookError) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-destructive">
        {orderbookError}
      </div>
    )
  }

  if (!book) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>
          {orderbookStatus === 'connecting'
            ? 'Connecting...'
            : 'Loading depth...'}
        </span>
      </div>
    )
  }

  return (
    <PaneTransition
      className="relative h-full w-full"
      phase={phase}
      marketLabel={marketLabel}
    >
      <div
        className="relative h-full w-full"
        style={{ contain: 'layout style paint' }}
      >
        <DepthChart
          data={trimmedOrderbook ?? book}
          resolvedTheme={DARK_DEPTH_THEME}
          onHover={handleHover}
          style={{ width: '100%', height: '100%' }}
        />
        <div
          ref={hoverPanelRef}
          className="pointer-events-none absolute left-0 top-0 z-10 rounded border border-border bg-popover/95 px-2.5 py-1.5 shadow-md backdrop-blur-sm"
          style={{ display: 'none', willChange: 'transform' }}
        >
          <div className="flex items-center gap-1.5 text-[11px]">
            <span
              ref={hoverBadgeRef}
              className="rounded px-1 py-px text-[9px] font-semibold uppercase"
            />
            <span ref={hoverPriceRef} className="font-mono" />
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground/70">
            Cumulative:{' '}
            <span ref={hoverCumRef} className="font-mono font-medium" />
          </div>
        </div>
      </div>
    </PaneTransition>
  )
}
