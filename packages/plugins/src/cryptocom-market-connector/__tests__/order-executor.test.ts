// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { cancelCryptocomOrder, placeCryptocomOrder } from '../order-executor'

const CREDS = { apiKey: 'cdckey', apiSecret: 'cdc-secret-DO-NOT-LEAK' }

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

describe('placeCryptocomOrder — advanced trigger orders', () => {
  it('routes sl+market sells to private/advanced/create-order as STOP_LOSS', async () => {
    const { calls } = stubFetch({
      code: 0,
      result: { order_id: 'CDC-ADV-1' },
    })

    const result = await placeCryptocomOrder(
      {
        market: 'cryptocom',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
      false,
    )
    expect(result).toEqual({ success: true, orderId: 'CDC-ADV-1' })

    expect(calls[0].url).toContain('/exchange/v1/private/advanced/create-order')
    const envelope = JSON.parse(calls[0].body)
    expect(envelope.method).toBe('private/advanced/create-order')
    expect(envelope.params).toMatchObject({
      instrument_name: 'BTC_USDT',
      side: 'SELL',
      type: 'STOP_LOSS',
      ref_price: '47000',
      quantity: '0.5',
    })
  })

  it('maps tp+limit to TAKE_PROFIT_LIMIT with price + quantity', async () => {
    const { calls } = stubFetch({
      code: 0,
      result: { order_id: 'CDC-ADV-2' },
    })

    await placeCryptocomOrder(
      {
        market: 'cryptocom',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '54900',
        trigger: { triggerPrice: '55000', triggerType: 'tp' },
        mode: 'live',
      },
      CREDS,
      false,
    )

    const p = JSON.parse(calls[0].body).params
    expect(p.type).toBe('TAKE_PROFIT_LIMIT')
    expect(p.ref_price).toBe('55000')
    expect(p.price).toBe('54900')
    expect(p.quantity).toBe('0.5')
  })

  it('maps sl+limit to STOP_LIMIT (not STOP_LOSS_LIMIT)', async () => {
    const { calls } = stubFetch({ code: 0, result: { order_id: 'X' } })

    await placeCryptocomOrder(
      {
        market: 'cryptocom',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '46900',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
      false,
    )
    expect(JSON.parse(calls[0].body).params.type).toBe('STOP_LIMIT')
  })

  it('converts market-buy trigger size to quote notional', async () => {
    const { calls } = stubFetch({ code: 0, result: { order_id: 'X' } })

    await placeCryptocomOrder(
      {
        market: 'cryptocom',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '40000', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
      false,
    )
    const p = JSON.parse(calls[0].body).params
    expect(p.notional).toBe('20000')
    expect(p.quantity).toBeUndefined()
  })

  it('keeps plain orders on private/create-order', async () => {
    const { calls } = stubFetch({ code: 0, result: { order_id: 'X' } })
    await placeCryptocomOrder(
      {
        market: 'cryptocom',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'limit',
        size: '1',
        price: '40000',
        mode: 'live',
      },
      CREDS,
      false,
    )
    expect(calls[0].url).toContain('/exchange/v1/private/create-order')
    expect(JSON.parse(calls[0].body).params.type).toBe('LIMIT')
  })
})

describe('cancelCryptocomOrder — trigger routing', () => {
  it('cancels trigger orders via private/advanced/cancel-order', async () => {
    const { calls } = stubFetch({ code: 0, result: {} })
    const result = await cancelCryptocomOrder(
      'ADV-1',
      'BTC-USDT',
      CREDS,
      false,
      { trigger: true },
    )
    expect(result.success).toBe(true)
    expect(calls[0].url).toContain('/exchange/v1/private/advanced/cancel-order')
    const envelope = JSON.parse(calls[0].body)
    expect(envelope.method).toBe('private/advanced/cancel-order')
    expect(envelope.params.order_id).toBe('ADV-1')
  })

  it('keeps regular cancels on private/cancel-order', async () => {
    const { calls } = stubFetch({ code: 0, result: {} })
    await cancelCryptocomOrder('O-1', 'BTC-USDT', CREDS, false)
    expect(calls[0].url).toContain('/exchange/v1/private/cancel-order')
    expect(calls[0].url).not.toContain('advanced')
  })
})
