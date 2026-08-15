// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which balance a prediction ticket calls "Available".
 *
 * A prediction pair key has no quote leg to read a balance for, and the
 * settlement currency is a venue detail the ticket has no reason to know:
 * Kalshi settles in USD, Polymarket in USDC, and a third-party connector may
 * report either — or USDT. So the rule is "whichever of these the balance
 * stream actually reported", and it lives here because the two tickets read
 * balances through different accessors and had drifted: the desktop scanned
 * three currencies, the phone hardcoded two, and a Kalshi account holding only
 * USDT showed funds on one surface and zero on the other.
 *
 * Order matters. USDC first because it is the one venue-native collateral that
 * is never also a spot balance sitting in the same account.
 */

/** Settlement currencies a prediction venue may report, most specific first. */
export const PREDICTION_COLLATERALS = ['USDC', 'USD', 'USDT'] as const

export type CollateralBalance = {
  currency: string
  /** Raw total as the balance store holds it — a string, never arithmetic. */
  total: string
}

/**
 * The collateral this account actually holds.
 *
 * Three passes, and the middle one earns its keep: a funded balance wins, but
 * an account that reported a currency with nothing in it still knows which
 * currency it settles in, so a drained Kalshi account reads "0 USD" rather
 * than "0 USDC". Only an account that has reported nothing at all falls back
 * to the first candidate.
 *
 * `read` is the caller's own accessor — a Map lookup on the desktop, a
 * `useBalance` result on the phone — which is what keeps this rule shared
 * without dragging either ticket's balance plumbing into the other.
 */
export function predictionCollateral(
  read: (currency: string) => string | undefined,
): CollateralBalance {
  let reported: CollateralBalance | null = null
  for (const currency of PREDICTION_COLLATERALS) {
    const total = read(currency)
    if (total === undefined) continue
    if (Number(total) > 0) return { currency, total }
    reported ??= { currency, total }
  }
  return reported ?? { currency: PREDICTION_COLLATERALS[0], total: '0' }
}
