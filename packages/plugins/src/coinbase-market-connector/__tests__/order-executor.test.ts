// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { placeCoinbaseOrder } from '../order-executor'

// Paper mode routes to the sandbox, which skips JWT auth — lets the tests
// exercise request shaping without a real ES256 key.
const CREDS = { apiKey: 'cbkey', apiSecret: 'cb-secret-DO-NOT-LEAK' }

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

const OK = { success: true, success_response: { order_id: 'CB-1' } }

describe('placeCoinbaseOrder — stop-limit trigger orders', () => {
  it('maps sl+market to stop_limit_stop_limit_gtc with STOP_DOWN and a 1% protective limit', async () => {
    const { calls } = stubFetch(OK)

    const result = await placeCoinbaseOrder(
      {
        market: 'coinbase',
        pair: 'BTC-USD',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'paper',
      },
      CREDS,
      '',
    )
    expect(result).toEqual({ success: true, orderId: 'CB-1' })

    const body = JSON.parse(calls[0].body)
    const cfg = body.order_configuration.stop_limit_stop_limit_gtc
    expect(cfg).toMatchObject({
      base_size: '0.5',
      stop_price: '47000',
      stop_direction: 'STOP_DIRECTION_STOP_DOWN',
    })
    // Market execution isn't available on Coinbase spot stops — the limit
    // rests 1% below the trigger to cap slippage while ensuring a fill.
    expect(cfg.limit_price).toBe('46530')
    expect(body.side).toBe('SELL')
  })

  it('maps tp+limit to STOP_UP with the explicit limit price', async () => {
    const { calls } = stubFetch(OK)

    await placeCoinbaseOrder(
      {
        market: 'coinbase',
        pair: 'BTC-USD',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '54900.50',
        trigger: { triggerPrice: '55000', triggerType: 'tp' },
        mode: 'paper',
      },
      CREDS,
      '',
    )

    const cfg = JSON.parse(calls[0].body).order_configuration
      .stop_limit_stop_limit_gtc
    expect(cfg.stop_direction).toBe('STOP_DIRECTION_STOP_UP')
    expect(cfg.stop_price).toBe('55000')
    expect(cfg.limit_price).toBe('54900.50')
  })

  it('preserves the trigger price decimal precision in the protective limit', async () => {
    const { calls } = stubFetch(OK)

    await placeCoinbaseOrder(
      {
        market: 'coinbase',
        pair: 'ETH-USD',
        side: 'buy',
        type: 'market',
        size: '2',
        trigger: { triggerPrice: '3000.00', triggerType: 'sl' },
        mode: 'paper',
      },
      CREDS,
      '',
    )

    const cfg = JSON.parse(calls[0].body).order_configuration
      .stop_limit_stop_limit_gtc
    // Buy stop crosses upward; limit rests 1% above with 2 decimals kept
    expect(cfg.stop_direction).toBe('STOP_DIRECTION_STOP_UP')
    expect(cfg.limit_price).toBe('3030.00')
  })
})
