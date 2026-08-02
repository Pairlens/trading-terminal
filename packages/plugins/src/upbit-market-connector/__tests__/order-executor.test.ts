// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { assertOrderConformant } from '../../test-utils/conformance'
import { fetchUpbitOpenOrders } from '../order-executor'

const CREDS = { apiKey: 'ukey', apiSecret: 'usecret' }

function stubFetch(orders: unknown) {
  globalThis.fetch = mock(async () => {
    return new Response(JSON.stringify(orders), { status: 200 })
  }) as unknown as typeof fetch
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function order(over: Record<string, unknown> = {}) {
  return {
    uuid: 'u1',
    market: 'KRW-BTC',
    side: 'bid',
    ord_type: 'limit',
    price: '40000000',
    state: 'wait',
    volume: '1',
    remaining_volume: '1',
    executed_volume: '0',
    avg_price: '0',
    trades_count: 0,
    paid_fee: '0',
    created_at: '2023-11-14T00:00:00+09:00',
    ...over,
  }
}

describe('fetchUpbitOpenOrders — status mapping incl. partial fills', () => {
  it('maps an open order with executed volume to partially_filled', async () => {
    stubFetch([order({ state: 'wait', volume: '1', executed_volume: '0.5' })])
    const orders = await fetchUpbitOpenOrders(CREDS, '')
    expect(orders[0].status).toBe('partially_filled')
    assertOrderConformant(orders[0])
  })

  it('maps a fresh open order (no fills) to live', async () => {
    stubFetch([order({ state: 'wait', executed_volume: '0' })])
    const orders = await fetchUpbitOpenOrders(CREDS, '')
    expect(orders[0].status).toBe('live')
  })

  it('maps done -> filled and cancel -> cancelled', async () => {
    stubFetch([
      order({ uuid: 'd', state: 'done', executed_volume: '1' }),
      order({ uuid: 'c', state: 'cancel', executed_volume: '0' }),
    ])
    const orders = await fetchUpbitOpenOrders(CREDS, '')
    expect(orders.find((o) => o.orderId === 'd')!.status).toBe('filled')
    expect(orders.find((o) => o.orderId === 'c')!.status).toBe('cancelled')
  })
})
