// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The EVM half of the token lookup.
 *
 * Two of these pin the bug that made it necessary. A DexScreener token read
 * answers with every pool the address appears in on EITHER side, so a memecoin
 * quoted against a bigger memecoin brings that other token's pools back with
 * it — and their market cap is not this token's. And the figures split into
 * two kinds: what sums across pools (liquidity, volume, trade counts) and what
 * is quoted by one (price, market cap, the percentage move). Mixing those up
 * is how a board reports a number nobody measured.
 */
import { describe, expect, it } from 'bun:test'

import { parseDexscreenerToken, poolsForToken } from '../dexscreener-token.ts'

const SHIB = '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE'
const WOOF = '0x8cDDd6EeA1067b78B77255e49861843F69D4703D'

function pool(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chainId: 'ethereum',
    dexId: 'uniswap',
    pairAddress: '0xpool',
    baseToken: { address: SHIB, name: 'SHIBA INU', symbol: 'SHIB' },
    quoteToken: { address: '0xweth', symbol: 'WETH' },
    priceUsd: '0.000005590',
    txns: { m5: { buys: 1, sells: 0 }, h24: { buys: 400, sells: 300 } },
    volume: { m5: 480, h24: 900_000 },
    priceChange: { h24: 8.5 },
    liquidity: { usd: 2_000_000 },
    fdv: 5_590_404_918,
    marketCap: 5_590_404_918,
    pairCreatedAt: 1_625_545_149_000,
    ...over,
  }
}

describe('poolsForToken', () => {
  it('keeps only pools whose BASE leg is the token asked about', () => {
    const rows = [
      pool(),
      // WOOF/SHIB: the endpoint returns it because SHIB is in it, and its
      // market cap belongs to WOOF.
      pool({
        baseToken: { address: WOOF, symbol: 'WOOF' },
        marketCap: 120_000,
      }),
    ]
    expect(poolsForToken(rows, 'ethereum', SHIB)).toHaveLength(1)
  })

  it('matches an address regardless of checksum casing', () => {
    const rows = [pool()]
    expect(poolsForToken(rows, 'ethereum', SHIB.toLowerCase())).toHaveLength(1)
  })

  it('drops a row the API answered for another chain', () => {
    const rows = [pool({ chainId: 'base' })]
    expect(poolsForToken(rows, 'ethereum', SHIB)).toHaveLength(0)
  })
})

describe('parseDexscreenerToken', () => {
  it('is null when no pool has this token as its base', () => {
    expect(
      parseDexscreenerToken(
        [pool({ baseToken: { address: WOOF, symbol: 'WOOF' } })],
        'ethereum',
        SHIB,
      ),
    ).toBeNull()
  })

  it('sums what pools add up to and quotes what only one can say', () => {
    const token = parseDexscreenerToken(
      [
        pool({ liquidity: { usd: 2_000_000 } }),
        pool({
          pairAddress: '0xshallow',
          liquidity: { usd: 500_000 },
          // A shallower pool quoting a different price and a stale cap: the
          // deepest one is what the row reports.
          priceUsd: '0.000004',
          marketCap: 4_000_000_000,
          priceChange: { h24: -30 },
          txns: { h24: { buys: 79, sells: 92 } },
          volume: { h24: 100_000 },
        }),
      ],
      'ethereum',
      SHIB,
    )

    expect(token).not.toBeNull()
    // Summed across both pools.
    expect(token!.liquidityUsd).toBe(2_500_000)
    expect(token!.flow.h24?.volumeUsd).toBe(1_000_000)
    expect(token!.flow.h24?.buys).toBe(479)
    expect(token!.flow.h24?.sells).toBe(392)
    // Quoted by the deepest pool alone.
    expect(token!.marketCapUsd).toBe(5_590_404_918)
    expect(token!.priceUsd).toBeCloseTo(0.00000559, 12)
    expect(token!.flow.h24?.priceChangePercent).toBe(8.5)
  })

  it('leaves the split volume at zero rather than deriving it', () => {
    // DexScreener counts trades per side and publishes ONE volume figure. A
    // split inferred from the count ratio would be a number nobody measured,
    // sitting in a field that means "measured".
    const token = parseDexscreenerToken([pool()], 'ethereum', SHIB)!
    expect(token.flow.h24?.buyVolumeUsd).toBe(0)
    expect(token.flow.h24?.sellVolumeUsd).toBe(0)
    expect(token.flow.h24?.volumeUsd).toBe(900_000)
  })

  it('publishes no audit, which the safety pane reads as unknown', () => {
    // Never an empty audit object: on an EVM chain there is no mint authority
    // to revoke, and an audit with three nulls in it would still paint the
    // pane as if a source had looked.
    const token = parseDexscreenerToken([pool()], 'ethereum', SHIB)!
    expect(token.audit).toBeNull()
    expect(token.holders).toBeNull()
    expect(token.curveProgress).toBeNull()
    expect(token.decimals).toBeNull()
  })

  it('dates the token by its earliest pool', () => {
    const token = parseDexscreenerToken(
      [
        pool({ pairCreatedAt: 1_700_000_000_000 }),
        pool({ pairAddress: '0xolder', pairCreatedAt: 1_625_545_149_000 }),
      ],
      'ethereum',
      SHIB,
    )!
    expect(token.createdAt).toBe(new Date(1_625_545_149_000).toISOString())
  })

  it('skips a window no pool reported', () => {
    const token = parseDexscreenerToken(
      [pool({ txns: { h24: { buys: 1, sells: 2 } }, volume: { h24: 10 } })],
      'ethereum',
      SHIB,
    )!
    expect(token.flow.h24).toBeDefined()
    expect(token.flow.m5).toBeUndefined()
    expect(token.flow.h1).toBeUndefined()
  })

  it('reads the socials the row carries and nothing else', () => {
    const token = parseDexscreenerToken(
      [
        pool({
          info: {
            imageUrl: 'https://cdn.dexscreener.com/shib.png',
            websites: [{ url: 'https://shibatoken.com' }],
            socials: [
              { url: 'https://x.com/shibtoken', type: 'twitter' },
              { url: 'https://discord.gg/shib', type: 'discord' },
            ],
          },
        }),
      ],
      'ethereum',
      SHIB,
    )!
    expect(token.socials.twitter).toBe('https://x.com/shibtoken')
    expect(token.socials.website).toBe('https://shibatoken.com')
    expect(token.socials.telegram).toBeNull()
    expect(token.iconUrl).toBe('https://cdn.dexscreener.com/shib.png')
  })
})
