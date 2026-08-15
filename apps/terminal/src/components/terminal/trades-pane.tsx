// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { memo, useCallback, useMemo, useRef } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'
import type { Trade } from '@/hooks/use-trades-stream'
import type {
  TradeSort,
  TradeSortColumn,
} from '@/components/terminal/trade-tape-sort'
import { useTradesStream } from '@/hooks/use-trades-stream'
import { formatBookPrice, formatPredictionBookPrice } from '@/lib/format-price'
import {
  computeMagnitudeReference,
  intensityFromStep,
  magnitudeFillColor,
  magnitudeIntensityStep,
  magnitudeTextColor,
} from '@/components/terminal/magnitude-intensity'
import {
  DEFAULT_TRADE_SORT,
  nextTradeSort,
  normalizeTradeSort,
  sortTrades,
} from '@/components/terminal/trade-tape-sort'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { useMarketCredentialGate } from '@/hooks/use-market-credential-gate'
import { usePaneVenue } from '@/hooks/use-pane-venue'
import { useIsPredictionPair } from '@/hooks/use-prediction-pair'
import { usePairUnavailable } from '@/stores/pair-availability-store'
import { usePersistedState } from '@/hooks/use-persisted-state'

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

/**
 * The same visibility rule for the value HEADING, which is a flex button.
 *
 * It cannot reuse TAPE_VALUE_CELL: that constant restores the cell with
 * `block`, and handing a second display utility to a button whose own class
 * list already says `flex` makes the merge pick one and drop the other. The
 * loser was `flex`, which left the heading laid out as a block — `justify-end`
 * inert, and the chevron pushed out of the inline flow onto a second line at
 * the track's left edge, where it read as belonging to the Size column.
 *
 * Both constants therefore restate the SAME breakpoint, and a change to one is
 * a change to the other: the heading has to disappear at exactly the width
 * where its column leaves the grid, or the header and the rows disagree about
 * how many cells there are.
 */
const TAPE_VALUE_HEADER = 'hidden @min-[24rem]/pane:flex justify-end'

/**
 * Row height in pixels, and the one number the virtualizer is not allowed to
 * guess wrong: `h-5` on the row is the same 20px as `py-[1px]` around an
 * 18px line box, stated twice so that changing one without the other is a
 * visible jump rather than a silent drift in the scroll geometry.
 */
const TAPE_ROW_HEIGHT = 20

