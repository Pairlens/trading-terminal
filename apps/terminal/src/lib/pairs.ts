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

/**
 * What the pair key alone says about the asset class, for the times the
 * instruments index says nothing.
 *
 * That index is an App Server read, so standalone, offline, or merely signed
 * out, EVERY symbol comes back unknown — and a caller that falls back to the
 * user's preferred venue then routes a crypto pair to whatever they happened
 * to be looking at. It routed 'BTC-USDT' to Alpaca exactly that way, and
 * Alpaca answered: its base leg 'BTC' is a real NYSE Arca spot-bitcoin ETF,
 * so a ~$28 equity price appeared under a crypto pair's label.
 *
 * Deliberately narrow. A quote leg that is not USD is not a US equity, and
 * that is the only call this makes. Everything else stays `undefined` rather
 * than guessing, because a wrong confident answer here is worse than none:
 * 'BTC-USD' is a real pair on both a crypto venue and (as an ETF) a stock
 * venue, and only the index can tell those apart.
 */
export function assetClassFromQuoteLeg(pairKey: string): string | undefined {
  const [, quote] = normalizePairKey(pairKey).split('-')
  if (!quote) return undefined
  return quote === 'USD' ? undefined : 'crypto-spot'
}
