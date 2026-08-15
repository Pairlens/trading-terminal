// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Upgrading the bare symbols already sitting in people's browsers.
 *
 * Watchlists and recents shipped as `Array<string>`. Those strings are real
 * user data, so they get read once, upgraded, and written back qualified,
 * rather than dropped. The class comes from three sources in descending order
 * of confidence, and this is the ONLY place the weakest of them is allowed to
 * run: once, at upgrade time, instead of on every render in six components.
 */
import {
  normalizeInstrumentClass,
  normalizeInstrumentId,
} from '@pairlens/shared/market-ref'
import { classFromSymbolShape } from './entry'
import type {
  InstrumentClass,
  InstrumentRef,
} from '@pairlens/shared/market-ref'
import { lookupPredictionOutcome } from '@/stores/prediction-directory-store'

/**
 * `pair-picker.assetClassMap` — the persisted symbol → asset-class side table
 * every pair picker writes when a row is chosen. It is the reason this upgrade
 * is mostly lossless: a watchlist entry can only have been added through a
 * picker, so the class was recorded at the time.
 */
export type LegacyAssetClassMap = Record<string, string>

/**
 * Upgrade one legacy symbol.
 *
 * Falls back to the symbol's shape when the map has nothing: equities are bare
 * tickers, crypto pairs carry their quote. That is the rule the pair switcher
 * has always used to classify a direct link, so the upgrade agrees with what
 * the app already showed. A wrong guess costs an unresolvable row the user can
 * re-pick from a picker; it cannot produce a wrong price, because the resolver
 * refuses rather than substituting a venue that does not serve the class.
 */
export function legacySymbolToInstrumentRef(
  symbol: string,
  assetClassMap?: LegacyAssetClassMap,
): InstrumentRef {
  const key = normalizeInstrumentId('spot', symbol)

  // A prediction outcome first, because it is the one legacy key whose venue
  // is part of its identity: the directory pinned the venue that lists it
  // when the user picked the row, and class-level routing would happily chart
  // a Polymarket key against Kalshi. Read non-reactively — this runs inside
  // a memo, and the pin does not change under it.
  const pinned = lookupPredictionOutcome(key)
  if (pinned?.market) {
    return { cls: 'prediction', market: pinned.market.toLowerCase(), id: key }
  }

  const cls =
    normalizeInstrumentClass(assetClassMap?.[key]) ??
    normalizeInstrumentClass(assetClassMap?.[symbol]) ??
    classFromUsdBaseLeg(key, assetClassMap) ??
    classFromSymbolShape(key)
  return { cls, id: normalizeInstrumentId(cls, symbol) }
}

/**
 * `AAPL-USD` when the map already says `AAPL` is a stock.
 *
 * The equities connector writes its pairs as `TICKER-USD`, so a key in that
 * form is the same instrument the picker recorded under the bare ticker, just
 * spelled the connector's way. Without this the shape rule sees the dash,
 * calls it crypto, and the recents strip asks a crypto exchange for AAPL on a
 * loop.
 *
 * Restricted to a USD quote leg and to a recorded answer, so it never invents
 * a classification: it only reads back one the user's own navigation produced.
 * `BTC-USD` follows the same rule, which is the honest outcome for a key that
 * names a real crypto pair AND a real spot-bitcoin ETF: whichever one this
 * user has actually charted is the better guess than a coin flip.
 */
function classFromUsdBaseLeg(
  key: string,
  assetClassMap?: LegacyAssetClassMap,
): InstrumentClass | undefined {
  const [base, quote] = key.split('-')
  if (quote !== 'USD' || !base) return undefined
  return normalizeInstrumentClass(assetClassMap?.[base])
}

/** Upgrade a stored list, dropping nothing and de-duplicating the result. */
export function legacySymbolsToInstrumentRefs(
  symbols: ReadonlyArray<string>,
  assetClassMap?: LegacyAssetClassMap,
): Array<InstrumentRef> {
  const seen = new Set<string>()
  const out: Array<InstrumentRef> = []
  for (const symbol of symbols) {
    if (!symbol.trim()) continue
    const ref = legacySymbolToInstrumentRef(symbol, assetClassMap)
    const key = `${ref.cls}:${ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}
