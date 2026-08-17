// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinglass prints → the wire's bucket grid, and the two places this is easy
 * to get silently wrong.
 *
 * **Side.** Coinglass documents `side` only as "Order direction (1: Buy,
 * 2: Sell)". That is the ORDER the engine placed, so a Sell closes a long —
 * the Binance convention, and the exact OPPOSITE of Bybit's `allLiquidation`,
 * where `S:"Buy"` means a long was liquidated. A shared helper across the two
 * would invert one of them, and an inverted liquidation map still looks
 * plausible on a chart, so nobody would catch it by eye. `__tests__/side.test`
 * pins both readings side by side for exactly that reason.
 *
 * **The grid.** The App Server's collector and this plugin can end up drawing
 * the same pane, so they must agree on where a bucket starts. Both snap the
 * price-bucket width to a 1/2/5×10^n step at ~40 buckets across the window's
 * traded range, and both take the lower bound as `floor(price / width) *
 * width`; time is a plain minute truncation. The arithmetic below mirrors
 * `apps/app-server/src/lib/liquidations.ts` (`snapBucketWidth`,
 * `priceBucketWidth`, `TARGET_PRICE_BUCKETS`) deliberately rather than sharing
 * code, because that module lives in a repo this package cannot import; if one
 * side changes, change both.
 */
import type {
  LiquidationBucket,
  LiquidationCompleteness,
  LiquidationSide,
} from '@pairlens/shared/instrument-types'
import type { CoinglassLiquidationOrder } from './client'

/** Time resolution buckets are stored at. Matches the server's collector. */
export const LIQUIDATION_RESOLUTION_MS = 60_000

/** Price buckets aimed for across the window's traded range. */
export const TARGET_PRICE_BUCKETS = 40

/**
 * `1` Buy closes a short, `2` Sell closes a long.
 *
 * Unknown values return null rather than a guess: a third value appearing
 * upstream would otherwise be silently folded into whichever side the fallback
 * picked, and half a map would be wrong with nothing to show for it.
 */
export function mapCoinglassSide(side: unknown): LiquidationSide | null {
  const value = Number(side)
  if (value === 2) return 'long'
  if (value === 1) return 'short'
  return null
}

/**
 * The smallest clean 1/2/5×10^n step that is at least `raw`.
 *
 * Clean means a step a price axis reads against: 50, 100, 200, 500, never
 * 137.4. Snapping UP keeps the bucket count at or below the target, so one
 * outlier print cannot widen a window into three hundred slabs.
 */
export function snapBucketWidth(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0
  const decade = Math.pow(10, Math.floor(Math.log10(raw)))
  const mantissa = raw / decade
  const snapped = mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10
  return snapped * decade
}

/**
 * Uniform price-bucket width for prints spanning `min`..`max`.
 *
 * Every print at one price leaves no range to divide, and a zero-width bucket
 * is not drawable, so the width falls back to a thousandth of the price
 * itself. A pair with two prints then looks like the same instrument as a pair
 * with two thousand.
 */
export function priceBucketWidth(min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0
  if (min <= 0 || max <= 0 || max < min) return 0
  const span = max - min
  return snapBucketWidth(span > 0 ? span / TARGET_PRICE_BUCKETS : max / 1_000)
}

export type ParsedPairKey = {
  base: string
  quote: string
  settle: string
}

/**
 * `BASE-QUOTE-SETTLE` split, which is what makes a pair key a linear perpetual.
 *
 * Spot keys (`BTC-USDT`) are refused rather than coerced: Coinglass serves
 * futures liquidations, and answering a spot key would attach a perpetual's
 * prints to an instrument that has none.
 */
export function parseFuturesPairKey(pairKey: string): ParsedPairKey | null {
  const parts = pairKey.toUpperCase().split('-')
  if (parts.length !== 3) return null
  const [base, quote, settle] = parts
  if (!base || !quote || !settle) return null
  if (!/^[A-Z0-9]+$/.test(base + quote + settle)) return null
  return { base, quote, settle }
}

function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Whether a Coinglass row belongs to the pair we were asked about.
 *
 * Rows carry the VENUE-NATIVE symbol, and the venues disagree: `BTCUSDT` on
 * Binance and Bybit, `XBTUSDTM` on KuCoin futures, `PF_XBTUSD` on Kraken. So
 * the test is prefix-based rather than an equality check against `BASE+QUOTE`,
 * which lets a venue suffix through while still rejecting a different
 * instrument: `ETHFIUSDT` does not match base `ETH`, because what follows the
 * base has to start with the quote.
 */
