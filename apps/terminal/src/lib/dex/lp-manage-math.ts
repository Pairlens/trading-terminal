// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the manage pane has to work out before it can show a confirmation: how
 * much a removal pays, and how much of the second token an addition needs.
 *
 * Everything here is stated in the POOL's own token order, `token0` and
 * `token1` as the position stores them, because those are the position
 * manager's own argument names. The pane beside this one orients a position to
 * the pair on screen, which is right for reading a range and wrong for a
 * confirmation: a card that says "3,000 USDC" while the transaction's
 * `amount0Desired` is WETH is a card nobody can check.
 *
 * The ADD ratio is the interesting one. A concentrated position only accepts
 * new liquidity in the proportion the current price implies, so typing one
 * amount fixes the other:
 *
 *   amount1 / amount0 = (√P − √Pa) · √P · √Pb / (√Pb − √P)
 *
 * which is the amount pair from the v3 whitepaper divided through by L. It is
 * evaluated on the DECIMAL-CORRECTED prices the position row already carries,
 * and that is exact rather than convenient: substituting p·k for every price
 * scales the numerator by k^(3/2) and the denominator by k^(1/2), so the ratio
 * comes out scaled by exactly k = 10^(dec0 − dec1) — which is the correction
 * from a raw ratio to a human one. No decimals needed, and no second place for
 * them to be applied twice.
 *
 * Out of range the position is one-sided: below the band it is all token0,
 * above it all token1, and the disabled input says so rather than accepting a
 * number the manager would ignore.
 */
import type { LpPositionEntry } from '@/lib/dex/lp-types'

/** Removal presets, the four every LP interface offers. */
export const REMOVE_PERCENT_PRESETS = [25, 50, 75, 100] as const

/** Slippage presets in bps, the same ladder the swap ticket uses. */
export const LP_SLIPPAGE_PRESETS_BPS = [10, 50, 100, 300] as const

/** Default tolerance, matching the connector's own. */
export const LP_DEFAULT_SLIPPAGE_BPS = 50

/** A whole percentage in 1..100, which is all the connector accepts. */
export function clampRemovePercent(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(100, Math.max(1, Math.round(value)))
}

export type RemovalPreview = {
  /** Tokens the burn returns, in human units. Null when the pool is unread. */
  amount0: number | null
  amount1: number | null
  /**
   * Fees the same transaction sweeps. NOT scaled by the percentage: the
   * multicall's `collect` leg takes everything the position owes, so a 25%
   * removal still pays out 100% of the fees. Showing a quarter of them would
   * understate the payout and read as a bug the first time somebody checked.
   */
  fees0: number | null
  fees1: number | null
}

/** What a removal of `pct` percent of the position pays out. */
export function removalPreview(
  entry: Pick<LpPositionEntry, 'amount0' | 'amount1' | 'fees0' | 'fees1'>,
  pct: number,
): RemovalPreview {
  const share = clampRemovePercent(pct) / 100
  return {
    amount0: entry.amount0 === null ? null : entry.amount0 * share,
    amount1: entry.amount1 === null ? null : entry.amount1 * share,
    fees0: entry.fees0,
    fees1: entry.fees1,
  }
}

/**
 * The floor a tolerance puts under an amount, for the confirmation card.
 *
 * The pane's own arithmetic on the last position read; the connector derives
 * the minimums it actually signs from fresh chain state. Both apply the same
 * haircut to the same quantity, so this is the number the user is agreeing to
 * within one refresh of pool drift, which is what the card says out loud.
 */
export function minAfterSlippage(
  amount: number | null,
  slippageBps: number,
): number | null {
  if (amount === null || !Number.isFinite(amount)) return null
  const bps = Math.min(Math.max(slippageBps, 0), 10_000)
  return amount * (1 - bps / 10_000)
}

export type DepositShape =
  /** In range: both tokens, `ratio` token1 per token0. */
  | { kind: 'both'; ratio: number }
  /** Price below the band: the position takes token0 only. */
  | { kind: 'token0' }
  /** Price above the band: token1 only. */
  | { kind: 'token1' }
  /** The pool did not answer, so which side is undeterminable. */
  | { kind: 'unknown' }

/**
 * Which tokens an addition to this position has to be made of.
 *
 * Decided on the price rather than on the reported amounts: a position that
 * has been emptied still has a band and a current price, and it is still
 * one-sided or two-sided by exactly that comparison.
 */
export function depositShape(
  entry: Pick<LpPositionEntry, 'priceLower' | 'priceUpper' | 'priceCurrent'>,
): DepositShape {
  const { priceLower: lower, priceUpper: upper, priceCurrent: current } = entry
  if (lower === null || upper === null || current === null) {
    return { kind: 'unknown' }
  }
  if (!(lower > 0) || !(upper > lower) || !(current > 0)) {
    return { kind: 'unknown' }
  }
  if (current <= lower) return { kind: 'token0' }
  if (current >= upper) return { kind: 'token1' }

  const sqrtP = Math.sqrt(current)
  const sqrtA = Math.sqrt(lower)
  const sqrtB = Math.sqrt(upper)
  const denominator = sqrtB - sqrtP
  if (!(denominator > 0)) return { kind: 'token1' }
  const ratio = ((sqrtP - sqrtA) * sqrtP * sqrtB) / denominator
  if (!Number.isFinite(ratio) || ratio <= 0) return { kind: 'unknown' }
  return { kind: 'both', ratio }
}

/**
 * The amount of the OTHER token that pairs with one the user typed.
 *
 * Null whenever the pairing is not determined: a one-sided position needs no
 * counterpart, and an unread pool has no ratio to derive one from. Null means
 * "leave the field alone", never zero.
 */
export function counterpartAmount(
  shape: DepositShape,
  side: 'token0' | 'token1',
  amount: number | null,
): number | null {
  if (shape.kind !== 'both') return null
  if (amount === null || !Number.isFinite(amount) || amount < 0) return null
  return side === 'token0' ? amount * shape.ratio : amount / shape.ratio
}

/**
 * A typed amount as a number, or null.
 *
 * Null for empty and for anything that is not a positive finite number, so a
 * half-typed `0.` never becomes a zero the confirm card would print as an
 * amount somebody is about to sign for.
 */
export function parseAmountInput(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

/**
 * The string form an amount goes to the connector in.
 *
 * Two properties, both of which bite when they are missing. Fixed notation,
 * never exponential: `1e-7` is a valid JavaScript number and not a decimal
 * string any token scaler accepts. And the fraction is TRUNCATED at the token's
 * decimals rather than rounded, matching what `scaleAmount` does on the way to
 * integer units — rounding here would send a deposit fractionally larger than
 * the one on the confirmation card.
 *
 * Amounts at or beyond 1e21 have no fixed notation in JavaScript and come back
 * as `0`, which the connector then refuses as an empty addition. No token
 * balance reaches that, and a silent exponent on the wire would be worse.
 */
export function amountToWireString(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0 || value >= 1e21) return '0'
  const places = Math.min(Math.max(Math.trunc(decimals), 0), 18)
  const [whole, fraction = ''] = value.toFixed(20).split('.')
  const cut = fraction.slice(0, places).replace(/0+$/, '')
  return cut ? `${whole}.${cut}` : whole
}

/** True when a position has fees worth a collect. */
export function hasClaimableFees(
  entry: Pick<LpPositionEntry, 'fees0' | 'fees1'>,
): boolean {
  return (entry.fees0 ?? 0) > 0 || (entry.fees1 ?? 0) > 0
}
