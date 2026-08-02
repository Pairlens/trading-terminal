// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { hmacSignHex } from '@pairlens/market-engine/hmac-signer'
import { assertOrderConformant } from '../../test-utils/conformance'
import {
  cancelBybitOrder,
  fetchBybitOpenOrders,
  placeBybitOrder,
} from '../order-executor'

const CREDS = { apiKey: 'ykey', apiSecret: 'ysecret-DO-NOT-LEAK' }
const RECV_WINDOW = '20000'

type Captured = { url: string; init: RequestInit }

function stubFetch(responseJson: unknown): { calls: Array<Captured> } {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(responseJson), { status: 200 })
  }) as unknown as typeof fetch
  return { calls }
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('placeBybitOrder — request signing & shape', () => {
  it('signs timestamp+key+recvWindow+body and routes paper to testnet', async () => {
    const { calls } = stubFetch({
      retCode: 0,
      retMsg: 'OK',
      result: { orderId: 'BB1' },
    })

    const result = await placeBybitOrder(
      {
        market: 'bybit',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '0.01',
        mode: 'paper',
      },
      CREDS,
      '',
    )

    expect(result).toEqual({ success: true, orderId: 'BB1' })
    const { url, init } = calls[0]
    expect(url).toBe('https://api-testnet.bybit.com/v5/order/create')

    const headers = init.headers as Record<string, string>
    expect(headers['X-BAPI-API-KEY']).toBe(CREDS.apiKey)
    expect(headers['X-BAPI-RECV-WINDOW']).toBe(RECV_WINDOW)

    const body = String(init.body)
    expect(JSON.parse(body)).toMatchObject({
      category: 'spot',
      symbol: 'BTCUSDT',
      side: 'Buy',
      orderType: 'Market',
      qty: '0.01',
    })

    // ByBit prehash: timestamp + apiKey + recvWindow + body
    const ts = headers['X-BAPI-TIMESTAMP']
    const expectedSig = await hmacSignHex(
      CREDS.apiSecret,
      `${ts}${CREDS.apiKey}${RECV_WINDOW}${body}`,
    )
    expect(headers['X-BAPI-SIGN']).toBe(expectedSig)
  })

  it('forwards a client order id as orderLinkId for idempotency', async () => {
    const { calls } = stubFetch({
      retCode: 0,
      retMsg: 'OK',
      result: { orderId: 'X' },
    })
    await placeBybitOrder(
      {
        market: 'bybit',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'paper',
        clientOrderId: 'pl0123456789abcdef',
      },
      CREDS,
      '',
    )
    expect(JSON.parse(String(calls[0].init.body)).orderLinkId).toBe(
      'pl0123456789abcdef',
    )
  })

  it('adds price + timeInForce for limit orders', async () => {
    const { calls } = stubFetch({
      retCode: 0,
      retMsg: 'OK',
      result: { orderId: 'X' },
    })
    await placeBybitOrder(
      {
        market: 'bybit',
        pair: 'ETH-USDT',
        side: 'sell',
        type: 'limit',
        size: '1',
        price: '3000',
        mode: 'paper',
      },
      CREDS,
      '',
    )
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.price).toBe('3000')
    expect(body.timeInForce).toBe('GTC')
    expect(body.side).toBe('Sell')
  })

  it('returns the retMsg on a non-zero retCode without leaking the secret', async () => {
    const warnings: Array<string> = []
    const realWarn = console.warn
    console.warn = mock((...a: Array<unknown>) =>
      warnings.push(a.map(String).join(' ')),
    ) as unknown as typeof console.warn

    stubFetch({ retCode: 10001, retMsg: 'Insufficient balance', result: {} })
    const result = await placeBybitOrder(
      {
        market: 'bybit',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '999',
        mode: 'paper',
      },
      CREDS,
      '',
    )
    console.warn = realWarn

    expect(result).toEqual({ success: false, error: 'Insufficient balance' })
    expect(warnings.join('\n')).not.toContain(CREDS.apiSecret)
  })

  it('returns a Network error when fetch throws', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('timeout')
    }) as unknown as typeof fetch
    const result = await placeBybitOrder(
      {
        market: 'bybit',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'paper',
      },
      CREDS,
      '',
    )
    expect(result).toEqual({ success: false, error: 'timeout' })
  })
})

