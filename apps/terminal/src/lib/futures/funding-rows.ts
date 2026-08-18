// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning per-venue funding answers into the rows the scanners render.
 *
 * Pure, and separate from the hook, because this is where the two decisions a
 * matrix lives or dies on are made: what counts as the SAME contract across
 * venues, and what order the rows come in.
 *
 * **Same contract means same base asset.** Binance settles BTC in USDT and
 * Kraken settles it in USD; a matrix that keyed on the full pair would put them
 * on separate rows and there would be nothing left to compare, which is the
 * entire purpose of the pane. The quote leg is kept on the cell so a row can
 * still say what each venue is actually quoting.
 *
 * **Order is by asset, not by rate.** Sorting on funding puts a contract nobody
 * trades at the top of the board every time it prints an outlier, and moves
 * every row on each refresh. The default order is the asset ranking the caller
 * supplies (market cap, where the terminal has one), so the board is stable and
 * BTC is where a reader expects it; sorting by a venue's column is an explicit
 * click.
 */

import { annualizedFunding, annualizedSpreadPoints } from './funding-math'
import type { FundingRateEntry } from '@pairlens/shared/instrument-types'
import type { FundingVenueResult } from '@/hooks/use-funding-rates'

/**
 * Which quote leg wins when one venue lists the same base twice.
 *
 * A tie is real: Binance lists BTC settled in USDT and in USDC. Preferring the
 * venue's deepest settlement asset keeps the cell on the contract a reader
 * means by "the BTC perp", and the fallback is alphabetical so the choice is
 * never a function of response order.
 */
const QUOTE_PREFERENCE = ['USDT', 'USD', 'USDC']

export type FundingCell = {
  market: string
  venueLabel: string
  /** Full three-segment pair key, for routing to the contract. */
  pair: string
  quote: string
  rate: number
  intervalHours: number
  intervalKnown: boolean
  /** Yearly rate as a fraction; null when the period is unusable. */
  annualized: number | null
  nextFundingMs?: number
  markPrice?: number
  indexPrice?: number
  predictedRate?: number
}

export type FundingRow = {
  base: string
  /** One cell per venue that lists the asset, keyed by market id. */
  cells: Record<string, FundingCell>
  /** How many venues answered for this asset. */
  coverage: number
  /** Cash-and-carry gap across venues, in points of annualised funding. */
  spreadPoints: number | null
  /** Asset ranking used for the default order; Infinity when unknown. */
  rank: number
}

export function buildFundingRows(
  results: Array<FundingVenueResult>,
  rankOf: (base: string) => number,
): Array<FundingRow> {
  const rows = new Map<string, FundingRow>()

  for (const result of results) {
    for (const entry of result.entries) {
      const base = entry.base
      if (!base) continue
      let row = rows.get(base)
      if (!row) {
        row = {
          base,
          cells: {},
          coverage: 0,
          spreadPoints: null,
          rank: rankOf(base),
        }
        rows.set(base, row)
      }
      const cell = toCell(entry, result)
      const existing = row.cells[result.market]
      if (
        existing &&
        preferredQuote(existing.quote, cell.quote) === existing.quote
      ) {
        continue
      }
      row.cells[result.market] = cell
    }
  }

  const out: Array<FundingRow> = []
  for (const row of rows.values()) {
    const cells = Object.values(row.cells)
    row.coverage = cells.length
    row.spreadPoints = annualizedSpreadPoints(
      cells.map((c) => c.annualized).filter((r): r is number => r !== null),
    )
    out.push(row)
  }
  out.sort(compareRows)
  return out
}

function toCell(
  entry: FundingRateEntry,
  result: FundingVenueResult,
): FundingCell {
  return {
    market: result.market,
    venueLabel: result.label,
    pair: entry.pair,
    quote: entry.quote,
    rate: entry.fundingRate,
    intervalHours: entry.intervalHours,
    intervalKnown: entry.intervalKnown,
    annualized: annualizedFunding(entry.fundingRate, entry.intervalHours),
    ...(entry.nextFundingMs !== undefined
      ? { nextFundingMs: entry.nextFundingMs }
      : {}),
    ...(entry.markPrice !== undefined ? { markPrice: entry.markPrice } : {}),
    ...(entry.indexPrice !== undefined ? { indexPrice: entry.indexPrice } : {}),
    ...(entry.predictedRate !== undefined
      ? { predictedRate: entry.predictedRate }
      : {}),
  }
}

