// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The write path, in the two places it can be wrong without anybody noticing.
 *
 * 1. THE ABI. A liquidity write is a struct passed by value, and a field typed
 *    or ordered wrong still encodes — into a different function, or into the
 *    same function with the arguments shifted. The selectors below are the ones
 *    Uniswap's deployed managers publish, so asserting them proves the tuples in
 *    `NFPM_WRITE_ABI` were transcribed correctly rather than plausibly.
 *
 * 2. THE REFUSALS. Every guard is asserted to run BEFORE the private key is
 *    touched, by handing the writer a key retriever that counts its calls. A
 *    refusal that reads the key is a refusal that has already lost the property
 *    it exists to protect.
 *
 * The chain reads are driven by a stubbed JSON-RPC endpoint rather than a mocked
 * viem, so the multicall, the ABI decoding and the address comparison are the
 * real ones. Nothing here signs: the key retriever always answers null, and the
 * furthest a test gets is the failure immediately after the last gate.
 */
import { afterEach, describe, expect, it, mock } from 'bun:test'
import {
  encodeAbiParameters,
  encodeFunctionResult,
  toFunctionSelector,
} from 'viem'

import { EVM_CHAINS } from '../chains'
import { LP_MANAGERS } from '../lp-deployments'
import { Q96, rawAmountsForLiquidity, sqrtRatioAtTick } from '../lp-math'
import {
  LP_DEFAULT_SLIPPAGE_BPS,
  LP_MAX_SLIPPAGE_BPS,
  NFPM_WRITE_ABI,
  applySlippageFloor,
  decreaseMinAmounts,
  executeLpWrite,
  floorToBigInt,
  isLpWriteAction,
  liquidityForPercent,
  lpWriteFailure,
  normalizeSlippageBps,
  parseTokenId,
  resolveLpManager,
  writeDeadline,
} from '../lp-writer'

const ETH_MANAGER = LP_MANAGERS['ethereum'][0]
const BASE_MANAGER = LP_MANAGERS['base'][0]
const PANCAKE_MANAGER = LP_MANAGERS['bsc'][1]

const WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const SOMEBODY_ELSE = '0x1111111111111111111111111111111111111111'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

// ── 1. ABI selectors ───────────────────────────────────────────────────

describe('NFPM_WRITE_ABI — selectors match the deployed managers', () => {
  // Published by Uniswap for INonfungiblePositionManager / IMulticall, and
  // unchanged in PancakeSwap v3's fork of both interfaces.
  const PUBLISHED: Record<string, `0x${string}`> = {
    ownerOf: '0x6352211e',
    positions: '0x99fbab88',
    collect: '0xfc6f7865',
    decreaseLiquidity: '0x0c49ccbe',
    increaseLiquidity: '0x219f5d17',
    multicall: '0xac9650d8',
  }

  for (const [name, selector] of Object.entries(PUBLISHED)) {
    it(`${name} encodes as ${selector}`, () => {
      const entry = NFPM_WRITE_ABI.find((item) => item.name === name)
      expect(entry).toBeDefined()
      expect(toFunctionSelector(entry!)).toBe(selector)
    })
  }

  it('covers every write the module sends', () => {
    const names = new Set<string>(NFPM_WRITE_ABI.map((item) => item.name))
    expect(names.has('factory')).toBe(true)
    for (const name of Object.keys(PUBLISHED)) {
      expect(names.has(name)).toBe(true)
    }
  })
})

// ── 2. Manager allowlist ───────────────────────────────────────────────

