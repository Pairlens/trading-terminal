// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The futures trading runtime, driven against a fake exchange.
 *
 * Three properties are money-shaped and none of them is visible from the pure
 * order builder: a paper slot must never sign against production, leverage must
 * reach the account BEFORE the order and its failure must stop the order, and
 * nothing may throw — `trading:orders` is declared `sideEffect: true`, so a
 * throw reaches the order pane as "All candidates failed" with the venue's real
 * reason buried inside.
 */

import { describe, expect, it } from 'bun:test'
import { CcxtFuturesTradingRuntime } from '../futures-orders'
import { binanceFuturesCcxtVenue } from '../venues/binance-futures'
import { kucoinFuturesCcxtVenue } from '../venues/kucoin-futures'
import type { CcxtExchangeHost } from '../../ccxt-connector/exchange-host'
import type { CexCredentials, CexSlot } from '../../cex-connector'
import type {
  CcxtFuturesExchangeLike,
  CcxtFuturesVenueConfig,
} from '../futures-types'
import type { OrderParams } from '@pairlens/market-engine/types'

const SECRET = 'super-secret-api-secret-value'

type Recorded = {
  orders: Array<Array<unknown>>
  leverage: Array<Array<unknown>>
}

function fakeExchange(over: Partial<CcxtFuturesExchangeLike> = {}): {
  exchange: CcxtFuturesExchangeLike
  recorded: Recorded
} {
  const recorded: Recorded = { orders: [], leverage: [] }
  const exchange = {
    id: 'binanceusdm',
    has: { setLeverage: true, createTriggerOrder: true },
    markets: {},
    createOrder: async (...args: Array<unknown>) => {
      recorded.orders.push(args)
      return { id: 'order-1' }
    },
    setLeverage: async (...args: Array<unknown>) => {
      recorded.leverage.push(args)
      return {}
    },
    fetchPositions: async () => [
      { symbol: 'BTC/USDT:USDT', contracts: 2, side: 'long' },
    ],
    ...over,
  } as unknown as CcxtFuturesExchangeLike
  return { exchange, recorded }
}

/** A host stand-in: no ccxt class, no socket, no timers. */
function hostFor(
  exchange: CcxtFuturesExchangeLike,
  paperActive = false,
): CcxtExchangeHost {
  return {
    generation: 0,
    paperActive,
    authed: true,
    peek: () => exchange,
    setCountry: () => false,
    acquire: async () => ({ exchange, generation: 0 }),
    close: async () => undefined,
    destroy: async () => undefined,
  } as unknown as CcxtExchangeHost
}

function runtime(
  exchange: CcxtFuturesExchangeLike,
  venue: CcxtFuturesVenueConfig = binanceFuturesCcxtVenue,
  paperActive = false,
): CcxtFuturesTradingRuntime {
  return new CcxtFuturesTradingRuntime({
    venue,
    ensureMarkets: async () => undefined,
    createHost: () => hostFor(exchange, paperActive),
  })
}

function slot(over: Partial<CexSlot<CexCredentials>> = {}): CexSlot {
  return {
    id: 'c1',
    credentials: { apiKey: 'key', apiSecret: SECRET },
    mode: 'live',
    country: 'DE',
    privateWsClient: null,
    orderCallback: null,
    balanceCallback: null,
    currentPair: '',
    ...over,
  }
}

function order(over: Partial<OrderParams> = {}): OrderParams {
  return {
    market: 'binance-futures',
    pair: 'BTC-USDT-USDT',
    side: 'buy',
    type: 'market',
    size: '3',
    mode: 'live',
    ...over,
  }
}

