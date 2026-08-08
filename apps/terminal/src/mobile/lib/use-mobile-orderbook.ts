// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One grouped, cumulated view of the book for the two mobile surfaces that
 * show it: the Trade panel's strip and the full-screen order book.
 *
 * The maths is NOT reimplemented here. `computeTickOptions`,
 * `computeAutoTickIndex`, `groupLevels` and `addCumulative` are the desktop
 * pane's own pure helpers, exported for this hook — a second copy of the
 * grouping rules would drift the moment a venue's tick size changed. What the
 * hook adds is everything the pane keeps entangled with its markup: the
 * row-count parameter (the phone's rows are 24px, the pane's are 18px), the
 * switch-transition retention, and the derived spread and pressure figures.
 *
 * This is a per-tick subscriber. Only the two components named above may call
 * it — see the mobile performance budget.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useMobileFocus } from '../mobile-focus-context'
import type { OrderBookLevel } from '@/hooks/use-orderbook-stream'
import {
  addCumulative,
  computeAutoTickIndex,
  computeTickOptions,
  groupLevels,
} from '@/components/terminal/orderbook-pane'
import { computeMagnitudeReference } from '@/components/terminal/magnitude-intensity'
import { useOptionalOrderbookData } from '@/lib/chart-terminal-context'
import { useSwitchTransition } from '@/hooks/use-switch-transition'

export type MobileBookRow = OrderBookLevel & { cumulative: number }

export type MobileOrderbook = {
  /** Asks in render order: worst price first, best ask last (above the spread). */
  asks: Array<MobileBookRow>
  /** Bids in render order: best bid first. */
  bids: Array<MobileBookRow>
  bestBid: number | null
  bestAsk: number | null
  /** Deepest cumulative on either side — the depth bars' 100%. */
  maxCumulative: number
  /**
   * Level size that saturates the depth tint, pooled across BOTH sides.
   *
   * The bar's length is cumulative depth; its colour strength is this level's
   * own size against this reference. Two variables, two channels — a wall reads
   * as a hot band even where the cumulative bar is already near full width.
   * Pooled because an equal bid and ask must paint identically or the book
   * lies about which side is heavier.
   */
  sizeReference: number
  spread: { value: number; pct: number } | null
  /** Share of the shown depth resting on each side. */
  buyPct: number
  sellPct: number
  /** Grouping options in ascending tick size. */
  tickOptions: Array<number>
  tickSize: number
  tickIndex: number
  isAuto: boolean
  setTickIndex: (index: number | null) => void
  /** Decimal places implied by the active grouping, for price formatting. */
  decimals: number
  /** A book is on screen (possibly the previous venue's, while switching). */
  ready: boolean
  /** The stream changed and its first snapshot has not landed yet. */
  switching: boolean
}

/** Decimals a grouped price needs so the tick is visible but no noise is. */
export function tickDecimals(tick: number): number {
  if (!Number.isFinite(tick) || tick <= 0) return 2
  if (tick >= 1) return 1
  const decimals = Math.ceil(-Math.log10(tick))
  return Math.min(8, Math.max(1, decimals))
}

