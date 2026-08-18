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
  isRankablePool,
  measurableReserveUsd,
  moveTintAlpha,
  peakAbsNet,
  poolTileKey,
  poolTileLines,
  sumFlowSince,
  swatchIndexFor,
  tileSizeFor,
  titleCaseVenue,
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

describe('sumFlowSince', () => {
  const NOW = 1_800_000_000_000
  const HOUR = 3_600_000

  it('sums the window and ignores everything before it', () => {
    const { buyUsd, sellUsd } = sumFlowSince(
      [
        { ts: NOW - 10_000, side: 'buy', amountUsd: 400 },
        { ts: NOW - 20_000, side: 'sell', amountUsd: 150 },
        { ts: NOW - 2 * HOUR, side: 'buy', amountUsd: 9_000_000 },
      ],
      NOW - HOUR,
    )
    expect(buyUsd).toBe(400)
    expect(sellUsd).toBe(150)
  })

  it('skips a malformed notional rather than counting it as zero', () => {
    const { buyUsd } = sumFlowSince(
      [{ ts: NOW, side: 'buy', amountUsd: NaN }],
      NOW - HOUR,
    )
    expect(buyUsd).toBe(0)
  })
})

describe('isRankablePool', () => {
  it('keeps a pool with real liquidity and volume in proportion', () => {
    // Orca's flagship: $84.2M locked, ~17 turns a day.
    expect(
      isRankablePool({ reserveUsd: 84_200_000, volume24hUsd: 1_420_000_000 }),
    ).toBe(true)
    // A quiet real pool with no volume figure stays: absence is not a lie.
    expect(isRankablePool({ reserveUsd: 250_000, volume24hUsd: null })).toBe(
      true,
    )
  })

  it('drops thin pools even when their volume figure is huge', () => {
    // The live failure this bar exists for: $12K of liquidity claiming $50M of
    // daily volume is four thousand turns, which no range services.
    expect(
      isRankablePool({ reserveUsd: 12_000, volume24hUsd: 50_000_000 }),
    ).toBe(false)
    expect(isRankablePool({ reserveUsd: 9_999, volume24hUsd: 1_000 })).toBe(
      false,
    )
  })

  it('keeps concentrated-liquidity pools, which turn over in the hundreds', () => {
    // Measured on Solana's live volume ranking: the tokenized equity pools
    // carrying most of the chain's volume run 150-370 turns on real ranges.
    // At the old ceiling of 50 they were all dropped and the map drew one tile.
    expect(
      isRankablePool({ reserveUsd: 300_900, volume24hUsd: 109_535_352 }),
    ).toBe(true)
    // Orca's SOL/USDC, the chain's flagship pool, at 63 turns.
    expect(
      isRankablePool({ reserveUsd: 4_000_000, volume24hUsd: 252_000_000 }),
    ).toBe(true)
  })

  it('drops pools that published no reserve figure at all', () => {
    expect(isRankablePool({ reserveUsd: null, volume24hUsd: 5_000_000 })).toBe(
      false,
    )
    expect(isRankablePool({ reserveUsd: 0, volume24hUsd: 0 })).toBe(false)
  })

  it('holds the ceiling exactly at the stated turnover', () => {
    expect(
      isRankablePool({ reserveUsd: 100_000, volume24hUsd: 50_000_000 }),
    ).toBe(true)
    expect(
      isRankablePool({ reserveUsd: 100_000, volume24hUsd: 50_000_001 }),
    ).toBe(false)
  })
})

describe('tileSizeFor', () => {
  const pool = {
    volume24hUsd: 1_420_000_000,
    reserveUsd: 84_200_000,
    trades24h: { buys: 200_000, sells: 118_402 },
  }

  it('measures each mode with its own metric', () => {
    expect(tileSizeFor(pool, 'volume')).toBe(1_420_000_000)
    expect(tileSizeFor(pool, 'liquidity')).toBe(84_200_000)
    expect(tileSizeFor(pool, 'trades')).toBe(318_402)
    expect(tileSizeFor(pool, 'turnover')).toBeCloseTo(16.86, 2)
  })

  it('gives no area to what the mode cannot measure', () => {
    // A zero-area tile is dropped by the caller. The alternative — treating a
    // missing count as "nothing traded" — would draw a busy pool as absent
    // from the trades map rather than as unmeasured.
    expect(tileSizeFor({ ...pool, trades24h: null }, 'trades')).toBe(0)
    expect(tileSizeFor({ ...pool, volume24hUsd: null }, 'volume')).toBe(0)
    expect(tileSizeFor({ ...pool, reserveUsd: null }, 'liquidity')).toBe(0)
    expect(tileSizeFor({ ...pool, reserveUsd: 0.5 }, 'turnover')).toBe(0)
  })
})

