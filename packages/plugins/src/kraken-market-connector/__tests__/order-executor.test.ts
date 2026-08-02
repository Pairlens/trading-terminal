// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { assertBalanceConformant } from '../../test-utils/conformance'
import { fetchKrakenBalances, placeKrakenOrder } from '../order-executor'

// krakenSign base64-decodes the secret, so it must be valid base64.
const CREDS = { apiKey: 'kkey', apiSecret: btoa('kraken-secret-DO-NOT-LEAK') }

function stubFetch(result: unknown, error: Array<string> = []) {
  globalThis.fetch = mock(async () => {
    return new Response(JSON.stringify({ error, result }), { status: 200 })
  }) as unknown as typeof fetch
}

function stubFetchCapture(result: unknown): {
  calls: Array<{ url: string; body: string }>
} {
  const calls: Array<{ url: string; body: string }> = []
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') })
    return new Response(JSON.stringify({ error: [], result }), { status: 200 })
  }) as unknown as typeof fetch
  return { calls }
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('fetchKrakenBalances — accurate frozen/available split (BalanceEx)', () => {
  it('splits balance into available and frozen via hold_trade', async () => {
    stubFetch({
      XXBT: { balance: '1.0', hold_trade: '0.25' },
      ZUSD: { balance: '1000', hold_trade: '0' },
      XETH: { balance: '0', hold_trade: '0' }, // zero -> dropped
    })

    const balances = await fetchKrakenBalances(CREDS)
    expect(balances).toHaveLength(2)

    const btc = balances.find(
      (b) => b.currency === 'BTC' || b.currency === 'XBT',
    )
    expect(btc).toBeDefined()
    expect(btc!.total).toBe('1')
    expect(btc!.frozen).toBe('0.25')
    expect(btc!.available).toBe('0.75')
    for (const b of balances) assertBalanceConformant(b)
  })

  it('returns an empty list when all balances are zero', async () => {
    stubFetch({ ZUSD: { balance: '0', hold_trade: '0' } })
    expect(await fetchKrakenBalances(CREDS)).toEqual([])
  })
})

describe('placeKrakenOrder — native trigger orders', () => {
  it('maps sl+market to ordertype stop-loss with the trigger as price', async () => {
    const { calls } = stubFetchCapture({ txid: ['KR-TX-1'] })

    const result = await placeKrakenOrder(
      {
        market: 'kraken',
        pair: 'BTC-USD',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'live',
      },
      CREDS,
    )
    expect(result).toEqual({ success: true, orderId: 'KR-TX-1' })

    const params = new URLSearchParams(calls[0].body)
    expect(calls[0].url).toContain('/private/AddOrder')
    expect(params.get('ordertype')).toBe('stop-loss')
    expect(params.get('price')).toBe('47000')
    expect(params.get('price2')).toBeNull()
    expect(params.get('volume')).toBe('0.5')
    expect(params.get('type')).toBe('sell')
  })

  it('maps tp+limit to take-profit-limit with price=trigger and price2=limit', async () => {
    const { calls } = stubFetchCapture({ txid: ['KR-TX-2'] })

    await placeKrakenOrder(
      {
        market: 'kraken',
        pair: 'BTC-USD',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '54900',
        trigger: { triggerPrice: '55000', triggerType: 'tp' },
        mode: 'live',
      },
      CREDS,
    )

    const params = new URLSearchParams(calls[0].body)
    expect(params.get('ordertype')).toBe('take-profit-limit')
    expect(params.get('price')).toBe('55000')
    expect(params.get('price2')).toBe('54900')
  })

  it('keeps validate-only dry-run behavior for paper trigger orders', async () => {
    const { calls } = stubFetchCapture({ descr: { order: 'stop-loss sell' } })

    const result = await placeKrakenOrder(
      {
        market: 'kraken',
        pair: 'BTC-USD',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'paper',
      },
      CREDS,
    )
    expect(result.success).toBe(true)
    const params = new URLSearchParams(calls[0].body)
    expect(params.get('validate')).toBe('true')
  })
})
