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
  if (!Number.isFinite(n) || n <= 0) return ''
  return String(Math.floor(n))
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