/** Rows kept mounted past each edge of the viewport. ~240px of runway. */
const TAPE_OVERSCAN = 12

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
    intensityStep,
    sideLabels,
    predictionPrices,
  }: {
    trade: Trade
    intensityStep: number
    sideLabels: SideLabels
    predictionPrices: boolean
  }) {
    const direction = trade.side === 'buy' ? 'up' : 'down'
    const intensity = intensityFromStep(intensityStep)

    return (
      <div
        className={cn(
          'relative h-5 items-center px-2 py-[1px] font-mono text-[11px] leading-[18px]',
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
          {predictionPrices
            ? formatPredictionBookPrice(trade.price)
            : formatBookPrice(trade.price)}
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
  // plus the two things that come from outside the print: where the row lands
  // on the tape's quantized size ladder, and the wording of the side column
  // (which moves on a language switch, and would otherwise stay frozen on
  // already-mounted rows).
  //
  // The ladder is why this is a STEP and not the raw reference. The reference
  // is a median, so it holds still more often than you would expect — but on a
  // 39s BTC-USDT sample it still moved on 12 of 44 publishes, and comparing it
  // directly means all 200 rows re-render on each of those to repaint colours
  // that did not change: 2400 row renders where the step needs 282. See
  // magnitudeIntensityStep.
  (prev, next) =>
    prev.trade.id === next.trade.id &&
    prev.intensityStep === next.intensityStep &&
    prev.predictionPrices === next.predictionPrices &&
    prev.sideLabels === next.sideLabels,
)

/**
 * A sortable column heading.
 *
 * The active column shows its direction as a chevron — shape, so it survives
 * the narrow layout where the Side heading's word is `sr-only` and the chevron
 * is the only thing left in a 0.85rem track.
 */
function TapeHeader({
  column,
  label,
  ariaLabel,
  active,
  direction,
  onSort,
  className,
  labelClassName,
}: {
  column: TradeSortColumn
  label: string
  ariaLabel: string
  active: boolean
  direction: TradeSort['direction']
  onSort: (column: TradeSortColumn) => void
  className?: string
  labelClassName?: string
}) {
  const Chevron = direction === 'asc' ? ChevronUp : ChevronDown

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      title={ariaLabel}
      aria-label={ariaLabel}
      className={cn(
        'flex min-w-0 items-center gap-0.5 overflow-hidden rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        active && 'text-foreground',
        className,
      )}
    >
      <span className={cn('truncate', labelClassName)}>{label}</span>
      {active && <Chevron className="size-2.5 shrink-0" aria-hidden="true" />}
    </button>
  )
}

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
  const predictionPrices = useIsPredictionPair(pairKey, market)
  const unavailable = usePairUnavailable(market, pairKey)
  const credentialGate = useMarketCredentialGate(market)

  const [storedSort, setStoredSort] = usePersistedState<TradeSort>(
    'trades.sort',
    DEFAULT_TRADE_SORT,
  )
  const sort = useMemo(() => normalizeTradeSort(storedSort), [storedSort])

  const onSort = useCallback(
    (column: TradeSortColumn) =>
      setStoredSort((prev) => nextTradeSort(normalizeTradeSort(prev), column)),
    [setStoredSort],
  )

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
  // Order-independent, so it reads the buffer rather than the sorted view.
  const sizeReference = useMemo(
    () => computeMagnitudeReference(trades.map((trade) => trade.size)),
    [trades],
  )

  const rows = useMemo(() => sortTrades(trades, sort), [trades, sort])

  // Every print is retained for 200 rows but a pane shows 20-40 of them, and
  // the buffer is replaced wholesale on every publish — up to ten a second.
  // Without this, each publish allocates 200 elements for React to walk past
  // ~160 memo bailouts; with it, the work per publish is the viewport.
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TAPE_ROW_HEIGHT,
    overscan: TAPE_OVERSCAN,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const paddingTop = virtualItems[0]?.start ?? 0
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() -
        (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

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

  // "Sort by Price" until it is the active column, then "Sorted by Price,
  // descending" — the direction has to reach a screen reader some way other
  // than the chevron, and this markup is a grid of divs rather than a table,
  // so there is no `aria-sort` for it to ride on.
  const sortLabel = (column: TradeSortColumn, label: string) =>
    sort.column !== column
      ? t('terminal.sort.by', { column: label })
      : sort.direction === 'asc'
        ? t('terminal.sort.ascending', { column: label })
        : t('terminal.sort.descending', { column: label })

  const headerProps = (column: TradeSortColumn, label: string) => ({
    column,
    label,
    ariaLabel: sortLabel(column, label),
    active: sort.column === column,
    direction: sort.direction,
    onSort,
  })

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
          <TapeHeader
            {...headerProps('side', t('positions.side'))}
            labelClassName="sr-only @min-[17rem]/pane:not-sr-only"
          />
          <TapeHeader {...headerProps('price', t('terminal.columns.price'))} />
          <TapeHeader
            {...headerProps('size', t('terminal.columns.size'))}
            className="justify-end"
          />
          <TapeHeader
            {...headerProps('value', t('terminal.columns.value'))}
            className={TAPE_VALUE_HEADER}
          />
          <TapeHeader
            {...headerProps('time', t('positions.time'))}
            className="justify-end"
          />
        </div>
      </div>

      {/* Tape — newest first by default. Virtualized: the stream hook caps the
          buffer at 200 prints, of which a pane shows a fraction, and the whole
          buffer is republished ten times a second. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div style={{ paddingTop, paddingBottom }}>
          {virtualItems.map((virtualRow) => {
            const trade = rows[virtualRow.index]!
            return (
              <TradeRow
                key={trade.id}
                trade={trade}
                intensityStep={magnitudeIntensityStep(
                  trade.size,
                  sizeReference,
                )}
                predictionPrices={predictionPrices}
                sideLabels={sideLabels}
              />
            )
          })}
        </div>
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
