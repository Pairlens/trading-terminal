// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import type {
  NewListingEntry,
  PoolListingEntry,
} from '@pairlens/shared/instrument-types'
import type { NewPoolRow } from '@/hooks/use-pool-stats'
import {
  MIN_NEW_POOL_LIQUIDITY_USD,
  dexListingRow,
  mergeNewListings,
} from '@/lib/new-listings'

const HOUR = 3_600_000
const NOW = Date.parse('2026-08-17T12:00:00Z')

function cex(
  venue: string,
  pairKey: string,
  firstSeenAt: number,
): NewListingEntry {
  const [base, quote] = pairKey.split('-')
  return { venue, pairKey, base, quote, firstSeenAt }
}

function pool(
  address: string,
  overrides: Partial<PoolListingEntry> = {},
): NewPoolRow {
  return {
    market: 'jupiter',
    pool: {
      network: 'solana',
      address,
      name: 'NEW / SOL',
      dexName: 'raydium',
      priceUsd: 0.42,
      change24hPct: null,
      volume24hUsd: 5_000,
      reserveUsd: 50_000,
      baseSymbol: 'NEW',
      quoteSymbol: 'SOL',
      baseAddress: `${address}-base`,
      createdAtMs: NOW - HOUR,
      ...overrides,
    },
  }
}

describe('dexListingRow', () => {
  it('drops a pool with no creation time rather than dating it now', () => {
    expect(dexListingRow(pool('A', { createdAtMs: undefined }))).toBeNull()
  })

  it('drops dust: a pool under the floor is a deployment, not a market', () => {
    expect(dexListingRow(pool('A', { reserveUsd: 0 }))).toBeNull()
    expect(dexListingRow(pool('A', { reserveUsd: null }))).toBeNull()
    expect(
      dexListingRow(pool('A', { reserveUsd: MIN_NEW_POOL_LIQUIDITY_USD - 1 })),
    ).toBeNull()
    expect(
      dexListingRow(pool('A', { reserveUsd: MIN_NEW_POOL_LIQUIDITY_USD })),
    ).not.toBeNull()
  })

  it('keys by chain and pool address, never by ticker', () => {
    // Two tokens sharing a symbol is the normal case on a new-pools feed.
    const row = dexListingRow(pool('PoolAddr'))
    expect(row?.key).toBe('dex:solana:PoolAddr')
    expect(row?.market).toBe('jupiter')
    expect(row?.liquidityUsd).toBe(50_000)
  })

  it('falls back to the token legs when the provider named nothing', () => {
    expect(dexListingRow(pool('A', { name: '' }))?.label).toBe('NEW / SOL')
  })
})

describe('mergeNewListings', () => {
  it('interleaves both sources newest first', () => {
    const rows = mergeNewListings(
      [
        cex('binance', 'AAA-USDT', NOW - 2 * HOUR),
        cex('gate', 'BBB-USDT', NOW - 4 * HOUR),
      ],
      [
        pool('P1', { createdAtMs: NOW - HOUR }),
        pool('P2', { createdAtMs: NOW - 3 * HOUR }),
      ],
    )
    expect(rows.map((r) => r.key)).toEqual([
      'dex:solana:P1',
      'cex:binance:AAA-USDT',
      'dex:solana:P2',
      'cex:gate:BBB-USDT',
    ])
  })

  it('orders ties deterministically so rows never swap under the cursor', () => {
    const a = mergeNewListings(
      [cex('binance', 'AAA-USDT', NOW), cex('gate', 'BBB-USDT', NOW)],
      [pool('P1', { createdAtMs: NOW })],
    )
    const b = mergeNewListings(
      [cex('gate', 'BBB-USDT', NOW), cex('binance', 'AAA-USDT', NOW)],
      [pool('P1', { createdAtMs: NOW })],
    )
    expect(a.map((r) => r.key)).toEqual(b.map((r) => r.key))
  })

  it('leaves a CEX row without a price rather than borrowing one', () => {
    const [row] = mergeNewListings([cex('binance', 'AAA-USDT', NOW)], [])
    expect(row.priceUsd).toBeNull()
    expect(row.liquidityUsd).toBeNull()
    expect(row.market).toBe('binance')
  })

  it('works with either half missing', () => {
    expect(mergeNewListings([], [pool('P1')])).toHaveLength(1)
    expect(mergeNewListings([cex('okx', 'X-USDT', NOW)], [])).toHaveLength(1)
    expect(mergeNewListings([], [])).toEqual([])
  })

  it('caps the merged list', () => {
    const cexRows = Array.from({ length: 40 }, (_, i) =>
      cex('binance', `C${i}-USDT`, NOW - i),
    )
    const dexRows = Array.from({ length: 40 }, (_, i) =>
      pool(`P${i}`, { createdAtMs: NOW - i }),
    )
    expect(mergeNewListings(cexRows, dexRows, 25)).toHaveLength(25)
  })
})
