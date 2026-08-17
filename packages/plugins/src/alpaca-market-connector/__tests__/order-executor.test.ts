// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import {
  assertBalanceConformant,
  assertOrderConformant,
} from '../../test-utils/conformance'
import {
  cancelAlpacaOrder,
  fetchAlpacaBalances,
  fetchAlpacaOpenOrders,
  fetchAlpacaPositions,
  normalizeAlpacaOrder,
  placeAlpacaOrder,
} from '../order-executor'

const CREDS = { apiKey: 'PKTEST123', apiSecret: 'alpaca-secret-DO-NOT-LEAK' }

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

/** Stub two sequential endpoints (account, then positions). */
function stubFetchSequence(
  responses: Array<{ json: unknown; status?: number }>,
): {
  calls: Array<Captured>
} {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    const i = calls.length
    calls.push({ url: String(url), init: init ?? {} })
    const r = responses[Math.min(i, responses.length - 1)]
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 })
  }) as unknown as typeof fetch
  return { calls }
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

// Real Alpaca order record shape (trimmed to relevant fields)
const REAL_ORDER = {
  id: '61e69015-8549-4bfd-b9c3-01e75843f47d',
  client_order_id: 'pl-abc123',
  created_at: '2026-06-30T13:35:00.111Z',
  updated_at: '2026-06-30T13:35:02.222Z',
  submitted_at: '2026-06-30T13:35:00.100Z',
  filled_at: '2026-06-30T13:35:02.220Z',
  asset_class: 'us_equity',
  symbol: 'AAPL',
  qty: '10',
  filled_qty: '10',
  filled_avg_price: '178.12',
  order_class: 'simple',
  type: 'market',
  side: 'buy',
  time_in_force: 'day',
  limit_price: null,
  status: 'filled',
  extended_hours: false,
}

