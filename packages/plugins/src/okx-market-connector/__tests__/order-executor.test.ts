// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { hmacSign } from '@pairlens/market-engine/hmac-signer'
import { assertOrderConformant } from '../../test-utils/conformance'
import {
  cancelOkxOrder,
  fetchOkxBalances,
  fetchOkxOpenOrders,
  placeOkxOrder,
} from '../order-executor'

const CREDS = {
  apiKey: 'test-key',
  apiSecret: 'test-secret-DO-NOT-LEAK',
  passphrase: 'test-pass-DO-NOT-LEAK',
}

type Captured = { url: string; init: RequestInit }

/** Install a fake fetch that records the request and returns `responseJson`. */
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

describe('placeOkxOrder — request signing & shape', () => {
  it('hits the global REST host, signs the prehash, and builds the order body', async () => {
    const { calls } = stubFetch({
      code: '0',
      data: [{ ordId: 'OID123', sCode: '0' }],
    })

    const result = await placeOkxOrder(
      {
        market: 'okx',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '0.001',
        mode: 'paper',
      },
      CREDS,
      '', // global
    )

    expect(result).toEqual({ success: true, orderId: 'OID123' })
    expect(calls).toHaveLength(1)

    const { url, init } = calls[0]
    expect(url).toBe('https://www.okx.com/api/v5/trade/order')
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers['OK-ACCESS-KEY']).toBe(CREDS.apiKey)
    expect(headers['OK-ACCESS-PASSPHRASE']).toBe(CREDS.passphrase)
    expect(headers['Content-Type']).toBe('application/json')
    // paper mode must set the simulated-trading flag
    expect(headers['x-simulated-trading']).toBe('1')

    // Body must carry the canonical OKX order fields.
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      instId: 'BTC-USDT',
      tdMode: 'cash',
      side: 'buy',
      ordType: 'market',
      sz: '0.001',
    })

    // The signature must equal HMAC(secret, timestamp + POST + path + body).
    const ts = headers['OK-ACCESS-TIMESTAMP']
    const expectedSig = await hmacSign(
      CREDS.apiSecret,
      `${ts}POST/api/v5/trade/order${String(init.body)}`,
    )
    expect(headers['OK-ACCESS-SIGN']).toBe(expectedSig)
  })

  it('routes trigger orders to the algo endpoint with conditional TP/SL fields', async () => {
    const { calls } = stubFetch({
      code: '0',
      data: [{ algoId: 'ALGO42', sCode: '0' }],
    })

    const result = await placeOkxOrder(
      {
        market: 'okx',
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

    // algoId must map to the generic orderId
    expect(result).toEqual({ success: true, orderId: 'ALGO42' })

    const { url, init } = calls[0]
    expect(url).toBe('https://www.okx.com/api/v5/trade/order-algo')

    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      instId: 'BTC-USDT',
      tdMode: 'cash',
      side: 'sell',
      ordType: 'conditional',
      sz: '0.5',
      slTriggerPx: '47000',
      slOrdPx: '-1', // market execution on trigger
      slTriggerPxType: 'last',
    })
    expect(body.tpTriggerPx).toBeUndefined()

    // Signature must cover the algo path
    const headers = init.headers as Record<string, string>
    const ts = headers['OK-ACCESS-TIMESTAMP']
    const expectedSig = await hmacSign(
      CREDS.apiSecret,
      `${ts}POST/api/v5/trade/order-algo${String(init.body)}`,
    )
    expect(headers['OK-ACCESS-SIGN']).toBe(expectedSig)
  })

  it('places TP trigger orders with limit execution at the given price', async () => {
    const { calls } = stubFetch({
      code: '0',
      data: [{ algoId: 'ALGO43', sCode: '0' }],
    })

    await placeOkxOrder(
      {
        market: 'okx',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '54900',
        trigger: { triggerPrice: '55000', triggerType: 'tp' },
        mode: 'paper',
        clientOrderId: 'algoclid1',
      },
      CREDS,
      '',
    )

    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toMatchObject({
      ordType: 'conditional',
      tpTriggerPx: '55000',
      tpOrdPx: '54900',
      algoClOrdId: 'algoclid1',
    })
    expect(body.slTriggerPx).toBeUndefined()
  })

  it('surfaces algo order rejections as errors', async () => {
    stubFetch({
      code: '1',
      msg: '',
      data: [{ sCode: '51280', sMsg: 'SL trigger price invalid' }],
    })

    const result = await placeOkxOrder(
      {
        market: 'okx',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'market',
        size: '0.5',
        trigger: { triggerPrice: '0', triggerType: 'sl' },
        mode: 'paper',
      },
      CREDS,
      '',
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('SL trigger price invalid')
  })

  it('forwards a client order id as clOrdId for idempotency', async () => {
    const { calls } = stubFetch({
      code: '0',
      data: [{ ordId: 'X', sCode: '0' }],
    })
    await placeOkxOrder(
      {
        market: 'okx',
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
    expect(JSON.parse(String(calls[0].init.body)).clOrdId).toBe(
      'pl0123456789abcdef',
    )
  })

  it('omits clOrdId when no client order id is supplied', async () => {
    const { calls } = stubFetch({
      code: '0',
      data: [{ ordId: 'X', sCode: '0' }],
    })
    await placeOkxOrder(
      {
        market: 'okx',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'paper',
      },
      CREDS,
      '',
    )
    expect(JSON.parse(String(calls[0].init.body)).clOrdId).toBeUndefined()
  })

  // An OKX key exists on exactly ONE regional entity (verified live: an EEA
  // key returns 50119 on www/us and works on eea). The credential's `entity`
  // must beat country-based routing for every credentialed call.
  it('routes to the credential entity over the country (eea key, global country)', async () => {
    const { calls } = stubFetch({
      code: '0',
      data: [{ ordId: 'X', sCode: '0' }],
    })
    await placeOkxOrder(
      {
        market: 'okx',
        pair: 'BTC-EUR',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'paper',
      },
      { ...CREDS, entity: 'eea' },
      '', // country says global — the account's entity must win
    )
    expect(calls[0].url).toBe('https://eea.okx.com/api/v5/trade/order')
  })

  it('treats an empty entity as no override (routes by country)', async () => {
    const { calls } = stubFetch({
      code: '0',
      data: [{ ordId: 'X', sCode: '0' }],
    })
    await placeOkxOrder(
      {
        market: 'okx',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'paper',
      },
      { ...CREDS, entity: '' },
      'US',
    )
    expect(calls[0].url).toBe('https://us.okx.com/api/v5/trade/order')
  })

  it('rewrites 50119 into the entity-mismatch explanation', async () => {
    stubFetch({
      code: '1',
      msg: '',
      data: [{ sCode: '50119', sMsg: "API key doesn't exist" }],
    })
    const result = await placeOkxOrder(
      {
        market: 'okx',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'paper',
      },
      CREDS,
      '',
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('www.okx.com')
    expect(result.error).toContain('50119')
    expect(result.error).toContain('regional entity')
  })

  it('leaves non-50119 rejections untouched', async () => {
    stubFetch({
      code: '1',
      msg: '',
      data: [{ sCode: '51008', sMsg: 'Insufficient balance' }],
    })
    const result = await placeOkxOrder(
      {
        market: 'okx',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'paper',
      },
      CREDS,
      '',
    )
    expect(result.error).toBe('Insufficient balance')
  })

  it('routes US accounts to the us.okx.com host', async () => {
    const { calls } = stubFetch({
      code: '0',
      data: [{ ordId: 'X', sCode: '0' }],
    })
    await placeOkxOrder(
      {
        market: 'okx',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'paper',
      },
      CREDS,
      'US',
    )
    expect(calls[0].url).toBe('https://us.okx.com/api/v5/trade/order')
  })

  it('omits the simulated-trading header in live mode and includes a limit price', async () => {
    const { calls } = stubFetch({
      code: '0',
      data: [{ ordId: 'X', sCode: '0' }],
    })
    await placeOkxOrder(
      {
        market: 'okx',
        pair: 'ETH-USDT',
        side: 'sell',
        type: 'limit',
        size: '2',
        price: '3000',
        mode: 'live',
      },
      CREDS,
      '',
    )
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['x-simulated-trading']).toBeUndefined()
    expect(JSON.parse(String(calls[0].init.body)).px).toBe('3000')
  })
})

describe('placeOkxOrder — error handling', () => {
  it('returns the exchange error when sCode is non-zero, without leaking credentials', async () => {
    const warnings: Array<string> = []
    const realWarn = console.warn
    console.warn = mock((...args: Array<unknown>) => {
      warnings.push(args.map(String).join(' '))
    }) as unknown as typeof console.warn

    stubFetch({
      code: '1',
      msg: 'top',
      data: [{ sCode: '51008', sMsg: 'Insufficient balance' }],
    })

    const result = await placeOkxOrder(
      {
        market: 'okx',
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
    expect(result.success).toBe(false)
    expect(result.error).toBe('Insufficient balance')
    // No log line may contain the secret or passphrase.
    const joined = warnings.join('\n')
    expect(joined).not.toContain(CREDS.apiSecret)
    expect(joined).not.toContain(CREDS.passphrase)
  })

  it('returns a Network error string when fetch throws', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('connection reset')
    }) as unknown as typeof fetch
    const result = await placeOkxOrder(
      {
        market: 'okx',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '1',
        mode: 'paper',
      },
      CREDS,
      '',
    )
    expect(result).toEqual({ success: false, error: 'connection reset' })
  })
})