describe('moveTintAlpha', () => {
  it('stays inside the design band', () => {
    expect(moveTintAlpha(0.0001)).toBeGreaterThanOrEqual(8)
    expect(moveTintAlpha(38)).toBe(34)
    expect(moveTintAlpha(-38)).toBe(34)
    expect(moveTintAlpha(1000)).toBe(34)
  })

  it('rises monotonically with the size of the move, either direction', () => {
    const ramp = [0.2, 1, 2, 5, 8, 12, 15].map(moveTintAlpha)
    for (let i = 1; i < ramp.length; i++) {
      expect(ramp[i]).toBeGreaterThan(ramp[i - 1])
    }
    expect(moveTintAlpha(-4.2)).toBeCloseTo(moveTintAlpha(4.2), 10)
  })

  it('leaves an unpublished move untinted rather than flat-coloured', () => {
    // A floor tint on a pool with no 24h figure is a claim that it did not
    // move. The tile draws on plain card instead.
    expect(moveTintAlpha(null)).toBe(0)
    expect(moveTintAlpha(NaN)).toBe(0)
  })
})

describe('titleCaseVenue', () => {
  it('turns a provider slug into a venue label', () => {
    expect(titleCaseVenue('orca')).toBe('Orca')
    expect(titleCaseVenue('uniswap_v3')).toBe('Uniswap V3')
    expect(titleCaseVenue('pancakeswap-v2')).toBe('Pancakeswap V2')
  })

  it('has no label for a listing that named no venue', () => {
    expect(titleCaseVenue('')).toBeNull()
    expect(titleCaseVenue(null)).toBeNull()
  })
})

describe('poolTileKey', () => {
  it('keys on the address, so two pools sharing a ticker are two tiles', () => {
    // The design deliberately shows two PYTH tiles. Keying on the symbol
    // would collapse them into one whose selection flickered between the two.
    const a = { network: 'solana', address: 'PoolAAA', name: 'PYTH / USDC' }
    const b = { network: 'solana', address: 'PoolBBB', name: 'PYTH / USDC' }
    expect(poolTileKey(a)).not.toBe(poolTileKey(b))
    expect(poolTileKey(a)).toBe('solana:PoolAAA')
  })

  it('separates the same address on two networks', () => {
    expect(poolTileKey({ network: 'base', address: '0xabc' })).not.toBe(
      poolTileKey({ network: 'eth', address: '0xabc' }),
    )
  })
})

describe('poolTileLines', () => {
  const usd = (value: number) => `$${Math.round(value / 1e6)}M`
  const pool = {
    name: 'SOL / USDC',
    dexName: 'orca',
    change24hPct: 2.1,
    reserveUsd: 84_200_000,
  }

  it('gives a large tile the venue, the liquidity and the move', () => {
    const lines = poolTileLines(pool, 320, 180, usd)
    expect(lines.layout).toBe('stack')
    expect(lines.title).toBe('SOL / USDC')
    expect(lines.subtitle).toBe('Orca · $84M')
    expect(lines.value).toBe('+2.1%')
    expect(lines.tone).toBe('up')
  })

  it('drops the subtitle once the tile is too small to carry three lines', () => {
    const lines = poolTileLines(pool, 90, 64, usd)
    expect(lines.layout).toBe('stack')
    expect(lines.subtitle).toBeNull()
    expect(lines.value).toBe('+2.1%')
  })

  it('lays a wide short tile out as a row', () => {
    const lines = poolTileLines(pool, 260, 44, usd)
    expect(lines.layout).toBe('row')
    expect(lines.subtitle).toBeNull()
  })

  it('signs a fall and tones it down', () => {
    const lines = poolTileLines({ ...pool, change24hPct: -8.4 }, 320, 180, usd)
    expect(lines.value).toBe('-8.4%')
    expect(lines.tone).toBe('down')
  })

  it('says nothing about a move the listing did not publish', () => {
    const lines = poolTileLines({ ...pool, change24hPct: null }, 320, 180, usd)
    expect(lines.value).toBeNull()
    expect(lines.tone).toBe('muted')
  })

  it('falls back to the venue alone when liquidity is dust', () => {
    const lines = poolTileLines({ ...pool, reserveUsd: 0.004 }, 320, 180, usd)
    expect(lines.subtitle).toBe('Orca')
  })
})

describe('swatchIndexFor', () => {
  it('is stable for a pool and lands in the chart palette', () => {
    const first = swatchIndexFor('7xKqPoolAddress')
    expect(swatchIndexFor('7xKqPoolAddress')).toBe(first)
    expect(first).toBeGreaterThanOrEqual(1)
    expect(first).toBeLessThanOrEqual(5)
  })

  it('spreads different pools across the palette', () => {
    const seen = new Set(
      ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg', 'hhh'].map(
        swatchIndexFor,
      ),
    )
    expect(seen.size).toBeGreaterThan(1)
  })

  it('handles an empty seed without leaving the palette', () => {
    const index = swatchIndexFor('')
    expect(index).toBeGreaterThanOrEqual(1)
    expect(index).toBeLessThanOrEqual(5)
  })
})
