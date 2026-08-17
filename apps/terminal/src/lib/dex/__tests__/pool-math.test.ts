// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  bucketNetFlow,
  buyShare,
  comparePoolsByTurnover,
  impactBarFraction,
  impactTier,
  impactVsMid,
  measurableReserveUsd,
  peakAbsNet,
  truncateAddress,
  usdToQuoteUnits,
  volumeToTvl,
} from '../pool-math'

describe('volumeToTvl', () => {
  it('measures how many times liquidity turned over', () => {
    expect(volumeToTvl(1_420_000_000, 84_200_000)).toBeCloseTo(16.86, 2)
  })

  it('refuses an empty or unknown pool', () => {
    // An Infinity here would sort a zero-liquidity pool to the top of the map,
    // which is the one row nobody should be routed into.
    expect(volumeToTvl(1000, 0)).toBeNull()
    expect(volumeToTvl(1000, null)).toBeNull()
    expect(volumeToTvl(null, 1000)).toBeNull()
  })

  it('refuses dust reserves that would mint a trillion-x ratio', () => {
    // pump.fun pools report reserves like $0.0000000004 against $100M of
    // volume; the observed result was a 282,747,067,246,933x row pinned to
    // the top of the board over a "$0" liquidity cell.
    expect(volumeToTvl(109_900_000, 3.9e-10)).toBeNull()
    expect(volumeToTvl(1000, 0.99)).toBeNull()
    expect(volumeToTvl(1000, 1)).toBe(1000)
  })
})

describe('measurableReserveUsd', () => {
  it('passes real reserves through and nulls dust', () => {
    expect(measurableReserveUsd(84_200_000)).toBe(84_200_000)
    expect(measurableReserveUsd(0.01)).toBe(0.01)
    expect(measurableReserveUsd(0.0099)).toBeNull()
    expect(measurableReserveUsd(0)).toBeNull()
    expect(measurableReserveUsd(null)).toBeNull()
  })
})

describe('impactTier', () => {
  it('splits at the points a trader acts on', () => {
    expect(impactTier(0.0001)).toBe('low')
    expect(impactTier(0.001)).toBe('low')
    expect(impactTier(0.0046)).toBe('moderate')
    expect(impactTier(0.021)).toBe('high')
  })

  it('reads a negative quote as the cheapest tier, not the worst', () => {
    // Kyber prices both legs from separate USD feeds and routinely returns a
    // small negative. Ranking by magnitude painted the best fill on the board
    // red, which is why this is signed.
    expect(impactTier(-0.0045)).toBe('low')
    expect(impactTier(-0.02)).toBe('low')
  })

  it('has no tier for an unknown impact', () => {
    expect(impactTier(null)).toBeNull()
    expect(impactTier(NaN)).toBeNull()
  })
})

describe('impactBarFraction', () => {
  it('fills linearly to 2% and clamps there', () => {
    expect(impactBarFraction(0.01)).toBeCloseTo(0.5, 10)
    expect(impactBarFraction(0.02)).toBe(1)
    expect(impactBarFraction(0.5)).toBe(1)
  })

  it('is empty rather than negative for a missing reading', () => {
    expect(impactBarFraction(null)).toBe(0)
  })
})

describe('impactVsMid', () => {
  it('reports a worse-than-mid fill as positive impact', () => {
    expect(impactVsMid(99, 100)).toBeCloseTo(0.01, 10)
  })

  it('reports a better-than-mid fill as negative', () => {
    expect(impactVsMid(101, 100)).toBeCloseTo(-0.01, 10)
  })

  it('will not divide by an absent mid', () => {
    expect(impactVsMid(99, 0)).toBeNull()
    expect(impactVsMid(null, 100)).toBeNull()
  })
})

describe('truncateAddress', () => {
  it('keeps both ends so two addresses can be told apart', () => {
    expect(truncateAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(
      '0x1234…5678',
    )
  })

  it('leaves a short address alone', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234')
    expect(truncateAddress(null)).toBe('')
  })
})

describe('buyShare', () => {
  it('splits the flow', () => {
    expect(buyShare(917_231, 914_863)).toBeCloseTo(0.5006, 4)
  })

  it('is null with nothing to split', () => {
    expect(buyShare(0, 0)).toBeNull()
    expect(buyShare(null, 100)).toBeNull()
  })
})

