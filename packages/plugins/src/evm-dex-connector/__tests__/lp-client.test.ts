// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The parsing half of the position reader, against fixtures.
 *
 * Everything a pane prints is derived in `buildPositionEntry`, so this is where
 * a mistranslated tick or a leg swapped for its neighbour gets caught. The RPC
 * walk itself is not mocked: it is six multicalls with no branching worth
 * simulating, and the parts that DO branch (what counts as a listable position,
 * what counts as this pool, what counts as an address) are pulled out and tested
 * directly.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildPositionEntry,
  isEvmAddress,
  isListablePosition,
  matchesPair,
  poolKeyOf,
} from '../lp-client'
import { LP_MANAGERS, lpManagersFor } from '../lp-deployments'
import { Q96, sqrtRatioAtTick } from '../lp-math'
import type { RawLpPosition } from '../lp-client'

const USDC = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  decimals: 6,
}
const WETH = {
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  symbol: 'WETH',
  decimals: 18,
}

const MANAGER = LP_MANAGERS['ethereum'][0]

function sqrtPriceX96At(tick: number): bigint {
  return BigInt(Math.round(sqrtRatioAtTick(tick) * Q96))
}

/** A live in-range USDC/WETH position: token0 is USDC, as the pool orders it. */
function rawPosition(overrides: Partial<RawLpPosition> = {}): RawLpPosition {
  return {
    manager: MANAGER,
    tokenId: 918_273n,
    token0: USDC.address,
    token1: WETH.address,
    fee: 500,
    tickLower: 195_000,
    tickUpper: 200_000,
    liquidity: 4_200_000_000_000_000_000n,
    tokensOwed0: 0n,
    tokensOwed1: 0n,
    ...overrides,
  }
}

describe('buildPositionEntry', () => {
  const poolAddress = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'

  test('reads a live in-range position end to end', () => {
    const entry = buildPositionEntry({
      market: 'ethereum',
      raw: rawPosition(),
      token0: USDC,
      token1: WETH,
      poolAddress,
      poolState: { sqrtPriceX96: sqrtPriceX96At(197_000), tick: 197_000 },
      fees: { amount0: 12_400_000n, amount1: 2_100_000_000_000_000n },
      pairAddresses: null,
    })

    expect(entry.market).toBe('ethereum')
    expect(entry.tokenId).toBe('918273')
    expect(entry.dexName).toBe('Uniswap v3')
    expect(entry.managerAddress).toBe(MANAGER.manager)
    expect(entry.poolAddress).toBe(poolAddress)
    expect(entry.feeTier).toBe(0.0005)
    expect(entry.inRange).toBe(true)
    expect(entry.currentTick).toBe(197_000)
    // Both legs are held while the price is inside the band.
    expect(entry.amount0).toBeGreaterThan(0)
    expect(entry.amount1).toBeGreaterThan(0)
    // Fees are descaled per leg: 12.4 USDC and 0.0021 WETH.
    expect(entry.fees0).toBeCloseTo(12.4, 6)
    expect(entry.fees1).toBeCloseTo(0.0021, 9)
    // Prices are token1 per token0, so a WETH figure per USDC.
    expect(entry.priceLower).toBeLessThan(entry.priceUpper!)
    expect(entry.priceCurrent).toBeGreaterThan(entry.priceLower!)
    expect(entry.priceCurrent).toBeLessThan(entry.priceUpper!)
    expect(1 / entry.priceCurrent!).toBeGreaterThan(1000)
  })

  test('an unread pool nulls the live fields and keeps the band', () => {
    const entry = buildPositionEntry({
      market: 'ethereum',
      raw: rawPosition(),
      token0: USDC,
      token1: WETH,
      poolAddress: null,
      poolState: null,
      fees: null,
      pairAddresses: null,
    })

    expect(entry.currentTick).toBeNull()
    expect(entry.sqrtPriceX96).toBeNull()
    expect(entry.inRange).toBeNull()
    expect(entry.amount0).toBeNull()
    expect(entry.amount1).toBeNull()
    // Not zero. A pane that printed 0 here would report an empty claim.
    expect(entry.fees0).toBeNull()
    expect(entry.fees1).toBeNull()
    // The band comes from the ticks alone, so it survives an unread pool.
    expect(entry.priceLower).toBeGreaterThan(0)
    expect(entry.priceUpper).toBeGreaterThan(0)
  })

  test('a position below its band holds only token0', () => {
    const entry = buildPositionEntry({
      market: 'ethereum',
      raw: rawPosition(),
      token0: USDC,
      token1: WETH,
      poolAddress,
      poolState: { sqrtPriceX96: sqrtPriceX96At(190_000), tick: 190_000 },
      fees: { amount0: 0n, amount1: 0n },
      pairAddresses: null,
    })
    expect(entry.inRange).toBe(false)
    expect(entry.amount1).toBe(0)
    expect(entry.amount0).toBeGreaterThan(0)
  })

  test('marks the position as this pool when both legs match by address', () => {
    const entry = buildPositionEntry({
      market: 'ethereum',
      raw: rawPosition(),
      token0: USDC,
      token1: WETH,
      poolAddress,
      poolState: { sqrtPriceX96: sqrtPriceX96At(197_000), tick: 197_000 },
      fees: null,
      // Lowercase on purpose: a pair key carries whatever case the caller had.
      pairAddresses: [WETH.address.toLowerCase(), USDC.address.toLowerCase()],
    })
    expect(entry.matchesPair).toBe(true)
  })

  test('keeps the manager fee in raw pool units alongside the fraction', () => {
    const entry = buildPositionEntry({
      market: 'ethereum',
      raw: rawPosition({ fee: 3000 }),
      token0: USDC,
      token1: WETH,
      poolAddress,
      poolState: null,
      fees: null,
      pairAddresses: null,
    })
    expect(entry.fee).toBe(3000)
    expect(entry.feeTier).toBe(0.003)
  })
})