describe('cancelOkxOrder', () => {
  it('posts to cancel-order with instId + ordId', async () => {
    const { calls } = stubFetch({ code: '0', msg: '' })
    const result = await cancelOkxOrder('OID9', 'BTC-USDT', CREDS, '', 'paper')
    expect(result).toEqual({ success: true, orderId: 'OID9' })
    expect(calls[0].url).toBe('https://www.okx.com/api/v5/trade/cancel-order')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      instId: 'BTC-USDT',
      ordId: 'OID9',
    })
  })
})

describe('fetchOkxBalances', () => {
  it('keeps only non-zero balances and maps fields as strings', async () => {
    stubFetch({
      code: '0',
      data: [
        {
          details: [
            {
              ccy: 'BTC',
              availBal: '0.5',
              availEq: '',
              frozenBal: '0.1',
              eq: '0.6',
            },
            {
              ccy: 'USDT',
              availBal: '0',
              availEq: '',
              frozenBal: '0',
              eq: '0',
            },
          ],
        },
      ],
    })
    const balances = await fetchOkxBalances(CREDS, '', false)
    expect(balances).toHaveLength(1)
    expect(balances[0]).toEqual({
      currency: 'BTC',
      available: '0.5',
      frozen: '0.1',
      total: '0.6',
    })
  })

  // Cash (spot) accounts return availEq as an EMPTY string for every
  // currency (verified live against OKX demo) — the spendable balance is
  // availBal. Mapping availEq directly reported 0 available across the board.
  it('falls back to availEq only when availBal is absent (margin/unified)', async () => {
    stubFetch({
      code: '0',
      data: [
        {
          details: [{ ccy: 'ETH', availEq: '2.5', frozenBal: '0', eq: '2.5' }],
        },
      ],
    })
    const balances = await fetchOkxBalances(CREDS, '', false)
    expect(balances[0]?.available).toBe('2.5')
  })
})