describe('placeOrder', () => {
  it('sends the perp symbol and the contract count', async () => {
    const { exchange, recorded } = fakeExchange()
    const result = await runtime(exchange).placeOrder(order(), slot())
    expect(result).toEqual({ success: true, orderId: 'order-1' })
    expect(recorded.orders[0]?.slice(0, 4)).toEqual([
      'BTC/USDT:USDT',
      'market',
      'buy',
      3,
    ])
  })

  it('records the traded pair before anything can fail', async () => {
    const { exchange } = fakeExchange({
      createOrder: async () => {
        throw new Error('venue down')
      },
    })
    const s = slot()
    await runtime(exchange).placeOrder(order(), s)
    // Venues that scope history and cancel by the last traded pair read this,
    // and a rejected order still moved the user's attention to that market.
    expect(s.currentPair).toBe('BTC-USDT-USDT')
  })

  it('applies leverage BEFORE the order, once per symbol', async () => {
    const { exchange, recorded } = fakeExchange()
    const r = runtime(exchange)
    // ONE slot across the burst — the shell keeps a slot per credential and
    // hands the same object to every order, which is what the memo is keyed on.
    const s = slot()
    await r.placeOrder(order({ leverage: 20 }), s)
    await r.placeOrder(order({ leverage: 20 }), s)
    expect(recorded.leverage).toEqual([[20, 'BTC/USDT:USDT']])
    expect(recorded.orders).toHaveLength(2)

    // A different value is a real change and goes out again.
    await r.placeOrder(order({ leverage: 5 }), s)
    expect(recorded.leverage).toHaveLength(2)
  })

  it('re-sends leverage after the credential is re-provisioned', async () => {
    // A re-provision builds a fresh authed instance, and account state this
    // runtime never observed on it is not state it may assume.
    const { exchange, recorded } = fakeExchange()
    const r = runtime(exchange)
    await r.placeOrder(order({ leverage: 20 }), slot())
    await r.placeOrder(order({ leverage: 20 }), slot())
    expect(recorded.leverage).toHaveLength(2)
  })

  it('does not place the order when leverage cannot be set', async () => {
    // Placing at whatever the account happened to carry would size the
    // position differently from what the ticket showed.
    const { exchange, recorded } = fakeExchange({
      setLeverage: async () => {
        throw new Error('leverage 20 exceeds the tier maximum')
      },
    })
    const result = await runtime(exchange).placeOrder(
      order({ leverage: 20 }),
      slot(),
    )
    expect(result.success).toBe(false)
    expect(recorded.orders).toHaveLength(0)
  })

  it('refuses leverage above the venue ceiling without a round trip', async () => {
    const { exchange, recorded } = fakeExchange()
    const result = await runtime(exchange).placeOrder(
      order({ leverage: 500 }),
      slot(),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('125x')
    expect(recorded.leverage).toHaveLength(0)
    expect(recorded.orders).toHaveLength(0)
  })

  it('refuses when the venue class cannot set leverage at all', async () => {
    // The only leverage path left is the per-order one, so this rejection has
    // to stop the ORDER — placing at whatever the account carried would size
    // the position differently from what the ticket showed.
    const { exchange, recorded } = fakeExchange({ has: {} })
    const result = await runtime(exchange).placeOrder(
      order({ leverage: 10 }),
      slot(),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not support')
    expect(recorded.orders).toHaveLength(0)
  })

  it('never touches leverage when the order does not ask for one', async () => {
    const { exchange, recorded } = fakeExchange()
    await runtime(exchange).placeOrder(order(), slot())
    expect(recorded.leverage).toHaveLength(0)
  })

  it('refuses a paper order on a venue with no sandbox, naming the reason', async () => {
    const { exchange, recorded } = fakeExchange()
    const result = await runtime(exchange, kucoinFuturesCcxtVenue).placeOrder(
      order({ mode: 'paper' }),
      slot({ mode: 'paper' }),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('no sandbox')
    expect(recorded.orders).toHaveLength(0)
  })

  it('places a paper order once the venue sandbox actually took', async () => {
    const { exchange, recorded } = fakeExchange()
    const result = await runtime(
      exchange,
      binanceFuturesCcxtVenue,
      true,
    ).placeOrder(order({ mode: 'paper' }), slot({ mode: 'paper' }))
    expect(result.success).toBe(true)
    expect(recorded.orders).toHaveLength(1)
  })

  it('returns a rejection rather than throwing, with secrets redacted', async () => {
    const { exchange } = fakeExchange({
      createOrder: async () => {
        throw new Error(`signature failed for secret=${SECRET}`)
      },
    })
    const result = await runtime(exchange).placeOrder(order(), slot())
    expect(result.success).toBe(false)
    expect(result.error).not.toContain(SECRET)
    expect(result.error).toContain('***')
  })

  it('refuses without credentials instead of signing an empty key', async () => {
    const { exchange } = fakeExchange()
    const result = await runtime(exchange).placeOrder(
      order(),
      slot({ credentials: {} }),
    )
    expect(result).toMatchObject({
      success: false,
      error: 'No credentials configured',
    })
  })
})

describe('fetchPositions', () => {
  it('returns three-segment rows', async () => {
    const { exchange } = fakeExchange()
    const positions = await runtime(exchange).fetchPositions(slot())
    expect(positions).toEqual([
      { pair: 'BTC-USDT-USDT', side: 'long', contracts: 2 },
    ])
  })

  it('degrades to an empty list rather than failing the whole pane', async () => {
    const { exchange } = fakeExchange({
      fetchPositions: async () => {
        throw new Error('rate limited')
      },
    })
    expect(await runtime(exchange).fetchPositions(slot())).toEqual([])
  })
})

describe('cancelOrder', () => {
  it('addresses the perp symbol and flags the trigger id space when asked', async () => {
    const calls: Array<Array<unknown>> = []
    const { exchange } = fakeExchange({
      cancelOrder: async (...args: Array<unknown>) => {
        calls.push(args)
        return {}
      },
    } as Partial<CcxtFuturesExchangeLike>)
    const r = runtime(exchange)
    await r.cancelOrder('7', 'BTC-USDT-USDT', slot())
    await r.cancelOrder('8', 'BTC-USDT-USDT', slot(), { trigger: true })
    expect(calls[0]).toEqual(['7', 'BTC/USDT:USDT', {}])
    expect(calls[1]?.[2]).toEqual({ trigger: true, stop: true })
  })
})