describe('placeAlpacaOrder — request shape & routing', () => {
  it('sends header auth + JSON body and routes paper mode to paper-api', async () => {
    const { calls } = stubFetch(REAL_ORDER)

    const result = await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'buy',
        type: 'market',
        size: '10',
        mode: 'paper',
        clientOrderId: 'pl-abc123',
      },
      CREDS,
    )

    expect(result.success).toBe(true)
    expect(result.orderId).toBe(REAL_ORDER.id)

    const { url, init } = calls[0]
    expect(url).toBe('https://paper-api.alpaca.markets/v2/orders')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['APCA-API-KEY-ID']).toBe(CREDS.apiKey)
    expect(headers['APCA-API-SECRET-KEY']).toBe(CREDS.apiSecret)

    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body).toEqual({
      symbol: 'AAPL',
      side: 'buy',
      type: 'market',
      qty: '10',
      time_in_force: 'day',
      client_order_id: 'pl-abc123',
    })
  })

  it('routes live mode to api.alpaca.markets', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'sell',
        type: 'market',
        size: '1',
        mode: 'live',
      },
      CREDS,
    )
    expect(calls[0].url).toBe('https://api.alpaca.markets/v2/orders')
  })

  it('maps quote-denominated market orders to notional dollars', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'buy',
        type: 'market',
        size: '500',
        mode: 'paper',
        tgtCcy: 'quote_ccy',
      },
      CREDS,
    )
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['notional']).toBe('500')
    expect(body['qty']).toBeUndefined()
    expect(body['time_in_force']).toBe('day')
  })

  it('maps sl+market triggers to a native stop order with stop_price', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'sell',
        type: 'market',
        size: '10',
        trigger: { triggerPrice: '170', triggerType: 'sl' },
        mode: 'paper',
      },
      CREDS,
    )
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['type']).toBe('stop')
    expect(body['stop_price']).toBe('170')
    expect(body['qty']).toBe('10')
    expect(body['limit_price']).toBeUndefined()
    expect(body['time_in_force']).toBe('gtc')
  })

  it('maps sl+limit triggers to stop_limit with both prices', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'sell',
        type: 'limit',
        size: '10',
        price: '169.5',
        trigger: { triggerPrice: '170', triggerType: 'sl' },
        mode: 'paper',
      },
      CREDS,
    )
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['type']).toBe('stop_limit')
    expect(body['stop_price']).toBe('170')
    expect(body['limit_price']).toBe('169.5')
  })

  it('maps tp triggers to a resting GTC limit at the trigger price', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'sell',
        type: 'market',
        size: '10',
        trigger: { triggerPrice: '190', triggerType: 'tp' },
        mode: 'paper',
      },
      CREDS,
    )
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['type']).toBe('limit')
    expect(body['limit_price']).toBe('190')
    expect(body['stop_price']).toBeUndefined()
    expect(body['time_in_force']).toBe('gtc')
  })

  it('never sizes trigger orders in notional dollars', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'sell',
        type: 'market',
        size: '10',
        tgtCcy: 'quote_ccy',
        trigger: { triggerPrice: '170', triggerType: 'sl' },
        mode: 'paper',
      },
      CREDS,
    )
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['qty']).toBe('10')
    expect(body['notional']).toBeUndefined()
  })

  it('sends limit orders with limit_price and GTC', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'NVDA-USD',
        side: 'buy',
        type: 'limit',
        size: '5',
        price: '120.50',
        mode: 'paper',
      },
      CREDS,
    )
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['symbol']).toBe('NVDA')
    expect(body['limit_price']).toBe('120.50')
    expect(body['time_in_force']).toBe('gtc')
  })

  // Alpaca rejects any fractional quantity carrying time_in_force 'gtc'
  // ("fractional orders must be DAY orders"), and the trade panel's percentage
  // sizing emits fractional share counts routinely. Verified against the paper
  // API: qty 0.37 + gtc is rejected, qty 0.37 + day is accepted.
  it('sends fractional limit orders as DAY rather than GTC', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    const result = await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'sell',
        type: 'limit',
        size: '0.66',
        price: '310.00',
        mode: 'paper',
      },
      CREDS,
    )
    expect(result.success).toBe(true)
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['qty']).toBe('0.66')
    expect(body['limit_price']).toBe('310.00')
    expect(body['time_in_force']).toBe('day')
  })

  it('keeps whole-share limit orders on GTC', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'sell',
        type: 'limit',
        size: '2',
        price: '310.00',
        mode: 'paper',
      },
      CREDS,
    )
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['time_in_force']).toBe('gtc')
  })

  // A fractional stop can only be a DAY order, which would expire at the
  // close — refused rather than handed back as protection that silently ends.
  it('refuses fractional trigger orders instead of downgrading them to DAY', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    const result = await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'sell',
        type: 'market',
        size: '0.66',
        trigger: { triggerType: 'sl', triggerPrice: '280' },
        mode: 'paper',
      },
      CREDS,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('whole number of shares')
    // Refused locally — never reached the venue.
    expect(calls).toHaveLength(0)
  })

  it('still accepts whole-share trigger orders as GTC', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    const result = await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'sell',
        type: 'market',
        size: '3',
        trigger: { triggerType: 'sl', triggerPrice: '280' },
        mode: 'paper',
      },
      CREDS,
    )
    expect(result.success).toBe(true)
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['type']).toBe('stop')
    expect(body['time_in_force']).toBe('gtc')
  })

  // Extended-hours eligibility, confirmed against the paper API: limit orders
  // qualify on either DAY or GTC, market orders answer "extended hours order
  // must be DAY or GTC limit orders", stops answer "not eligible for extended
  // hours trading". An identical aggressive GTC buy filled with the flag and
  // sat unfilled without it, so the flag really does gate participation.
  it('sends extended_hours on a whole-share limit order, keeping GTC', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    const result = await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'buy',
        type: 'limit',
        size: '1',
        price: '330',
        extendedHours: true,
        mode: 'paper',
      },
      CREDS,
    )
    expect(result.success).toBe(true)
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['extended_hours']).toBe(true)
    expect(body['time_in_force']).toBe('gtc')
  })

  it('composes extended hours with the fractional DAY rule', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'buy',
        type: 'limit',
        size: '0.37',
        price: '330',
        extendedHours: true,
        mode: 'paper',
      },
      CREDS,
    )
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['extended_hours']).toBe(true)
    expect(body['time_in_force']).toBe('day')
  })

  it('omits extended_hours entirely when not requested', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'buy',
        type: 'limit',
        size: '1',
        price: '330',
        mode: 'paper',
      },
      CREDS,
    )
    const body = JSON.parse(String(calls[0].init.body)) as Record<
      string,
      unknown
    >
    expect(body['extended_hours']).toBeUndefined()
  })

  it('refuses an extended-hours market order rather than sending it', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    const result = await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'buy',
        type: 'market',
        size: '1',
        extendedHours: true,
        mode: 'paper',
      },
      CREDS,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('limit order')
    expect(calls).toHaveLength(0)
  })

  it('refuses an extended-hours trigger order rather than sending it', async () => {
    const { calls } = stubFetch(REAL_ORDER)
    const result = await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'sell',
        type: 'limit',
        size: '1',
        price: '280',
        trigger: { triggerType: 'sl', triggerPrice: '285' },
        extendedHours: true,
        mode: 'paper',
      },
      CREDS,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('stop or take-profit')
    expect(calls).toHaveLength(0)
  })

  it('surfaces the API error message on rejection', async () => {
    stubFetch({ code: 40310000, message: 'insufficient buying power' }, 403)
    const result = await placeAlpacaOrder(
      {
        market: 'alpaca',
        pair: 'AAPL-USD',
        side: 'buy',
        type: 'market',
        size: '1000000',
        mode: 'paper',
      },
      CREDS,
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('insufficient buying power')
  })
})

