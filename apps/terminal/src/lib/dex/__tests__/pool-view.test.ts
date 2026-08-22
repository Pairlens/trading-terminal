// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import type { PoolStats } from '@pairlens/shared/instrument-types'

import type { SelectedPoolSnapshot } from '@/lib/dex/discovery-store'
import { poolDetailView } from '@/lib/dex/pool-view'

/** What the map row published about the pool the user clicked. */
const LISTED: SelectedPoolSnapshot = {
  priceUsd: 0.0000155,
  change24hPct: 388.4,
  volume24hUsd: 129_494_176,
  reserveUsd: 304_526,
  trades24h: { buys: 134_422, sells: 89_076, buyers: null, sellers: null },
  fdvUsd: 15_500_000,
}

const LIVE: PoolStats = {
  network: 'solana',
  address: 'PINNED',
  name: 'NVDA / SOL',
  dexName: 'pumpswap',
  baseSymbol: 'NVDA',
  quoteSymbol: 'SOL',
  priceUsd: 0.0000161,
  quotePriceUsd: 76.99,
  priceInQuote: 0.00000019,
  change1hPct: 1.2,
  change24hPct: 402.1,
  volume1hUsd: 900_000,
  volume24hUsd: 130_482_841,
  reserveUsd: 298_004,
  baseReserve: null,
  quoteReserve: null,
  feeTier: 0.003,
  trades24h: { buys: 134_500, sells: 89_100, buyers: null, sellers: null },
  buyVolume24hUsd: null,
  sellVolume24hUsd: null,
  createdAt: null,
  fdvUsd: null,
  source: 'geckoterminal',
}

describe('poolDetailView', () => {
  it('draws the map row while the pool read is still out', () => {
    // The whole point of carrying the snapshot: a selected pool must never
    // leave the pane as a column of dashes, because the tile beside it is
    // already showing these exact numbers.
    const view = poolDetailView(null, LISTED)
    expect(view.live).toBe(false)
    expect(view.priceUsd).toBe(0.0000155)
    expect(view.volume24hUsd).toBe(129_494_176)
    expect(view.reserveUsd).toBe(304_526)
    expect(view.trades24h?.buys).toBe(134_422)
  })

  it('has no fee tier to show from a listing row', () => {
    // Listings do not publish one, and inventing a default would be a number
    // the reader can act on that nobody measured.
    expect(poolDetailView(null, LISTED).feeTier).toBeNull()
  })

  it('switches wholesale once live state lands', () => {
    const view = poolDetailView(LIVE, LISTED)
    expect(view.live).toBe(true)
    expect(view.priceUsd).toBe(0.0000161)
    expect(view.feeTier).toBe(0.003)
  })

  it('never blends the two sources', () => {
    // A fresh volume over a stale reserve is a turnover ratio neither provider
    // would stand behind. Every field comes from the same measurement.
    const view = poolDetailView(LIVE, LISTED)
    expect(view.volume24hUsd).toBe(LIVE.volume24hUsd)
    expect(view.reserveUsd).toBe(LIVE.reserveUsd)
    expect(view.change24hPct).toBe(LIVE.change24hPct)
  })

  it('carries the figures only the pool read has', () => {
    // These are the reason the pane is worth a full-height column: the same
    // read the six headline numbers come from already publishes the hour, the
    // reserves and the pool's age, and nothing was drawing them.
    const view = poolDetailView(LIVE, LISTED)
    expect(view.change1hPct).toBe(1.2)
    expect(view.volume1hUsd).toBe(900_000)
    expect(view.priceInQuote).toBe(0.00000019)
    expect(view.quotePriceUsd).toBe(76.99)
  })

  it('leaves them null on the listing row rather than inventing them', () => {
    // A map row publishes none of them. FDV is the one exception, and it is
    // the map's own measurement taken in the same tick as price and volume.
    const view = poolDetailView(null, LISTED)
    expect(view.change1hPct).toBeNull()
    expect(view.volume1hUsd).toBeNull()
    expect(view.baseReserve).toBeNull()
    expect(view.createdAt).toBeNull()
    expect(view.fdvUsd).toBe(15_500_000)
  })

  it('does not reach back to the listing for an FDV the read lacks', () => {
    // The whole-object rule, read the other way round: this pool read measured
    // no FDV, and the listing's five-minute-old one beside fresh volume would
    // be exactly the blend the split exists to prevent.
    expect(poolDetailView(LIVE, LISTED).fdvUsd).toBeNull()
  })

  it('keeps a null the live read published, rather than falling back', () => {
    // "The provider measured this pool and it has no value locked" is a real
    // answer, and reaching back to the listing for a nicer number would draw
    // liquidity over a pool that reported none.
    const view = poolDetailView({ ...LIVE, reserveUsd: null }, LISTED)
    expect(view.reserveUsd).toBeNull()
  })
})
