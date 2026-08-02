// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cancelHtxOrder, placeHtxOrder } from '../order-executor'

const CREDS = { apiKey: 'htxkey', apiSecret: 'htx-secret-DO-NOT-LEAK' }

type Captured = { url: string; body: string }

/** Answers the account-lookup GET (v1 envelope) and the algo POST (v2
 * envelope) by URL, so the module-level account-id cache doesn't matter. */
function stubHtxFetch(algoResponse: unknown): { calls: Array<Captured> } {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, body: String(init?.body ?? '') })
    if (u.includes('/v1/account/accounts')) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          data: [{ id: 424242, type: 'spot', state: 'working' }],
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify(algoResponse), { status: 200 })
  }) as unknown as typeof fetch
  return { calls }
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function algoCall(calls: Array<Captured>): Captured {
  const call = calls.find((c) => c.url.includes('/v2/algo-orders'))
  expect(call).toBeDefined()
  return call!
}

describe('placeHtxOrder — algo (trigger) orders', () => {
  it('routes sl+market sells to /v2/algo-orders with orderSize', async () => {
    const { calls } = stubHtxFetch({
      code: 200,
      data: { clientOrderId: 'HTX-ALGO-1' },
    })

    const result = await placeHtxOrder(
      {
        market: 'htx',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'live',
        clientOrderId: 'HTX-ALGO-1',
      },
      CREDS,
    )
    expect(result).toEqual({ success: true, orderId: 'HTX-ALGO-1' })

    const body = JSON.parse(algoCall(calls).body)
    expect(body).toMatchObject({
      symbol: 'btcusdt',
      orderSide: 'sell',
      orderType: 'market',
      stopPrice: '47000',
      clientOrderId: 'HTX-ALGO-1',
      orderSize: '0.5',
    })
    // account id comes from the (possibly pre-cached) account lookup
    expect(typeof body.accountId).toBe('string')
    expect(body.accountId.length).toBeGreaterThan(0)
    expect(body.orderValue).toBeUndefined()
  })

  it('sends orderPrice + orderSize for limit-execution triggers', async () => {
    const { calls } = stubHtxFetch({
      code: 200,
      data: { clientOrderId: 'HTX-ALGO-2' },
    })

    await placeHtxOrder(
      {
        market: 'htx',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '54900',
        trigger: { triggerPrice: '55000', triggerType: 'tp' },
        mode: 'live',
      },
      CREDS,
    )

    const body = JSON.parse(algoCall(calls).body)
    expect(body.orderPrice).toBe('54900')
    expect(body.orderSize).toBe('0.5')
    expect(typeof body.clientOrderId).toBe('string')
  })

  it('converts market-buy trigger size to quote orderValue', async () => {
    const { calls } = stubHtxFetch({
      code: 200,
      data: { clientOrderId: 'HTX-ALGO-3' },
    })

    await placeHtxOrder(
      {
        market: 'htx',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '40000', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
    )

    const body = JSON.parse(algoCall(calls).body)
    expect(body.orderValue).toBe('20000')
    expect(body.orderSize).toBeUndefined()
  })

  it('surfaces v2 error messages', async () => {
    stubHtxFetch({ code: 4007, message: 'invalid stop price' })

    const result = await placeHtxOrder(
      {
        market: 'htx',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '0', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('invalid stop price')
  })
})

describe('cancelHtxOrder — trigger routing', () => {
  it('cancels algo orders via /v2/algo-orders/cancellation with clientOrderIds', async () => {
    const calls: Array<{ url: string; body: string }> = []
    globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') })
      return new Response(
        JSON.stringify({ code: 200, data: { accepted: ['HTX-ALGO-1'] } }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const result = await cancelHtxOrder('HTX-ALGO-1', CREDS, { trigger: true })
    expect(result).toEqual({ success: true, orderId: 'HTX-ALGO-1' })
    expect(calls[0].url).toContain('/v2/algo-orders/cancellation')
    expect(JSON.parse(calls[0].body)).toEqual({
      clientOrderIds: ['HTX-ALGO-1'],
    })
  })

  it('keeps regular cancels on submitcancel', async () => {
    const calls: Array<string> = []
    globalThis.fetch = mock(async (url: unknown) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ status: 'ok', data: 'O-1' }), {
        status: 200,
      })
    }) as unknown as typeof fetch

    await cancelHtxOrder('O-1', CREDS)
    expect(calls[0]).toContain('/v1/order/orders/O-1/submitcancel')
  })
})
