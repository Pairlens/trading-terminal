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
 * The map's liquidity bar. Locked reserves are the one figure a wash bot
 * cannot fake cheaply, so the tile SET is chosen by them; the sizing metric
 * only ranks pools that already cleared the bar.
 */
export const MIN_MAPPABLE_RESERVE_USD = 10_000

/**
 * The map's wash ceiling, in daily turns of the pool's own liquidity.
 *
 * Calibrated at 50 to begin with, on the assumption that a pool turning over
 * more than fifty times a day had to be a bot painting volume. That holds for
 * a constant-product pool and is simply wrong for a concentrated one, where
 * `reserve_in_usd` is the value sitting in the active range rather than the
 * whole book — a tight range around a stable price services enormous volume on
 * very little capital, which is the entire point of the design.
 *
 * Measured against a live volume ranking rather than argued: Ethereum's top
 * twenty pools all sit under 6 turns and are unaffected by any ceiling in this
 * range. Solana's are not — Orca's own SOL/USDC runs 63, and the tokenized
 * equity pools that carry most of the chain's volume (NVDA, TSLA, HOOD against
 * SOL) run 150 to 370 on real, deep, actively rebalanced ranges. At 50 the
 * busiest chain on the board drew exactly one tile, which is not a quality bar
 * doing its job, it is a quality bar answering a different question than the
 * one the map asks.
 *
 * So the ceiling is where the impossible starts rather than where the unusual
 * does. What it still catches is the shape it was built for: a listing whose
 * volume implies thousands of turns against a reserve barely over the floor.
 * Everything it excludes remains one click away in the full listing.
 */
export const MAX_MAPPABLE_TURNOVER = 500

/**
 * Whether a pool earns a place on the map.
 *
 * The pool map's quality bar, and the auto-select's too. Sizing a treemap over
 * a listing straight from the provider put a six-figure-liquidity pool with a
 * wash-traded volume figure on the largest tile, above pools a thousand times
 * its size, because nothing upstream distinguishes a market from a deployment
 * with a bot pointed at it. Two rules, both about what cannot be faked: the
 * pool must hold real published liquidity, and its claimed volume must be in
 * sane proportion to it. A pool that never published a reserve fails both,
 * since without one there is no way to tell which kind it is. Everything the
 * bar excludes is still in the full listing behind the footer strip.
 */
export function isRankablePool(pool: {
  reserveUsd: number | null
  volume24hUsd: number | null
}): boolean {
  if (pool.reserveUsd === null || pool.reserveUsd < MIN_MAPPABLE_RESERVE_USD) {
    return false
  }
  const turnover = volumeToTvl(pool.volume24hUsd, pool.reserveUsd)
  return turnover === null || turnover <= MAX_MAPPABLE_TURNOVER
}

/** The metrics a pool tile can be sized by. */
export type PoolTileMode = 'volume' | 'liquidity' | 'trades' | 'turnover'

/**
 * Tile area for a pool under the active mode.
 *
 * Zero for anything the mode cannot measure, which is what keeps a pool with
 * no trade count from claiming area on the trades map. Callers drop the zeroes
 * before handing the set to the treemap: a zero-area tile is invisible but
 * still costs the layout a slot.
 */
export function tileSizeFor(
  pool: {
    volume24hUsd: number | null
    reserveUsd: number | null
    trades24h?: { buys: number; sells: number } | null
  },
  mode: PoolTileMode,
): number {
  switch (mode) {
    case 'volume':
      return positiveOrZero(pool.volume24hUsd)
    case 'liquidity':
      return positiveOrZero(measurableReserveUsd(pool.reserveUsd))
    case 'trades': {
      const counts = pool.trades24h
      if (!counts) return 0
      return positiveOrZero(counts.buys + counts.sells)
    }
    case 'turnover':
      return positiveOrZero(volumeToTvl(pool.volume24hUsd, pool.reserveUsd))
  }
}

function positiveOrZero(value: number | null): number {
  if (value === null || !Number.isFinite(value) || value <= 0) return 0
  return value
}

/** The design's tint band: nothing flatter than 8%, nothing louder than 34%. */
const TINT_MIN = 8
const TINT_MAX = 34
/** Where the ramp saturates. A 15% day is already a very loud tile. */
const TINT_FULL_PCT = 15

/**
 * How strongly a tile is tinted by its 24h move, as a `color-mix` percentage.
 *
 * Monotonic in the absolute move and compressive rather than linear: most
 * pools on a normal day sit inside a couple of percent, and a linear ramp
 * would paint that whole population the same flat floor colour while reserving
 * the readable end of the band for the two rows that already stand out by
 * size. The square root spends the band where the pools are.
 *
 * Zero for a pool with no published move, which the caller draws untinted. A
 * floor tint there would be a claim that the pool was flat.
 */
