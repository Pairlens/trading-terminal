// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Normalize a user/route-supplied pair key to the canonical BASE-QUOTE form
 * connectors expect: trimmed, uppercased, with `/` and `_` separators
 * replaced by `-` (e.g. "btc/usdt" → "BTC-USDT").
 */
export function normalizePairKey(pairKey: string): string {
  return pairKey.trim().toUpperCase().replace(/[/_]/g, '-')
}

/**
 * The base and quote assets of a pair key.
 *
 * Crypto keys carry both ('BTC-USDT'). A stock's key is the bare ticker
 * ('AAPL'), because that is the key shared with the App Server catalog, so its
 * quote has to come from the venue rather than the string. Getting that wrong
 * is not only a mislabelled ticket: the quote asset is also what the balance
 * lookup is keyed on, so a US equity defaulting to USDT reads "0 USDT" beside
 * an account holding dollars, and sends order presets to the wrong bucket.
 *
 * `equity` should come from the connector's declared asset classes rather than
 * a venue allowlist, so a second stock broker behaves correctly for free.
 */
export function splitPairAssets(
  pairKey: string,
  opts?: { equity?: boolean },
): { base: string; quote: string } {
  const [base, quote] = pairKey.split('-')
  return {
    base: base || pairKey,
    quote: quote || (opts?.equity ? 'USD' : 'USDT'),
  }
}