describe('cancelAlpacaOrder', () => {
  it('DELETEs the order by id on the mode-matched host', async () => {
    const { calls } = stubFetch({}, 204)
    const result = await cancelAlpacaOrder('order-1', CREDS, 'paper')
    expect(result.success).toBe(true)
    expect(calls[0].url).toBe(
      'https://paper-api.alpaca.markets/v2/orders/order-1',
    )
    expect(calls[0].init.method).toBe('DELETE')
  })
})

describe('normalizeAlpacaOrder — conformance & status mapping', () => {
  it('normalizes a filled order into the shared contract', () => {
    const order = normalizeAlpacaOrder(REAL_ORDER)
    expect(order.orderId).toBe(REAL_ORDER.id)
    expect(order.pair).toBe('AAPL-USD')
    expect(order.side).toBe('buy')
    expect(order.type).toBe('market')
    expect(order.status).toBe('filled')
    expect(order.avgPrice).toBe('178.12')
    expect(order.createdAt).toBe(Date.parse(REAL_ORDER.created_at))
    assertOrderConformant(order)
  })

  // Both records below are verbatim shapes from the paper API. A notional
  // order keeps qty=null for its whole life — even after filling — so shares
  // only ever appear in filled_qty.
  it('leaves size empty for a pending notional order rather than reporting 0 shares', () => {
    const order = normalizeAlpacaOrder({
      ...REAL_ORDER,
      status: 'accepted',
      notional: '200',
      qty: null,
      filled_qty: '0',
      filled_avg_price: null,
    })
    expect(order.size).toBe('')
    expect(order.fillSize).toBe('0')
  })

  it('reports the filled share count for a filled notional order', () => {
    const order = normalizeAlpacaOrder({
      ...REAL_ORDER,
      status: 'filled',
      notional: '200',
      qty: null,
      filled_qty: '0.653991674',
      filled_avg_price: '305.799',
    })
    expect(order.size).toBe('0.653991674')
    expect(order.avgPrice).toBe('305.799')
  })

  it('maps the Alpaca status enum onto the 4-state contract', () => {
    const mk = (status: string) =>
      normalizeAlpacaOrder({ ...REAL_ORDER, status }).status
    expect(mk('new')).toBe('live')
    expect(mk('accepted')).toBe('live')
    expect(mk('pending_new')).toBe('live')
    expect(mk('held')).toBe('live')
    expect(mk('partially_filled')).toBe('partially_filled')
    expect(mk('filled')).toBe('filled')
    expect(mk('canceled')).toBe('cancelled')
    expect(mk('expired')).toBe('cancelled')
    expect(mk('rejected')).toBe('cancelled')
    expect(mk('done_for_day')).toBe('cancelled')
  })
})

