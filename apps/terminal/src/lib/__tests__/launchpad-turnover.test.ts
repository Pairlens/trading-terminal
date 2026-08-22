// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { medianOf, turnoverMultiples, turnoverOf } from '../launchpad-turnover'
import type { LaunchpadToken } from '@pairlens/shared/instrument-types'

function token(over: Partial<LaunchpadToken> = {}): LaunchpadToken {
  return {
    chain: 'solana',
    address: 'mint',
    symbol: 'MEME',
    name: 'Meme',
    iconUrl: null,
    decimals: null,
    priceUsd: 1,
    marketCapUsd: 1_000_000,
    fdvUsd: null,
    liquidityUsd: null,
    holders: null,
    launchpad: null,
    createdAt: null,
    graduatedAt: null,
    curveProgress: null,
    organicScore: null,
    verified: false,
    audit: null,
    flow: {
      h24: {
        buys: 0,
        sells: 0,
        buyVolumeUsd: 0,
        sellVolumeUsd: 0,
        volumeUsd: 100_000,
        traders: null,
        priceChangePercent: null,
      },
    },
    socials: { twitter: null, telegram: null, website: null },
    stage: 'legendary',
    source: 'coingecko',
    ...over,
  }
}

describe('turnoverOf', () => {
  it('is volume over capitalisation', () => {
    expect(turnoverOf(token())).toBeCloseTo(0.1, 10)
  })

  it('falls back to FDV when no market cap was published', () => {
    // The same substitution the market-cap cell makes: for a token whose whole
    // supply circulates they are one number.
    expect(
      turnoverOf(token({ marketCapUsd: null, fdvUsd: 500_000 })),
    ).toBeCloseTo(0.2, 10)
  })

  it('is null when either half is missing or zero', () => {
    expect(turnoverOf(token({ marketCapUsd: null, fdvUsd: null }))).toBeNull()
    expect(turnoverOf(token({ marketCapUsd: 0 }))).toBeNull()
    expect(turnoverOf(token({ flow: {} }))).toBeNull()
  })
})

describe('medianOf', () => {
  it('takes the middle of an odd sample and the mean of an even one', () => {
    expect(medianOf([3, 1, 2])).toBe(2)
    expect(medianOf([1, 2, 3, 4])).toBe(2.5)
  })

  it('is null when there is nothing to measure', () => {
    expect(medianOf([])).toBeNull()
    expect(medianOf([0, 0])).toBeNull()
  })
})

describe('turnoverMultiples', () => {
  const rows = [
    token({ address: 'a', marketCapUsd: 1_000_000 }), // 0.1
    token({
      address: 'b',
      marketCapUsd: 1_000_000,
      flow: { h24: { ...token().flow.h24!, volumeUsd: 200_000 } },
    }), // 0.2
    token({
      address: 'c',
      marketCapUsd: 1_000_000,
      flow: { h24: { ...token().flow.h24!, volumeUsd: 600_000 } },
    }), // 0.6
  ]

  it('measures every row against the median of the column', () => {
    const out = turnoverMultiples(rows)
    // Median turnover is 0.2, so the middle row is exactly usual.
    expect(out.get('solana:b')).toBeCloseTo(1, 10)
    expect(out.get('solana:a')).toBeCloseTo(0.5, 10)
    expect(out.get('solana:c')).toBeCloseTo(3, 10)
  })

  it('refuses to publish a multiple with fewer than three samples', () => {
    // A median of one or two rows is not a baseline, and "8.4×" measured
    // against it reads as a finding rather than as noise.
    expect(turnoverMultiples(rows.slice(0, 2)).size).toBe(0)
    expect(turnoverMultiples([]).size).toBe(0)
  })

  it('leaves out rows it could not measure, and still ranks the rest', () => {
    const out = turnoverMultiples([
      ...rows,
      token({ address: 'd', marketCapUsd: null, fdvUsd: null }),
    ])
    expect(out.has('solana:d')).toBe(false)
    expect(out.size).toBe(3)
  })
})
