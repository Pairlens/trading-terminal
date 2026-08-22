// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A collection's price history, and the one place in this connector where the
 * answer depends on what the caller is drawing.
 *
 * ## Two sources, and the type that keeps them apart
 *
 * OpenSea tracks a floor over time (`/collections/{slug}/floor_prices`), which
 * is the number a collection is actually quoted at. It also publishes a sales
 * tape, from which an OHLC can be bucketed. These are different numbers: an
 * average of fills is not a floor, and a rare-trait sale eight times the floor
 * moves one of them and not the other. `NftSeriesBasis` exists precisely so a
 * chart can say which it drew, and this file sets it honestly rather than
 * labelling everything `'floor'` because that reads better.
 *
 * The floor history is preferred wherever it answers, because it is one request
 * instead of six pages and because it is the price. Bucketed sales are the
 * fallback, and they carry `basis: 'sales'`.
 *
 * ## The budget, and what `truncated` means
 *
 * The sales path pages backwards through `next` and is capped at
 * `MAX_SALE_PAGES` pages of 200. A hot collection can print more than that in a
 * day, so the cap is reached before the window is, and the series then covers
 * less time than was asked for. That is what `truncated` says. A short series
 * and a truncated one look identical on a chart, and only one of them is a hole
 * worth telling the user about.
 */
import { openSeaFetch, unsupported } from './http'
import { fetchCollectionDetail, usdRateFor } from './collections-client'
import { parseFloorPoints, parseSaleEvents } from './parsers'
import { resolveSlug } from './slug-resolver'

import type { Candle } from '@pairlens/shared/types'
import type {
  NftChain,
  NftPricePoint,
  NftPriceSeries,
  NftSale,
} from '@pairlens/shared/nft-types'
import type { ParseContext } from './parsers'

/** The timeframes the manifest publishes, in ms. */
export const TIMEFRAME_MS: Readonly<Record<string, number>> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '1d': 86_400_000,
}

/**
 * OpenSea's floor-history windows. Ascending, because the smallest window that
 * covers what was asked for is the one with the most resolution left in it.
 */
const FLOOR_WINDOWS: ReadonlyArray<readonly [string, number]> = [
  ['one_minute', 60_000],
  ['five_minutes', 300_000],
  ['fifteen_minutes', 900_000],
  ['one_hour', 3_600_000],
  ['one_day', 86_400_000],
  ['seven_days', 604_800_000],
  ['thirty_days', 2_592_000_000],
  ['one_year', 31_536_000_000],
]

/** Points OpenSea is asked for in one floor-history read. */
const MAX_RESOLUTION = 1000
/** Pages of sales the fallback will spend on one series. */
const MAX_SALE_PAGES = 6
const SALE_PAGE = 200

export function floorWindowFor(spanMs: number): {
  window: string
  spanMs: number
} {
  for (const [window, size] of FLOOR_WINDOWS) {
    if (size >= spanMs) return { window, spanMs: size }
  }
  return { window: 'all_time', spanMs }
}

// ── Bucketing, pure ──────────────────────────────────────────────────

export function bucketStart(timestampMs: number, bucketMs: number): number {
  return Math.floor(timestampMs / bucketMs) * bucketMs
}

/**
 * Floor points into candles.
 *
 * Real OHLC when the floor moved more than once inside a bucket, and a flat bar
 * when it did not. Empty buckets carry the previous close forward: a WebGL
 * candle series with holes in it renders as a broken axis, and a floor that did
 * not move is genuinely still that floor. Volume is zero throughout, because a
 * floor history says nothing about how much traded.
 */
export function bucketFloorCandles(
  points: ReadonlyArray<NftPricePoint>,
  bucketMs: number,
): Array<Candle> {
  const ordered = [...points].sort((a, b) => a.timestampMs - b.timestampMs)
  const candles: Array<Candle> = []
  let current: Candle | null = null

  for (const point of ordered) {
    const price = point.floorPrice ?? point.close
    if (price === undefined) continue
    const ts = bucketStart(point.timestampMs, bucketMs)
    if (!current || ts !== current.ts) {
      if (current) {
        for (let gap = current.ts + bucketMs; gap < ts; gap += bucketMs) {
          candles.push({
            ts: gap,
            open: current.close,
            high: current.close,
            low: current.close,
            close: current.close,
            volume: 0,
          })
        }
      }
      current = {
        ts,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      }
      candles.push(current)
      continue
    }
    current.high = Math.max(current.high, price)
    current.low = Math.min(current.low, price)
    current.close = price
  }
  return candles
}

