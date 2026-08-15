// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Picker rows → refs. Every surface that can start a navigation (the omni
 * search, the pair switcher, the markets pane, the mobile screens) turns its
 * row into a ref here, so they all pin identity the same way.
 */
import {
  isTokenAddress,
  normalizeInstrumentClass,
  normalizeInstrumentId,
} from '@pairlens/shared/market-ref'
import type {
  InstrumentClass,
  InstrumentRef,
  MarketRef,
} from '@pairlens/shared/market-ref'

/** The subset of `PairEntry`/`Instrument` this needs. Kept structural so both fit. */
export type RefSource = {
  symbol: string
  assetClass?: string
  /** Quote leg. Carried into dex ids so the pool resolvers can find a pool. */
  quote?: string
  chain?: string
  address?: string
  /** Prediction rows: the venue that lists this outcome. Part of identity. */
  market?: string
  predictionMarketId?: string
  outcome?: string
}

/**
 * What a symbol's SHAPE says when nothing else does. Equities are bare tickers
 * (AAPL); every crypto pair carries its quote (BTC-USDT). This is the rule the
 * pair switcher has always used, kept because it is right more often than a
 * blanket default and because it is the one that gets a direct link to a stock
 * onto a stocks venue.
 */
export function classFromSymbolShape(symbol: string): InstrumentClass {
  return symbol.includes('-') ? 'spot' : 'stocks'
}

/**
 * A row's venue-free identity.
 *
 * A row carrying a chain and an address is a token, and it becomes an
 * address-keyed ref no matter what its symbol says. That is the whole
 * see-what-you-trade rule: there are hundreds of tokens named PEPE, and the
 * one the user just looked at is the one in this row.
 */
export function entryToInstrumentRef(entry: RefSource): InstrumentRef {
  // A prediction outcome IS its venue plus the connector's key. Class-level
  // routing can chart a Polymarket key against Kalshi, which is why this is
  // bound rather than resolved.
  if (entry.predictionMarketId && entry.outcome && entry.market) {
    return {
      cls: 'prediction',
      market: entry.market.toLowerCase(),
      id: normalizeInstrumentId('prediction', entry.symbol),
    }
  }
  if (entry.chain && entry.address) {
    // Address as the base, the row's own quote leg after it: the address is
    // the identity, and the quote is what the pool resolvers pair it against.
    const quote = entry.quote?.trim() || 'USDC'
    return {
      cls: 'dex',
      market: entry.chain.toLowerCase(),
      id: normalizeInstrumentId('dex', `${entry.address}-${quote}`),
    }
  }
  const cls =
    normalizeInstrumentClass(entry.assetClass) ??
    classFromSymbolShape(entry.symbol)
  return { cls, id: normalizeInstrumentId(cls, entry.symbol) }
}

/**
 * The same row bound to a venue. For token rows the chain in the row wins over
 * the venue passed in: a Base token charted "on solana" is not the same asset,
 * it is nothing.
 */
export function entryToMarketRef(entry: RefSource, market: string): MarketRef {
  const inst = entryToInstrumentRef(entry)
  return {
    cls: inst.cls,
    market: inst.market ?? market.toLowerCase(),
    id: inst.id,
  }
}

/**
 * A bare pair key already carrying an address in its base leg, as the DEX pool
 * resolvers accept today ('0xabc…-USDC'). Reduced to the address, which is the
 * identity; the quote leg is a routing detail the connector re-derives.
 */
export function tokenIdFromPairKey(pairKey: string): string | null {
  const [base] = pairKey.split('-')
  return base && isTokenAddress(base)
    ? normalizeInstrumentId('dex', base)
    : null
}
