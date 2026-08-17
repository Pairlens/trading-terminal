// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The whole market in five numbers, derived from the top-coins snapshot the
 * discovery board already fetches.
 *
 * Nothing here calls anything. That matters because the headline strip is the
 * first thing on the spot board and every figure on it is a claim: a total
 * capitalisation that drifts from the sum of its rows, or a breadth count that
 * disagrees with the movers table under it, is the kind of error nobody
 * reports and everybody stops trusting the board over.
 *
 * The 24h capitalisation change is the one figure that is not a plain sum.
 * Averaging the per-coin percentages would let a $4M meme coin count as much
 * as Bitcoin, so yesterday's capitalisation is reconstructed coin by coin
 * (`cap / (1 + pct)`) and the change is measured between the two totals — a
 * capitalisation-weighted move, which is what "the market is up 1.2%" means.
 */
import type { TopCoin } from '@pairlens/shared/instrument-types'

export type MarketPulse = {
  /** Sum of every coin's capitalisation in the snapshot. */
  totalCap: number
  /**
   * Capitalisation-weighted 24h move in percent, over the coins whose change
   * is usable. Null when none are: no figure beats a wrong one.
   */
  capChange24hPct: number | null
  /** Sum of every coin's 24h volume. */
  totalVolume24h: number
  /** Bitcoin's share of `totalCap`, in percent. Null without a BTC row. */
  btcDominancePct: number | null
  /** How the day's moves split. Flat coins count as neither. */
  advancing: number
  declining: number
  /** Coins that carried a 24h change at all — the breadth denominator. */
  breadthCount: number
}

const isFinitePositive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/**
 * A percentage that can be inverted back to yesterday. −100% or worse would
 * put yesterday's capitalisation at zero or below, which is not a market move
 * but a bad row, and one of them would take the whole total with it.
 */
const isInvertible = (pct: number): boolean => pct > -100

export function summarizeMarket(coins: Iterable<TopCoin>): MarketPulse {
  let totalCap = 0
  let totalVolume24h = 0
  let btcCap = 0
  let hasBtc = false
  // The weighted change is measured over the coins that contributed to BOTH
  // sides of it, so a coin missing a usable percentage never lands in one
  // total and not the other.
  let weightedCap = 0
  let weightedPrevCap = 0
  let advancing = 0
  let declining = 0
  let breadthCount = 0

  for (const coin of coins) {
    const cap = isFinitePositive(coin.marketCap) ? coin.marketCap : 0
    totalCap += cap
    if (isFinitePositive(coin.volume24h)) totalVolume24h += coin.volume24h
    if (coin.symbol.toUpperCase() === 'BTC' && cap > 0) {
      btcCap = cap
      hasBtc = true
    }

    const pct = coin.percentChange24h
    if (!isFiniteNumber(pct)) continue
    breadthCount++
    if (pct > 0) advancing++
    else if (pct < 0) declining++

    if (cap > 0 && isInvertible(pct)) {
      weightedCap += cap
      weightedPrevCap += cap / (1 + pct / 100)
    }
  }

  return {
    totalCap,
    capChange24hPct:
      weightedPrevCap > 0
        ? ((weightedCap - weightedPrevCap) / weightedPrevCap) * 100
        : null,
    totalVolume24h,
    btcDominancePct: hasBtc && totalCap > 0 ? (btcCap / totalCap) * 100 : null,
    advancing,
    declining,
    breadthCount,
  }
}
