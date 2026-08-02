// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { mapBitvavoOrder, placeBitvavoOrder } from '../order-executor'
import type { BitvavoOrder } from '../order-executor'

const CREDS = { apiKey: 'bvkey', apiSecret: 'bv-secret-DO-NOT-LEAK' }

type Captured = { url: string; body: string }

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

describe('placeBitvavoOrder — native trigger orders', () => {
  it('maps sl+market to stopLoss with triggerAmount on lastTrade', async () => {
    const { calls } = stubFetch({ orderId: 'BV-TRIG-1' })

    const result = await placeBitvavoOrder(
      {
        market: 'bitvavo',
        pair: 'BTC-EUR',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
    )
    expect(result).toEqual({ success: true, orderId: 'BV-TRIG-1' })

    const body = JSON.parse(calls[0].body)
    expect(body).toMatchObject({
      market: 'BTC-EUR',
      side: 'sell',
      orderType: 'stopLoss',
      triggerType: 'price',
      triggerReference: 'lastTrade',
      triggerAmount: '47000',
      amount: '0.5',
    })
    expect(body.price).toBeUndefined()
    expect(body.amountQuote).toBeUndefined()
  })

  it('maps tp+limit to takeProfitLimit with price + triggerAmount', async () => {
    const { calls } = stubFetch({ orderId: 'BV-TRIG-2' })

    await placeBitvavoOrder(
      {
        market: 'bitvavo',
        pair: 'BTC-EUR',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '54900',
        trigger: { triggerPrice: '55000', triggerType: 'tp' },
        mode: 'live',
      },
      CREDS,
    )

    const body = JSON.parse(calls[0].body)
    expect(body.orderType).toBe('takeProfitLimit')
    expect(body.triggerAmount).toBe('55000')
    expect(body.price).toBe('54900')
    expect(body.amount).toBe('0.5')
  })

  it('keeps plain orders untouched', async () => {
    const { calls } = stubFetch({ orderId: 'BV-1' })
    await placeBitvavoOrder(
      {
        market: 'bitvavo',
        pair: 'BTC-EUR',
        side: 'buy',
        type: 'market',
        size: '100',
        tgtCcy: 'quote_ccy',
        mode: 'live',
      },
      CREDS,
    )
    const body = JSON.parse(calls[0].body)
    expect(body.orderType).toBe('market')
    expect(body.amountQuote).toBe('100')
    expect(body.triggerAmount).toBeUndefined()
  })
})

describe('mapBitvavoOrder — trigger marking', () => {
  const BASE: BitvavoOrder = {
    orderId: 'O1',
    market: 'BTC-EUR',
    status: 'awaitingTrigger',
    side: 'sell',
    orderType: 'stopLoss',
    amount: '0.5',
    triggerAmount: '47000',
    created: 1700000000000,
    updated: 1700000000000,
  }

  it('marks awaiting stopLoss orders as live trigger orders', async () => {
    const o = mapBitvavoOrder(BASE)
    expect(o.triggerOrder).toBe(true)
    expect(o.triggerPrice).toBe('47000')
    expect(o.type).toBe('market')
    expect(o.status).toBe('live') // awaitingTrigger → live
  })

  it('maps takeProfitLimit to limit execution', async () => {
    const o = mapBitvavoOrder({
      ...BASE,
      orderType: 'takeProfitLimit',
      price: '54900',
      triggerPrice: '55000',
      triggerAmount: undefined,
    })
    expect(o.triggerOrder).toBe(true)
    expect(o.triggerPrice).toBe('55000')
    expect(o.type).toBe('limit')
  })

  it('leaves plain limit orders unmarked', async () => {
    const o = mapBitvavoOrder({
      ...BASE,
      orderType: 'limit',
      status: 'new',
      price: '40000',
      triggerAmount: undefined,
    })
    expect(o.triggerOrder).toBeUndefined()
    expect(o.type).toBe('limit')
  })
})
