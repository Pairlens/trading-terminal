// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { memo, useMemo } from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'
import type { Trade } from '@/hooks/use-trades-stream'
import { useTradesStream } from '@/hooks/use-trades-stream'
import { formatBookPrice } from '@/lib/format-price'
import {
  computeMagnitudeReference,
  magnitudeFillColor,
  magnitudeIntensity,
  magnitudeTextColor,
} from '@/components/terminal/magnitude-intensity'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useOptionalChartConfig } from '@/lib/chart-terminal-context'

function formatSize(size: number): string {
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(2)}M`
  if (size >= 1_000) return `${(size / 1_000).toFixed(2)}K`
  if (size >= 1) return size.toFixed(4)
  return size.toPrecision(4)
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

const TradeRow = memo(
  function TradeRow({
    trade,
    sizeReference,
  }: {
    trade: Trade
    sizeReference: number
  }) {
    const direction = trade.side === 'buy' ? 'up' : 'down'
    const intensity = magnitudeIntensity(trade.size, sizeReference)

    return (
      <div className="relative grid grid-cols-3 gap-1 px-2 py-[1px] font-mono text-[11px] leading-[18px]">
        {/* Unlike the book, the tint spans the whole row: there is no
            cumulative axis here, so nothing competes for the row's width. */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: magnitudeFillColor(direction, intensity) }}
        />
        <span
          className={cn(
            'relative z-10',
            trade.side === 'buy' ? 'text-up' : 'text-down',
          )}
        >
          {formatBookPrice(trade.price)}
        </span>
        <span
          className="relative z-10 text-right"
          style={{ color: magnitudeTextColor(intensity) }}
        >
          {formatSize(trade.size)}
        </span>
        <span className="relative z-10 text-right text-muted-foreground">
          {formatTime(trade.ts)}
        </span>
      </div>
    )
  },
  // Trades are immutable once printed, so identity is the whole comparison.
  (prev, next) =>
    prev.trade.id === next.trade.id &&
    prev.sizeReference === next.sizeReference,
)

export function TradesPane() {
  const activePair = usePanePair()

  if (!activePair) return <PanePairPicker />

  return (
    <TradesPaneInner market={activePair.market} pairKey={activePair.pairKey} />
  )
}

function TradesPaneInner({
  market,
  pairKey,
}: {
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  const { trades, status } = useTradesStream({ market, pairKey })

  const chartConfig = useOptionalChartConfig()
  const { markets } = useAvailableMarkets()
  const marketLabel =
    markets.find((m) => m.value === market)?.label ?? chartConfig?.market ?? ''

  // Same reference rule as the order book: `median x 6` over what's on screen,
  // so "big" means big for this tape rather than big in absolute units.
  const sizeReference = useMemo(
    () => computeMagnitudeReference(trades.map((trade) => trade.size)),
    [trades],
  )

  if (status === 'unsupported') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
        <span className="text-xs text-muted-foreground">
          No trade feed on {marketLabel || 'this venue'}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {t('terminal.status.noTradesFeed')}
        </span>
      </div>
    )
  }

  if (trades.length === 0) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>
          {status === 'connecting'
            ? t('terminal.status.connecting')
            : t('terminal.status.waitingTrades')}
        </span>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-2 py-1">
        <div className="grid flex-1 grid-cols-3 gap-1 font-mono text-[10.5px] font-medium uppercase tracking-[.11em] text-muted-foreground">
          <span>{t('terminal.columns.price')}</span>
          <span className="text-right">{t('terminal.columns.size')}</span>
          <span className="text-right">Time</span>
        </div>
      </div>

      {/* Tape — newest first. No virtualization: the stream hook caps the
          buffer well below the point where row count would matter. */}
      <div className="flex-1 overflow-y-auto">
        {trades.map((trade) => (
          <TradeRow
            key={trade.id}
            trade={trade}
            sizeReference={sizeReference}
          />
        ))}
      </div>

      {/* Streaming footer */}
      <div className="flex items-center gap-1.5 border-t border-border/50 px-2 py-1 font-mono text-[10px] uppercase tracking-[.11em] text-muted-foreground">
        <span className="live-dot size-1.5 rounded-full bg-up" />
        <span>Streaming</span>
        {marketLabel && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="normal-case tracking-normal">{marketLabel}</span>
          </>
        )}
      </div>
    </div>
  )
}
