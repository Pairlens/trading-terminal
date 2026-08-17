// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The reserve supplement's merge rules.
 *
 * Each test here corresponds to a way a user gets a wrong number on screen:
 * reserves belonging to a different pool than the value locked beside them, a
 * primary figure quietly replaced by a second provider's, or a row that claims a
 * provenance it does not have.
 */
import { describe, expect, it } from 'bun:test'

import {
  mergePoolStats,
  needsReserves,
  providerLabel,
  samePool,
} from '../pool-stats-merge'
import type { PoolStats } from '@pairlens/shared/instrument-types'

/** A GeckoTerminal answer: value locked in USD, nothing per side. */
function primaryRow(overrides: Partial<PoolStats> = {}): PoolStats {
  return {
    network: 'eth',
    address: '0xe0554a476a092703abdb3ef35c80e0d76d32939f',
    name: 'WETH / USDC 0.05%',
    dexName: 'uniswap_v3',
    baseSymbol: 'WETH',
    quoteSymbol: 'USDC',
    priceUsd: 1905.6,
    quotePriceUsd: 0.9999,
    priceInQuote: 1905.9,
    change1hPct: 0.21,
    change24hPct: 1.28,
    volume1hUsd: 2117941.88,
    volume24hUsd: 34930431.94,
    reserveUsd: 5294840.12,
    baseReserve: null,
    quoteReserve: null,
    feeTier: 0.0005,
    trades24h: { buys: 7589, sells: 8227, buyers: 1200, sellers: 1300 },
    buyVolume24hUsd: null,
    sellVolume24hUsd: null,
    createdAt: '2021-11-14T21:44:29Z',
    fdvUsd: null,
    source: 'geckoterminal',
    ...overrides,
  }
}

/** A DexScreener answer for the SAME pool: both sides, and its own identity. */
function supplementRow(overrides: Partial<PoolStats> = {}): PoolStats {
  return {
    ...primaryRow(),
    // Checksummed, where the primary reported it lowercased.
    network: 'ethereum',
    address: '0xE0554a476A092703abdB3Ef35c80e0D76d32939F',
    name: 'WETH / USDC',
    dexName: 'uniswap v3',
    baseReserve: 1580.575,
    quoteReserve: 2282886,
    feeTier: null,
    fdvUsd: 4245833882,
    source: 'dexscreener',
    ...overrides,
  }
}

describe('samePool', () => {
  it('matches on address, case-insensitively', () => {
    // The primary reports EVM addresses lowercased and the supplement echoes the
    // checksummed form. Comparing them literally would refuse every EVM merge.
    expect(samePool(primaryRow(), supplementRow())).toBe(true)
  })

  it('ignores the network slug, which the two providers spell differently', () => {
    expect(primaryRow().network).toBe('eth')
    expect(supplementRow().network).toBe('ethereum')
    expect(samePool(primaryRow(), supplementRow())).toBe(true)
  })

  it('is false for two different pools', () => {
    expect(
      samePool(primaryRow(), supplementRow({ address: '0xdeadbeef' })),
    ).toBe(false)
  })

  it('is false when either address is empty', () => {
    expect(samePool(primaryRow({ address: '' }), supplementRow())).toBe(false)
    expect(samePool(primaryRow(), supplementRow({ address: '   ' }))).toBe(
      false,
    )
  })
})

describe('needsReserves', () => {
  it('is true only when neither side is published', () => {
    expect(needsReserves(primaryRow())).toBe(true)
    expect(needsReserves(primaryRow({ baseReserve: 1580 }))).toBe(false)
    expect(needsReserves(primaryRow({ quoteReserve: 2282886 }))).toBe(false)
    expect(needsReserves(null)).toBe(false)
  })
})

describe('mergePoolStats', () => {
  it('fills the reserves and reports who filled them', () => {
    const { stats, filledBy, filled } = mergePoolStats(
      primaryRow(),
      supplementRow(),
    )
    expect(stats?.baseReserve).toBe(1580.575)
    expect(stats?.quoteReserve).toBe(2282886)
    expect(filledBy).toBe('dexscreener')
    expect(filled).toContain('baseReserve')
    expect(filled).toContain('quoteReserve')
  })

  it('never overwrites a field the primary published', () => {
    // The supplement measured the same pool a few seconds later and reports its
    // own fee, price and volume. The primary's answer is the row.
    const { stats } = mergePoolStats(
      primaryRow(),
      supplementRow({
        priceUsd: 1900.01,
        volume24hUsd: 1,
        reserveUsd: 2,
        feeTier: 0.03,
      }),
    )
    expect(stats?.priceUsd).toBe(1905.6)
    expect(stats?.volume24hUsd).toBe(34930431.94)
    expect(stats?.reserveUsd).toBe(5294840.12)
    expect(stats?.feeTier).toBe(0.0005)
  })

  it('keeps the primary s identity and provenance', () => {
    // A merged row that reported the supplement's source would make every other
    // number look like the supplement measured it.
    const { stats } = mergePoolStats(primaryRow(), supplementRow())
    expect(stats?.source).toBe('geckoterminal')
    expect(stats?.network).toBe('eth')
    expect(stats?.address).toBe('0xe0554a476a092703abdb3ef35c80e0d76d32939f')
    expect(stats?.name).toBe('WETH / USDC 0.05%')
    expect(stats?.dexName).toBe('uniswap_v3')
  })

  it('fills other gaps too, and only the ones that were gaps', () => {
    const { stats, filled } = mergePoolStats(primaryRow(), supplementRow())
    // The primary published no FDV; the supplement did.
    expect(stats?.fdvUsd).toBe(4245833882)
    expect(filled).toContain('fdvUsd')
    // Neither published the buy/sell notional split, so it stays a gap.
    expect(stats?.buyVolume24hUsd).toBeNull()
    expect(filled).not.toContain('buyVolume24hUsd')
    expect(filled).not.toContain('volume24hUsd')
  })

  it('refuses a supplement about a different pool', () => {
    // The two providers resolve pools independently and disagree: for SOL/USDC
    // one picks Raydium and the other an Orca whirlpool. Reserves from one
    // beside value locked from the other is a depth no pool has.
    const primary = primaryRow()
    const merged = mergePoolStats(
      primary,
      supplementRow({ address: '0x1111111111111111111111111111111111111111' }),
    )
    expect(merged.stats).toBe(primary)
    expect(merged.filledBy).toBeNull()
    expect(merged.filled).toEqual([])
  })

  it('preserves object identity when nothing was filled', () => {
    // So a pane memoized on `stats` does not re-render because an empty
    // supplement arrived.
    const primary = primaryRow({ baseReserve: 1, quoteReserve: 2, fdvUsd: 3 })
    expect(mergePoolStats(primary, supplementRow()).stats).toBe(primary)
    expect(mergePoolStats(primary, null).stats).toBe(primary)
  })

  it('is empty when there is no primary answer at all', () => {
    // No pool means no pool; a supplement cannot conjure the row.
    expect(mergePoolStats(null, supplementRow())).toEqual({
      stats: null,
      filledBy: null,
      filled: [],
    })
  })
})

describe('providerLabel', () => {
  it('names every source the wire type allows', () => {
    expect(providerLabel('geckoterminal')).toBe('GeckoTerminal')
    expect(providerLabel('dexpaprika')).toBe('DexPaprika')
    expect(providerLabel('dexscreener')).toBe('DexScreener')
  })
})
