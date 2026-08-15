// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pair keys for perpetual futures, and the ccxt symbols they map onto.
 *
 * A perp pair key is THREE segments — `BASE-QUOTE-SETTLE`, e.g. `BTC-USDT-USDT`
 * on Binance and KuCoin, `BTC-USD-USD` on Kraken. The settlement leg is not
 * decoration: the terminal's position ledger is keyed by pair alone, and a perp
 * that reported itself as `BTC-USDT` would share that slot with the spot pair
 * of the same name. Segment count is therefore the discriminator, and it has to
 * survive every hop — which is why the order and position normalizers here go
 * through `fromFuturesSymbol` rather than the spot `fromCcxtSymbol`, whose whole
 * job is to DROP the settle leg.
 *
 * The mapping is a pure segment split in both directions. It cannot reuse the
 * spot `toCcxtSymbol`, which is `replace('-', '/')` — `String.replace` with a
 * string pattern rewrites only the FIRST match, so `BTC-USDT-USDT` would come
 * out as `BTC/USDT-USDT`, a symbol no venue resolves and which fails as a
 * `BadSymbol` several layers away from the mistake.
 *
 * Nothing here persists anything. The key is derived from the venue's own
 * unified symbol every time, so a cold profile addressing a pair from a URL
 * needs no lookup table (contrast the prediction runtime, whose outcome handles
 * are opaque and must be remembered).
 */

/**
 * Canonical futures pair: uppercase, dash separated, `/` and `:` folded to
 * dashes so a ccxt symbol pasted anywhere still normalizes.
 */
export function normalizeFuturesPair(raw: string): string {
  return raw.trim().replace(/[/_:]/g, '-').toUpperCase()
}

/** Segments of a pair key: 2 = spot, 3 = perp. Empty segments are dropped. */
export function futuresPairSegments(pair: string): Array<string> {
  return normalizeFuturesPair(pair)
    .split('-')
    .filter((segment) => segment.length > 0)
}

/**
 * `'BTC-USDT-USDT'` → `'BTC/USDT:USDT'`.
 *
 * A two-segment key maps to the plain spot symbol instead of inventing a
 * settlement currency: the venue answers `BadSymbol` for a pair it does not
 * list, which is the honest outcome, whereas guessing that the quote settles
 * the contract would silently address a DIFFERENT instrument on any
 * inverse-listing venue.
 */
export function toFuturesSymbol(pair: string): string {
  const segments = futuresPairSegments(pair)
  const [base, quote, settle] = segments
  if (!base || !quote) return normalizeFuturesPair(pair)
  const spot = `${base}/${quote}`
  return settle ? `${spot}:${settle}` : spot
}

/**
 * `'BTC/USDT:USDT'` → `'BTC-USDT-USDT'`, settle leg PRESERVED.
 *
 * The inverse of `toFuturesSymbol` on everything the futures markets table
 * holds, which is exactly what makes the round trip safe to run on an order
 * update or a position row without consulting the table.
 */
export function fromFuturesSymbol(symbol: string): string {
  return normalizeFuturesPair(symbol)
}
