// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import {
  cancelKucoinOrder,
  fetchKucoinOpenOrders,
  placeKucoinOrder,
} from '../order-executor'

const CREDS = {
  apiKey: 'kckey',
  apiSecret: 'kc-secret-DO-NOT-LEAK',
  passphrase: 'kc-pass',
}

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

describe('placeKucoinOrder — native trigger orders', () => {
  it('routes sl+market to the stop-order endpoint with stop=loss', async () => {
    const { calls } = stubFetch({
      code: '200000',
      data: { orderId: 'KC-STOP-1' },
    })

    const result = await placeKucoinOrder(
      {
        market: 'kucoin',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
      '',
    )
    expect(result).toEqual({ success: true, orderId: 'KC-STOP-1' })

    expect(calls[0].url).toContain('/api/v1/stop-order')
    const body = JSON.parse(calls[0].body)
    expect(body).toMatchObject({
      symbol: 'BTC-USDT',
      side: 'sell',
      type: 'market',
      stopPrice: '47000',
      stop: 'loss',
      tradeType: 'TRADE',
      size: '0.5',
    })
  })

  it('routes tp+limit as stop=entry with price and size', async () => {
    const { calls } = stubFetch({
      code: '200000',
      data: { orderId: 'KC-STOP-2' },
    })

    await placeKucoinOrder(
      {
        market: 'kucoin',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '54900',
        trigger: { triggerPrice: '55000', triggerType: 'tp' },
        mode: 'live',
      },
      CREDS,
      '',
    )

    const body = JSON.parse(calls[0].body)
    expect(body.stop).toBe('entry')
    expect(body.stopPrice).toBe('55000')
    expect(body.price).toBe('54900')
    expect(body.size).toBe('0.5')
  })

  it('keeps plain orders on the hf endpoint', async () => {
    const { calls } = stubFetch({ code: '200000', data: { orderId: 'KC-1' } })
    await placeKucoinOrder(
      {
        market: 'kucoin',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'live',
      },
      CREDS,
      '',
    )
    expect(calls[0].url).toContain('/api/v1/hf/orders')
    expect(JSON.parse(calls[0].body).stop).toBeUndefined()
  })
})

describe('cancelKucoinOrder — trigger routing', () => {
  it('cancels trigger orders via DELETE /api/v1/stop-order/{id}', async () => {
    const { calls } = stubFetch({ code: '200000', data: {} })
    const result = await cancelKucoinOrder(
      'STOP-1',
      'BTC-USDT',
      CREDS,
      '',
      'live',
      { trigger: true },
    )
    expect(result.success).toBe(true)
    expect(calls[0].url).toContain('/api/v1/stop-order/STOP-1')
    expect(calls[0].url).not.toContain('/hf/')
  })

  it('keeps regular cancels on the hf endpoint', async () => {
    const { calls } = stubFetch({ code: '200000', data: {} })
    await cancelKucoinOrder('O-1', 'BTC-USDT', CREDS, '', 'live')
    expect(calls[0].url).toContain('/api/v1/hf/orders/O-1?symbol=BTC-USDT')
  })
})

describe('fetchKucoinOpenOrders — stop order merge', () => {
  it('merges un-triggered stop orders with triggerOrder marking', async () => {
    globalThis.fetch = mock(async (url: unknown) => {
      const u = String(url)
      const isStop = u.includes('/api/v1/stop-order')
      const body = isStop
        ? {
            code: '200000',
            data: {
              items: [
                {
                  id: 'STOP-9',
                  symbol: 'BTC-USDT',
                  side: 'sell',
                  type: 'market',
                  stopPrice: '47000',
                  stop: 'loss',
                  size: '0.5',
                  createdAt: '1700000000000',
                },
              ],
            },
          }
        : { code: '200000', data: [] }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as unknown as typeof fetch

    const orders = await fetchKucoinOpenOrders(CREDS, '', false, 'BTC-USDT')
    expect(orders).toHaveLength(1)
    expect(orders[0].orderId).toBe('STOP-9')
    expect(orders[0].triggerOrder).toBe(true)
    expect(orders[0].triggerPrice).toBe('47000')
    expect(orders[0].status).toBe('live')
  })
})
