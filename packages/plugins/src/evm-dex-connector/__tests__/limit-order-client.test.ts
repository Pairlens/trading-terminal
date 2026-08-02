// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { clearTokenDirectory } from '@pairlens/market-engine/token-directory'
import {
  coerceTypedMessage,
  toNormalizedLimitOrder,
  validateOrderSignPayload,
} from '../limit-order-client'
import { clearTokenCaches } from '../token-client'
import { EVM_CHAINS } from '../chains'
import type { TypedDataPayload } from '../limit-order-client'

const chain = EVM_CHAINS['base']
const WETH = '0x4200000000000000000000000000000000000006'

const realFetch = globalThis.fetch
beforeEach(() => {
  clearTokenCaches()
  clearTokenDirectory()
})
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('coerceTypedMessage — EIP-712 value coercion for viem', () => {
  const types = {
    Order: [
      { name: 'salt', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'makingAmount', type: 'uint256' },
      { name: 'makerAssetData', type: 'bytes' },
    ],
    CancelOrder: [{ name: 'orderIds', type: 'uint64[]' }],
  }

  it('converts uint strings to bigints, leaves addresses/bytes alone', () => {
    const out = coerceTypedMessage(types, 'Order', {
      salt: '12345678901234567890',
      maker: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      makingAmount: '10000000',
      makerAssetData: '0x',
    })
    expect(out['salt']).toBe(12345678901234567890n)
    expect(out['makingAmount']).toBe(10_000_000n)
    expect(out['maker']).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
    expect(out['makerAssetData']).toBe('0x')
  })

  it('converts uint arrays element-wise', () => {
    const out = coerceTypedMessage(types, 'CancelOrder', {
      orderIds: [1, '2'],
    })
    expect(out['orderIds']).toEqual([1n, 2n])
  })
})

describe('validateOrderSignPayload — refuse to blind-sign API payloads', () => {
  const MAKER = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
  const expected = {
    chainId: chain.chainId,
    maker: MAKER,
    makerAsset: chain.quote.address,
    takerAsset: WETH,
    makingAmount: 9_000_000_000n,
    takingAmount: 5_000_000_000_000_000_000n,
  }

  function goodPayload(): TypedDataPayload {
    return {
      types: { Order: [] },
      domain: { name: 'KyberSwap LO', chainId: chain.chainId },
      primaryType: 'Order',
      message: {
        salt: '123',
        maker: MAKER.toLowerCase(),
        makerAsset: chain.quote.address.toLowerCase(),
        takerAsset: WETH.toLowerCase(),
        makingAmount: '9000000000',
        takingAmount: '5000000000000000000',
      },
    }
  }

  it('accepts a payload that matches the requested order', () => {
    expect(validateOrderSignPayload(goodPayload(), expected)).toBeNull()
  })

  it('accepts chainId serialized as a string', () => {
    const payload = goodPayload()
    payload.domain['chainId'] = String(chain.chainId)
    expect(validateOrderSignPayload(payload, expected)).toBeNull()
  })

  it('rejects a substituted maker asset', () => {
    const payload = goodPayload()
    payload.message['makerAsset'] = '0x1111111111111111111111111111111111111111'
    expect(validateOrderSignPayload(payload, expected)).toContain('makerAsset')
  })

  it('rejects a tampered making amount', () => {
    const payload = goodPayload()
    payload.message['makingAmount'] = '999000000000'
    expect(validateOrderSignPayload(payload, expected)).toContain(
      'makingAmount',
    )
  })

  it('rejects a substituted maker (signature would authorize another account order)', () => {
    const payload = goodPayload()
    payload.message['maker'] = '0x2222222222222222222222222222222222222222'
    expect(validateOrderSignPayload(payload, expected)).toContain('maker')
  })

  it('rejects a payload pinned to a different chain', () => {
    const payload = goodPayload()
    payload.domain['chainId'] = 1
    expect(validateOrderSignPayload(payload, expected)).toContain('chainId')
  })

  it('rejects when a critical field is missing (fail closed)', () => {
    const payload = goodPayload()
    delete payload.message['takingAmount']
    expect(validateOrderSignPayload(payload, expected)).toContain(
      'takingAmount',
    )
  })

  it('rejects a non-Order primaryType', () => {
    const payload = goodPayload()
    payload.primaryType = 'CancelOrder'
    expect(validateOrderSignPayload(payload, expected)).toContain('primaryType')
  })

  it('rejects malformed numeric fields instead of throwing', () => {
    const payload = goodPayload()
    payload.message['makingAmount'] = 'not-a-number'
    expect(validateOrderSignPayload(payload, expected)).toContain(
      'makingAmount',
    )
  })
})

describe('toNormalizedLimitOrder — KyberSwap LO mapping', () => {
  it('maps a buy (quote is the maker asset) with raw-unit scaling', async () => {
    // No fetch needed: quote + wrapped-native resolve via chain shortcuts
    globalThis.fetch = mock(
      async () => new Response('{}', { status: 404 }),
    ) as unknown as typeof fetch

    const order = await toNormalizedLimitOrder(chain, {
      id: 42,
      makerAsset: chain.quote.address.toLowerCase(),
      takerAsset: WETH,
      makingAmount: '9000000000', // 9000 USDC (6 decimals)
      takingAmount: '5000000000000000000', // 5 WETH (18 decimals)
      filledMakingAmount: '0',
      status: 'active',
      createdAt: 1765000000,
    })

    expect(order?.orderId).toBe('42')
    expect(order?.side).toBe('buy')
    expect(order?.pair).toBe('WETH-USDC')
    expect(Number(order?.size)).toBeCloseTo(5)
    expect(Number(order?.price)).toBeCloseTo(1800)
    expect(order?.status).toBe('live')
    expect(order?.ts).toBe(1765000000 * 1000)
  })

  it('maps a sell with partial fill and terminal statuses', async () => {
    globalThis.fetch = mock(
      async () => new Response('{}', { status: 404 }),
    ) as unknown as typeof fetch

    const partial = await toNormalizedLimitOrder(chain, {
      id: 7,
      makerAsset: WETH,
      takerAsset: chain.quote.address,
      makingAmount: '2000000000000000000', // 2 WETH
      takingAmount: '4000000000', // 4000 USDC
      filledMakingAmount: '1000000000000000000', // 1 WETH filled
      status: 'active',
      createdAt: 1765000000,
    })
    expect(partial?.side).toBe('sell')
    expect(partial?.status).toBe('partially_filled')
    expect(Number(partial?.fillSize)).toBeCloseTo(1)
    expect(Number(partial?.price)).toBeCloseTo(2000)

    const filled = await toNormalizedLimitOrder(chain, {
      id: 8,
      makerAsset: WETH,
      takerAsset: chain.quote.address,
      makingAmount: '1000000000000000000',
      takingAmount: '2000000000',
      filledMakingAmount: '1000000000000000000',
      status: 'filled',
      createdAt: 1765000000,
    })
    expect(filled?.status).toBe('filled')
  })

  it('rejects malformed orders', async () => {
    expect(await toNormalizedLimitOrder(chain, {})).toBeNull()
  })
})
