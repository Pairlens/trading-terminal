// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { hmacSignHex } from '@pairlens/market-engine/hmac-signer'
import {
  assertBalanceConformant,
  assertOrderConformant,
} from '../../test-utils/conformance'
import {
  cancelBinanceOrder,
  fetchBinanceBalances,
  fetchBinanceOpenOrders,
  placeBinanceOrder,
} from '../order-executor'

const CREDS = { apiKey: 'bkey', apiSecret: 'bsecret-DO-NOT-LEAK' }

type Captured = { url: string; init: RequestInit }

function stubFetch(
  responseJson: unknown,
  okStatus = 200,
): { calls: Array<Captured> } {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(responseJson), { status: okStatus })
  }) as unknown as typeof fetch
  return { calls }
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Recompute the expected HMAC over the query string preceding `&signature=`. */
async function verifySignature(qs: string): Promise<void> {
  const idx = qs.indexOf('&signature=')
  expect(idx).toBeGreaterThan(-1)
  const payload = qs.slice(0, idx)
  const sig = qs.slice(idx + '&signature='.length)
  expect(sig).toBe(await hmacSignHex(CREDS.apiSecret, payload))
}

describe('placeBinanceOrder — request signing & shape', () => {
  it('signs the query, sets the API key header, and routes paper to testnet', async () => {
    const { calls } = stubFetch({ orderId: 555 })

    const result = await placeBinanceOrder(
      {
        market: 'binance',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '0.01',
        mode: 'paper',
      },
      CREDS,
      '',
    )

    expect(result).toEqual({ success: true, orderId: '555' })
    const { url, init } = calls[0]
    expect(url).toBe('https://testnet.binance.vision/api/v3/order')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['X-MBX-APIKEY']).toBe(
      CREDS.apiKey,
    )

    const qs = String(init.body)
    expect(qs).toContain('symbol=BTCUSDT')
    expect(qs).toContain('side=BUY')
    expect(qs).toContain('type=MARKET')
    expect(qs).toContain('quantity=0.01')
    expect(qs).toContain('timestamp=')
    await verifySignature(qs)
  })

  it('uses quoteOrderQty for quote-denominated market orders', async () => {
    const { calls } = stubFetch({ orderId: 1 })
    await placeBinanceOrder(
      {
        market: 'binance',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '100',
        mode: 'paper',
        tgtCcy: 'quote_ccy',
      },
      CREDS,
      '',
    )
    const qs = String(calls[0].init.body)
    expect(qs).toContain('quoteOrderQty=100')
    expect(qs).not.toContain('quantity=')
  })

  it('forwards a client order id as newClientOrderId for idempotency', async () => {
    const { calls } = stubFetch({ orderId: 1 })
    await placeBinanceOrder(
      {
        market: 'binance',
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
    expect(String(calls[0].init.body)).toContain(
      'newClientOrderId=pl0123456789abcdef',
    )
  })

  it('adds price + timeInForce for limit orders and routes live US to binance.us', async () => {
    const { calls } = stubFetch({ orderId: 2 })
    await placeBinanceOrder(
      {
        market: 'binance',
        pair: 'ETH-USDT',
        side: 'sell',
        type: 'limit',
        size: '1',
        price: '3000',
        mode: 'live',
      },
      CREDS,
      'US',
    )
    expect(calls[0].url).toBe('https://api.binance.us/api/v3/order')
    const qs = String(calls[0].init.body)
    expect(qs).toContain('price=3000')
    expect(qs).toContain('timeInForce=GTC')
  })

  it('surfaces the exchange msg on a non-ok response without leaking the secret', async () => {
    const warnings: Array<string> = []
    const realWarn = console.warn
    console.warn = mock((...a: Array<unknown>) =>
      warnings.push(a.map(String).join(' ')),
    ) as unknown as typeof console.warn

    stubFetch({ msg: 'Account has insufficient balance' }, 400)
    const result = await placeBinanceOrder(
      {
        market: 'binance',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '999',
        mode: 'live',
      },
      CREDS,
      '',
    )
    console.warn = realWarn

    expect(result).toEqual({
      success: false,
      error: 'Account has insufficient balance',
    })
    expect(warnings.join('\n')).not.toContain(CREDS.apiSecret)
  })

  it('returns a Network error when fetch throws', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('socket hang up')
    }) as unknown as typeof fetch
    const result = await placeBinanceOrder(
      {
        market: 'binance',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'paper',
      },
      CREDS,
      '',
    )
    expect(result).toEqual({ success: false, error: 'socket hang up' })
  })
})

