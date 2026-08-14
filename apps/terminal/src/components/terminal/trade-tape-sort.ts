// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Sort model for the time-and-sales tape ───────────────────────────
//
// Kept out of the pane because ordering a feed that reprints ten times a
// second has two properties worth pinning in a test rather than eyeballing:
// the default costs nothing, and equal rows never shuffle.

// The engine type rather than the hook's re-export: this module is pure, and
// its test should not have to load a React hook to compare two numbers.
import type { Trade } from '@pairlens/market-engine/types'

export const TRADE_SORT_COLUMNS = [
  'side',
  'price',
  'size',
  'value',
  'time',
] as const

export type TradeSortColumn = (typeof TRADE_SORT_COLUMNS)[number]
export type TradeSortDirection = 'asc' | 'desc'
export type TradeSort = {
  column: TradeSortColumn
  direction: TradeSortDirection
}

/** Newest print first — a tape, which is what the pane is for. */
export const DEFAULT_TRADE_SORT: TradeSort = {
  column: 'time',
  direction: 'desc',
}

/**
 * Direction a column opens on when it is first clicked.
 *
 * Every quantity opens descending because the question behind clicking Size
 * or Value is "what were the big prints", not "what were the dust ones", and
 * Time descending is the tape's own order. Side opens ascending only so that
 * `buy` — the first of the two in the comparator — leads, which is the
 * arbitrary-but-stable choice; the second click gives the other grouping.
 */
const NATURAL_DIRECTION: Record<TradeSortColumn, TradeSortDirection> = {
  side: 'asc',
  price: 'desc',
  size: 'desc',
  value: 'desc',
  time: 'desc',
}

/** Click behaviour: same column flips, a new column opens at its natural end. */
export function nextTradeSort(
  current: TradeSort,
  column: TradeSortColumn,
): TradeSort {
  if (current.column === column) {
    return { column, direction: current.direction === 'desc' ? 'asc' : 'desc' }
  }
  return { column, direction: NATURAL_DIRECTION[column] }
}

/**
 * Coerce a persisted value back into a sort.
 *
 * The setting survives in localStorage across releases, so a column that is
 * renamed or dropped would otherwise reach the comparator as a string it has
 * no case for and quietly return an unsorted tape.
 */
export function normalizeTradeSort(value: unknown): TradeSort {
  if (typeof value !== 'object' || value === null) return DEFAULT_TRADE_SORT
  const { column, direction } = value as Partial<TradeSort>
  if (!TRADE_SORT_COLUMNS.includes(column as TradeSortColumn)) {
    return DEFAULT_TRADE_SORT
  }
  return {
    column: column as TradeSortColumn,
    direction: direction === 'asc' ? 'asc' : 'desc',
  }
}

function compareColumn(column: TradeSortColumn, a: Trade, b: Trade): number {
  switch (column) {
    case 'side':
      // buy < sell, so the pair groups rather than interleaves.
      return (a.side === 'buy' ? 0 : 1) - (b.side === 'buy' ? 0 : 1)
    case 'price':
      return a.price - b.price
    case 'size':
      return a.size - b.size
    case 'value':
      return a.price * a.size - b.price * b.size
    case 'time':
      return a.ts - b.ts
  }
}

/**
 * Order the tape.
 *
 * Two things this owes the caller, both because the input is replaced wholesale
 * ten times a second:
 *
 *   1. The default is free. The stream hands the buffer over newest-first
 *      already, so time-descending returns the SAME array — no copy, no sort,
 *      and the identity a downstream `useMemo` needs to stay put.
 *   2. Equal rows never move. A tape sorted by Side has ~100 rows sharing a
 *      key, and `Array#sort` being stable only guarantees they hold their
 *      position within ONE call — across two calls over two different arrays it
 *      guarantees nothing. So ties fall through to timestamp, then to id: a
 *      total order, which is what keeps the block from reshuffling under the
 *      cursor on every flush.
 */
export function sortTrades(
  trades: Array<Trade>,
  sort: TradeSort,
): Array<Trade> {
  if (sort.column === 'time' && sort.direction === 'desc') return trades

  const sign = sort.direction === 'asc' ? 1 : -1
  return trades.slice().sort((a, b) => {
    const primary = compareColumn(sort.column, a, b)
    if (primary !== 0) return primary * sign
    if (a.ts !== b.ts) return b.ts - a.ts
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}
