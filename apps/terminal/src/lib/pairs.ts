// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  isTokenAddress,
  normalizeInstrumentId,
} from '@pairlens/shared/market-ref'

/**
 * Normalize a user/route-supplied pair key to the canonical BASE-QUOTE form
 * connectors expect: trimmed, uppercased, with `/` and `_` separators
 * replaced by `-` (e.g. "btc/usdt" → "BTC-USDT").
 *
 * An address base leg is the one thing that must NOT be upper-cased, and this
 * function is what every stream hook runs its pair key through. Base58 is
 * case-sensitive, so `SO111…1112` is a different (nonexistent) mint, and an
 * EVM address loses its checksum casing; downstream both stop matching
 * `isTokenAddress`, which is the test a DEX resolver uses to decide between
 * "look up this exact token" and "search pools by name". GeckoTerminal was
 * being asked `search/pools?query=0XDAC17F958D2EE523…%20USDC`, so a token
 * opened by address was charted from whatever pool a text search turned up.
 *
 * The per-class rule already exists and is shared with the routing layer, so
 * this defers to it rather than keeping a second copy that can drift. Only the
 * address arm changes: every other key normalizes exactly as before.
 */
export function normalizePairKey(pairKey: string): string {
  const dashed = pairKey.trim().replace(/[/_]/g, '-')
  const at = dashed.lastIndexOf('-')
  const base = at === -1 ? dashed : dashed.slice(0, at)
  if (isTokenAddress(base)) return normalizeInstrumentId('dex', dashed)
  return dashed.toUpperCase()
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