describe('placeBinanceOrder — native trigger orders', () => {
  it('maps sl+market to STOP_LOSS with stopPrice', async () => {
    const { calls } = stubFetch({ orderId: 777 })

    const result = await placeBinanceOrder(
      {
        market: 'binance',
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
    expect(result).toEqual({ success: true, orderId: '777' })

    const qs = String(calls[0].init.body)
    const params = new URLSearchParams(qs)
    expect(params.get('type')).toBe('STOP_LOSS')
    expect(params.get('stopPrice')).toBe('47000')
    expect(params.get('quantity')).toBe('0.5')
    expect(params.get('price')).toBeNull()
    await verifySignature(qs)
  })

  it('maps tp+limit to TAKE_PROFIT_LIMIT with price + timeInForce', async () => {
    const { calls } = stubFetch({ orderId: 778 })

    await placeBinanceOrder(
      {
        market: 'binance',
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

    const params = new URLSearchParams(String(calls[0].init.body))
    expect(params.get('type')).toBe('TAKE_PROFIT_LIMIT')
    expect(params.get('stopPrice')).toBe('55000')
    expect(params.get('price')).toBe('54900')
    expect(params.get('timeInForce')).toBe('GTC')
    // Stop order types always size in base quantity
    expect(params.get('quantity')).toBe('0.5')
    expect(params.get('quoteOrderQty')).toBeNull()
  })
})

describe('cancelBinanceOrder', () => {
  it('issues a signed DELETE with symbol + orderId', async () => {
    const { calls } = stubFetch({})
    const result = await cancelBinanceOrder(
      '77',
      'BTC-USDT',
      CREDS,
      '',
      'paper',
    )
    expect(result).toEqual({ success: true, orderId: '77' })
    expect(calls[0].init.method).toBe('DELETE')
    expect(calls[0].url).toContain('symbol=BTCUSDT')
    expect(calls[0].url).toContain('orderId=77')
  })
})

describe('fetchBinanceBalances — conformance', () => {
  it('computes total and drops zero balances', async () => {
    stubFetch({
      balances: [
        { asset: 'BTC', free: '0.5', locked: '0.1' },
        { asset: 'USDT', free: '0', locked: '0' },
      ],
    })
    const balances = await fetchBinanceBalances(CREDS, '', false)
    expect(balances).toHaveLength(1)
    expect(balances[0]).toEqual({
      currency: 'BTC',
      available: '0.5',
      frozen: '0.1',
      total: '0.6',
    })
    assertBalanceConformant(balances[0])
  })
})

describe('fetchBinanceOpenOrders — conformance', () => {
  it('marks untriggered STOP_LOSS_LIMIT orders as trigger orders', async () => {
    stubFetch([
      {
        orderId: 11,
        symbol: 'BTCUSDT',
        side: 'SELL',
        type: 'STOP_LOSS_LIMIT',
        origQty: '0.5',
        price: '46900',
        stopPrice: '47000',
        executedQty: '0',
        status: 'NEW',
        time: 1700000000000,
        updateTime: 1700000000000,
      },
    ])
    const orders = await fetchBinanceOpenOrders(CREDS, '', false)
    expect(orders[0].triggerOrder).toBe(true)
    expect(orders[0].triggerPrice).toBe('47000')
    expect(orders[0].type).toBe('limit')
    expect(orders[0].status).toBe('live')
  })

  it('normalizes a Binance order record', async () => {
    stubFetch([
      {
        orderId: 9,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        origQty: '0.01',
        price: '40000',
        executedQty: '0',
        status: 'NEW',
        time: 1700000000000,
        updateTime: 1700000000000,
      },
    ])
    const orders = await fetchBinanceOpenOrders(CREDS, '', false)
    expect(orders).toHaveLength(1)
    assertOrderConformant(orders[0])
    expect(orders[0].status).toBe('live')
  })
})