describe('placeBybitOrder — native trigger orders', () => {
  it('places a spot tpslOrder with triggerPrice and base-unit market sizing', async () => {
    const { calls } = stubFetch({
      retCode: 0,
      retMsg: 'OK',
      result: { orderId: 'BB-TRIG-1' },
    })

    const result = await placeBybitOrder(
      {
        market: 'bybit',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '47000', triggerType: 'sl' },
        mode: 'paper',
      },
      CREDS,
      '',
    )
    expect(result).toEqual({ success: true, orderId: 'BB-TRIG-1' })

    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toMatchObject({
      category: 'spot',
      symbol: 'BTCUSDT',
      side: 'Sell',
      orderType: 'Market',
      qty: '0.5',
      orderFilter: 'tpslOrder',
      triggerPrice: '47000',
      marketUnit: 'baseCoin',
    })
  })

  it('places a limit-execution trigger order with price + GTC', async () => {
    const { calls } = stubFetch({
      retCode: 0,
      retMsg: 'OK',
      result: { orderId: 'BB-TRIG-2' },
    })

    await placeBybitOrder(
      {
        market: 'bybit',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '54900',
        trigger: { triggerPrice: '55000', triggerType: 'tp' },
        mode: 'paper',
      },
      CREDS,
      '',
    )

    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toMatchObject({
      orderFilter: 'tpslOrder',
      triggerPrice: '55000',
      orderType: 'Limit',
      price: '54900',
      timeInForce: 'GTC',
    })
    expect(body.marketUnit).toBeUndefined()
  })
})

describe('cancelBybitOrder', () => {
  it('posts to cancel with category/symbol/orderId', async () => {
    const { calls } = stubFetch({ retCode: 0, retMsg: 'OK' })
    const result = await cancelBybitOrder('BB9', 'BTC-USDT', CREDS, '', 'paper')
    expect(result).toEqual({ success: true, orderId: 'BB9' })
    expect(calls[0].url).toBe('https://api-testnet.bybit.com/v5/order/cancel')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      category: 'spot',
      symbol: 'BTCUSDT',
      orderId: 'BB9',
    })
  })

  it('adds orderFilter tpslOrder when cancelling a trigger order', async () => {
    const { calls } = stubFetch({ retCode: 0, retMsg: 'OK' })
    await cancelBybitOrder('BB10', 'BTC-USDT', CREDS, '', 'paper', {
      trigger: true,
    })
    expect(JSON.parse(String(calls[0].init.body)).orderFilter).toBe('tpslOrder')
  })
})

describe('fetchBybitOpenOrders — normalizer & status mapping', () => {
  it('marks tpslOrder records as trigger orders and de-dups the double query', async () => {
    stubFetch({
      retCode: 0,
      result: {
        list: [
          {
            orderId: 'T1',
            symbol: 'BTCUSDT',
            side: 'Sell',
            orderType: 'Market',
            qty: '0.5',
            price: '',
            triggerPrice: '47000',
            stopOrderType: 'tpslOrder',
            cumExecQty: '0',
            avgPrice: '',
            orderStatus: 'Untriggered',
            cumExecFee: '0',
            feeCurrency: '',
            updatedTime: '1700000000000',
            createdTime: '1700000000000',
          },
        ],
      },
    })
    const orders = await fetchBybitOpenOrders(CREDS, '', true)
    // The same stub answers both the regular and tpslOrder-filtered
    // queries — dedupe by orderId must collapse them to one row.
    expect(orders).toHaveLength(1)
    expect(orders[0].triggerOrder).toBe(true)
    expect(orders[0].triggerPrice).toBe('47000')
    expect(orders[0].status).toBe('live') // Untriggered → live
  })

  it('maps PartiallyFilled into the canonical enum and conforms', async () => {
    stubFetch({
      retCode: 0,
      result: {
        list: [
          {
            orderId: 'O1',
            symbol: 'BTCUSDT',
            side: 'Buy',
            orderType: 'Limit',
            qty: '1',
            price: '40000',
            cumExecQty: '0.5',
            avgPrice: '40000',
            orderStatus: 'PartiallyFilled',
            cumExecFee: '0.01',
            feeCurrency: 'USDT',
            updatedTime: '1700000000000',
            createdTime: '1700000000000',
          },
        ],
      },
    })
    const orders = await fetchBybitOpenOrders(CREDS, '', true)
    expect(orders).toHaveLength(1)
    assertOrderConformant(orders[0])
    expect(orders[0].status).toBe('partially_filled')
    expect(orders[0].side).toBe('buy')
    expect(orders[0].type).toBe('limit')
  })
})
