// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A stored watchlist entry, un-qualified.
 *
 * Watchlists hold QUALIFIED refs (`spot:BTC-USDT`, `prediction:polymarket:KX…`,
 * `dex:base:0xabc…-USDC`) rather than bare symbols, because a ticker is not an
 * identity: there are hundreds of tokens called PEPE and AAPL trades on more
 * than one exchange. Everything downstream of a row still wants the bare
 * symbol, though — the instruments index is keyed by it, the bulk quote map is
 * keyed by it, and `PairAvatar` letters its first three characters.
 *
 * Feeding the raw strings through drew `spospot:BTC-USDT` on every mobile
 * watchlist row (`spo` from the avatar, `spot:BTC-USDT` from the symbol) and
 * silently broke the prediction-directory lookup, which is keyed by pair key.
 * So the split happens once, here, and the row gets both halves: the symbol to
 * look things up with, and the ref to route with.
 */
import { parseInstrumentRef } from '@pairlens/shared/market-ref'
import type { InstrumentRef } from '@pairlens/shared/market-ref'

export type WatchEntry = {
  /** The raw stored string. The React key, because it is what is unique. */
  key: string
  /** Parsed ref, or null for a legacy bare symbol. */
  ref: InstrumentRef | null
  /** The bare symbol every price and metadata lookup wants. */
  symbol: string
}

/**
 * One entry per stored string, in stored order.
 *
 * An unparseable string is kept as its own symbol rather than dropped: it is a
 * pre-qualification entry the user put there themselves, and losing a row
 * reads as data loss even when the row is only half usable.
 */
export function watchEntriesFrom(
  symbols: ReadonlyArray<string>,
): Array<WatchEntry> {
  return symbols.map((raw) => {
    const ref = parseInstrumentRef(raw)
    return { key: raw, ref, symbol: ref?.id ?? raw }
  })
}
