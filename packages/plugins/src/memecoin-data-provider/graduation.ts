// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How far up the bonding curve a token is, when nobody will tell us directly.
 *
 * The primary feed publishes `bondingCurve` outright, computed by the venue
 * that runs the curve, and when it answers none of this code runs. This module
 * is the reconstruction for the fallback path, and it exists because a
 * Graduating column without a percentage is just a list.
 *
 * ## The curve is not linear, and assuming it was is the trap
 *
 * The obvious reconstruction is `marketCap / graduationMarketCap`. It is
 * wrong, and measurably so: against the venue's own figures the implied
 * graduation market cap drifts from 156 SOL at 63% completion to 328 SOL at
 * 94%, because a launchpad curve is constant-product and market cap grows
 * superlinearly as the token side drains.
 *
 * So invert the actual curve. With virtual reserves `X * Y = k`, price is
 * `X / Y` and market cap is proportional to `1 / Y^2`, so for a curve that
 * starts at `Y` tokens and sells `T` of them:
 *
 *     mcap(x) = mcapTarget * ((Y - T) / (Y - x*T))^2
 *
 * which inverts to
 *
 *     x = (Y - (Y - T) / sqrt(mcap / mcapTarget)) / T
 *
 * Measured against 55 live pump.fun tokens carrying the venue's own
 * percentage, that reconstruction lands within a median of 0.25 percentage
 * points. The naive ratio was off by twenty at the low end.
 *
 * ## Why the target is denominated in SOL
 *
 * A curve completes when a fixed amount of SOL has been paid into it, so the
 * market cap at graduation is a fixed number of SOL and a MOVING number of
 * dollars. The figure everyone quotes for pump.fun, "$69k", was measured when
 * SOL was around $224. A hardcoded dollar threshold would be right on the day
 * it was written and quietly wrong forever after.
 *
 * The number below was fitted, not looked up: 413 SOL is the median implied
 * target across those 55 samples at SOL $94.03, which reproduces the quoted
 * $69k at SOL $167 and the $92k people quoted at SOL $224. Note it is
 * deliberately NOT the market cap you see on a token that just graduated —
 * those print $28k to $32k, because the price dumps between the last curve
 * buy and the migration, and reading the threshold off a post-graduation print
 * is how this constant came out a quarter too low on the first pass.
 */

/** Virtual token reserve a pump.fun curve starts with. */
const CURVE_INITIAL_TOKENS = 1_073_000_000
/** Tokens the curve sells before it completes. */
const CURVE_TOKENS_FOR_SALE = 793_100_000
/** What is left on the curve at completion. */
const CURVE_FINAL_TOKENS = CURVE_INITIAL_TOKENS - CURVE_TOKENS_FOR_SALE

/**
 * Market cap in SOL at which each launchpad's curve completes.
 *
 * Add a launchpad here only with a measurement behind it. An invented number
 * produces a confident progress bar pointing at nothing, which is worse than
 * the honest null an unlisted launchpad gets.
 */
export const GRADUATION_MCAP_SOL: Readonly<Record<string, number>> = {
  'pump.fun': 413,
  // letsbonk.fun runs the same curve shape and graduates within a few percent
  // of the same figure. Listed separately so a divergence can be corrected
  // without touching the other.
  'letsbonk.fun': 413,
}

/**
 * The share of the curve a token has climbed, 0..1, or null when we cannot
 * say.
 *
 * Clamped at both ends. A token can sit fractionally over the line between its
 * last curve trade and the migration transaction, and a 104% bar reads as a
 * bug; tokens on a curve variant we have not fitted can come out negative, and
 * the honest floor for those is zero rather than a minus sign.
 */
export function curveProgressOf(params: {
  launchpad: string | null
  marketCapUsd: number | null
  solPriceUsd: number | null
  /** Present once the curve completed. A graduated token is done, not 99%. */
  graduatedAt: string | null
}): number | null {
  const { launchpad, marketCapUsd, solPriceUsd, graduatedAt } = params
  if (graduatedAt) return 1
  if (!launchpad || !marketCapUsd || !solPriceUsd) return null
  if (!(marketCapUsd > 0)) return null
  const targetUsd = graduationTargetUsd(launchpad, solPriceUsd)
  if (targetUsd === null || !(targetUsd > 0)) return null

  const ratio = Math.sqrt(marketCapUsd / targetUsd)
  if (!(ratio > 0)) return null
  const remaining = CURVE_FINAL_TOKENS / ratio
  const sold = CURVE_INITIAL_TOKENS - remaining
  return Math.max(0, Math.min(1, sold / CURVE_TOKENS_FOR_SALE))
}

/**
 * The graduation market cap in dollars right now, for the line a progress bar
 * is measured against. Null when the launchpad is unknown, same rule as above.
 */
export function graduationTargetUsd(
  launchpad: string | null,
  solPriceUsd: number | null,
): number | null {
  if (!launchpad || !solPriceUsd) return null
  const targetSol = GRADUATION_MCAP_SOL[launchpad]
  return targetSol ? targetSol * solPriceUsd : null
}

/**
 * The band that counts as "graduating".
 *
 * The floor exists because the column is a watchlist, not a census: a token at
 * 8% of its curve is a New token, and putting it here would bury the handful
 * that are genuinely about to migrate under several hundred that are not.
 */
export const GRADUATING_FLOOR = 0.35

/** Whether a token belongs in the Graduating column. */
export function isGraduating(progress: number | null): boolean {
  return progress !== null && progress >= GRADUATING_FLOOR && progress < 1
}

/**
 * Market cap in dollars a token must clear to count as Legendary.
 *
 * A round number, and a deliberately high one. The column is for the handful
 * of memecoins that outlived their cycle and trade like majors, so the bar
 * sits where "this has been around a while" stops being a guess. Denominated
 * in dollars rather than SOL because these are cross-chain: PEPE and SHIB have
 * nothing to do with Solana.
 */
export const LEGENDARY_MCAP_FLOOR_USD = 100_000_000

/**
 * How recently a token must have been minted to count as New.
 *
 * Six hours rather than one. A one-hour window empties out overnight in
 * quieter markets and leaves the column reading as broken, and a token minted
 * four hours ago that has not graduated is still, to a memecoin trader, new.
 */
export const NEW_MAX_AGE_MS = 6 * 60 * 60 * 1000

/**
 * How recently a token must have graduated to stay in the Graduated column.
 *
 * A week. Past that it is not a graduation any more, it is just a token, and
 * the ones worth keeping have moved to Legendary on their own.
 */
export const GRADUATED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Milliseconds since an ISO timestamp, or null if it is missing or unparsable. */
export function ageMsOf(iso: string | null, now: number): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? now - ms : null
}
