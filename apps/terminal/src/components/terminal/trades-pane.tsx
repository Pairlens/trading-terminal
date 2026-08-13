// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { memo, useMemo } from 'react'
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react'

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
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { usePaneVenue } from '@/hooks/use-pane-venue'
import { usePairUnavailable } from '@/stores/pair-availability-store'

function formatSize(size: number): string {
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(2)}M`
  if (size >= 1_000) return `${(size / 1_000).toFixed(2)}K`
  if (size >= 1) return size.toFixed(4)
  return size.toPrecision(4)
}

/**
 * What the print actually moved, in the quote currency.
 *
 * Sizes are only comparable within one asset — 0.004 and 300 say nothing to
 * each other until they are both a few hundred dollars — so the notional is
 * the column that makes two rows of the same tape comparable. K/M above a
 * thousand keeps it inside its track; a BTC-quoted pair lands under 1, where
 * significant digits say more than a fixed two decimals would.
 */
function formatNotional(value: number): string {
  if (!Number.isFinite(value)) return '—'
  // Each unit is picked from the ROUNDED figure, not the raw one: 999.999
  // renders as "1000.00" at two decimals, which is both a unit behind the row
  // above it and the widest string the track would ever have to hold.
  const round2 = (n: number) => Math.round(n * 100) / 100
  if (round2(value / 1_000_000) >= 1)
    return `${round2(value / 1e6).toFixed(2)}M`
  if (round2(value / 1_000) >= 1) return `${round2(value / 1e3).toFixed(2)}K`
  if (value >= 1) return value.toFixed(2)
  return value.toPrecision(3)
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// Column template shared by the tape's header and its rows — each row is its
// own grid, so anything but fixed/fractional tracks would drift row to row.
// Price and size get the wider fractions: a BTC print is nine characters and
// a small-cap size can run to ten, while the clock is always eight.
//
// The side column carries the arrow alone until the pane is wide enough for
// the word to sit next to it without squeezing the price out of its track.
// 17rem/4.25rem is what the longest translation needs — Polish "Sprzedaż" —
// not what English would get away with.
//
// The value column is the same bargain one step up: at 24rem there is room
// for a fourth fractional track without any of the other three dropping below
// what their widest content needs (a ten-character micro-price, a
// ten-character size, an eight-character clock), so it appears there and is
// display:none — out of the grid entirely, not merely invisible — below it.
const TAPE_GRID =
  'grid grid-cols-[0.85rem_1.15fr_1.15fr_1fr] gap-1 @min-[17rem]/pane:grid-cols-[4.25rem_1.15fr_1.15fr_1fr] @min-[24rem]/pane:grid-cols-[4.25rem_1.15fr_1.15fr_1.15fr_1fr]'

/** The value cell, hidden below the width its track needs. See TAPE_GRID. */
const TAPE_VALUE_CELL = 'hidden @min-[24rem]/pane:block text-right'

/** Buy/sell wording, resolved once per render of the pane rather than per row. */
type SideLabels = { buy: string; sell: string }

/**
 * Side of the print, stated rather than implied.
 *
 * The tint and the red/green price already say "buy" or "sell", but both ride
 * on one channel — hue — and how loudly it speaks is up to the active theme.
 * So the side gets its own column: an arrow (shape, not colour) at every
 * width, and the word itself once there is room. Below that width the word
 * stays in the accessibility tree via `sr-only`, and `title` keeps it one
 * hover away.
 */
function TradeSide({ side, label }: { side: Trade['side']; label: string }) {
  const isBuy = side === 'buy'
  const Arrow = isBuy ? ArrowUp : ArrowDown

  return (
    <span
      title={label}
      className={cn(
        'relative z-10 flex items-center gap-0.5 overflow-hidden',
        isBuy ? 'text-up' : 'text-down',
      )}
    >
      <Arrow className="size-2.5 shrink-0" aria-hidden="true" />
      <span className="sr-only @min-[17rem]/pane:not-sr-only">{label}</span>
    </span>
  )
}

const TradeRow = memo(
  function TradeRow({
    trade,
    sizeReference,
    sideLabels,
  }: {
    trade: Trade
    sizeReference: number
    sideLabels: SideLabels
  }) {
    const direction = trade.side === 'buy' ? 'up' : 'down'
    const intensity = magnitudeIntensity(trade.size, sizeReference)

    return (
      <div
        className={cn(
          'relative px-2 py-[1px] font-mono text-[11px] leading-[18px]',
          TAPE_GRID,
        )}
      >
        {/* Unlike the book, the tint spans the whole row: there is no
            cumulative axis here, so nothing competes for the row's width. */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: magnitudeFillColor(direction, intensity) }}
        />
        <TradeSide
          side={trade.side}
          label={trade.side === 'buy' ? sideLabels.buy : sideLabels.sell}
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
        <span
          className={cn('relative z-10 text-foreground/70', TAPE_VALUE_CELL)}
        >
          {formatNotional(trade.price * trade.size)}
        </span>
        <span className="relative z-10 text-right text-muted-foreground">
          {formatTime(trade.ts)}
        </span>
      </div>
    )
  },
  // Trades are immutable once printed, so identity is the whole comparison —
  // plus the two things that come from outside the print: the tape's size
  // scale and the wording of the side column (which moves on a language
  // switch, and would otherwise stay frozen on already-mounted rows).
  (prev, next) =>
    prev.trade.id === next.trade.id &&
    prev.sizeReference === next.sizeReference &&
    prev.sideLabels === next.sideLabels,
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
  const { t, i18n } = useTranslation()
  const { trades, status } = useTradesStream({ market, pairKey })

  const venue = usePaneVenue(market)
  const unavailable = usePairUnavailable(market, pairKey)

  // Reuses the fills table's vocabulary (nouns, already translated in every
  // locale) so a print reads the same word here as it does under Positions.
  // Held by reference so a tape full of memoized rows re-renders on a
  // language switch and on nothing else.
  const sideLabels = useMemo<SideLabels>(
    () => ({ buy: t('positions.buy'), sell: t('positions.sell') }),
    [t, i18n.language],
  )

  // Same reference rule as the order book: `median x 6` over what's on screen,
  // so "big" means big for this tape rather than big in absolute units.
  const sizeReference = useMemo(
    () => computeMagnitudeReference(trades.map((trade) => trade.size)),
    [trades],
  )

  // Ahead of the unsupported check: "the venue doesn't list this pair" is the
  // real answer, and telling someone to find a venue with a trade feed when the
  // pair itself isn't there sends them down the wrong path.
  if (unavailable) {
    return <PaneDataUnavailable compact pairKey={pairKey} market={market} />
  }

  if (status === 'unsupported') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
        <span className="text-xs text-muted-foreground">
          {venue.label
            ? t('terminal.status.noTradesFeedOn', { venue: venue.label })
            : t('terminal.status.noTradesFeedHere')}
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
        <div
          className={cn(
            'flex-1 font-mono text-[10.5px] font-medium uppercase tracking-[.11em] text-muted-foreground',
            TAPE_GRID,
          )}
        >
          <span className="sr-only @min-[17rem]/pane:not-sr-only">
            {t('positions.side')}
          </span>
          <span>{t('terminal.columns.price')}</span>
          <span className="text-right">{t('terminal.columns.size')}</span>
          <span className={TAPE_VALUE_CELL}>{t('terminal.columns.value')}</span>
          <span className="text-right">{t('positions.time')}</span>
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
            sideLabels={sideLabels}
          />
        ))}
      </div>

      {/* Venue footer — see the order book pane: only shown when this tape
          isn't on the charted venue, and never a stream-health claim. */}
      {venue.isDistinct && (
        <div className="border-t border-border/50 px-2 py-1 text-[10px] text-muted-foreground">
          {venue.label}
        </div>
      )}
    </div>
  )
}