/**
 * Sales into series points, one point per bucket that actually printed.
 *
 * Deliberately sparse: a bucket with no fills has no average, and inventing one
 * would put a price on an hour when nobody traded. The candle variant below
 * fills forward because a chart needs a continuous axis; a series does not.
 *
 * `volume` is turnover in the settlement currency rather than an item count, so
 * a bucket of one 80 ETH sale and a bucket of forty 2 ETH sales read the same
 * size, which is what a volume pane under a price chart means.
 */
export function bucketSalePoints(
  sales: ReadonlyArray<NftSale>,
  bucketMs: number,
): Array<NftPricePoint> {
  const ordered = [...sales].sort((a, b) => a.timestampMs - b.timestampMs)
  const points: Array<NftPricePoint> = []
  let current: NftPricePoint | null = null

  for (const sale of ordered) {
    if (!Number.isFinite(sale.price) || sale.price <= 0) continue
    const ts = bucketStart(sale.timestampMs, bucketMs)
    if (!current || ts !== current.timestampMs) {
      current = {
        timestampMs: ts,
        open: sale.price,
        high: sale.price,
        low: sale.price,
        close: sale.price,
        volume: sale.price,
        salesCount: 1,
      }
      points.push(current)
      continue
    }
    current.high = Math.max(current.high ?? sale.price, sale.price)
    current.low = Math.min(current.low ?? sale.price, sale.price)
    current.close = sale.price
    current.volume = (current.volume ?? 0) + sale.price
    current.salesCount = (current.salesCount ?? 0) + 1
  }

  for (const point of points) {
    if (point.salesCount && point.volume !== undefined) {
      point.averagePrice = point.volume / point.salesCount
    }
  }
  return points
}

/** The same buckets as candles, with empty ones carried forward. */
export function bucketSaleCandles(
  sales: ReadonlyArray<NftSale>,
  bucketMs: number,
): Array<Candle> {
  const points = bucketSalePoints(sales, bucketMs)
  const candles: Array<Candle> = []
  for (const point of points) {
    const previous = candles[candles.length - 1]
    if (previous) {
      for (
        let gap = previous.ts + bucketMs;
        gap < point.timestampMs;
        gap += bucketMs
      ) {
        candles.push({
          ts: gap,
          open: previous.close,
          high: previous.close,
          low: previous.close,
          close: previous.close,
          volume: 0,
        })
      }
    }
    candles.push({
      ts: point.timestampMs,
      open: point.open ?? 0,
      high: point.high ?? 0,
      low: point.low ?? 0,
      close: point.close ?? 0,
      volume: point.volume ?? 0,
    })
  }
  return candles
}

// ── Reads ────────────────────────────────────────────────────────────

async function contextFor(
  apiKey: string,
  chain: NftChain,
  contract: string,
  slug: string,
): Promise<ParseContext> {
  const detail = await fetchCollectionDetail(apiKey, chain, slug, contract)
  const ctx: ParseContext = {
    chain,
    contract,
    priceCurrency: detail.summary.priceCurrency,
    collectionName: detail.summary.name,
  }
  const rate = usdRateFor(ctx.priceCurrency)
  if (rate !== undefined) ctx.usdRate = rate
  return ctx
}

async function fetchFloorPoints(
  apiKey: string,
  slug: string,
  spanMs: number,
  bucketMs: number,
): Promise<{ points: Array<NftPricePoint>; windowMs: number }> {
  const { window, spanMs: windowMs } = floorWindowFor(spanMs)
  const resolution = Math.min(
    MAX_RESOLUTION,
    Math.max(2, Math.ceil(windowMs / Math.max(bucketMs, 1))),
  )
  const raw = await openSeaFetch<unknown>(
    apiKey,
    `/collections/${slug}/floor_prices?timeframe=${window}&resolution=${resolution}`,
  )
  return { points: parseFloorPoints(raw), windowMs }
}

/**
 * Sales, paged backwards until the window is covered or the cap is hit.
 *
 * `after` is sent so the server stops at the window rather than handing back a
 * year of history a page at a time; the cursor walk is what fills the window in
 * when a collection prints faster than one page holds.
 */
async function pageSales(
  apiKey: string,
  slug: string,
  ctx: ParseContext,
  sinceMs: number,
): Promise<{ sales: Array<NftSale>; covered: boolean }> {
  const after = Math.floor(sinceMs / 1000)
  const sales: Array<NftSale> = []
  let cursor: string | undefined
  let covered = false

  for (let page = 0; page < MAX_SALE_PAGES; page++) {
    const query = `/events/collection/${slug}?event_type=sale&limit=${SALE_PAGE}&after=${after}${
      cursor ? `&next=${encodeURIComponent(cursor)}` : ''
    }`
    const raw = await openSeaFetch<unknown>(apiKey, query)
    const parsed = parseSaleEvents(raw, ctx)
    sales.push(...parsed.sales)
    cursor = parsed.cursor
    if (!cursor || parsed.sales.length === 0) {
      // The server served the tail of the window, so the series is complete
      // even if it is short.
      covered = true
      break
    }
    const oldest = sales[sales.length - 1]?.timestampMs
    if (oldest !== undefined && oldest <= sinceMs) {
      covered = true
      break
    }
  }

  return { sales: sales.filter((sale) => sale.timestampMs >= sinceMs), covered }
}

