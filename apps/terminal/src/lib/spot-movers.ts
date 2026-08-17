// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What moved, ranked five ways, from one snapshot.
 *
 * The rule the whole module is built around: every ranking has to be derivable
 * from the fields the top-coins snapshot actually carries (price, 1h/24h/7d
 * change, 24h volume, capitalisation). A tab that needs a field nobody serves
 * is not implemented rather than approximated, because a movers table is read
 * as fact and a plausible-looking fabricated column is worse than a missing
 * one.
 *
 * Two derivations are worth stating out loud, since both look like numbers
 * they are not:
 *
 * - **Turnover multiple** (`14.2×`) is 24h volume over capitalisation,
 *   measured against the median coin in the same snapshot. It is NOT "versus
 *   its own 30-day average", which no snapshot field can support. Read it as
 *   "this traded fourteen times as much of itself today as a typical coin
 *   did" — which is the question the column exists to answer, and the reason
 *   `unusual` ranks by it.
 * - **Volatility score** normalises each window's move to a daily equivalent
 *   (an hour scaled by √24, a week by 1/√7) and takes the largest. A coin that
 *   did all of its 9% in the last hour outranks one that drifted 9% over the
 *   day, which is the distinction the tab is for.
 */
import type {
  BulkTickerEntry,
  TopCoin,
} from '@pairlens/shared/instrument-types'

/** Ranking windows the snapshot can serve. */
export type MoverWindow = '1h' | '24h' | '7d'

export type MoverTab =
  | 'gainers'
  | 'losers'
  | 'volume'
  | 'volatility'
  | 'unusual'

