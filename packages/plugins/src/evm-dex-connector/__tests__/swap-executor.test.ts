// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import {
  NATIVE_TOKEN_ADDRESS,
  executeSwap,
  getRoute,
  isAllowedRouter,
  scaleAmount,
} from '../swap-executor'
import { EVM_CHAINS } from '../chains'

const KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5'

type Captured = { url: string; init: RequestInit }

function stubFetch(
  responseJson: unknown,
  status = 200,
): { calls: Array<Captured> } {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(responseJson), { status })
  }) as unknown as typeof fetch
  return { calls }
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('scaleAmount — decimal string to smallest unit, no float loss', () => {
  it('scales whole and fractional parts', () => {
    expect(scaleAmount('1.5', 6)).toBe(1_500_000n)
    expect(scaleAmount('0.000001', 6)).toBe(1n)
    expect(scaleAmount('2', 18)).toBe(2_000_000_000_000_000_000n)
  })

  it('keeps precision beyond double-float range', () => {
    // 123456789.123456789012345678 * 1e18 — unrepresentable as a double
    expect(scaleAmount('123456789.123456789012345678', 18)).toBe(
      123456789123456789012345678n,
    )
  })

  it('truncates excess fractional digits instead of rounding up', () => {
    expect(scaleAmount('0.1234567', 6)).toBe(123_456n)
  })

  it('handles edge formats', () => {
    expect(scaleAmount('.5', 6)).toBe(500_000n)
    expect(scaleAmount('5.', 6)).toBe(5_000_000n)
    expect(scaleAmount('0', 6)).toBe(0n)
    expect(scaleAmount('', 6)).toBe(0n)
  })
})

describe('getRoute — KyberSwap aggregator request/response', () => {
  const chain = EVM_CHAINS['base']

  it('requests the chain-scoped routes endpoint and returns the route', async () => {
    const { calls } = stubFetch({
      code: 0,
      data: {
        routeSummary: {
          tokenIn: NATIVE_TOKEN_ADDRESS.toLowerCase(),
          amountIn: '1000000000000000000',
          tokenOut: chain.quote.address.toLowerCase(),
          amountOut: '1666407749',
        },
        routerAddress: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5',
      },
    })

    const route = await getRoute(
      chain,
      NATIVE_TOKEN_ADDRESS,
      chain.quote.address,
      1_000_000_000_000_000_000n,
    )

    expect(route?.routerAddress).toBe(
      '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5',
    )
    expect(route?.routeSummary.amountOut).toBe('1666407749')

    const url = new URL(calls[0].url)
    expect(url.origin + url.pathname).toBe(
      'https://aggregator-api.kyberswap.com/base/api/v1/routes',
    )
    expect(url.searchParams.get('tokenIn')).toBe(NATIVE_TOKEN_ADDRESS)
    expect(url.searchParams.get('tokenOut')).toBe(chain.quote.address)
    expect(url.searchParams.get('amountIn')).toBe('1000000000000000000')
  })

  it('returns null on a non-zero aggregator code', async () => {
    stubFetch({ code: 4008, message: 'route not found' })
    const route = await getRoute(chain, NATIVE_TOKEN_ADDRESS, '0xdead', 1n)
    expect(route).toBeNull()
  })

  it('returns null when routerAddress is missing', async () => {
    stubFetch({ code: 0, data: { routeSummary: { amountOut: '1' } } })
    const route = await getRoute(chain, NATIVE_TOKEN_ADDRESS, '0xdead', 1n)
    expect(route).toBeNull()
  })

  it('returns null on HTTP failure', async () => {
    stubFetch({ message: 'oops' }, 500)
    const route = await getRoute(chain, NATIVE_TOKEN_ADDRESS, '0xdead', 1n)
    expect(route).toBeNull()
  })

  it('rejects a route naming a non-allowlisted router (fail closed)', async () => {
    stubFetch({
      code: 0,
      data: {
        routeSummary: {
          tokenIn: NATIVE_TOKEN_ADDRESS.toLowerCase(),
          amountIn: '1000000000000000000',
          tokenOut: chain.quote.address.toLowerCase(),
          amountOut: '1666407749',
        },
        routerAddress: '0x1111111111111111111111111111111111111111',
      },
    })
    const route = await getRoute(
      chain,
      NATIVE_TOKEN_ADDRESS,
      chain.quote.address,
      1_000_000_000_000_000_000n,
    )
    expect(route).toBeNull()
  })

  it('rejects a route whose tokens/amount do not match the request', async () => {
    const tampered = {
      code: 0,
      data: {
        routeSummary: {
          tokenIn: NATIVE_TOKEN_ADDRESS.toLowerCase(),
          amountIn: '2000000000000000000', // 2x what the user asked for
          tokenOut: chain.quote.address.toLowerCase(),
          amountOut: '1666407749',
        },
        routerAddress: KYBER_ROUTER,
      },
    }
    stubFetch(tampered)
    const route = await getRoute(
      chain,
      NATIVE_TOKEN_ADDRESS,
      chain.quote.address,
      1_000_000_000_000_000_000n,
    )
    expect(route).toBeNull()
  })
})

