// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The same asset, addressed as another asset class.
 *
 * Exactly two classes share an identity. A spot pair and a linear perpetual
 * are both `BASE-QUOTE`; the perp carries a third leg naming what the contract
 * settles in, which on every venue the terminal ships repeats the quote. That
 * leg is not decoration (`splitPairAssets` in `@/lib/pairs` owns the rule, and
 * the position ledger depends on it), but it is derivable, and derivable is
 * what makes "put this chart on Binance Futures" a question with an answer.
 *
 * Every other pairing returns null, and null is the answer rather than a gap
 * to fill in later:
 *
 * - A stock is a bare ticker. There is no quote leg for a contract to settle
 *   in, and no venue lists a perpetual on one.
 * - A token, a memecoin, a collection and a prediction outcome are all
 *   venue-bound (`isVenueBoundClass`): the chain or the venue is part of what
 *   the address names. Re-pointing one at another venue does not re-price the
 *   asset, it names a different asset, and usually nothing at all.
 *
 * Callers navigate on a string and refuse on null. Nothing here guesses.
 */
import {
  isVenueBoundClass,
  normalizeInstrumentId,
} from '@pairlens/shared/market-ref'
import type { InstrumentClass } from '@pairlens/shared/market-ref'

/**
 * `('BTC-USDT', 'spot', 'perp')` → `'BTC-USDT-USDT'`, and back the other way.
 * Null when the two classes do not name one asset.
 */
export function sameAssetInClass(
  id: string,
  from: InstrumentClass,
  to: InstrumentClass,
): string | null {
  if (from === to) return id
  if (isVenueBoundClass(from) || isVenueBoundClass(to)) return null
  if (from !== 'spot' && from !== 'perp') return null
  if (to !== 'spot' && to !== 'perp') return null

  const segments = normalizeInstrumentId(from, id).split('-').filter(Boolean)
  const [base, quote] = segments

  // Two segments exactly on the way up: a bare ticker is an equity, and a
  // third segment is a settle leg this key already has.
  if (from === 'spot') {
    return segments.length === 2 && base && quote
      ? `${base}-${quote}-${quote}`
      : null
  }

  // And on the way down, drop it. Kraken's dollar-settled `BTC-USD-USD`
  // becomes `BTC-USD`, which is the spot pair its price tracks.
  return segments.length === 3 && base && quote ? `${base}-${quote}` : null
}
