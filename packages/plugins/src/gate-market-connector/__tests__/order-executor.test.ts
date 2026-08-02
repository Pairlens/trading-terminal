// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cancelGateOrder, placeGateOrder } from '../order-executor'

const CREDS = { apiKey: 'gkey', apiSecret: 'gate-secret-DO-NOT-LEAK' }

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

describe('placeGateOrder — price-triggered orders', () => {
  it('routes sl+market to price_orders with rule <= and ioc market put', async () => {
    const { calls } = stubFetch({ id: 987654 })

    const result = await placeGateOrder(
      {
        market: 'gate',
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
    expect(result).toEqual({ success: true, orderId: '987654' })

    expect(calls[0].url).toContain('/spot/price_orders')
    const body = JSON.parse(calls[0].body)
    expect(body.market).toBe('BTC_USDT')
    expect(body.trigger).toMatchObject({
      price: '47000',
      rule: '<=',
      expiration: 30 * 86400,
    })
    expect(body.put).toMatchObject({
      type: 'market',
      side: 'sell',
      amount: '0.5', // market sells are base-denominated
      account: 'normal',
      time_in_force: 'ioc',
    })
  })

  it('routes tp+limit with rule >= and gtc limit put', async () => {
    const { calls } = stubFetch({ id: 987655 })

    await placeGateOrder(
      {
        market: 'gate',
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
    expect(body.trigger.rule).toBe('>=')
    expect(body.put).toMatchObject({
      type: 'limit',
      price: '54900',
      amount: '0.5',
      time_in_force: 'gtc',
    })
  })

  it('converts market-buy trigger size from base to quote via the trigger price', async () => {
    const { calls } = stubFetch({ id: 987656 })

    await placeGateOrder(
      {
        market: 'gate',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '40000', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
      '',
    )

    const body = JSON.parse(calls[0].body)
    expect(body.put.amount).toBe('20000') // 0.5 × 40000 quote
    expect(body.trigger.rule).toBe('>=') // sl+buy crosses upward
  })

  it('keeps plain orders on /spot/orders', async () => {
    const { calls } = stubFetch({ id: 1 })
    await placeGateOrder(
      {
        market: 'gate',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'limit',
        size: '1',
        price: '40000',
        mode: 'live',
      },
      CREDS,
      '',
    )
    expect(calls[0].url).toContain('/spot/orders')
    expect(calls[0].url).not.toContain('price_orders')
    expect(JSON.parse(calls[0].body).currency_pair).toBe('BTC_USDT')
  })
})

describe('cancelGateOrder — trigger routing', () => {
  it('cancels trigger orders via DELETE /spot/price_orders/{id} without currency_pair', async () => {
    const { calls } = stubFetch({ id: 42 })
    const result = await cancelGateOrder('42', 'BTC-USDT', CREDS, '', 'live', {
      trigger: true,
    })
    expect(result.success).toBe(true)
    expect(calls[0].url).toContain('/spot/price_orders/42')
    expect(calls[0].url).not.toContain('currency_pair')
  })

  it('keeps regular cancels on /spot/orders/{id} with currency_pair', async () => {
    const { calls } = stubFetch({ id: 7 })
    await cancelGateOrder('7', 'BTC-USDT', CREDS, '', 'live')
    expect(calls[0].url).toContain('/spot/orders/7?currency_pair=BTC_USDT')
  })
})
