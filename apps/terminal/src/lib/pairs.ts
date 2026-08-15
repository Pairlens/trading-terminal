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
 * A perpetual future adds a THIRD segment, the settle currency
 * ('BTC-USDT-USDT', 'BTC-USD-USD'), which is what the position and margin are
 * denominated in. The settle leg is the discriminator for the whole perp
 * surface: it is what tells the risk guard to price a contract count rather
 * than a base amount, and it is what keeps a perp fill out of the spot
 * position ledger's 'BTC-USDT' slot, since that ledger is keyed by pair alone.
 *
 * Segment count alone is NOT that discriminator. Prediction outcome keys are
 * dash-joined too — a Kalshi ticker is 'KXBTCD-26AUG15-T53', its NO side has
 * four segments — and treating any third segment as a settle leg routed those
 * onto futures venues. Every v1 futures venue lists linear contracts, where
 * the settle currency IS the quote currency, so a settle leg is emitted only
 * when the third segment repeats the second. Inverse contracts
 * ('BTC-USD-BTC') are out of scope until a venue ships them; when one does,
 * this test must learn their shape rather than loosen back to "any third
 * segment".
 *
 * `equity` should come from the connector's declared asset classes rather than
 * a venue allowlist, so a second stock broker behaves correctly for free.
 */
export function splitPairAssets(
  pairKey: string,
  opts?: { equity?: boolean },
): { base: string; quote: string; settle?: string } {
  const parts = pairKey.split('-')
  const [base, quote] = parts
  const settle = parts.length === 3 && parts[2] === quote ? parts[2] : undefined
  return {
    base: base || pairKey,
    quote: quote || (opts?.equity ? 'USD' : 'USDT'),
    ...(settle ? { settle } : {}),
  }
}

/**
 * True when a pair key names a perpetual future (BASE-QUOTE-SETTLE).
 *
 * The connectors mint these keys from ccxt's `BASE/QUOTE:SETTLE` symbols, so
 * a genuine perp key always carries the settle leg — and on the linear
 * contracts every v1 venue lists, that leg repeats the quote. The repeat is
 * what `splitPairAssets` tests, and it is what keeps prediction outcome keys
 * (also dash-joined, 'KXBTCD-26AUG15-T53') from reading as contracts. Callers
 * routing on this should still let a prediction-directory pin win first: a
 * registered outcome names its one venue explicitly, and explicit beats
 * inferred.
 */
export function isPerpPairKey(pairKey: string): boolean {
  return Boolean(splitPairAssets(normalizePairKey(pairKey)).settle)
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
  const normalized = normalizePairKey(pairKey)
  const { quote, settle } = splitPairAssets(normalized)
  if (!normalized.includes('-')) return undefined
  // A settle leg (third segment repeating the quote — see splitPairAssets) is
  // unambiguous where the two-segment case is not: 'BTC-USD-USD' can be
  // answered confidently even though 'BTC-USD' cannot. A dash-joined key
  // whose third segment does NOT repeat the quote is a prediction outcome's
  // shape, and stays undefined rather than guessing.
  if (settle) return 'crypto-perp'
  const parts = normalized.split('-')
  if (parts.length !== 2) return undefined
  return quote === 'USD' ? undefined : 'crypto-spot'
}