describe('usdToQuoteUnits', () => {
  it('converts a dollar size into the token being spent', () => {
    expect(usdToQuoteUnits(10_000, 1)).toBe(10_000)
    expect(usdToQuoteUnits(10_000, 2500)).toBe(4)
  })

  it('declines when the quote leg is unpriced', () => {
    // What collapses the impact grid instead of quoting a size in a currency
    // nobody named.
    expect(usdToQuoteUnits(10_000, null)).toBeNull()
    expect(usdToQuoteUnits(10_000, 0)).toBeNull()
    expect(usdToQuoteUnits(0, 1)).toBeNull()
  })
})

describe('comparePoolsByTurnover', () => {
  it('ranks the pool that traded its own liquidity hardest first', () => {
    const deepQuiet = { volume24hUsd: 1_000, reserveUsd: 1_000_000 }
    const shallowBusy = { volume24hUsd: 900, reserveUsd: 10_000 }
    expect(comparePoolsByTurnover(deepQuiet, shallowBusy)).toBeGreaterThan(0)
  })

  it('sinks pools with no liquidity figure below those that have one', () => {
    const known = { volume24hUsd: 10, reserveUsd: 1000 }
    const unknown = { volume24hUsd: 1_000_000, reserveUsd: null }
    expect(comparePoolsByTurnover(known, unknown)).toBeLessThan(0)
  })

  it('falls back to volume when neither publishes liquidity', () => {
    const a = { volume24hUsd: 10, reserveUsd: null }
    const b = { volume24hUsd: 20, reserveUsd: null }
    expect(comparePoolsByTurnover(a, b)).toBeGreaterThan(0)
  })
})

describe('bucketNetFlow', () => {
  const BUCKET = 60_000
  // now sits mid-bucket on purpose: bucket starts must snap to the grid.
  const NOW = 10 * BUCKET + 12_345

  it('nets buys against sells inside each bucket', () => {
    const buckets = bucketNetFlow(
      [
        { ts: 10 * BUCKET + 1_000, side: 'buy', amountUsd: 500 },
        { ts: 10 * BUCKET + 2_000, side: 'sell', amountUsd: 200 },
        { ts: 9 * BUCKET + 1_000, side: 'sell', amountUsd: 400 },
      ],
      BUCKET,
      3,
      NOW,
    )
    expect(buckets.length).toBe(3)
    expect(buckets[2].netUsd).toBe(300)
    expect(buckets[1].netUsd).toBe(-400)
    expect(buckets[0].netUsd).toBe(0)
  })

  it('anchors the window to now, not to the last print', () => {
    // A pool that stopped trading must show empty recent bars. Anchoring to
    // the newest trade would slide the window back and draw a stale burst as
    // if it were happening now.
    const buckets = bucketNetFlow(
      [{ ts: NOW - 20 * BUCKET, side: 'buy', amountUsd: 900 }],
      BUCKET,
      3,
      NOW,
    )
    expect(buckets.every((b) => b.netUsd === 0)).toBe(true)
    expect(buckets[2].ts).toBe(10 * BUCKET)
  })

  it('ignores prints from the future and malformed notionals', () => {
    const buckets = bucketNetFlow(
      [
        { ts: NOW + 5 * BUCKET, side: 'buy', amountUsd: 100 },
        { ts: NOW, side: 'buy', amountUsd: NaN },
      ],
      BUCKET,
      3,
      NOW,
    )
    expect(peakAbsNet(buckets)).toBe(0)
  })

  it('returns nothing for a degenerate window', () => {
    expect(bucketNetFlow([], 0, 3, NOW)).toEqual([])
    expect(bucketNetFlow([], BUCKET, 0, NOW)).toEqual([])
  })
})

describe('peakAbsNet', () => {
  it('scales bars by the largest swing either way', () => {
    expect(
      peakAbsNet([
        { ts: 0, buyUsd: 0, sellUsd: 0, netUsd: 120 },
        { ts: 1, buyUsd: 0, sellUsd: 0, netUsd: -400 },
      ]),
    ).toBe(400)
  })
})