/**
 * The `series` action: a floor history where OpenSea tracks one, bucketed sales
 * where it does not.
 */
export async function fetchSeries(
  apiKey: string,
  chain: NftChain,
  contract: string,
  days: number,
): Promise<NftPriceSeries> {
  const slug = await resolveSlug(apiKey, chain, contract)
  const ctx = await contextFor(apiKey, chain, contract, slug)
  const spanMs = Math.max(1, days) * 86_400_000
  // Roughly a point every few minutes on a short window, daily on a long one.
  const bucketMs = days <= 2 ? 300_000 : days <= 14 ? 3_600_000 : 86_400_000
  const sinceMs = Date.now() - spanMs

  const floor = await fetchFloorPoints(apiKey, slug, spanMs, bucketMs).catch(
    () => null,
  )
  if (floor && floor.points.length > 1) {
    const points = floor.points.filter((point) => point.timestampMs >= sinceMs)
    const series: NftPriceSeries = {
      basis: 'floor',
      priceCurrency: ctx.priceCurrency,
      points: points.length > 0 ? points : floor.points,
    }
    // The window OpenSea serves is a fixed set of sizes, so a 20-day request is
    // answered from a 30-day window and is never short. It IS short when the
    // collection is younger than the window, and that is not a gap.
    const first = series.points[0]?.timestampMs
    if (
      first !== undefined &&
      first > sinceMs + bucketMs * 2 &&
      floor.windowMs < spanMs
    ) {
      series.truncated = true
    }
    return series
  }

  const { sales, covered } = await pageSales(apiKey, slug, ctx, sinceMs)
  const points = bucketSalePoints(sales, days <= 3 ? 3_600_000 : 86_400_000)
  const series: NftPriceSeries = {
    basis: 'sales',
    priceCurrency: ctx.priceCurrency,
    points,
  }
  if (!covered) series.truncated = true
  return series
}

/**
 * The `market-data:candles` and `market-data:history` answer.
 *
 * OHLC of the tracked floor, which is the price an NFT trader means. The sales
 * tape is the fallback and it brings volume with it, which the floor history
 * does not publish: a floor chart's volume pane is empty on purpose rather than
 * filled with a number from somewhere else.
 */
export async function fetchCandles(
  apiKey: string,
  chain: NftChain,
  contract: string,
  timeframe: string,
  limit: number,
): Promise<Array<Candle>> {
  const bucketMs = TIMEFRAME_MS[timeframe]
  if (!bucketMs) unsupported(`candles at ${timeframe}`, chain)

  const slug = await resolveSlug(apiKey, chain, contract)
  const ctx = await contextFor(apiKey, chain, contract, slug)
  const bars = Math.min(Math.max(Math.trunc(limit), 2), 500)
  const spanMs = bucketMs * bars

  const floor = await fetchFloorPoints(apiKey, slug, spanMs, bucketMs).catch(
    () => null,
  )
  const floorCandles =
    floor && floor.points.length > 1
      ? bucketFloorCandles(floor.points, bucketMs)
      : []
  if (
    floorCandles.length > 1 &&
    !isCoarserThan(floor?.points ?? [], bucketMs)
  ) {
    return floorCandles.slice(-bars)
  }

  // Either OpenSea tracks no floor for this collection, or it tracks one at a
  // coarser step than the bars we were asked for. The second case is the one
  // worth guarding: some chains are backed by a daily feed, and serving a 5m
  // chart out of daily points would be twelve identical bars an hour claiming
  // to be intraday. Bucketed fills at the real step are sparse and honest.
  const { sales } = await pageSales(apiKey, slug, ctx, Date.now() - spanMs)
  const saleCandles = bucketSaleCandles(sales, bucketMs)
  if (saleCandles.length > 1) return saleCandles.slice(-bars)
  return floorCandles.slice(-bars)
}

/**
 * Whether a point series steps more slowly than the bars asked for.
 *
 * Median spacing rather than mean: a feed with one long gap in it is still a
 * fine intraday feed, and a mean would condemn it.
 */
function isCoarserThan(
  points: ReadonlyArray<NftPricePoint>,
  bucketMs: number,
): boolean {
  if (points.length < 3) return false
  const gaps: Array<number> = []
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]
    const current = points[i]
    if (!previous || !current) continue
    gaps.push(current.timestampMs - previous.timestampMs)
  }
  if (gaps.length === 0) return false
  gaps.sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)] ?? 0
  return median > bucketMs * 2
}