describe('isAllowedRouter — KyberSwap router allowlist', () => {
  it('accepts the pinned MetaAggregationRouterV2 in any casing', () => {
    expect(isAllowedRouter(KYBER_ROUTER)).toBe(true)
    expect(isAllowedRouter(KYBER_ROUTER.toLowerCase())).toBe(true)
  })

  it('rejects unknown addresses and non-strings', () => {
    expect(isAllowedRouter('0x1111111111111111111111111111111111111111')).toBe(
      false,
    )
    expect(isAllowedRouter(undefined)).toBe(false)
    expect(isAllowedRouter(42)).toBe(false)
  })
})

describe('executeSwap — build-response validation before signing', () => {
  const chain = EVM_CHAINS['base']
  const WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

  // A route as returned by getRoute (already anchored to the user request)
  const route = {
    routeSummary: {
      tokenIn: NATIVE_TOKEN_ADDRESS.toLowerCase(),
      amountIn: '1000000000000000000',
      tokenOut: chain.quote.address.toLowerCase(),
      amountOut: '1666407749',
    },
    routerAddress: KYBER_ROUTER,
  }

  function run(buildData: Record<string, unknown>) {
    stubFetch({ code: 0, data: buildData })
    const getPrivateKey = mock(async () => null)
    return {
      getPrivateKey,
      result: executeSwap({
        chain,
        route,
        walletAddress: WALLET,
        getPrivateKey,
        rpcUrl: 'http://localhost:0',
        slippageBps: 100,
      }),
    }
  }

  it('refuses to sign when the build response names an unknown router', async () => {
    const { result, getPrivateKey } = run({
      data: '0xdeadbeef',
      routerAddress: '0x2222222222222222222222222222222222222222',
    })
    const res = await result
    expect(res.success).toBe(false)
    expect(res.error).toContain('unknown router')
    // The private key must never be touched on a rejected build
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('refuses to sign malformed calldata', async () => {
    const { result, getPrivateKey } = run({
      data: 'not-hex-calldata',
      routerAddress: KYBER_ROUTER,
    })
    const res = await result
    expect(res.success).toBe(false)
    expect(res.error).toContain('malformed calldata')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('refuses to sign when the build changes amountIn', async () => {
    const { result, getPrivateKey } = run({
      data: '0xdeadbeef',
      routerAddress: KYBER_ROUTER,
      amountIn: '3000000000000000000',
    })
    const res = await result
    expect(res.success).toBe(false)
    expect(res.error).toContain('changed amountIn')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('refuses to sign when the built output falls below the slippage floor', async () => {
    const { result, getPrivateKey } = run({
      data: '0xdeadbeef',
      routerAddress: KYBER_ROUTER,
      amountIn: '1000000000000000000',
      amountOutMin: '1000000000', // way below 1666407749 * (1 - 1%)
    })
    const res = await result
    expect(res.success).toBe(false)
    expect(res.error).toContain('slippage floor')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('proceeds to key retrieval when the build passes every check', async () => {
    const { result, getPrivateKey } = run({
      data: '0xdeadbeef',
      routerAddress: KYBER_ROUTER,
      amountIn: '1000000000000000000',
      amountOut: '1666407749',
      amountOutMin: '1649743672', // exactly the 1% slippage floor
    })
    const res = await result
    // Key mock returns null, so the swap stops right after validation —
    // reaching this error proves the untrusted-response checks passed.
    expect(res).toEqual({
      success: false,
      error: 'Wallet private key not found',
    })
    expect(getPrivateKey).toHaveBeenCalledTimes(1)
  })
})
