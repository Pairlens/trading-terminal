// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cancelBitgetOrder, placeBitgetOrder } from '../order-executor'

const CREDS = {
  apiKey: 'bgkey',
  apiSecret: 'bg-secret-DO-NOT-LEAK',
  passphrase: 'bg-pass',
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

describe('placeBitgetOrder — plan (trigger) orders', () => {
  it('routes sl+market to place-plan-order with base sizing and no force', async () => {
    const { calls } = stubFetch({
      code: '00000',
      data: { orderId: 'BG-PLAN-1' },
    })

    const result = await placeBitgetOrder(
      {
        market: 'bitget',
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
    expect(result).toEqual({ success: true, orderId: 'BG-PLAN-1' })

    expect(calls[0].url).toContain('/trade/place-plan-order')
    const body = JSON.parse(calls[0].body)
    expect(body).toMatchObject({
      symbol: 'BTCUSDT',
      side: 'sell',
      orderType: 'market',
      size: '0.5',
      planType: 'amount',
      triggerPrice: '47000',
      triggerType: 'fill_price',
    })
    expect(body.force).toBeUndefined()
    expect(body.executePrice).toBeUndefined()
  })

  it('adds executePrice for limit-execution plan orders', async () => {
    const { calls } = stubFetch({
      code: '00000',
      data: { orderId: 'BG-PLAN-2' },
    })

    await placeBitgetOrder(
      {
        market: 'bitget',
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
    expect(body.executePrice).toBe('54900')
    expect(body.triggerPrice).toBe('55000')
  })

  it('keeps plain orders on place-order with force gtc', async () => {
    const { calls } = stubFetch({ code: '00000', data: { orderId: 'BG-1' } })
    await placeBitgetOrder(
      {
        market: 'bitget',
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
    expect(calls[0].url).toContain('/trade/place-order')
    expect(JSON.parse(calls[0].body).force).toBe('gtc')
  })
})

describe('cancelBitgetOrder — trigger routing', () => {
  it('cancels plan orders via cancel-plan-order', async () => {
    const { calls } = stubFetch({ code: '00000', data: { result: 'success' } })
    const result = await cancelBitgetOrder(
      'PLAN-1',
      'BTC-USDT',
      CREDS,
      '',
      'live',
      { trigger: true },
    )
    expect(result.success).toBe(true)
    expect(calls[0].url).toContain('/trade/cancel-plan-order')
    expect(JSON.parse(calls[0].body).orderId).toBe('PLAN-1')
  })

  it('keeps regular cancels on cancel-order', async () => {
    const { calls } = stubFetch({ code: '00000', data: {} })
    await cancelBitgetOrder('O-1', 'BTC-USDT', CREDS, '', 'live')
    expect(calls[0].url).toContain('/trade/cancel-order')
    expect(calls[0].url).not.toContain('plan')
  })
})
