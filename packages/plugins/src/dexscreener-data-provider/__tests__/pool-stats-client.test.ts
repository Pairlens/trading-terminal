// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  createdAtIso,
  dexLabel,
  numberOrNull,
  parsePoolStats,
} from '../pool-stats-client'
import {
  AERODROME_NO_CREATED_AT,
  ORCA_SOL_USDC,
  PUMPFUN_NO_LIQUIDITY,
  UNISWAP_V3_WETH_USDC,
} from './fixtures'

describe('numberOrNull', () => {
  it('parses the numeric strings the API sends for prices', () => {
    // priceUsd and priceNative are strings; everything else is a number.
    expect(numberOrNull('1905.60')).toBe(1905.6)
    expect(numberOrNull('0.00000005693')).toBe(5.693e-8)
    expect(numberOrNull(49101263.35)).toBe(49101263.35)
  })

  it('is null for everything that is not a number', () => {
    // The distinction every reserve cell depends on: a field the API omitted
    // must not arrive as 0, or "reserves not published" renders as an empty pool.
    expect(numberOrNull(undefined)).toBeNull()
    expect(numberOrNull(null)).toBeNull()
    expect(numberOrNull('')).toBeNull()
    expect(numberOrNull('   ')).toBeNull()
    expect(numberOrNull('NaN')).toBeNull()
    expect(numberOrNull(Infinity)).toBeNull()
  })
})

describe('dexLabel', () => {
  it('appends the pool version the row carries', () => {
    expect(dexLabel('uniswap', ['v3'])).toBe('uniswap v3')
    expect(dexLabel('orca', ['wp'])).toBe('orca wp')
  })

  it('is the venue alone when there is no label', () => {
    expect(dexLabel('aerodrome', undefined)).toBe('aerodrome')
    expect(dexLabel('aerodrome', [])).toBe('aerodrome')
  })

  it('never renders a stray separator', () => {
    expect(dexLabel(undefined, undefined)).toBe('')
    expect(dexLabel('', ['v3'])).toBe('v3')
  })
})

describe('createdAtIso', () => {
  it('converts the epoch milliseconds the API sends', () => {
    expect(createdAtIso(1688106058000)).toBe('2023-06-30T06:20:58.000Z')
  })

  it('is null when the venue published no creation time', () => {
    // Whole venues omit it. Pool age has to read unknown rather than 1970,
    // which is what a zero would render as.
    expect(createdAtIso(undefined)).toBeNull()
    expect(createdAtIso(0)).toBeNull()
    expect(createdAtIso('2023-06-30')).toBeNull()
    expect(createdAtIso(Number.NaN)).toBeNull()
  })
})

describe('parsePoolStats — the reference row', () => {
  const stats = parsePoolStats(ORCA_SOL_USDC, 'solana')!

  it('maps identity and the venue label', () => {
    expect(stats.network).toBe('solana')
    expect(stats.address).toBe('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE')
    expect(stats.name).toBe('SOL / USDC')
    expect(stats.dexName).toBe('orca wp')
    expect(stats.baseSymbol).toBe('SOL')
    expect(stats.quoteSymbol).toBe('USDC')
    expect(stats.source).toBe('dexscreener')
  })

  it('publishes BOTH-SIDE reserves, which is why this provider exists', () => {
    expect(stats.baseReserve).toBe(208666)
    expect(stats.quoteReserve).toBe(9863877)
    expect(stats.reserveUsd).toBe(25683220.42)
  })

  it('reconciles the two reserves against the row s own prices', () => {
    // The invariant that makes these numbers safe to render beside a figure a
    // DIFFERENT provider measured: they are token units already scaled by each
    // token's decimals, not raw on-chain integers. If DexScreener ever changed
    // that, the sum would be off by 10^18 rather than by a rounding step.
    const derived =
      stats.baseReserve! * stats.priceUsd! +
      stats.quoteReserve! * stats.quotePriceUsd!
    expect(Math.abs(derived / stats.reserveUsd! - 1)).toBeLessThan(0.01)
  })

  it('derives the quote leg s USD price from the two prices published', () => {
    expect(stats.priceUsd).toBe(75.81)
    expect(stats.priceInQuote).toBe(75.8114)
    expect(stats.quotePriceUsd).toBeCloseTo(0.99998, 4)
  })

  it('maps the windows the panes read', () => {
    expect(stats.volume24hUsd).toBe(49101263.35)
    expect(stats.volume1hUsd).toBe(3648410.5)
    expect(stats.change24hPct).toBe(0.66)
    expect(stats.change1hPct).toBe(0.32)
    expect(stats.trades24h).toEqual({
      buys: 13769,
      sells: 13437,
      // Counted per transaction; DexScreener publishes no signer counts.
      buyers: null,
      sellers: null,
    })
    expect(stats.createdAt).toBe('2023-06-30T06:20:58.000Z')
  })

  it('leaves the fee tier and the buy/sell split null rather than guessing', () => {
    // `labels: ['wp']` is a pool type, not a fee. The counts are published; the
    // notionals behind them are not.
    expect(stats.feeTier).toBeNull()
    expect(stats.buyVolume24hUsd).toBeNull()
    expect(stats.sellVolume24hUsd).toBeNull()
  })
})

describe('parsePoolStats — absences', () => {
  it('reads a v3 label without inventing a fee tier', () => {
    const stats = parsePoolStats(UNISWAP_V3_WETH_USDC, 'ethereum')!
    expect(stats.dexName).toBe('uniswap v3')
    expect(stats.feeTier).toBeNull()
    expect(stats.fdvUsd).toBe(4245833882)
    expect(stats.baseReserve).toBe(1580.575)
  })

  it('collapses every reserve cell when the row carries no liquidity object', () => {
    const stats = parsePoolStats(PUMPFUN_NO_LIQUIDITY, 'solana')!
    expect(stats.reserveUsd).toBeNull()
    expect(stats.baseReserve).toBeNull()
    expect(stats.quoteReserve).toBeNull()
    // The rest of the row is still an answer.
    expect(stats.priceUsd).toBe(0.000004319)
    expect(stats.volume24hUsd).toBe(2420.9)
  })

  it('leaves pool age unknown when the venue published none', () => {
    const stats = parsePoolStats(AERODROME_NO_CREATED_AT, 'base')!
    expect(stats.createdAt).toBeNull()
    expect(stats.baseReserve).toBe(2332.5344)
  })

  it('trusts the row s own chainId over the one requested', () => {
    // A row can answer for a different chain than the caller asked about, and
    // the caller filters on this field.
    expect(parsePoolStats(ORCA_SOL_USDC, 'base')!.network).toBe('solana')
  })

  it('returns null for a row with no pair address', () => {
    // Without an address there is no pool to be about.
    expect(parsePoolStats({ chainId: 'solana' }, 'solana')).toBeNull()
    expect(parsePoolStats({}, 'solana')).toBeNull()
  })
})
