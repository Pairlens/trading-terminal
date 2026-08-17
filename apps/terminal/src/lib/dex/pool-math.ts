// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The arithmetic the on-chain panes share, kept away from the components so
 * the numbers can be tested rather than eyeballed.
 *
 * One rule runs through all of it: a missing input produces null, never a
 * zero. On a pool pane the two read completely differently — "$0 locked" is a
 * pool nobody should touch, "not published" is a pane that has to say so.
 */

/**
 * Below a dollar of reserves the provider's figure is dust or a placeholder
 * (pump.fun pools report fractions of a cent against millions in volume), and
 * a ratio built on it is a trillion-x lie that sorts to the top of the board.
 */
export const MIN_RANKABLE_RESERVE_USD = 1

/**
 * A reserve figure a pane may print as money. Anything under a cent would
 * render as "$0", which reads as "empty pool" when the truth is "the provider
 * published dust"; those collapse to null so the cell shows a dash.
 */
export function measurableReserveUsd(reserveUsd: number | null): number | null {
  if (reserveUsd === null || reserveUsd < 0.01) return null
  return reserveUsd
}

/**
 * Turnover: how many times a pool's own liquidity traded through it in a day.
 *
 * The ranking number for the pool map, and the one that separates a deep pool
 * nobody uses from a shallow one doing real volume. Null when either side is
 * missing or liquidity is below the rankable floor, because dividing by an
 * empty (or dust-valued) pool produces a number that sorts to the top of the
 * board while meaning nothing.
 */
export function volumeToTvl(
  volume24hUsd: number | null,
  reserveUsd: number | null,
): number | null {
  if (volume24hUsd === null || reserveUsd === null) return null
  if (reserveUsd < MIN_RANKABLE_RESERVE_USD) return null
  const ratio = volume24hUsd / reserveUsd
  return Number.isFinite(ratio) ? ratio : null
}

/**
 * Where a price impact sits on the three-step scale the panes colour by.
 *
 * The thresholds are the ones a trader acts on rather than round numbers: up
 * to 10 bps a market order is fine, up to 50 bps it is worth splitting or
 * waiting, and past that the size is moving the pool. Used for the bar colour
 * on the impact grid and the ladder's "vs best" column.
 */
export type ImpactTier = 'low' | 'moderate' | 'high'

export function impactTier(impact: number | null): ImpactTier | null {
  if (impact === null || !Number.isFinite(impact)) return null
  // Signed, not absolute. A negative reading means the quote's output prices
  // ABOVE its input, which on a real fill is the two USD references
  // disagreeing rather than free money: a live $1,000 WETH buy on Base quoted
  // -0.45%. Ranking that by magnitude painted a red "high impact" bar on the
  // cheapest fill on the board, which is the exact opposite of the truth.
  if (impact <= 0.001) return 'low'
  if (impact <= 0.005) return 'moderate'
  return 'high'
}

/**
 * Bar width for an impact reading, 0..1.
 *
 * Linear to 2%, which is where the bar is full: beyond that the exact length
 * stops being informative and the colour is doing the talking.
 */
export function impactBarFraction(impact: number | null): number {
  if (impact === null || !Number.isFinite(impact)) return 0
  return Math.min(1, Math.max(0, Math.abs(impact) / 0.02))
}

/**
 * Impact measured against a reference mid, for a quote that states none.
 *
 * Positive means the fill is WORSE than mid. Both sides must be positive
 * numbers or the answer is null: a zero mid would make every quote look
 * infinitely bad, and a zero fill is not a fill.
 */
export function impactVsMid(
  executionPrice: number | null,
  midPrice: number | null,
): number | null {
  if (executionPrice === null || midPrice === null) return null
  if (!(executionPrice > 0) || !(midPrice > 0)) return null
  return (midPrice - executionPrice) / midPrice
}

/**
 * `0x1234abcd…9876` — an address short enough for a tape row and still
 * checkable against a block explorer.
 *
 * Both ends are kept because that is how addresses are actually compared by
 * eye; a leading-only truncation makes every address from the same deployer
 * look identical.
 */
export function truncateAddress(
  address: string | null,
  lead = 6,
  tail = 4,
): string {
  if (!address) return ''
  if (address.length <= lead + tail + 1) return address
  return `${address.slice(0, lead)}…${address.slice(-tail)}`
}