export function rowMatchesPair(symbol: string, pair: ParsedPairKey): boolean {
  const normalized = normalizeSymbol(symbol)
  if (!normalized.startsWith(pair.base)) return false
  return normalized.slice(pair.base.length).startsWith(pair.quote)
}

/** Whether a row's exchange is the venue we asked for, casing aside. */
export function rowMatchesExchange(
  exchangeName: string,
  exchange: string,
): boolean {
  return (
    typeof exchangeName === 'string' &&
    exchangeName.toLowerCase() === exchange.toLowerCase()
  )
}

export type AggregateInput = {
  rows: ReadonlyArray<CoinglassLiquidationOrder>
  pair: ParsedPairKey
  /** Coinglass exchange name the rows must carry. */
  exchange: string
  /** Window start, epoch ms. Rows outside are dropped. */
  since: number
}

export type AggregateResult = {
  buckets: Array<LiquidationBucket>
  bucketWidth: number
  /** Rows that survived the pair/exchange/window filters. */
  matched: number
}

/**
 * Prints → minute × price buckets, in two passes.
 *
 * The first pass filters and finds the traded range, because the bucket width
 * depends on the range and the range depends on the rows; the second buckets
 * against a width that is then fixed for the whole response. Doing it in one
 * pass with a running width is what makes a strip jitter sideways between
 * refreshes, since every new print would re-scale every existing bucket.
 */
export function aggregateLiquidationOrders(
  input: AggregateInput,
): AggregateResult {
  const { rows, pair, exchange, since } = input

  type Kept = { ts: number; price: number; side: LiquidationSide; usd: number }
  const kept: Array<Kept> = []
  let min = Infinity
  let max = -Infinity

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    if (!rowMatchesExchange(row.exchange_name, exchange)) continue
    if (!rowMatchesPair(String(row.symbol ?? ''), pair)) continue
    const side = mapCoinglassSide(row.side)
    if (side === null) continue
    const ts = Number(row.time)
    const price = Number(row.price)
    const usd = Number(row.usd_value)
    if (!Number.isFinite(ts) || ts < since) continue
    if (!Number.isFinite(price) || price <= 0) continue
    if (!Number.isFinite(usd) || usd <= 0) continue
    kept.push({ ts, price, side, usd })
    if (price < min) min = price
    if (price > max) max = price
  }

  if (kept.length === 0) return { buckets: [], bucketWidth: 0, matched: 0 }

  const bucketWidth = priceBucketWidth(min, max)
  if (bucketWidth <= 0) return { buckets: [], bucketWidth: 0, matched: 0 }

  const grid = new Map<string, LiquidationBucket>()
  for (const row of kept) {
    const ts =
      Math.floor(row.ts / LIQUIDATION_RESOLUTION_MS) * LIQUIDATION_RESOLUTION_MS
    const price = Math.floor(row.price / bucketWidth) * bucketWidth
    const key = `${ts}:${price}:${row.side}`
    const existing = grid.get(key)
    if (existing) {
      existing.notionalUsd += row.usd
      existing.count += 1
    } else {
      grid.set(key, {
        ts,
        price,
        side: row.side,
        notionalUsd: row.usd,
        count: 1,
      })
    }
  }

  // (ts, price) order, matching the server's, so a client accumulating by
  // price never has to sort.
  const buckets = [...grid.values()].sort(
    (a, b) => a.ts - b.ts || a.price - b.price,
  )
  return { buckets, bucketWidth, matched: kept.length }
}

/**
 * What this response can honestly claim.
 *
 * The venue's own stream is the CEILING, and two things below it drag the
 * answer down. A `min_liquidation_amount` above zero means the response is the
 * tail above a cutoff, so small prints are missing by construction. A page
 * that came back at the 200-row cap means the window held more than we were
 * shown. Either one makes a complete stream's excerpt a sample, and neither
 * can ever make a sampled stream complete.
 *
 * This is stricter than "report the venue's completeness", deliberately: the
 * field exists so a pane never presents a sample as a census, and a truncated
 * page IS a sample no matter how good the upstream feed is.
 */
export function resolveCompleteness(
  streamCompleteness: LiquidationCompleteness,
  evidence: { thresholdUsd: number; truncated: boolean },
): LiquidationCompleteness {
  if (streamCompleteness === 'sampled') return 'sampled'
  if (evidence.truncated) return 'sampled'
  if (evidence.thresholdUsd > 0) return 'sampled'
  return 'complete'
}