describe('fetchOkxOpenOrders — normalized output conforms', () => {
  /** Answers the regular and algo-pending endpoints separately. */
  function stubOpenOrderFetches(
    regular: Array<Record<string, string>>,
    algos: Array<Record<string, string>>,
  ): { calls: Array<string> } {
    const calls: Array<string> = []
    globalThis.fetch = mock(async (url: unknown) => {
      const u = String(url)
      calls.push(u)
      const data = u.includes('orders-algo-pending') ? algos : regular
      return new Response(JSON.stringify({ code: '0', data }), { status: 200 })
    }) as unknown as typeof fetch
    return { calls }
  }

  const REGULAR_ORDER = {
    ordId: 'OID1',
    instId: 'BTC-USDT',
    side: 'buy',
    ordType: 'limit',
    sz: '0.01',
    px: '40000',
    fillSz: '0',
    avgPx: '',
    state: 'live',
    fee: '0',
    feeCcy: 'USDT',
    uTime: '1700000000000',
    cTime: '1700000000000',
  }

  it('normalizes an OKX order record to the canonical contract', async () => {
    stubOpenOrderFetches([REGULAR_ORDER], [])
    const orders = await fetchOkxOpenOrders(CREDS, '', false)
    expect(orders).toHaveLength(1)
    assertOrderConformant(orders[0])
    expect(orders[0].status).toBe('live')
    expect(orders[0].triggerOrder).toBeUndefined()
  })

  it('merges pending conditional algo orders with triggerOrder marking', async () => {
    const { calls } = stubOpenOrderFetches(
      [REGULAR_ORDER],
      [
        {
          algoId: 'ALGO7',
          instId: 'BTC-USDT',
          side: 'sell',
          ordType: 'conditional',
          sz: '0.5',
          slTriggerPx: '47000',
          slOrdPx: '-1',
          state: 'live',
          cTime: '1700000000000',
        },
      ],
    )

    const orders = await fetchOkxOpenOrders(CREDS, '', false)
    expect(orders).toHaveLength(2)
    expect(
      calls.some((u) =>
        u.includes('/api/v5/trade/orders-algo-pending?ordType=conditional'),
      ),
    ).toBe(true)

    const algo = orders.find((o) => o.orderId === 'ALGO7')!
    expect(algo.triggerOrder).toBe(true)
    expect(algo.triggerPrice).toBe('47000')
    expect(algo.type).toBe('market') // slOrdPx -1 = market execution
    expect(algo.status).toBe('live')
  })
})

describe('cancelOkxOrder — algo routing', () => {
  it('routes trigger cancels to cancel-algos with an [{algoId, instId}] body', async () => {
    const { calls } = stubFetch({
      code: '0',
      data: [{ algoId: 'ALGO7', sCode: '0' }],
    })

    const result = await cancelOkxOrder(
      'ALGO7',
      'BTC-USDT',
      CREDS,
      '',
      'paper',
      { trigger: true },
    )
    expect(result).toEqual({ success: true, orderId: 'ALGO7' })
    expect(calls[0].url).toBe('https://www.okx.com/api/v5/trade/cancel-algos')
    expect(JSON.parse(String(calls[0].init.body))).toEqual([
      { instId: 'BTC-USDT', algoId: 'ALGO7' },
    ])
  })

  it('surfaces per-item sCode failures from cancel-algos', async () => {
    stubFetch({
      code: '0',
      data: [{ algoId: 'ALGO7', sCode: '51293', sMsg: 'order not found' }],
    })
    const result = await cancelOkxOrder(
      'ALGO7',
      'BTC-USDT',
      CREDS,
      '',
      'paper',
      { trigger: true },
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('order not found')
  })
})