export function useMobileOrderbook(rowsPerSide: number): MobileOrderbook {
  const orderbookData = useOptionalOrderbookData()
  const { focusedPair, focusedVenue: market } = useMobileFocus()

  const { phase, display: book } = useSwitchTransition(
    market,
    focusedPair,
    orderbookData?.orderbook ?? null,
  )

  const [tickIndex, setTickIndex] = useState<number | null>(null)

  // Stabilised to an order of magnitude, exactly as the pane does it: the tick
  // ladder must not be rebuilt on every price tick.
  const stableBestBid = useMemo(() => {
    const raw = book?.bids[0]?.price ?? 0
    if (raw <= 0) return 0
    return Math.pow(10, Math.ceil(Math.log10(raw)))
  }, [book?.bids[0]?.price])

  const serverBaseTickSize = orderbookData?.baseTickSize ?? 0

  const tickOptions = useMemo(() => {
    if (serverBaseTickSize <= 0) return []
    return computeTickOptions(serverBaseTickSize, stableBestBid)
  }, [serverBaseTickSize, stableBestBid])

  // A new instrument gets a new ladder — drop a manual pick that no longer
  // means anything rather than grouping the new book by the old venue's tick.
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

  // Auto grouping re-fits on context changes only — connector, ladder, row
  // count — never on a book tick, which is why the book is read through a ref
  // instead of being an effect dependency.
  const bookRef = useRef(book)
  bookRef.current = book
  const [autoTickIndex, setAutoTickIndex] = useState(0)
  useEffect(() => {
    if (phase !== 'live') return
    const bids = bookRef.current?.bids
    if (!bids?.length || tickOptions.length === 0) return
    setAutoTickIndex(computeAutoTickIndex(tickOptions, bids, rowsPerSide))
  }, [phase, market, tickOptions, rowsPerSide])

  const isAuto = tickIndex === null
  const effectiveTickIndex = tickIndex ?? autoTickIndex
  const tickSize = tickOptions[effectiveTickIndex] ?? 0

  const asks = useMemo(() => {
    if (!book?.asks.length) return []
    const grouped =
      tickSize > 0 ? groupLevels(book.asks, tickSize, 'asks') : book.asks
    return addCumulative(grouped.slice(0, rowsPerSide)).reverse()
  }, [book?.asks, rowsPerSide, tickSize])

  const bids = useMemo(() => {
    if (!book?.bids.length) return []
    const grouped =
      tickSize > 0 ? groupLevels(book.bids, tickSize, 'bids') : book.bids
    return addCumulative(grouped.slice(0, rowsPerSide))
  }, [book?.bids, rowsPerSide, tickSize])

  const bestBid = bids[0]?.price ?? null
  const bestAsk = asks[asks.length - 1]?.price ?? null

  const maxCumulative = useMemo(() => {
    const maxBid = bids[bids.length - 1]?.cumulative ?? 0
    const maxAsk = asks[0]?.cumulative ?? 0
    return Math.max(maxBid, maxAsk)
  }, [bids, asks])

  // ONE reference for both sides, and computed once here rather than in each
  // row: a row that derived its own scale would paint a bid and an equal ask
  // differently, and the book would misreport which side is heavier. Two small
  // arrays and one sort over the visible rows per book update — the same order
  // of work the slicing above already does, and the same shape the desktop
  // pane uses.
  const sizeReference = useMemo(
    () =>
      computeMagnitudeReference(
        bids.map((row) => row.size),
        asks.map((row) => row.size),
      ),
    [bids, asks],
  )

  const spread = useMemo(() => {
    if (bestBid == null || bestAsk == null) return null
    const value = bestAsk - bestBid
    return { value, pct: bestBid > 0 ? (value / bestBid) * 100 : 0 }
  }, [bestBid, bestAsk])

  const totalBid = bids[bids.length - 1]?.cumulative ?? 0
  const totalAsk = asks[0]?.cumulative ?? 0
  const total = totalBid + totalAsk
  const buyPct = total > 0 ? (totalBid / total) * 100 : 0
  const sellPct = total > 0 ? (totalAsk / total) * 100 : 0

  const handleSetTickIndex = useCallback((index: number | null) => {
    setTickIndex(index)
  }, [])

  return {
    asks,
    bids,
    bestBid,
    bestAsk,
    maxCumulative,
    sizeReference,
    spread,
    buyPct,
    sellPct,
    tickOptions,
    tickSize,
    tickIndex: effectiveTickIndex,
    isAuto,
    setTickIndex: handleSetTickIndex,
    decimals: tickDecimals(tickSize > 0 ? tickSize : serverBaseTickSize),
    ready: bids.length > 0 || asks.length > 0,
    switching: phase === 'switching',
  }
}