describe('poolKeyOf', () => {
  test('the same pool on the same manager shares a key', () => {
    expect(poolKeyOf(rawPosition({ tokenId: 1n }))).toBe(
      poolKeyOf(rawPosition({ tokenId: 2n, tickLower: 100, tickUpper: 200 })),
    )
  })

  test('a different fee tier is a different pool', () => {
    expect(poolKeyOf(rawPosition({ fee: 500 }))).not.toBe(
      poolKeyOf(rawPosition({ fee: 3000 })),
    )
  })

  test('the same pair and fee on ANOTHER manager is a different pool', () => {
    // The bug this pins: on BNB Chain a wallet can hold a Uniswap v3 and a
    // PancakeSwap v3 position on the same pair at the same fee tier. A key
    // without the manager in it resolved both through one factory, and one
    // position was shown the other's pool state.
    const uniswap = LP_MANAGERS['bsc'][0]
    const pancake = LP_MANAGERS['bsc'].find(
      (m) => m.dexName === 'PancakeSwap v3',
    )!
    expect(poolKeyOf(rawPosition({ manager: uniswap }))).not.toBe(
      poolKeyOf(rawPosition({ manager: pancake })),
    )
  })
})

describe('matchesPair', () => {
  const tokens = [USDC.address, WETH.address] as const

  test('null when the caller asked about no pair', () => {
    expect(matchesPair(tokens, null)).toBeNull()
  })

  test('true regardless of leg order and case', () => {
    expect(
      matchesPair(tokens, [WETH.address.toUpperCase(), USDC.address] as const),
    ).toBe(true)
  })

  test('false when only one leg is in the pool', () => {
    expect(
      matchesPair(tokens, [
        USDC.address,
        '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      ] as const),
    ).toBe(false)
  })
})

describe('isListablePosition', () => {
  test('a live position lists', () => {
    expect(
      isListablePosition({
        liquidity: 1n,
        tokensOwed0: 0n,
        tokensOwed1: 0n,
      }),
    ).toBe(true)
  })

  test('a burned position with fees still owed lists', () => {
    expect(
      isListablePosition({
        liquidity: 0n,
        tokensOwed0: 5n,
        tokensOwed1: 0n,
      }),
    ).toBe(true)
  })

  test('an empty receipt does not', () => {
    expect(
      isListablePosition({
        liquidity: 0n,
        tokensOwed0: 0n,
        tokensOwed1: 0n,
      }),
    ).toBe(false)
  })
})

describe('isEvmAddress', () => {
  test('accepts a 20-byte hex address', () => {
    expect(isEvmAddress(USDC.address)).toBe(true)
  })

  test('refuses anything else', () => {
    expect(isEvmAddress('')).toBe(false)
    expect(isEvmAddress('0x123')).toBe(false)
    expect(isEvmAddress(`${USDC.address}00`)).toBe(false)
    expect(isEvmAddress(USDC.address.slice(2))).toBe(false)
    expect(isEvmAddress(null)).toBe(false)
    expect(isEvmAddress(42)).toBe(false)
  })
})

describe('lp deployments', () => {
  test('every pinned address is a syntactically valid contract address', () => {
    for (const [market, managers] of Object.entries(LP_MANAGERS)) {
      expect(managers.length).toBeGreaterThan(0)
      for (const manager of managers) {
        expect(isEvmAddress(manager.manager)).toBe(true)
        expect(isEvmAddress(manager.factory)).toBe(true)
        expect(manager.manager.toLowerCase()).not.toBe(
          manager.factory.toLowerCase(),
        )
        expect(manager.dexName.length).toBeGreaterThan(0)
        expect(market.length).toBeGreaterThan(0)
      }
    }
  })

  test('Base and BNB Chain do not reuse the mainnet deployment', () => {
    // The bug this pins: Uniswap v3 shares one address pair across Ethereum,
    // Arbitrum and Polygon but NOT on Base or BNB Chain, where reusing it reads
    // an address with no code at it.
    const mainnet = LP_MANAGERS['ethereum'][0]
    for (const market of ['base', 'bsc']) {
      expect(LP_MANAGERS[market][0].manager.toLowerCase()).not.toBe(
        mainnet.manager.toLowerCase(),
      )
      expect(LP_MANAGERS[market][0].factory.toLowerCase()).not.toBe(
        mainnet.factory.toLowerCase(),
      )
    }
  })

  test('Arbitrum and Polygon do share it', () => {
    const mainnet = LP_MANAGERS['ethereum'][0]
    for (const market of ['arbitrum', 'polygon']) {
      expect(LP_MANAGERS[market][0].manager).toBe(mainnet.manager)
      expect(LP_MANAGERS[market][0].factory).toBe(mainnet.factory)
    }
  })

  test('BNB Chain carries PancakeSwap v3 with its own slot0 layout', () => {
    const pancake = LP_MANAGERS['bsc'].find(
      (m) => m.dexName === 'PancakeSwap v3',
    )
    expect(pancake).toBeDefined()
    expect(pancake!.slot0).toBe('pancake-v3')
  })

  test('Solana has no entry, and asking for one is empty rather than a throw', () => {
    expect(lpManagersFor('jupiter')).toEqual([])
    expect(lpManagersFor('nonsense')).toEqual([])
  })
})
