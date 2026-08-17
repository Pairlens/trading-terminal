// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The prediction ticket's arithmetic, extracted so it can be tested without
 * mounting 1400 lines of desktop layout.
 *
 * The unit boundary is the whole point of this file. Both venues price in
 * PROBABILITY — 0.53 collateral units per contract — and both traders and
 * venue UIs speak CENTS. So the ticket's price fields are cents and every
 * value crossing into `placeOrder` is converted here, once, at the edge. Below
 * this line prices are dollars; above it they are cents. Nothing in between.
 *
 * Sizes are contract COUNTS and are never converted: one contract pays one
 * unit of collateral if the outcome resolves true, which is what makes
 * `contracts × price` the money at risk on a buy and `contracts × (1 − price)`
 * the money at risk on a sell.
 */
import type { PredictionDirectoryEntry } from '@/stores/prediction-directory-store'
import { normalizePairKey } from '@/lib/pairs'

/** A probability is strictly inside (0, 100) cents. Nothing else is a price. */
export const MIN_PRICE_CENTS = 0
export const MAX_PRICE_CENTS = 100

/**
 * A cents string from the ticket's price field → the dollar price the
 * connector expects, or null when the field cannot be an order.
 *
 * REJECTS out-of-range rather than clamping, and that is a safety property,
 * not tidiness. The ticket's price field is shared state: a `60000` left over
 * from a BTC-USDT draft survives the switch to a prediction outcome, and a
 * clamping converter turned it into a live buy at 99.9¢ — the worst fill the
 * venue offers — with a submit button that looked perfectly valid. Null is
 * what lets every caller refuse instead: the submit gate, the max-loss row and
 * the field's own error state all key off it.
 */
export function centsToPrice(cents: string | number): number | null {
  const n = typeof cents === 'number' ? cents : Number(cents)
  if (!Number.isFinite(n)) return null
  if (n <= MIN_PRICE_CENTS || n >= MAX_PRICE_CENTS) return null
  return n / 100
}

/** The inverse, for seeding the field from a live book. */
export function priceToCents(price: number): number {
  if (!Number.isFinite(price)) return 0
  // One decimal: Polymarket quotes tenths of a cent and a seeded field that
  // rounds them away moves the user's order before they touch it.
  return Math.round(price * 1000) / 10
}

/**
 * Contracts are whole. A stepper cannot produce a fraction, but a pasted value
 * can, and a venue rejecting `1.5` after the hold gesture is the worst place
 * to find out.
 */
export function normalizeContracts(raw: string | number): string {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return ''
  // Floored FIRST, then checked: a fraction under one contract is not "0
  // contracts", it is no order at all. Dollar-denominated sizing reaches this
  // on every keystroke below one contract's cost, and a literal '0' in the
  // size field renders as a size the venue would refuse.
  const whole = Math.floor(n)
  return whole > 0 ? String(whole) : ''
}

export type MaxLossInput = {
  contracts: number
  /** Dollar probability price (0..1), not cents. */
  price: number | null
  side: 'buy' | 'sell'
}

/**
 * Worst case in collateral units.
 *
 * A buy loses the premium: the contract resolves false and pays nothing. A
 * sell is the mirror — the seller is short a contract that can settle at 1, so
 * the exposure is what is left above the price they collected. Display only:
 * the risk guard in `market-data-provider` sizes on notional, which for a buy
 * is the same number and for a sell is the more conservative one.
 */
export function predictionMaxLoss({
  contracts,
  price,
  side,
}: MaxLossInput): number | null {
  if (!Number.isFinite(contracts) || contracts <= 0) return null
  if (price === null || !Number.isFinite(price)) return null
  const per = side === 'buy' ? price : 1 - price
  return contracts * Math.max(0, per)
}

export type FillPriceInput = {
  /** The typed limit price, already converted to dollars, or null. */
  limitPrice: number | null
  bid: number | null
  ask: number | null
  last: number | null
  side: 'buy' | 'sell'
}

/**
 * The price this ticket is sizing against — what "avg fill price" states.
 *
 * A limit order fills at the price the user typed, so it wins outright. A
 * market order crosses the spread, and on a probability book the spread is the
 * whole trade: an outcome quoted 61 bid / 68 ask is a 10% difference in how
 * many contracts a hundred dollars buys, so sizing a buy off the LAST price
 * quietly overstates the position by that much. The far touch is the honest
 * estimate, and the last trade is only the fallback for a venue that is not
 * publishing a book right now.
 *
 * Null rather than a bound when nothing usable exists: the payout card, the
 * contract count and the max-loss row all refuse together, which is what keeps
 * a stale figure from sitting next to a live confirm button.
 */