/**
 * Buy share of a pool's flow, 0..1, from whichever pair of figures exists.
 *
 * Notionals first (what moved), counts second (how often), because a hundred
 * dust buys against one large sell is a pool being sold into, and the count
 * split alone would draw it as overwhelming demand.
 */
export function buyShare(
  buyValue: number | null,
  sellValue: number | null,
): number | null {
  if (buyValue === null || sellValue === null) return null
  const total = buyValue + sellValue
  if (!(total > 0)) return null
  return buyValue / total
}

/**
 * A USD size converted into units of the pair's quote leg.
 *
 * The impact tiers are asked for in dollars ("what does $10k cost me here")
 * but a quote is priced in the token being spent, and the quote leg is a
 * USD stable only most of the time. Null when the quote's USD price is
 * unknown, which is what collapses the tier grid instead of quoting a size
 * nobody asked for.
 */
export function usdToQuoteUnits(
  usd: number,
  quotePriceUsd: number | null,
): number | null {
  if (!(usd > 0)) return null
  if (quotePriceUsd === null || !(quotePriceUsd > 0)) return null
  return usd / quotePriceUsd
}

/**
 * Rank pools by turnover, then by volume for the ones with no liquidity
 * figure at all.
 *
 * Sorting happens on data refresh rather than per tick, and the comparator is
 * total so row identity stays stable between refreshes with equal keys.
 */
export function comparePoolsByTurnover(
  a: { volume24hUsd: number | null; reserveUsd: number | null },
  b: { volume24hUsd: number | null; reserveUsd: number | null },
): number {
  const ratioA = volumeToTvl(a.volume24hUsd, a.reserveUsd)
  const ratioB = volumeToTvl(b.volume24hUsd, b.reserveUsd)
  if (ratioA !== null && ratioB !== null && ratioA !== ratioB)
    return ratioB - ratioA
  if (ratioA !== null && ratioB === null) return -1
  if (ratioA === null && ratioB !== null) return 1
  return (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0)
}

/**
 * Net flow per interval, derived from the swaps themselves.
 *
 * There is no liquidity-flow endpoint on either provider, so this is buys
 * minus sells in USD over each bucket of the trade feed — real money that
 * crossed the pool, not a modelled reserve delta. The bars are labelled as
 * net taker flow for exactly that reason: liquidity ADDED by an LP never
 * appears in a swap feed and is not in these numbers.
 */
export type FlowBucket = {
  /** Bucket start, epoch ms. */
  ts: number
  buyUsd: number
  sellUsd: number
  netUsd: number
}

export function bucketNetFlow(
  trades: Array<{ ts: number; side: 'buy' | 'sell'; amountUsd: number }>,
  bucketMs: number,
  bucketCount: number,
  now: number,
): Array<FlowBucket> {
  if (bucketMs <= 0 || bucketCount <= 0) return []
  // Anchored to the CURRENT bucket rather than to the newest print: a pool
  // that has not traded for ten minutes should show empty recent bars, not a
  // window that quietly slides back to whenever it last did.
  const latestStart = Math.floor(now / bucketMs) * bucketMs
  const buckets: Array<FlowBucket> = []
  for (let i = bucketCount - 1; i >= 0; i--) {
    buckets.push({
      ts: latestStart - i * bucketMs,
      buyUsd: 0,
      sellUsd: 0,
      netUsd: 0,
    })
  }
  const firstTs = buckets[0].ts
  for (const trade of trades) {
    if (!Number.isFinite(trade.amountUsd)) continue
    const index = Math.floor((trade.ts - firstTs) / bucketMs)
    const bucket = buckets[index]
    if (!bucket) continue
    if (trade.side === 'buy') bucket.buyUsd += trade.amountUsd
    else bucket.sellUsd += trade.amountUsd
    bucket.netUsd = bucket.buyUsd - bucket.sellUsd
  }
  return buckets
}

/** Largest absolute net in a bucket set, for scaling the bars. */
export function peakAbsNet(buckets: Array<FlowBucket>): number {
  let peak = 0
  for (const bucket of buckets) {
    const magnitude = Math.abs(bucket.netUsd)
    if (magnitude > peak) peak = magnitude
  }
  return peak
}