describe('resolveLpManager — the pinned deployment or nothing', () => {
  it('accepts a pinned manager in any casing', () => {
    expect(resolveLpManager('ethereum', ETH_MANAGER.manager)?.dexName).toBe(
      'Uniswap v3',
    )
    expect(
      resolveLpManager('ethereum', ETH_MANAGER.manager.toLowerCase())?.manager,
    ).toBe(ETH_MANAGER.manager)
  })

  it('resolves the PancakeSwap manager to its own slot0 variant', () => {
    expect(resolveLpManager('bsc', PANCAKE_MANAGER.manager)?.slot0).toBe(
      'pancake-v3',
    )
  })

  it('refuses a manager pinned on a DIFFERENT chain', () => {
    // Base deployed its own manager; the mainnet address has no code there and
    // vice versa, so a cross-chain address is exactly the mistake to catch.
    expect(resolveLpManager('ethereum', BASE_MANAGER.manager)).toBeNull()
    expect(resolveLpManager('base', ETH_MANAGER.manager)).toBeNull()
  })

  it('refuses unknown addresses, malformed input and a chain with no deployment', () => {
    expect(resolveLpManager('ethereum', SOMEBODY_ELSE)).toBeNull()
    expect(resolveLpManager('ethereum', '0xdead')).toBeNull()
    expect(resolveLpManager('ethereum', undefined)).toBeNull()
    expect(resolveLpManager('jupiter', ETH_MANAGER.manager)).toBeNull()
  })
})

describe('parseTokenId / isLpWriteAction', () => {
  it('accepts a decimal id and refuses everything else', () => {
    expect(parseTokenId('918273')).toBe(918_273n)
    expect(parseTokenId('0')).toBe(0n)
    expect(parseTokenId('12.5')).toBeNull()
    expect(parseTokenId('0x1f')).toBeNull()
    expect(parseTokenId('-1')).toBeNull()
    expect(parseTokenId(918_273)).toBeNull()
    expect(parseTokenId('')).toBeNull()
  })

  it('names exactly the three write actions', () => {
    expect(isLpWriteAction('lp-collect')).toBe(true)
    expect(isLpWriteAction('lp-decrease')).toBe(true)
    expect(isLpWriteAction('lp-increase')).toBe(true)
    expect(isLpWriteAction('lp-positions')).toBe(false)
    expect(isLpWriteAction('place')).toBe(false)
  })
})

// ── 3. Pure math ───────────────────────────────────────────────────────

describe('liquidityForPercent — exact integer slices', () => {
  const L = 4_200_000_000_000_000_001n

  it('100% is the position, to the last unit', () => {
    expect(liquidityForPercent(L, 100)).toBe(L)
  })

  it('splits proportionally, rounding down', () => {
    expect(liquidityForPercent(1_000n, 25)).toBe(250n)
    expect(liquidityForPercent(1_000n, 75)).toBe(750n)
    // 4200000000000000001 * 25 / 100 truncates rather than rounding up
    expect(liquidityForPercent(L, 25)).toBe(1_050_000_000_000_000_000n)
  })

  it('never removes more than the position holds', () => {
    let total = 0n
    for (const pct of [25, 25, 25, 25]) {
      total += liquidityForPercent(L, pct)!
    }
    expect(total <= L).toBe(true)
  })

  it('refuses fractional, zero and out-of-range percentages', () => {
    expect(liquidityForPercent(L, 0)).toBeNull()
    expect(liquidityForPercent(L, 101)).toBeNull()
    expect(liquidityForPercent(L, 12.5)).toBeNull()
    expect(liquidityForPercent(L, Number.NaN)).toBeNull()
    expect(liquidityForPercent(0n, 50)).toBeNull()
  })
})

