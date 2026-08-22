// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The gems parser, pinned against real response shapes.
 *
 * Both fixtures below are trimmed copies of live `datapi.jup.ag/v1/pools/gems`
 * rows read on 2026-08-22. They exist because three of the mistakes this
 * parser can make are silent and expensive:
 *
 * 1. Taking `pool.id` as identity. It is the POOL address; the mint is
 *    `baseAsset.id`, and confusing them points the chart and every swap at the
 *    wrong account.
 * 2. Scaling `priceChange` or `topHoldersPercentage`. The first is already a
 *    percentage and the second is too, but the contract wants the second as a
 *    0..1 ratio, so exactly one of them gets divided.
 * 3. Reading a graduated row's missing `bondingCurve` as zero. It is complete,
 *    not stalled at the bottom.
 */
import { describe, expect, test } from 'bun:test'

import { parsePool } from '../gems-client'
import type { RawPool } from '../gems-client'

/** A pump.fun token most of the way up its curve. */
const GRADUATING: RawPool = {
  id: '5DLJu2UgaLXWqRehryDZxisS6voRp2wmBaXvhfsPpump',
  chain: 'solana',
  dex: 'pump.fun',
  type: 'pumpfun',
  createdAt: '2026-08-21T14:34:09Z',
  liquidity: 9758.820985833938,
  volume24h: 232755.09,
  bondingCurve: 96.06111557906519,
  baseAsset: {
    id: '5DLJu2UgaLXWqRehryDZxisS6voRp2wmBaXvhfsPpump',
    name: 'Speedycat',
    symbol: 'SPEEDY',
    icon: 'https://ipfs.io/ipfs/bafybeifvna',
    decimals: 6,
    launchpad: 'pump.fun',
    holderCount: 350,
    mcap: 31567.53967405065,
    fdv: 31567.53967405065,
    usdPrice: 3.156852323182121e-5,
    organicScore: 52.18590130364854,
    audit: {
      mintAuthorityDisabled: true,
      freezeAuthorityDisabled: true,
      topHoldersPercentage: 22.120832609443323,
      devMints: 1,
    },
    stats5m: {
      priceChange: 3.6739031445290142,
      buyVolume: 349.8471496066538,
      sellVolume: 220.15528863314344,
      numBuys: 15,
      numSells: 4,
      numTraders: 10,
    },
  },
}

/**
 * A freshly migrated token. Note what is MISSING: the pool carries no
 * `bondingCurve` and no `liquidity`, and the asset carries no `mcap`. That is
 * the real shape, not a truncation.
 */
const GRADUATED: RawPool = {
  id: 'ADSdfkmc9hTa1FzvKFiT5TUM8x3EaoK7HMQqBZbxp9NF',
  chain: 'solana',
  dex: 'swap.pump.fun',
  type: 'pumpfun-amm',
  bondingCurve: null,
  baseAsset: {
    // Deliberately DIFFERENT from `pool.id`, which is the whole point.
    id: 'QA2NdFf88DDgePiR3FL6RMEUYZNQGUKyRoVANDQpump',
    symbol: 'SCUBA',
    launchpad: 'pump.fun',
    holderCount: 293,
    graduatedPool: 'ADSdfkmc9hTa1FzvKFiT5TUM8x3EaoK7HMQqBZbxp9NF',
    graduatedAt: '2026-08-21T23:06:28Z',
    firstPool: { createdAt: '2026-08-21T22:31:28Z' },
  },
}

describe('parsePool', () => {
  test('identity is the MINT, never the pool address', () => {
    const token = parsePool(GRADUATED, 'graduated')!
    expect(token.address).toBe('QA2NdFf88DDgePiR3FL6RMEUYZNQGUKyRoVANDQpump')
    expect(token.address).not.toBe(GRADUATED.id)
    expect(token.chain).toBe('solana')
  })

  test('curve percentage becomes a 0..1 ratio', () => {
    const token = parsePool(GRADUATING, 'graduating')!
    expect(token.curveProgress).toBeCloseTo(0.9606, 4)
  })

  test('a graduated row is complete, not zero', () => {
    // `bondingCurve: null` is the shape, and the naive read of it is 0, which
    // would sort every fresh migration to the bottom of a progress ranking.
    const token = parsePool(GRADUATED, 'graduated')!
    expect(token.curveProgress).toBe(1)
    expect(token.graduatedAt).toBe('2026-08-21T23:06:28Z')
  })

  test('price change stays a percentage and top holders becomes a ratio', () => {
    const token = parsePool(GRADUATING, 'graduating')!
    expect(token.flow.m5?.priceChangePercent).toBeCloseTo(3.674, 3)
    expect(token.audit?.topHoldersPercent).toBeCloseTo(0.2212, 4)
  })

  test('carries the flow counts a column ranks on', () => {
    const token = parsePool(GRADUATING, 'graduating')!
    expect(token.flow.m5).toEqual({
      buys: 15,
      sells: 4,
      buyVolumeUsd: 349.8471496066538,
      sellVolumeUsd: 220.15528863314344,
      volumeUsd: 349.8471496066538 + 220.15528863314344,
      traders: 10,
      priceChangePercent: 3.6739031445290142,
    })
    // Only the windows the source published. An absent window must not appear
    // as a row of zeros in the flow pane.
    expect(token.flow.h24).toBeUndefined()
  })

  test('pool liquidity wins over the asset-level figure', () => {
    // On a curve there is one pool that matters; the asset-level number sums
    // every pool the token trades in.
    const token = parsePool(GRADUATING, 'graduating')!
    expect(token.liquidityUsd).toBeCloseTo(9758.82, 2)
  })

  test('a missing audit field is unknown, never safe', () => {
    const token = parsePool(GRADUATED, 'graduated')!
    // This row published no audit at all.
    expect(token.audit).toBeNull()

    const partial = parsePool(
      {
        ...GRADUATING,
        baseAsset: {
          ...GRADUATING.baseAsset!,
          audit: { mintAuthorityDisabled: true },
        },
      },
      'graduating',
    )!
    expect(partial.audit?.mintAuthorityDisabled).toBe(true)
    expect(partial.audit?.freezeAuthorityDisabled).toBeNull()
    expect(partial.audit?.topHoldersPercent).toBeNull()
  })

  test('records which source answered, so a tilde can be earned', () => {
    expect(parsePool(GRADUATING, 'graduating')!.source).toBe('jupiter-gems')
  })

  test('refuses a row with no base asset rather than inventing one', () => {
    expect(parsePool({ id: 'pool-only' }, 'new')).toBeNull()
    expect(parsePool({ id: 'p', baseAsset: { symbol: 'X' } }, 'new')).toBeNull()
  })

  test('falls back to the mint when a token ships no symbol', () => {
    const token = parsePool(
      { id: 'p', baseAsset: { id: 'AbCdEfGhIjKl' } },
      'new',
    )!
    expect(token.symbol).toBe('AbCd')
    expect(token.name).toBe('AbCdEfGhIjKl')
  })
})
