// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The arithmetic behind a perpetual-futures ticket, as pure functions.
 *
 * Both shells render this: the desk's `trade-entry-panel.tsx` and the phone's
 * `mobile/panels/trade-panel.tsx`. It lives OUTSIDE `src/mobile/` for the
 * reason every shared helper does — the mobile tree is a one-way dependency,
 * so a number both tickets show cannot be owned by the one that is separable.
 *
 * Nothing here talks to a venue. A perp ticket has three figures the spot one
 * does not (what the contracts are worth in the base asset, what the order is
 * worth at all, and where the position would be liquidated), and each of them
 * is a place two implementations would have drifted.
 */

/**
 * Maintenance-margin rate the liquidation estimate assumes.
 *
 * 0.5% is the low tier on Binance USD-M, KuCoin and Kraken alike for the
 * majors, and the tiers only ever go UP with position size — so the estimate
 * this produces is the optimistic end of the range, which is why every surface
 * that renders it labels it an estimate. Module-private: no venue publishes a
 * tier to this layer, and a parameter no caller ever varied read as though one
 * did.
 */
const MAINTENANCE_MARGIN_RATE = 0.005

/** Base-asset amount a contract count represents. */
export function contractsToBase(
  contracts: number,
  contractSize: number,
): number {
  if (!Number.isFinite(contracts) || !Number.isFinite(contractSize)) return 0
  return contracts * contractSize
}

/**
 * Order notional in the settle currency: contracts × contract size × price.
 *
 * Null rather than zero when there is no usable price. A ticket that showed
 * "0" would read as a free order; a dash reads as "not priced yet", which is
 * what it is.
 */
export function perpNotional(input: {
  contracts: number
  contractSize: number
  price: number | null
}): number | null {
  const { contracts, contractSize, price } = input
  if (!(contracts > 0) || !(contractSize > 0)) return null
  if (price == null || !(price > 0)) return null
  return contracts * contractSize * price
}

/**
 * Estimated liquidation price for an ISOLATED linear perpetual opened here.
 *
 * long  ≈ entry × (1 − 1/leverage + mmr)
 * short ≈ entry × (1 + 1/leverage − mmr)
 *
 * Deliberately an estimate, and every caller says so on screen. The real
 * number depends on the account's whole cross-margin balance, the venue's
 * maintenance tier for the position's size, unrealised PnL on other positions,
 * and funding paid since entry — none of which a ticket has before the order
 * exists. What this IS good for is the thing a trader needs at 25x: an
 * order-of-magnitude sense of how close the liquidation sits to the price on
 * the chart, computed the same way on both shells.
 *
 * Null at 1x, on BOTH sides. An unleveraged position posts its full notional
 * as margin, so there is no margin border to draw: the formula's long answer
 * at 1x is entry × mmr, which for BTC at $60k is $300 — a plausible-looking
 * price the ticket rendered in red. The short answer at 1x (entry × 1.995) is
 * arithmetically defensible and equally meaningless, since nothing is
 * borrowed. Both are a dash instead.
 *
 * Also null without a usable entry price.
 */
export function estimateLiquidationPrice(input: {
  entryPrice: number | null
  leverage: number
  side: 'buy' | 'sell'
}): number | null {
  const { entryPrice, leverage, side } = input
  if (entryPrice == null || !(entryPrice > 0)) return null
  if (!(leverage > 1)) return null
  const factor =
    side === 'buy'
      ? 1 - 1 / leverage + MAINTENANCE_MARGIN_RATE
      : 1 + 1 / leverage - MAINTENANCE_MARGIN_RATE
  if (!(factor > 0)) return null
  return entryPrice * factor
}

/**
 * The leverage presets a ticket offers, clamped to what the venue allows.
 *
 * Always ends at the venue's own maximum even when that is not a round number
 * (Kraken tops out at 50 on some contracts, 5 on others), because the top of
 * the row is the answer to "how far can this go" and a row that stopped at 25
 * under a 50x cap would be lying by omission. Always starts at 1: unleveraged
 * is a position too.
 */
export function leveragePresets(maxLeverage: number): Array<number> {
  const max = Math.max(1, Math.floor(maxLeverage))
  const presets = [1, 2, 5, 10, 25, 50, 100].filter((p) => p < max)
  return [...presets, max]
}

/** Clamp a chosen leverage into 1..max, for a venue switch mid-ticket. */
export function clampLeverage(leverage: number, maxLeverage: number): number {
  const max = Math.max(1, Math.floor(maxLeverage))
  if (!Number.isFinite(leverage)) return 1
  return Math.min(max, Math.max(1, Math.floor(leverage)))
}
