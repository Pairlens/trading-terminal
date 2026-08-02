// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { placeBfxOrder } from '../order-executor'

const CREDS = { apiKey: 'bfxkey', apiSecret: 'bfx-secret-DO-NOT-LEAK' }

type Captured = { url: string; body: string }

// Success envelope: [MTS, TYPE, MSG_ID, null, [[ORDER,...]], CODE, STATUS, TEXT]
function okResponse(orderId: number): Array<unknown> {
  return [1700000000000, 'on-req', null, null, [[orderId]], 0, 'SUCCESS', 'ok']
}

function stubFetch(responseJson: unknown): { calls: Array<Captured> } {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') })
    return new Response(JSON.stringify(responseJson), { status: 200 })
  }) as unknown as typeof fetch
  return { calls }
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('placeBfxOrder — native trigger orders', () => {
  it('maps sl+market to EXCHANGE STOP with price = trigger', async () => {
    const { calls } = stubFetch(okResponse(555001))

    const result = await placeBfxOrder(
      {
        market: 'bitfinex',
        pair: 'BTC-USD',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
    )
    expect(result).toEqual({ success: true, orderId: '555001' })

    const body = JSON.parse(calls[0].body)
    expect(body.type).toBe('EXCHANGE STOP')
    expect(body.price).toBe('47000')
    expect(body.amount).toBe('-0.5') // negative = sell
    expect(body.price_aux_limit).toBeUndefined()
  })

  it('maps sl+limit to EXCHANGE STOP LIMIT with price_aux_limit', async () => {
    const { calls } = stubFetch(okResponse(555002))

    await placeBfxOrder(
      {
        market: 'bitfinex',
        pair: 'BTC-USD',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '46900',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
    )

    const body = JSON.parse(calls[0].body)
    expect(body.type).toBe('EXCHANGE STOP LIMIT')
    expect(body.price).toBe('47000')
    expect(body.price_aux_limit).toBe('46900')
  })

  it('maps tp to a resting EXCHANGE LIMIT (Bitfinex stops cannot fire upward for sells)', async () => {
    const { calls } = stubFetch(okResponse(555003))

    await placeBfxOrder(
      {
        market: 'bitfinex',
        pair: 'BTC-USD',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '55000', triggerType: 'tp' },
        mode: 'live',
      },
      CREDS,
    )

    const body = JSON.parse(calls[0].body)
    expect(body.type).toBe('EXCHANGE LIMIT')
    expect(body.price).toBe('55000')
  })
})