describe('fetchAlpacaBalances — account + positions → balances', () => {
  it('emits USD cash plus one conformant entry per position', async () => {
    const { calls } = stubFetchSequence([
      { json: { cash: '50000.25', portfolio_value: '61000' } },
      {
        json: [
          {
            symbol: 'AAPL',
            qty: '10',
            qty_available: '8',
            avg_entry_price: '170.00',
          },
          { symbol: 'SPY', qty: '2', qty_available: '2' },
        ],
      },
    ])

    const balances = await fetchAlpacaBalances(CREDS, 'paper')

    expect(calls[0].url).toBe('https://paper-api.alpaca.markets/v2/account')
    expect(calls[1].url).toBe('https://paper-api.alpaca.markets/v2/positions')

    expect(balances).toHaveLength(3)
    const usd = balances.find((b) => b.currency === 'USD')!
    expect(usd.available).toBe('50000.25')
    const aapl = balances.find((b) => b.currency === 'AAPL')!
    expect(aapl.available).toBe('8')
    expect(aapl.frozen).toBe('2')
    expect(aapl.total).toBe('10')
    for (const b of balances) assertBalanceConformant(b)
  })
})

describe('fetchAlpacaOpenOrders', () => {
  it('lists open orders and normalizes each record', async () => {
    const { calls } = stubFetch([
      { ...REAL_ORDER, status: 'new', filled_qty: '0' },
    ])
    const orders = await fetchAlpacaOpenOrders(CREDS, 'paper')
    expect(calls[0].url).toContain(
      'https://paper-api.alpaca.markets/v2/orders?status=open',
    )
    expect(orders).toHaveLength(1)
    expect(orders[0].status).toBe('live')
    assertOrderConformant(orders[0])
  })
})

/**
 * A cash-equity position, verbatim from GET /v2/positions. Kept whole rather
 * than trimmed to the fields read today: the ones that go unused are exactly
 * the ones a future field-name typo would silently pick up.
 */
const REAL_POSITION = {
  asset_id: '904837e3-3b76-47ec-b432-046db621571b',
  symbol: 'NVDA',
  exchange: 'NASDAQ',
  asset_class: 'us_equity',
  avg_entry_price: '104.18',
  qty: '220',
  qty_available: '220',
  side: 'long',
  market_value: '26642.00',
  cost_basis: '22919.60',
  unrealized_pl: '3722.40',
  unrealized_plpc: '0.1624',
  unrealized_intraday_pl: '589.00',
  unrealized_intraday_plpc: '0.0226',
  current_price: '121.10',
  lastday_price: '118.42',
  change_today: '0.02263',
}

describe('fetchAlpacaPositions', () => {
  it('normalizes a long stock holding onto the shared position shape', async () => {
    const { calls } = stubFetch([REAL_POSITION])
    const positions = await fetchAlpacaPositions(CREDS, 'paper')

    expect(calls[0].url).toBe('https://paper-api.alpaca.markets/v2/positions')
    expect(positions).toHaveLength(1)
    expect(positions[0]).toEqual({
      pair: 'NVDA-USD',
      side: 'long',
      contracts: 220,
      entryPrice: 104.18,
      markPrice: 121.1,
      unrealizedPnl: 3722.4,
      notionalUsd: 26642,
      intradayPnl: 589,
      changeToday: 0.02263,
    })
    // No liquidation price on a cash equity: absent, not zero, or the pane
    // draws a price at which nothing happens.
    expect(positions[0].liquidationPrice).toBeUndefined()
  })

  it('reports a short as a positive count with the direction in side', async () => {
    stubFetch([
      { ...REAL_POSITION, qty: '-40', side: 'short', market_value: '-4844.00' },
    ])
    const positions = await fetchAlpacaPositions(CREDS, 'paper')
    expect(positions[0].side).toBe('short')
    expect(positions[0].contracts).toBe(40)
  })

  it('drops a flat row rather than rendering a zero-share holding', async () => {
    stubFetch([
      { ...REAL_POSITION, qty: '0' },
      { symbol: '', qty: '5' },
    ])
    expect(await fetchAlpacaPositions(CREDS, 'paper')).toEqual([])
  })

  it('throws on a refused read, so an empty book is never inferred', async () => {
    stubFetch({ message: 'account is not authorized' }, 403)
    await expect(fetchAlpacaPositions(CREDS, 'live')).rejects.toThrow(
      'account is not authorized',
    )
  })
})