export function predictionFillPrice({
  limitPrice,
  bid,
  ask,
  last,
  side,
}: FillPriceInput): number | null {
  if (limitPrice !== null && isProbability(limitPrice)) return limitPrice
  const touch = side === 'buy' ? ask : bid
  if (touch !== null && isProbability(touch)) return touch
  return last !== null && isProbability(last) ? last : null
}

export type AmountSizingInput = {
  /** What the user typed into the amount field, in collateral units. */
  amountUsd: number
  /** Dollar probability price (0..1) the order would fill at. */
  price: number | null
  side: 'buy' | 'sell'
}

/**
 * Dollars in the field → contracts on the wire.
 *
 * Traders think in money and both venues settle in contracts, so the ticket
 * takes one and sends the other. The divisor is what the contract COSTS on
 * this side, not its price: a buy pays the premium, a sell posts the rest of
 * the dollar it may owe, and dividing a sell's stake by the price would size
 * a 95¢ outcome at twenty times the intended risk.
 *
 * Floors, via `normalizeContracts`, so the committed stake is always at or
 * under what the user typed. Rounding up would spend money they did not offer.
 */
export function contractsForAmount({
  amountUsd,
  price,
  side,
}: AmountSizingInput): string {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return ''
  if (price === null || !isProbability(price)) return ''
  const perContract = side === 'buy' ? price : 1 - price
  if (perContract <= 0) return ''
  return normalizeContracts(snapWhole(amountUsd / perContract))
}

/**
 * Binary floating point, undone.
 *
 * `1 - 0.95` is 0.05000000000000004, so $100 on a 95¢ sell divides to
 * 1999.9999… and a bare floor sizes it at 1999 — one contract missing from an
 * order the user will check against their own arithmetic. The snap is a
 * millionth of a contract wide, which no real fraction ever lands inside.
 */
function snapWhole(value: number): number {
  const nearest = Math.round(value)
  return Math.abs(value - nearest) < 1e-6 ? nearest : value
}

export type PredictionPayout = {
  /** Collateral committed: the most this order can lose. */
  stake: number
  /** Collateral returned if the order is right — one unit per contract. */
  payout: number
  profit: number
  /** Profit as a fraction of the stake. */
  roi: number
}

/**
 * What the order returns when it is right.
 *
 * One contract settles at exactly one unit of collateral, so the payout is the
 * contract count on BOTH sides — which is the reading that makes a sell
 * legible. Selling a Yes at 68¢ posts 32¢ and returns the whole dollar if the
 * outcome does not happen; quoting the 68¢ premium as the payout would state a
 * 212% return as 68%.
 *
 * The stake is `predictionMaxLoss`, deliberately: the card above the confirm
 * button and the risk row under it must never disagree about what is at risk.
 */
export function predictionPayout(input: MaxLossInput): PredictionPayout | null {
  const stake = predictionMaxLoss(input)
  if (stake === null || stake <= 0) return null
  const payout = input.contracts
  return {
    stake,
    payout,
    profit: payout - stake,
    roi: (payout - stake) / stake,
  }
}

/** A probability is strictly inside (0, 1); the bounds are not prices. */
function isProbability(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1
}

/** Kalshi's NO leg is the YES ticker with this suffix. */
const KALSHI_NO_SUFFIX = '-NO'

export type PredictionSibling = {
  pairKey: string
  /** The outcome the sibling names, for the switch's label. */
  label: string
}

/**
 * The other side of the same question, when there is exactly one.
 *
 * Directory first: it is the only thing that knows a Polymarket handle's
 * partner, and on a categorical market ("who wins?") there is no single
 * sibling, so a scan that finds several returns none rather than picking one.
 *
 * Kalshi gets a structural fallback because its keys carry the relationship —
 * `<ticker>` is YES and `<ticker>-NO` is NO — which is what lets a cold link
 * still offer the switch.
 */
export function predictionSibling(
  pairKey: string,
  market: string,
  entries: Record<string, PredictionDirectoryEntry>,
): PredictionSibling | null {
  const key = normalizePairKey(pairKey)
  const current = entries[key]

  if (current) {
    let found: PredictionSibling | null = null
    for (const [candidateKey, entry] of Object.entries(entries)) {
      if (candidateKey === key) continue
      if (entry.market !== current.market) continue
      if (entry.predictionMarketId !== current.predictionMarketId) continue
      if (entry.outcome === current.outcome) continue
      // A second match means a categorical market; no single "other side".
      if (found) return null
      found = { pairKey: candidateKey, label: entry.outcome }
    }
    if (found) return found
  }

  if ((current?.market ?? market) === 'kalshi') {
    return key.endsWith(KALSHI_NO_SUFFIX)
      ? { pairKey: key.slice(0, -KALSHI_NO_SUFFIX.length), label: 'Yes' }
      : { pairKey: `${key}${KALSHI_NO_SUFFIX}`, label: 'No' }
  }

  return null
}