export function moveTintAlpha(changePct: number | null): number {
  if (changePct === null || !Number.isFinite(changePct)) return 0
  const magnitude = Math.min(Math.abs(changePct), TINT_FULL_PCT)
  const ramp = Math.sqrt(magnitude / TINT_FULL_PCT)
  return TINT_MIN + (TINT_MAX - TINT_MIN) * ramp
}

/**
 * What a pool tile says at a given size.
 *
 * The progressive-disclosure rule, kept out of the component so the thresholds
 * can be checked rather than eyeballed at one window width. Three shapes: a
 * large tile carries the pair, its venue and liquidity, and the move; a wide
 * short tile puts the pair and the move on one line because there is no room
 * to stack them; a small tile keeps the pair and the move and drops the rest.
 *
 * The title is the pool's own name and the KEY is its address (see
 * `poolTileKey`) — a chain's map routinely lists two pools whose base tokens
 * share a ticker, and they have to render as two tiles that both say PYTH.
 */
export type PoolTileLines = {
  title: string
  subtitle: string | null
  value: string | null
  tone: 'up' | 'down' | 'muted'
  layout: 'stack' | 'row'
}

/** Below this a tile gets the pair and the move, and nothing else. */
const TILE_SUBTITLE_MIN_H = 74
const TILE_SUBTITLE_MIN_W = 104
/** Short and wide: stacking three lines here would clip all three. */
const TILE_ROW_MAX_H = 52

export function poolTileLines(
  pool: {
    name: string
    dexName: string
    change24hPct: number | null
    reserveUsd: number | null
  },
  width: number,
  height: number,
  formatUsd: (value: number) => string,
): PoolTileLines {
  const change = pool.change24hPct
  const tone = change === null ? 'muted' : change >= 0 ? 'up' : 'down'
  const value =
    change === null ? null : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`

  const layout = height <= TILE_ROW_MAX_H ? 'row' : 'stack'
  const roomForSubtitle =
    layout === 'stack' &&
    height >= TILE_SUBTITLE_MIN_H &&
    width >= TILE_SUBTITLE_MIN_W

  const reserve = measurableReserveUsd(pool.reserveUsd)
  const venue = titleCaseVenue(pool.dexName)
  const subtitle = !roomForSubtitle
    ? null
    : reserve !== null
      ? venue
        ? `${venue} · ${formatUsd(reserve)}`
        : formatUsd(reserve)
      : (venue ?? null)

  return { title: pool.name, subtitle, value, tone, layout }
}

/**
 * A tile's identity: the chain and the pool address, never the ticker.
 *
 * The whole reason the map keys on this. Two pools for tokens both called PYTH
 * are two different markets, and a symbol key would collapse them into one
 * tile whose selection state flickered between them.
 */
export function poolTileKey(pool: {
  network: string
  address: string
}): string {
  return `${pool.network}:${pool.address}`
}

/**
 * `uniswap_v3` → `Uniswap V3`, `orca` → `Orca`.
 *
 * Provider dex slugs are lowercase and underscore-joined. Version segments
 * stay uppercase because `Uniswap v3` reads as a typo next to `Orca`.
 */
export function titleCaseVenue(dexName: string | null): string | null {
  if (!dexName) return null
  const words = dexName
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) =>
      /^v\d+$/i.test(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
  return words.length > 0 ? words.join(' ') : null
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

/**
 * Buy and sell notionals over a trailing window of the same swap feed.
 *
 * The detail pane's pressure bar. Deliberately derived from the trades the flow
 * pane already fetched rather than from a provider's own 1h split: the two
 * panes sit side by side on one board, and a second number for the same hour
 * that disagreed by a rounding would read as one of them being broken.
 *
 * Prints older than the window and malformed notionals are skipped rather than
 * counted as zero, which is the same rule `bucketNetFlow` follows.
 */
export function sumFlowSince(
  trades: ReadonlyArray<{
    ts: number
    side: 'buy' | 'sell'
    amountUsd: number
  }>,
  sinceTs: number,
): { buyUsd: number; sellUsd: number } {
  let buyUsd = 0
  let sellUsd = 0
  for (const trade of trades) {
    if (trade.ts < sinceTs) continue
    if (!Number.isFinite(trade.amountUsd)) continue
    if (trade.side === 'buy') buyUsd += trade.amountUsd
    else sellUsd += trade.amountUsd
  }
  return { buyUsd, sellUsd }
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
