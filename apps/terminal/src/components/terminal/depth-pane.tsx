// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useCallback, useMemo, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useTheme } from 'next-themes'

import {
  DARK_DEPTH_THEME,
  LIGHT_DEPTH_THEME,
} from '@pairlens/fast-financial-charts/depth-chart'
import { DepthChart } from '@pairlens/fast-financial-charts/react'
import { usePanePair } from '@pairlens/plugin-sdk'
import type { DepthChartHoverInfo } from '@pairlens/fast-financial-charts/depth-chart'
import type { OrderbookStreamValue } from '@/lib/chart-terminal-context'
import {
  useOptionalChartConfig,
  useOptionalOrderbookData,
} from '@/lib/chart-terminal-context'
import { formatBookPrice, formatPredictionBookPrice } from '@/lib/format-price'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneTransition } from '@/components/layout/pane-transition'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { useMarketCredentialGate } from '@/hooks/use-market-credential-gate'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useIsPredictionPair } from '@/hooks/use-prediction-pair'
import { useSwitchTransition } from '@/hooks/use-switch-transition'
import { usePairUnavailable } from '@/stores/pair-availability-store'

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

  return (
    <DepthPaneInner
      orderbookData={orderbookData}
      pairKey={activePair.pairKey}
    />
  )
}

function DepthPaneInner({
  orderbookData,
  pairKey,
}: {
  orderbookData: OrderbookStreamValue
  pairKey: string
}) {
  const { t } = useTranslation()
  const { orderbook, orderbookStatus, orderbookError } = orderbookData

  // Switch transition: retain the previous book and dim it until the new
  // stream's first snapshot arrives (`book` is what we actually render).
  const chartConfig = useOptionalChartConfig()
  const market = chartConfig?.market ?? ''
  const { markets } = useAvailableMarkets()
  const marketLabel = markets.find((m) => m.value === market)?.label ?? market
  const predictionPrices = useIsPredictionPair(pairKey, market)
  const unavailable = usePairUnavailable(market, pairKey)
  const credentialGate = useMarketCredentialGate(market)
  const {
    phase,
    display: book,
    marketChanged,
  } = useSwitchTransition(market, pairKey, orderbook)

  // The canvas engine takes a resolved theme object, so the pane has to pick
  // it — passing the dark one unconditionally left light mode with dark-tuned
  // axis text (a washed-out grey on paper) and the brighter dark strokes.
  const { resolvedTheme } = useTheme()
  const depthTheme =
    resolvedTheme === 'light' ? LIGHT_DEPTH_THEME : DARK_DEPTH_THEME

  const hoverPanelRef = useRef<HTMLDivElement>(null)
  const hoverBadgeRef = useRef<HTMLSpanElement>(null)
  const hoverPriceRef = useRef<HTMLSpanElement>(null)
  const hoverCumRef = useRef<HTMLSpanElement>(null)

  const handleHover = useCallback(
    (info: DepthChartHoverInfo | null) => {
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

      // The panel is DOM, not canvas, so it can use the P&L tokens directly and
      // follow whatever theme plugin is active — unlike the chart body, whose
      // themes still bake in fixed hexes upstream.
      const isBid = info.side === 'bid'
      const token = isBid ? '--up' : '--down'
      badge.textContent = isBid ? 'Bid' : 'Ask'
      badge.style.background = `color-mix(in oklch, var(${token}) 15%, transparent)`
      badge.style.color = `var(${token})`
      price.textContent = predictionPrices
        ? formatPredictionBookPrice(info.price)
        : formatBookPrice(info.price)
      cum.textContent = formatSize(info.cumulative)
      cum.style.color = `var(${token})`
    },
    [predictionPrices],
  )

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

  // Before the pair-availability check, which cannot be trusted here: nothing
  // was ever subscribed, so "the venue doesn't list this pair" would be a
  // verdict on a request that was never made.
  if (credentialGate.state !== 'ok') {
    return (
      <PaneCredentialsRequired
        compact
        state={credentialGate.state}
        market={market}
        venueLabel={credentialGate.venueLabel}
      />
    )
  }

  if (unavailable) {
    return <PaneDataUnavailable compact pairKey={pairKey} market={market} />
  }

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
            ? t('terminal.status.connecting')
            : t('terminal.status.loadingDepth')}
        </span>
      </div>
    )
  }

  return (
    <PaneTransition
      className="relative h-full w-full"
      phase={phase}
      marketLabel={marketChanged ? marketLabel : undefined}
    >
      <div
        className="relative h-full w-full"
        style={{ contain: 'layout style paint' }}
      >
        <DepthChart
          data={trimmedOrderbook ?? book}
          resolvedTheme={depthTheme}
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
