// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'
import type { OrderBookLevel } from '@/hooks/use-orderbook-stream'
import type { BookMetric } from '@/hooks/use-orderbook-metric'
import type { OrderbookStreamValue } from '@/lib/chart-terminal-context'
import { useOrderbookMetric } from '@/hooks/use-orderbook-metric'
import {
  useOptionalChartConfig,
  useOptionalOrderbookData,
} from '@/lib/chart-terminal-context'
import { formatBookPrice } from '@/lib/format-price'
import {
  computeMagnitudeReference,
  magnitudeFillColor,
  magnitudeIntensity,
  magnitudeTextColor,
} from '@/components/terminal/magnitude-intensity'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneTransition } from '@/components/layout/pane-transition'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { useMarketCredentialGate } from '@/hooks/use-market-credential-gate'
import { usePaneVenue } from '@/hooks/use-pane-venue'
import { useSwitchTransition } from '@/hooks/use-switch-transition'
import { usePairUnavailable } from '@/stores/pair-availability-store'
// Market data now comes through plugin-based connectors

const ROW_HEIGHT = 18

function formatSize(size: number): string {
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(2)}M`
  if (size >= 1_000) return `${(size / 1_000).toFixed(2)}K`
  if (size >= 1) return size.toFixed(4)
  return size.toPrecision(4)
}

// Notional is money, so it reads in money's units: two decimals, and a decade
// suffix once a level is worth more than a thousand of them.
function formatValue(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  if (value >= 1) return value.toFixed(2)
  return value.toPrecision(3)
}

/** Shared with the mobile book so both shells print a notional the same way. */
export function formatAmount(amount: number, metric: BookMetric): string {
  return metric === 'value' ? formatValue(amount) : formatSize(amount)
}

function formatTickSize(tick: number): string {
  if (tick >= 1) return tick.toLocaleString()
  // Show meaningful decimals without trailing zeros
  const s = tick.toPrecision(2)
  return parseFloat(s).toString()
}

// Generate tick size options as a 1-2-5 decade series starting from the
// exchange tick size. Values are always clean decimal powers-of-10 multied
// by 1, 2, or 5 — avoiding float drift from raw tick * multiplier.
export function computeTickOptions(
  tickSize: number,
  bestBid: number,
): Array<number> {
  if (bestBid <= 0 || tickSize <= 0) return []

  // Find the decade that contains tickSize (e.g. 0.01 → exp=-2)
  const exp = Math.floor(Math.log10(tickSize))
  const options: Array<number> = []
  const steps = [1, 2, 5]

  for (let e = exp; options.length < 12; e++) {
    for (const s of steps) {
      // Build a clean decimal value: s * 10^e
      const val = e >= 0 ? s * 10 ** e : parseFloat((s * 10 ** e).toFixed(-e))
      if (val < tickSize * 0.99) continue // skip values below exchange tick
      if (val >= bestBid) return options.length > 0 ? options : [tickSize]
      options.push(val)
      if (options.length >= 12) break
    }
  }

  return options.length > 0 ? options : [tickSize]
}

// Widest slice of the instrument's own price that Auto will let one side of the
// book span. "Enough buckets" alone is only a lower bound, so the tick it picks
// tracks however deep the venue's book happens to reach: a venue that pushes
// its entire ladder (Binance's SHIB/USDT tops out around 260 levels, and those
// run most of the way to zero) satisfies the bucket count at a tick two decades
// too coarse, and the pane ends up quoting a price range nobody trades in.
// Measured across the bundled venues, every liquid pair clears 6% with room to
// spare — BTC lands near 0.2%, SOL and DOGE near 3% — so the cap only ever
// bites the degenerate books.
export const MAX_AUTO_BAND_FRACTION = 0.06

// Find the largest tick that produces >= targetRows grouped buckets without
// spanning more than MAX_AUTO_BAND_FRACTION of the price.
// When raw levels are sparse (e.g. books5 = 5 levels), use smallest tick
// to avoid over-grouping.
export function computeAutoTickIndex(
  options: Array<number>,
  levels?: Array<OrderBookLevel>,
  targetRows?: number,
): number {
  if (!levels?.length || !targetRows || options.length === 0) {
    return 0 // smallest tick = no grouping
  }
  // With very few raw levels, don't group at all
  if (levels.length <= targetRows) return 0

  // targetRows buckets of `tick` is the band this side will actually show.
  // levels[0] is the best price (bids descending, asks ascending).
  const maxTick = (levels[0].price * MAX_AUTO_BAND_FRACTION) / targetRows

  for (let i = options.length - 1; i >= 0; i--) {
    const tick = options[i]
    if (tick > maxTick) continue
    const buckets = new Set<number>()
    for (const { price } of levels) {
      buckets.add(Math.floor(price / tick) * tick)
    }
    if (buckets.size >= targetRows) return i
  }
  return 0
}

/**
 * Group raw orderbook levels into tick-sized buckets.
 * For bids: floor(price / tick) * tick → aggregate size
 * For asks: ceil(price / tick) * tick → aggregate size
 * Sorted: bids descending, asks ascending.
 */
export function groupLevels(
  levels: Array<OrderBookLevel>,
  tick: number,
  side: 'bids' | 'asks',
): Array<OrderBookLevel> {
  if (tick <= 0 || levels.length === 0) return levels

  const buckets = new Map<number, number>()
  for (const { price, size } of levels) {
    const key =
      side === 'bids'
        ? Math.floor(price / tick) * tick
        : Math.ceil(price / tick) * tick
    buckets.set(key, (buckets.get(key) ?? 0) + size)
  }

  const grouped = Array.from(buckets.entries()).map(([price, size]) => ({
    price,
    size,
  }))

  // Bids: descending (best bid first), asks: ascending (best ask first)
  grouped.sort((a, b) =>
    side === 'bids' ? b.price - a.price : a.price - b.price,
  )

  return grouped
}

type RowWithCumulative = OrderBookLevel & {
  /** The magnitude this row displays — base size, or its quote notional. */
  amount: number
  cumulative: number
}

export function addCumulative(
  levels: Array<OrderBookLevel>,
  metric: BookMetric = 'size',
): Array<RowWithCumulative> {
  let cumulative = 0
  return levels.map((level) => {
    // Notional is the bucket's OWN price × size, not a re-sum of the raw
    // levels: everything inside a bucket sits within one tick of the price on
    // screen, so this is the money the displayed row actually represents.
    const amount = metric === 'value' ? level.price * level.size : level.size
    cumulative += amount
    return { ...level, amount, cumulative }
  })
}

const OrderBookRow = memo(
  function OrderBookRow({
    row,
    maxCumulative,
    amountReference,
    metric,
    side,
  }: {
    row: RowWithCumulative
    maxCumulative: number
    amountReference: number
    metric: BookMetric
    side: 'bid' | 'ask'
  }) {
    const depthPct =
      maxCumulative > 0 ? (row.cumulative / maxCumulative) * 100 : 0
    // Bar length = cumulative depth, bar strength = this level's own amount.
    const intensity = magnitudeIntensity(row.amount, amountReference)

    return (
      <div className="relative grid grid-cols-3 gap-1 px-2 py-[1px] font-mono text-[11px] leading-[18px]">
        <div
          className="absolute inset-0"
          style={{
            width: `${depthPct}%`,
            [side === 'bid' ? 'left' : 'right']: 0,
            backgroundColor: magnitudeFillColor(
              side === 'bid' ? 'up' : 'down',
              intensity,
            ),
            // Colour eases on the same curve as width so a level filling in
            // reads as one motion, not a resize plus a separate flash.
            transition: 'width 300ms ease-out, background-color 300ms ease-out',
          }}
        />
        <span
          className={cn(
            'relative z-10',
            side === 'bid' ? 'text-up' : 'text-down',
          )}
        >
          {formatBookPrice(row.price)}
        </span>
        <span
          className="relative z-10 text-right"
          style={{
            color: magnitudeTextColor(intensity),
            transition: 'color 300ms ease-out',
          }}
        >
          {formatAmount(row.amount, metric)}
        </span>
        <span className="relative z-10 text-right text-muted-foreground">
          {formatAmount(row.cumulative, metric)}
        </span>
      </div>
    )
  },
  (prev, next) =>
    prev.row.price === next.row.price &&
    prev.row.amount === next.row.amount &&
    prev.row.cumulative === next.row.cumulative &&
    prev.maxCumulative === next.maxCumulative &&
    prev.amountReference === next.amountReference &&
    prev.metric === next.metric &&
    prev.side === next.side,
)

function TickSelector({
  options,
  selectedIndex,
  isAuto,
  onChange,
}: {
  options: Array<number>
  selectedIndex: number
  isAuto: boolean
  onChange: (index: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label = isAuto ? `Auto` : formatTickSize(options[selectedIndex])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        {label}
        <ChevronDown className="size-2.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-0.5 max-h-48 overflow-y-auto rounded-md border bg-popover py-0.5 shadow-md">
          <button
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
            className={cn(
              'block w-full px-3 py-0.5 text-left text-[10px] font-mono hover:bg-accent',
              isAuto ? 'text-foreground font-medium' : 'text-muted-foreground',
            )}
          >
            Auto
          </button>
          <div className="my-0.5 border-t border-border/50" />
          {options.map((tick, i) => (
            <button
              key={tick}
              onClick={() => {
                onChange(i)
                setOpen(false)
              }}
              className={cn(
                'block w-full px-3 py-0.5 text-left text-[10px] font-mono hover:bg-accent',
                !isAuto && i === selectedIndex
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground',
              )}
            >
              {formatTickSize(tick)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The second column's header is its own switch: it names the reading in force
 * and a click swaps it, so the column carries two meanings without costing a
 * third column of a pane this narrow.
 *
 * It shows ONE label, not "Size / Value". The pane routinely renders at ~200px,
 * where a third is 65px — enough for `Dimensione` or `Khối lượng` alone and
 * nowhere near enough for a pair of them, so a both-labels header would read
 * fine in English and paint over the price header in half the catalog. Both
 * readings live in the tooltip instead, and the hover affordance is the tick
 * selector's, three pixels to the right.
 */
function MetricHeader({
  metric,
  onToggle,
}: {
  metric: BookMetric
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const both = `${t('terminal.columns.size')} / ${t('terminal.columns.value')}`

  return (
    <button
      onClick={onToggle}
      type="button"
      aria-label={both}
      aria-pressed={metric === 'value'}
      title={both}
      className="-mx-1 justify-self-end rounded px-1 uppercase whitespace-nowrap transition-colors hover:bg-accent hover:text-foreground"
    >
      {metric === 'value'
        ? t('terminal.columns.value')
        : t('terminal.columns.size')}
    </button>
  )
}

export function OrderbookPane() {
  const activePair = usePanePair()
  const orderbookData = useOptionalOrderbookData()

  if (!activePair || !orderbookData) {
    return <PanePairPicker />
  }

  return (
    <OrderbookPaneInner
      orderbookData={orderbookData}
      pairKey={activePair.pairKey}
    />
  )
}

function OrderbookPaneInner({
  orderbookData,
  pairKey,
}: {
  orderbookData: OrderbookStreamValue
  pairKey: string
}) {
  const { t } = useTranslation()
  const {
    orderbook,
    baseTickSize: serverBaseTickSize,
    orderbookStatus: status,
    orderbookError: errorMessage,
  } = orderbookData

  // Switch transition: the orderbook stream nulls out on every venue/pair
  // change, so retain the previous book and dim it until the new stream's first
  // snapshot arrives (`book` is the retained payload we actually render).
  const chartConfig = useOptionalChartConfig()
  const market = chartConfig?.market ?? ''
  const venue = usePaneVenue(market)
  const unavailable = usePairUnavailable(market, pairKey)
  const credentialGate = useMarketCredentialGate(market)
  const {
    phase,
    display: book,
    marketChanged,
  } = useSwitchTransition(market, pairKey, orderbook)

  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [visibleRows, setVisibleRows] = useState(20)
  const [tickIndex, setTickIndex] = useState<number | null>(null)
  // Persisted and shared: unlike the tick, which describes THIS book's depth,
  // the metric is a reading preference — a second pane, a second window and the
  // phone all follow it, and it survives a reload.
  const [metric, setMetric] = useOrderbookMetric()

  // Header (~28px), spread row (~26px), buy/sell bar (~32px) — plus the venue
  // footer (~24px) on the panes that render one.
  const chromeHeight = venue.isDistinct ? 110 : 86

  // Measure available height for rows (callback ref so it works after loading state)
  useEffect(() => {
    if (!containerEl) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const available = entry.contentRect.height - chromeHeight
      const rows = Math.max(4, Math.floor(available / ROW_HEIGHT))
      setVisibleRows(rows)
    })
    observer.observe(containerEl)
    return () => observer.disconnect()
  }, [containerEl, chromeHeight])

  const rowsPerSide = Math.floor(visibleRows / 2)

  // Stabilize bestBid to order-of-magnitude so tick options don't recompute on
  // every price tick (e.g. 71384 → 80000, 0.00034 → 0.0004). Only changes when
  // the price crosses a power-of-10 boundary.
  const stableBestBid = useMemo(() => {
    const raw = book?.bids[0]?.price ?? 0
    if (raw <= 0) return 0
    const magnitude = Math.pow(10, Math.ceil(Math.log10(raw)))
    return magnitude
  }, [book?.bids[0]?.price])

  // Compute tick options from server-provided base tick size
  const tickOptions = useMemo(() => {
    if (!serverBaseTickSize || serverBaseTickSize <= 0) return []
    return computeTickOptions(serverBaseTickSize, stableBestBid)
  }, [serverBaseTickSize, stableBestBid])

  // Reset to Auto when tick options change (new pair / new instrument)
  const prevOptionsRef = useRef<Array<number>>([])
  useEffect(() => {
    if (
      tickOptions.length > 0 &&
      tickOptions.join() !== prevOptionsRef.current.join()
    ) {
      prevOptionsRef.current = tickOptions
      setTickIndex(null)
    }
  }, [tickOptions])

  const isAuto = tickIndex === null

  // Auto grouping: pick the tick that fits ~rowsPerSide levels for the CURRENT
  // connector's book. This re-fits ONLY when the context changes — connector,
  // tick options, or layout — never on a book tick. The book is read through a
  // ref so it is deliberately NOT an effect dependency: the effect therefore
  // does no per-tick work and produces no per-tick re-render (setAutoTickIndex
  // fires at most once per switch/resize), keeping the order book's hot path
  // free of extra render cost.
  //
  // Waiting for phase 'live' is what makes a market switch re-fit the depth: a
  // switch changes `market`, but useSwitchTransition keeps showing the previous
  // book (phase 'switching') until the new connector's snapshot lands — so we
  // measure against the NEW book, whose spread/depth differs even when the raw
  // tick size matches. (Earlier this was keyed only on tickOptions/layout, so
  // switching connectors never re-fit Auto.)
  const bookRef = useRef(book)
  bookRef.current = book
  const [autoTickIndex, setAutoTickIndex] = useState(0)
  useEffect(() => {
    if (phase !== 'live') return // wait until the switched-in book has settled
    const bids = bookRef.current?.bids
    if (!bids?.length || tickOptions.length === 0) return
    setAutoTickIndex(computeAutoTickIndex(tickOptions, bids, rowsPerSide))
  }, [phase, market, tickOptions, rowsPerSide])

  const effectiveTickIndex = tickIndex ?? autoTickIndex
  const tickSize = tickOptions[effectiveTickIndex] ?? 0

  // Group raw levels into tick-sized buckets, then slice + cumulate
  const asks = useMemo(() => {
    if (!book?.asks.length) return []
    const grouped =
      tickSize > 0 ? groupLevels(book.asks, tickSize, 'asks') : book.asks
    const sliced = grouped.slice(0, rowsPerSide)
    return addCumulative(sliced, metric).reverse()
  }, [book?.asks, rowsPerSide, tickSize, metric])

  const bids = useMemo(() => {
    if (!book?.bids.length) return []
    const grouped =
      tickSize > 0 ? groupLevels(book.bids, tickSize, 'bids') : book.bids
    const sliced = grouped.slice(0, rowsPerSide)
    return addCumulative(sliced, metric)
  }, [book?.bids, rowsPerSide, tickSize, metric])

  const maxCumulative = useMemo(() => {
    const maxBid = bids[bids.length - 1]?.cumulative ?? 0
    const maxAsk = asks[0]?.cumulative ?? 0
    return Math.max(maxBid, maxAsk)
  }, [bids, asks])

  // One reference for both sides — a bid and an ask of equal amount must paint
  // identically or the book misreports which side is heavier. Scaled to the
  // metric on screen: in value mode a cheap venue's raw sizes are the wrong
  // yardstick for the notionals being drawn.
  const amountReference = useMemo(
    () =>
      computeMagnitudeReference(
        bids.map((r) => r.amount),
        asks.map((r) => r.amount),
      ),
    [bids, asks],
  )

  const spread = useMemo(() => {
    if (!bids.length || !asks.length) return null
    const bestBid = bids[0].price
    const bestAsk = asks[asks.length - 1].price
    const spreadValue = bestAsk - bestBid
    const spreadPct = bestBid > 0 ? (spreadValue / bestBid) * 100 : 0
    return { value: spreadValue, pct: spreadPct }
  }, [bids, asks])

  const handleTickChange = useCallback((index: number | null) => {
    setTickIndex(index)
  }, [])

  const handleMetricToggle = useCallback(() => {
    setMetric((current) => (current === 'size' ? 'value' : 'size'))
  }, [setMetric])

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

  // Ahead of the loading and error states: "this venue doesn't list the pair"
  // is the specific answer, and the book has nothing true left to show.
  if (unavailable) {
    return <PaneDataUnavailable compact pairKey={pairKey} market={market} />
  }

  if (errorMessage) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-destructive px-4 text-center">
        {errorMessage}
      </div>
    )
  }

  if (!book) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>
          {status === 'connecting'
            ? t('terminal.status.connecting')
            : t('terminal.status.loadingOrderBook')}
        </span>
      </div>
    )
  }

  return (
    <PaneTransition
      className="relative flex h-full flex-col overflow-hidden text-xs"
      phase={phase}
      marketLabel={marketChanged ? venue.label : undefined}
      ref={setContainerEl}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-2 py-1">
        <div className="grid flex-1 grid-cols-3 gap-1 font-mono text-[10.5px] font-medium uppercase tracking-[.11em] text-muted-foreground">
          <span>{t('terminal.columns.price')}</span>
          <MetricHeader metric={metric} onToggle={handleMetricToggle} />
          <span className="text-right">{t('terminal.columns.total')}</span>
        </div>
        {tickOptions.length > 0 && (
          <TickSelector
            options={tickOptions}
            selectedIndex={effectiveTickIndex}
            isAuto={isAuto}
            onChange={handleTickChange}
          />
        )}
      </div>

      {/* Asks (reversed: highest at top, lowest near spread) */}
      <div className="flex flex-1 flex-col justify-end overflow-hidden">
        {asks.map((row) => (
          <OrderBookRow
            key={row.price}
            row={row}
            maxCumulative={maxCumulative}
            amountReference={amountReference}
            metric={metric}
            side="ask"
          />
        ))}
      </div>

      {/* Spread indicator */}
      {spread && (
        <div className="flex items-center justify-center gap-2 border-y border-border px-2 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[.11em] text-muted-foreground">
            Spread
          </span>
          <span className="font-mono text-[12.5px] font-medium text-foreground">
            {formatBookPrice(spread.value)}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            · {spread.pct.toFixed(3)}%
          </span>
        </div>
      )}

      {/* Bids (highest near spread, descending) */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {bids.map((row) => (
          <OrderBookRow
            key={row.price}
            row={row}
            maxCumulative={maxCumulative}
            amountReference={amountReference}
            metric={metric}
            side="bid"
          />
        ))}
      </div>

      {/* Buy vs Sell pressure bar */}
      <BuySellBar bids={bids} asks={asks} />

      {/* Venue footer — only when this book isn't on the charted venue. Stream
          health is the top bar's job (ConnectionIndicator), which can say
          "stalled"; a per-pane dot could only ever say "streaming". */}
      {venue.isDistinct && (
        <div className="border-t border-border/50 px-2 py-1 text-[10px] text-muted-foreground">
          {venue.label}
        </div>
      )}
    </PaneTransition>
  )
}

const BuySellBar = memo(
  function BuySellBar({
    bids,
    asks,
  }: {
    bids: Array<RowWithCumulative>
    asks: Array<RowWithCumulative>
  }) {
    const totalBid = bids[bids.length - 1]?.cumulative ?? 0
    const totalAsk = asks[0]?.cumulative ?? 0
    const total = totalBid + totalAsk

    if (total <= 0) return null

    const buyPct = (totalBid / total) * 100
    const sellPct = (totalAsk / total) * 100

    return (
      <div className="border-t border-border/50 px-2 py-1.5">
        <div className="mb-1 flex items-center justify-between font-mono text-[10px]">
          <span className="text-up">B {buyPct.toFixed(1)}%</span>
          <span className="text-down">{sellPct.toFixed(1)}% S</span>
        </div>
        <div className="flex h-1.5 gap-px overflow-hidden rounded-full">
          <div
            className="rounded-l-full bg-up transition-[width] duration-300"
            style={{ width: `${buyPct}%` }}
          />
          <div
            className="rounded-r-full bg-down transition-[width] duration-300"
            style={{ width: `${sellPct}%` }}
          />
        </div>
      </div>
    )
  },
  (prev, next) => {
    const prevBid = prev.bids[prev.bids.length - 1]?.cumulative ?? 0
    const prevAsk = prev.asks[0]?.cumulative ?? 0
    const nextBid = next.bids[next.bids.length - 1]?.cumulative ?? 0
    const nextAsk = next.asks[0]?.cumulative ?? 0
    return prevBid === nextBid && prevAsk === nextAsk
  },
)