describe('normalizeSlippageBps', () => {
  it('defaults when unset and rounds a fractional bps', () => {
    expect(normalizeSlippageBps(undefined)).toBe(LP_DEFAULT_SLIPPAGE_BPS)
    expect(normalizeSlippageBps(null)).toBe(LP_DEFAULT_SLIPPAGE_BPS)
    expect(normalizeSlippageBps(50.4)).toBe(50)
  })

  it('refuses a tolerance that would stop protecting anything', () => {
    expect(normalizeSlippageBps(-1)).toBeNull()
    expect(normalizeSlippageBps(LP_MAX_SLIPPAGE_BPS + 1)).toBeNull()
    expect(normalizeSlippageBps('50')).toBeNull()
    expect(normalizeSlippageBps(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('applySlippageFloor — a floor, rounded down', () => {
  it('takes exactly the stated haircut', () => {
    expect(applySlippageFloor(10_000n, 50)).toBe(9_950n)
    expect(applySlippageFloor(1_000_000n, 250)).toBe(975_000n)
  })

  it('is the identity at zero tolerance', () => {
    expect(applySlippageFloor(1_234_567n, 0)).toBe(1_234_567n)
  })

  it('rounds down rather than up', () => {
    // 7 * 9950 / 10000 = 6.965 → 6, never 7
    expect(applySlippageFloor(7n, 50)).toBe(6n)
  })

  it('is zero for nothing', () => {
    expect(applySlippageFloor(0n, 50)).toBe(0n)
    expect(applySlippageFloor(-5n, 50)).toBe(0n)
  })
})

describe('floorToBigInt', () => {
  it('floors and refuses the values a float amount can degenerate to', () => {
    expect(floorToBigInt(10.99)).toBe(10n)
    expect(floorToBigInt(1e21)).toBe(1_000_000_000_000_000_000_000n)
    expect(floorToBigInt(0)).toBe(0n)
    expect(floorToBigInt(-3)).toBe(0n)
    expect(floorToBigInt(Number.NaN)).toBe(0n)
    expect(floorToBigInt(Number.POSITIVE_INFINITY)).toBe(0n)
  })
})

describe('decreaseMinAmounts — bounds under the amounts a burn returns', () => {
  const tickLower = 195_000
  const tickUpper = 200_000
  const inRangeTick = 197_500
  const sqrtPriceX96 = BigInt(Math.round(sqrtRatioAtTick(inRangeTick) * Q96))
  const liquidity = 4_200_000_000_000_000_000n

  function amountsAt(tick: number, l: bigint) {
    return rawAmountsForLiquidity({
      liquidity: l,
      sqrtPriceX96: BigInt(Math.round(sqrtRatioAtTick(tick) * Q96)),
      currentTick: tick,
      tickLower,
      tickUpper,
    })
  }

  it('sits just under what the position holds, on both legs', () => {
    const expected = amountsAt(inRangeTick, liquidity)
    const { amount0Min, amount1Min } = decreaseMinAmounts({
      liquidityToRemove: liquidity,
      sqrtPriceX96,
      currentTick: inRangeTick,
      tickLower,
      tickUpper,
      slippageBps: 50,
    })
    expect(Number(amount0Min)).toBeLessThan(expected.amount0)
    expect(Number(amount1Min)).toBeLessThan(expected.amount1)
    // Within the haircut plus one unit of flooring, never further below.
    expect(Number(amount0Min)).toBeGreaterThan(expected.amount0 * 0.9949 - 2)
    expect(Number(amount1Min)).toBeGreaterThan(expected.amount1 * 0.9949 - 2)
  })

  it('scales with the slice being removed', () => {
    const full = decreaseMinAmounts({
      liquidityToRemove: liquidity,
      sqrtPriceX96,
      currentTick: inRangeTick,
      tickLower,
      tickUpper,
      slippageBps: 50,
    })
    const quarter = decreaseMinAmounts({
      liquidityToRemove: liquidityForPercent(liquidity, 25)!,
      sqrtPriceX96,
      currentTick: inRangeTick,
      tickLower,
      tickUpper,
      slippageBps: 50,
    })
    // Linear in liquidity, so a quarter of the range is a quarter of the floor.
    expect(Number(quarter.amount0Min) / Number(full.amount0Min)).toBeCloseTo(
      0.25,
      6,
    )
    expect(Number(quarter.amount1Min) / Number(full.amount1Min)).toBeCloseTo(
      0.25,
      6,
    )
  })

  it('is single-sided for a position the price has left', () => {
    const below = decreaseMinAmounts({
      liquidityToRemove: liquidity,
      sqrtPriceX96: BigInt(Math.round(sqrtRatioAtTick(tickLower - 500) * Q96)),
      currentTick: tickLower - 500,
      tickLower,
      tickUpper,
      slippageBps: 50,
    })
    expect(below.amount1Min).toBe(0n)
    expect(below.amount0Min > 0n).toBe(true)

    const above = decreaseMinAmounts({
      liquidityToRemove: liquidity,
      sqrtPriceX96: BigInt(Math.round(sqrtRatioAtTick(tickUpper + 500) * Q96)),
      currentTick: tickUpper + 500,
      tickLower,
      tickUpper,
      slippageBps: 50,
    })
    expect(above.amount0Min).toBe(0n)
    expect(above.amount1Min > 0n).toBe(true)
  })

  it('at zero tolerance is the floored amounts themselves', () => {
    const expected = amountsAt(inRangeTick, liquidity)
    const mins = decreaseMinAmounts({
      liquidityToRemove: liquidity,
      sqrtPriceX96,
      currentTick: inRangeTick,
      tickLower,
      tickUpper,
      slippageBps: 0,
    })
    expect(mins.amount0Min).toBe(BigInt(Math.floor(expected.amount0)))
    expect(mins.amount1Min).toBe(BigInt(Math.floor(expected.amount1)))
  })
})

describe('writeDeadline', () => {
  it('is ten minutes out, in unix seconds', () => {
    expect(writeDeadline(1_700_000_000_000)).toBe(1_700_000_600n)
  })
})

describe('lpWriteFailure', () => {
  it('reports a refusal with no transaction attached', () => {
    expect(lpWriteFailure('lp-collect', 'base', '42', 'nope')).toEqual({
      success: false,
      action: 'lp-collect',
      market: 'base',
      tokenId: '42',
      txHash: null,
      error: 'nope',
    })
  })
})

// ── 4. Refusals, against a stubbed chain ───────────────────────────────

type RpcHandler = (method: string, params: Array<unknown>) => unknown

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stubRpc(handler: RpcHandler) {
  globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      id: number
      method: string
      params?: Array<unknown>
    }
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: handler(body.method, body.params ?? []),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as unknown as typeof fetch
}

/** Multicall3's `aggregate3` return shape, so viem's decoder sees real data. */
function aggregate3(
  entries: Array<{ success: boolean; returnData: `0x${string}` }>,
): `0x${string}` {
  return encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
    [entries],
  )
}

function ok(returnData: `0x${string}`) {
  return { success: true, returnData }
}

function ownerOfResult(address: string) {
  return encodeFunctionResult({
    abi: NFPM_WRITE_ABI,
    functionName: 'ownerOf',
    result: address as `0x${string}`,
  })
}

function factoryResult(address: string) {
  return encodeFunctionResult({
    abi: NFPM_WRITE_ABI,
    functionName: 'factory',
    result: address as `0x${string}`,
  })
}

/** A live in-range USDC/WETH position, as `positions()` would report it. */
function positionsResult(liquidity = 4_200_000_000_000_000_000n) {
  return encodeFunctionResult({
    abi: NFPM_WRITE_ABI,
    functionName: 'positions',
    result: [
      0n,
      '0x0000000000000000000000000000000000000000',
      USDC as `0x${string}`,
      WETH as `0x${string}`,
      500,
      195_000,
      200_000,
      liquidity,
      0n,
      0n,
      0n,
      0n,
    ],
  })
}

describe('executeLpWrite — every refusal happens before the key is read', () => {
  const chain = EVM_CHAINS['ethereum']

  function run(
    overrides: Partial<Parameters<typeof executeLpWrite>[0]> = {},
    keyValue: string | null = null,
  ) {
    const getPrivateKey = mock(async () => keyValue)
    return {
      getPrivateKey,
      result: executeLpWrite({
        chain,
        action: 'lp-collect',
        manager: ETH_MANAGER.manager,
        tokenId: '918273',
        walletAddress: WALLET,
        getPrivateKey,
        rpcUrl: 'http://127.0.0.1:9/rpc',
        ...overrides,
      }),
    }
  }

  it('refuses a manager that is not the pinned deployment', async () => {
    const { result, getPrivateKey } = run({ manager: SOMEBODY_ELSE })
    const res = await result
    expect(res.success).toBe(false)
    expect(res.error).toContain('Unknown position manager')
    expect(res.txHash).toBeNull()
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('refuses a malformed position id', async () => {
    const { result, getPrivateKey } = run({ tokenId: '91:82' })
    expect((await result).error).toContain('Invalid position id')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('refuses a slippage tolerance above the ceiling', async () => {
    const { result, getPrivateKey } = run({
      action: 'lp-decrease',
      liquidityPct: 50,
      slippageBps: LP_MAX_SLIPPAGE_BPS + 1,
    })
    expect((await result).error).toContain('Slippage tolerance')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('refuses a fractional removal percentage', async () => {
    const { result, getPrivateKey } = run({
      action: 'lp-decrease',
      liquidityPct: 33.3,
    })
    expect((await result).error).toContain('whole number')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('refuses an increase with nothing in it', async () => {
    const { result, getPrivateKey } = run({
      action: 'lp-increase',
      amount0Desired: '0',
      amount1Desired: '',
    })
    expect((await result).error).toContain('both amounts are zero')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('refuses a position the wallet does not own', async () => {
    stubRpc((method) => {
      if (method !== 'eth_call') return '0x'
      return aggregate3([
        ok(ownerOfResult(SOMEBODY_ELSE)),
        ok(factoryResult(ETH_MANAGER.factory)),
        ok(positionsResult()),
      ])
    })
    const { result, getPrivateKey } = run()
    const res = await result
    expect(res.success).toBe(false)
    expect(res.error).toContain('not held by this wallet')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('refuses a manager whose factory disagrees with the pinned one', async () => {
    stubRpc((method) => {
      if (method !== 'eth_call') return '0x'
      return aggregate3([
        ok(ownerOfResult(WALLET)),
        ok(factoryResult(SOMEBODY_ELSE)),
        ok(positionsResult()),
      ])
    })
    const { result, getPrivateKey } = run()
    expect((await result).error).toContain('Pinned factory does not match')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('refuses a removal on a position with no liquidity, after the reads', async () => {
    stubRpc((method) => {
      if (method !== 'eth_call') return '0x'
      return aggregate3([
        ok(ownerOfResult(WALLET)),
        ok(factoryResult(ETH_MANAGER.factory)),
        ok(positionsResult(0n)),
      ])
    })
    // Decided from chain state, so it is decided before the key: an emptied
    // position must not cost a vault prompt.
    const { result, getPrivateKey } = run({
      action: 'lp-decrease',
      liquidityPct: 25,
    })
    expect((await result).error).toContain('no liquidity to remove')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('reaches the key only once every gate has passed, and stops without one', async () => {
    stubRpc((method) => {
      if (method !== 'eth_call') return '0x'
      return aggregate3([
        ok(ownerOfResult(WALLET)),
        ok(factoryResult(ETH_MANAGER.factory)),
        ok(positionsResult()),
      ])
    })
    const { result, getPrivateKey } = run()
    const res = await result
    expect(res).toEqual({
      success: false,
      action: 'lp-collect',
      market: 'ethereum',
      tokenId: '918273',
      txHash: null,
      error: 'Wallet private key not found',
    })
    expect(getPrivateKey).toHaveBeenCalledTimes(1)
  })

  it('refuses to sign with a key that derives to another address', async () => {
    stubRpc((method) => {
      if (method !== 'eth_call') return '0x'
      return aggregate3([
        ok(ownerOfResult(WALLET)),
        ok(factoryResult(ETH_MANAGER.factory)),
        ok(positionsResult()),
      ])
    })
    const { result } = run(
      {},
      // A well-formed key for a completely different account.
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    )
    expect((await result).error).toBe('Private key does not match wallet')
  })

  it('reports an unreadable position as data rather than a throw', async () => {
    stubRpc((method) => {
      if (method !== 'eth_call') return '0x'
      return aggregate3([
        { success: false, returnData: '0x' },
        ok(factoryResult(ETH_MANAGER.factory)),
        ok(positionsResult()),
      ])
    })
    const { result, getPrivateKey } = run()
    const res = await result
    expect(res.success).toBe(false)
    expect(res.error).toContain('could not be read')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })
})