export type MoverRow = {
  /** Base symbol for a crypto row ('TAO'), bare ticker for a stock ('AAPL'). */
  symbol: string
  /** Display name when the source carries one. */
  name: string | null
  price: number
  /** The move over the active window, in percent. */
  changePct: number
  /** 24h volume in USD, when the source reports it. */
  volume24h: number | null
  /** See the module header. Null without a usable capitalisation. */
  turnoverMultiple: number | null
  logoUrl: string | null
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

const isPositive = (v: unknown): v is number => isFiniteNumber(v) && v > 0

const HOURS_PER_DAY_SQRT = Math.sqrt(24)
const DAYS_PER_WEEK_SQRT = Math.sqrt(7)

export function changeIn(coin: TopCoin, window: MoverWindow): number {
  const raw =
    window === '1h'
      ? coin.percentChange1h
      : window === '7d'
        ? coin.percentChange7d
        : coin.percentChange24h
  return isFiniteNumber(raw) ? raw : 0
}

/** 24h volume over capitalisation — the share of itself a coin traded today. */
export function turnover(coin: TopCoin): number | null {
  if (!isPositive(coin.marketCap) || !isPositive(coin.volume24h)) return null
  return coin.volume24h / coin.marketCap
}

/**
 * The median turnover of the snapshot, which is what every row's multiple is
 * measured against. Median rather than mean: one stablecoin turning over
 * eighty times its float would drag a mean far enough that nothing else ever
 * looked unusual again.
 */
export function medianTurnover(coins: ReadonlyArray<TopCoin>): number | null {
  const values: Array<number> = []
  for (const coin of coins) {
    const t = turnover(coin)
    if (t !== null) values.push(t)
  }
  if (values.length === 0) return null
  values.sort((a, b) => a - b)
  const mid = values.length >> 1
  const median =
    values.length % 2 === 1
      ? values[mid]
      : ((values[mid - 1] ?? 0) + (values[mid] ?? 0)) / 2
  return median > 0 ? median : null
}

/** Largest daily-equivalent move across the three windows the snapshot has. */
export function volatilityScore(coin: TopCoin): number {
  const hourly = Math.abs(changeIn(coin, '1h')) * HOURS_PER_DAY_SQRT
  const daily = Math.abs(changeIn(coin, '24h'))
  const weekly = Math.abs(changeIn(coin, '7d')) / DAYS_PER_WEEK_SQRT
  return Math.max(hourly, daily, weekly)
}

/**
 * A turnover multiple at or above this is worth colouring: below it the coin
 * is trading at roughly a normal share of its own size and the number is
 * background, not signal. Matches the design's split, where 3.1× is marked
 * and 2.4× is not.
 */
export const UNUSUAL_TURNOVER = 3

function toRow(
  coin: TopCoin,
  window: MoverWindow,
  median: number | null,
): MoverRow {
  const t = turnover(coin)
  return {
    symbol: coin.symbol.toUpperCase(),
    name: coin.name || null,
    price: coin.price,
    changePct: changeIn(coin, window),
    volume24h: isPositive(coin.volume24h) ? coin.volume24h : null,
    turnoverMultiple: t !== null && median !== null ? t / median : null,
    logoUrl: coin.logoUrl,
  }
}

/**
 * Rank the snapshot for one tab.
 *
 * Rows are sorted into a total order — the tab's measure first, then symbol —
 * so two coins that tie never swap places between refreshes and a memoized
 * row keeps its identity across a re-rank.
 */
export function rankMovers(
  coins: ReadonlyArray<TopCoin>,
  tab: MoverTab,
  window: MoverWindow,
  limit = 50,
): Array<MoverRow> {
  const median = medianTurnover(coins)
  const priced = coins.filter((c) => isPositive(c.price))

  let scored: Array<{ coin: TopCoin; score: number }>
  switch (tab) {
    case 'gainers':
      scored = priced
        .map((coin) => ({ coin, score: changeIn(coin, window) }))
        .filter((e) => e.score > 0)
      break
    case 'losers':
      scored = priced
        .map((coin) => ({ coin, score: -changeIn(coin, window) }))
        .filter((e) => e.score > 0)
      break
    case 'volume':
      scored = priced
        .map((coin) => ({ coin, score: coin.volume24h }))
        .filter((e) => isPositive(e.score))
      break
    case 'volatility':
      scored = priced
        .map((coin) => ({ coin, score: volatilityScore(coin) }))
        .filter((e) => e.score > 0)
      break
    case 'unusual':
      scored =
        median === null
          ? []
          : priced
              .map((coin) => {
                const t = turnover(coin)
                return { coin, score: t === null ? 0 : t / median }
              })
              .filter((e) => e.score > 0)
      break
  }

  scored.sort(
    (a, b) => b.score - a.score || a.coin.symbol.localeCompare(b.coin.symbol),
  )

  return scored.slice(0, limit).map((e) => toRow(e.coin, window, median))
}

/**
 * The same ranking over a broker's bulk snapshot.
 *
 * A bulk ticker entry is price and 24h change and nothing else — no volume, no
 * capitalisation — so only the two tabs those two fields can serve exist here.
 * The caller hides the rest rather than showing tabs that would always be
 * empty.
 */
export const EQUITY_MOVER_TABS: ReadonlyArray<MoverTab> = ['gainers', 'losers']

export function rankEquityMovers(
  entries: ReadonlyArray<BulkTickerEntry>,
  tab: MoverTab,
  limit = 50,
): Array<MoverRow> {
  if (tab !== 'gainers' && tab !== 'losers') return []
  const sign = tab === 'gainers' ? 1 : -1
  return entries
    .filter((e) => isPositive(e.price) && isFiniteNumber(e.change24h))
    .filter((e) => sign * e.change24h > 0)
    .sort(
      (a, b) =>
        sign * b.change24h - sign * a.change24h ||
        a.symbol.localeCompare(b.symbol),
    )
    .slice(0, limit)
    .map(
      (e): MoverRow => ({
        symbol: e.symbol.toUpperCase(),
        name: null,
        price: e.price,
        changePct: e.change24h,
        volume24h: null,
        turnoverMultiple: null,
        logoUrl: null,
      }),
    )
}

/**
 * Bar width for the change column, as a fraction of the strongest move on
 * screen. Relative rather than absolute, because a 0.4% day and a 40% day are
 * both worth reading at a glance and a fixed scale flattens one of them.
 */
export function changeBarFraction(
  row: MoverRow,
  rows: ReadonlyArray<MoverRow>,
): number {
  let max = 0
  for (const r of rows) max = Math.max(max, Math.abs(r.changePct))
  if (max <= 0) return 0
  return Math.min(1, Math.abs(row.changePct) / max)
}