/** The winner of a quote-leg tie, as an identity so the caller can compare. */
function preferredQuote<T extends string>(a: T, b: T): T {
  const ai = QUOTE_PREFERENCE.indexOf(a)
  const bi = QUOTE_PREFERENCE.indexOf(b)
  const aRank = ai === -1 ? QUOTE_PREFERENCE.length : ai
  const bRank = bi === -1 ? QUOTE_PREFERENCE.length : bi
  if (aRank !== bRank) return aRank < bRank ? a : b
  return a.localeCompare(b) <= 0 ? a : b
}

function compareRows(a: FundingRow, b: FundingRow): number {
  if (a.rank !== b.rank) return a.rank - b.rank
  if (a.coverage !== b.coverage) return b.coverage - a.coverage
  return a.base.localeCompare(b.base)
}

/**
 * Reorder rows by one venue's column, richest first or cheapest first.
 *
 * Rows that venue does not list sink to the bottom in their default order
 * rather than being dropped: the contract still exists on the other venues, and
 * removing it from the board on a sort click would read as data loss.
 */
export function sortRowsByVenue(
  rows: Array<FundingRow>,
  market: string,
  direction: 'asc' | 'desc',
): Array<FundingRow> {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a.cells[market]?.annualized
    const bv = b.cells[market]?.annualized
    if (av == null && bv == null) return compareRows(a, b)
    if (av == null) return 1
    if (bv == null) return -1
    if (av === bv) return compareRows(a, b)
    return (av - bv) * sign
  })
}

export type FundingExtreme = {
  base: string
  cell: FundingCell
  /**
   * The annualised rate, non-null by construction: a contract whose period is
   * unusable cannot be RANKED against the others, so it never enters the list
   * at all rather than being carried as a nullable the renderer must re-check.
   */
  annualized: number
}

/**
 * The dearest and cheapest live rates across every venue.
 *
 * One entry per contract per venue, not per asset: "TAO on Binance" and "TAO on
 * KuCoin" are two different trades, and collapsing them would hide the leg that
 * makes the pair work.
 */
export function fundingExtremes(
  rows: Array<FundingRow>,
  limit: number,
): { positive: Array<FundingExtreme>; negative: Array<FundingExtreme> } {
  const flat: Array<FundingExtreme> = []
  for (const row of rows) {
    for (const cell of Object.values(row.cells)) {
      if (cell.annualized === null) continue
      flat.push({ base: row.base, cell, annualized: cell.annualized })
    }
  }
  const positive = flat
    .filter((e) => e.annualized > 0)
    .sort((a, b) => b.annualized - a.annualized)
    .slice(0, limit)
  const negative = flat
    .filter((e) => e.annualized < 0)
    .sort((a, b) => a.annualized - b.annualized)
    .slice(0, limit)
  return { positive, negative }
}

/**
 * Both sides of `fundingExtremes` as ONE list, dearest carry first.
 *
 * The rail used to render two labelled sections, which spent a third of a
 * short pane on headings and, with a single venue connected, put a "shorts
 * paying" heading over one row. Interleaved by |rate| the eye reads it as what
 * it is: the contracts whose carry is worth a second look, whichever way they
 * pay. The sign is carried by the icon and the colour on each row.
 *
 * `perSide` bounds BOTH the list and everything downstream of it: the rail
 * fetches a 30-day history per entry, so this is the number that decides how
 * many REST calls the pane costs.
 */
export function rankedExtremes(
  rows: Array<FundingRow>,
  perSide: number,
): Array<FundingExtreme> {
  const { positive, negative } = fundingExtremes(rows, perSide)
  return [...positive, ...negative].sort((a, b) => {
    const gap = Math.abs(b.annualized) - Math.abs(a.annualized)
    if (gap !== 0) return gap
    return a.base.localeCompare(b.base)
  })
}

/**
 * The cell a single-venue-per-row pane should show for an asset.
 *
 * Basis needs BOTH a mark and an index, and the venues disagree about whether
 * they publish the second one — so the venue with a usable pair wins over one
 * that merely answered first. Preference order otherwise follows the venue list
 * the caller passed, which is the order the user sees everywhere else.
 */
export function primaryCell(
  row: FundingRow,
  marketOrder: Array<string>,
): FundingCell | null {
  const cells = marketOrder
    .map((market) => row.cells[market])
    .filter((c): c is FundingCell => c !== undefined)
  const withIndex = cells.find(
    (c) => c.markPrice !== undefined && c.indexPrice !== undefined,
  )
  return withIndex ?? cells[0] ?? null
}
