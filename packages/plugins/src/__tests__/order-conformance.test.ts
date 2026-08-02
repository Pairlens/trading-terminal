// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import {
  assertBalanceConformant,
  assertOrderConformant,
} from '../test-utils/conformance'
import {
  createOkxMarketConnectorPlugin,
  okxMarketConnectorManifest,
} from '../okx-market-connector'

import {
  fetchMexcBalances,
  fetchMexcOpenOrders,
} from '../mexc-market-connector/order-executor'
import {
  fetchGateBalances,
  fetchGateOpenOrders,
} from '../gate-market-connector/order-executor'
import {
  fetchKucoinBalances,
  fetchKucoinOpenOrders,
} from '../kucoin-market-connector/order-executor'
import {
  fetchCoinbaseBalances,
  fetchCoinbaseOpenOrders,
} from '../coinbase-market-connector/order-executor'
import {
  fetchBitgetBalances,
  fetchBitgetOpenOrders,
} from '../bitget-market-connector/order-executor'
import {
  fetchHtxBalances,
  fetchHtxOpenOrders,
} from '../htx-market-connector/order-executor'
import {
  fetchCryptocomBalances,
  fetchCryptocomOpenOrders,
} from '../cryptocom-market-connector/order-executor'
import {
  fetchBfxBalances,
  fetchBfxOpenOrders,
} from '../bitfinex-market-connector/order-executor'
import type { PluginExecuteParams } from '@pairlens/plugin-system/types'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
} from '@pairlens/market-engine/types'

// ── URL-dispatching fetch mock ──
// Routes a request to the first matching response by URL substring, so
// multi-call flows (e.g. HTX resolves an account id, then fetches) work.
type Route = { match: string; json: unknown }
function dispatch(routes: Array<Route>) {
  globalThis.fetch = mock(async (url: unknown) => {
    const u = String(url)
    const r = routes.find((x) => u.includes(x.match))
    return new Response(JSON.stringify(r ? r.json : {}), { status: 200 })
  }) as unknown as typeof fetch
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

// Shared assertion: a normalized BTC balance must split 0.5 avail / 0.1 frozen
// / 0.6 total (as numbers — float→string formatting differs per connector).
function assertBtcSplit(balances: Array<NormalizedBalance>, label: string) {
  for (const b of balances) assertBalanceConformant(b, `${label} balance`)
  const btc = balances.find((b) => b.currency.toUpperCase() === 'BTC')
  expect(btc, `${label} has BTC balance`).toBeDefined()
  expect(Number(btc!.available), `${label} available`).toBeCloseTo(0.5, 6)
  expect(Number(btc!.frozen), `${label} frozen`).toBeCloseTo(0.1, 6)
  expect(Number(btc!.total), `${label} total`).toBeCloseTo(0.6, 6)
}

function assertFilledOrder(
  orders: Array<NormalizedOrderUpdate>,
  label: string,
) {
  expect(orders.length, `${label} returned an order`).toBeGreaterThan(0)
  for (const o of orders) assertOrderConformant(o, `${label} order`)
  expect(orders[0].status, `${label} status`).toBe('filled')
}

describe('order/balance conformance — trade-capable connectors', () => {
  it('mexc', async () => {
    dispatch([
      {
        match: '/account',
        json: { balances: [{ asset: 'BTC', free: '0.5', locked: '0.1' }] },
      },
    ])
    assertBtcSplit(
      await fetchMexcBalances({ apiKey: 'k', apiSecret: 's' }, '', false),
      'mexc',
    )

    dispatch([
      {
        match: '/openOrders',
        json: [
          {
            status: 'FILLED',
            orderId: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
            type: 'LIMIT',
          },
        ],
      },
    ])
    assertFilledOrder(
      await fetchMexcOpenOrders({ apiKey: 'k', apiSecret: 's' }, '', false),
      'mexc',
    )
  })

  it('gate', async () => {
    dispatch([
      {
        match: '/spot/accounts',
        json: [{ currency: 'BTC', available: '0.5', locked: '0.1' }],
      },
    ])
    assertBtcSplit(
      await fetchGateBalances({ apiKey: 'k', apiSecret: 's' }, '', false),
      'gate',
    )

    dispatch([
      {
        match: '/spot/orders',
        json: [
          {
            status: 'closed',
            finish_as: 'filled',
            id: '1',
            currency_pair: 'BTC_USDT',
            side: 'buy',
            type: 'limit',
          },
        ],
      },
    ])
    assertFilledOrder(
      await fetchGateOpenOrders(
        { apiKey: 'k', apiSecret: 's' },
        '',
        false,
        'BTC-USDT',
      ),
      'gate',
    )
  })

  it('kucoin', async () => {
    const creds = { apiKey: 'k', apiSecret: 's', passphrase: 'p' }
    dispatch([
      {
        match: '/accounts',
        json: {
          code: '200000',
          data: [
            { currency: 'BTC', available: '0.5', holds: '0.1', balance: '0.6' },
          ],
        },
      },
    ])
    assertBtcSplit(await fetchKucoinBalances(creds, '', false), 'kucoin')

    dispatch([
      {
        match: 'order',
        json: {
          code: '200000',
          data: [
            {
              status: 'done',
              id: '1',
              symbol: 'BTC-USDT',
              side: 'buy',
              type: 'limit',
            },
          ],
        },
      },
    ])
    assertFilledOrder(
      await fetchKucoinOpenOrders(creds, '', false, 'BTC-USDT'),
      'kucoin',
    )
  })

  it('coinbase (paper skips JWT)', async () => {
    const creds = { apiKey: 'name', apiSecret: 'pem' }
    dispatch([
      {
        match: '/accounts',
        json: {
          accounts: [
            {
              available_balance: { value: '0.5', currency: 'BTC' },
              hold: { value: '0.1' },
            },
          ],
        },
      },
    ])
    assertBtcSplit(await fetchCoinbaseBalances(creds, '', true), 'coinbase')

    dispatch([
      {
        match: 'orders',
        json: {
          orders: [
            {
              status: 'FILLED',
              order_id: '1',
              product_id: 'BTC-USDT',
              order_side: 'BUY',
            },
          ],
        },
      },
    ])
    assertFilledOrder(
      await fetchCoinbaseOpenOrders(creds, '', true, 'BTC-USDT'),
      'coinbase',
    )
  })

  it('bitget', async () => {
    dispatch([
      {
        match: '/account/assets',
        json: {
          code: '00000',
          data: [{ coin: 'BTC', available: '0.5', frozen: '0.1', locked: '0' }],
        },
      },
    ])
    assertBtcSplit(
      await fetchBitgetBalances(
        { apiKey: 'k', apiSecret: 's', passphrase: 'p' },
        '',
        false,
      ),
      'bitget',
    )

    dispatch([
      {
        match: 'unfilled-orders',
        json: {
          code: '00000',
          data: [
            {
              status: 'filled',
              orderId: '1',
              symbol: 'BTCUSDT',
              side: 'buy',
              orderType: 'limit',
            },
          ],
        },
      },
    ])
    assertFilledOrder(
      await fetchBitgetOpenOrders(
        { apiKey: 'k', apiSecret: 's', passphrase: 'p' },
        '',
        false,
      ),
      'bitget',
    )
  })

  it('htx (resolves account id, then fetches)', async () => {
    const creds = { apiKey: 'k', apiSecret: 's' }
    dispatch([
      // order matters: the balance URL also contains 'account/accounts'
      {
        match: 'balance',
        json: {
          status: 'ok',
          data: {
            list: [
              { currency: 'btc', type: 'trade', balance: '0.5' },
              { currency: 'btc', type: 'frozen', balance: '0.1' },
            ],
          },
        },
      },
      {
        match: 'account/accounts',
        json: {
          status: 'ok',
          data: [{ id: 1, type: 'spot', state: 'working' }],
        },
      },
    ])
    assertBtcSplit(await fetchHtxBalances(creds), 'htx')

    dispatch([
      {
        match: 'account/accounts',
        json: {
          status: 'ok',
          data: [{ id: 1, type: 'spot', state: 'working' }],
        },
      },
      {
        match: 'order',
        json: {
          status: 'ok',
          data: [
            {
              id: 1,
              symbol: 'btcusdt',
              type: 'buy-limit',
              amount: '1',
              price: '30000',
              state: 'filled',
              'filled-amount': '1',
              'filled-cash-amount': '30000',
              'filled-fees': '0',
              'created-at': 1700000000000,
            },
          ],
        },
      },
    ])
    assertFilledOrder(await fetchHtxOpenOrders(creds, 'BTC-USDT'), 'htx')
  })

  it('cryptocom', async () => {
    const creds = { apiKey: 'k', apiSecret: 's' }
    dispatch([
      {
        match: 'user-balance',
        json: {
          code: 0,
          result: {
            data: [
              {
                position_balances: [
                  {
                    instrument_name: 'BTC',
                    quantity: '0.6',
                    reserved_qty: '0.1',
                  },
                ],
              },
            ],
          },
        },
      },
    ])
    assertBtcSplit(await fetchCryptocomBalances(creds, false), 'cryptocom')

    dispatch([
      {
        match: 'open-orders',
        json: {
          code: 0,
          result: {
            data: [
              {
                order_id: '1',
                instrument_name: 'BTC_USDT',
                side: 'BUY',
                type: 'LIMIT',
                price: '30000',
                quantity: '1',
                cumulative_quantity: '1',
                avg_price: '30000',
                status: 'FILLED',
                fee_currency: 'USDT',
                cumulative_fee: '0',
                create_time: 1700000000000,
                update_time: 1700000000000,
              },
            ],
          },
        },
      },
    ])
    assertFilledOrder(
      await fetchCryptocomOpenOrders(creds, false, 'BTC-USDT'),
      'cryptocom',
    )
  })

  it('bitfinex (array-of-arrays)', async () => {
    const creds = { apiKey: 'k', apiSecret: 's' }
    dispatch([
      // wallet: [TYPE, CURRENCY, BALANCE, UNSETTLED, AVAILABLE]
      { match: '/auth/r/wallets', json: [['exchange', 'BTC', 0.6, 0, 0.5]] },
    ])
    assertBtcSplit(await fetchBfxBalances(creds), 'bitfinex')

    dispatch([
      // order array: status at index 13 ('EXECUTED...' → filled)
      {
        match: '/auth/r/orders',
        json: [
          [
            1,
            0,
            0,
            'tBTCUSD',
            1700000000000,
            1700000000000,
            1,
            1,
            'EXCHANGE LIMIT',
            null,
            0,
            0,
            null,
            'EXECUTED @ 30000(1.0)',
            null,
            null,
            30000,
            30000,
          ],
        ],
      },
    ])
    assertFilledOrder(await fetchBfxOpenOrders(creds), 'bitfinex')
  })
})

// ── Credential slot resolution ──
// A provided-but-unknown credentialId must FAIL CLOSED: routing the order to
// some other configured slot could hit the wrong account or trading mode.
// Omitting credentialId keeps the legacy single-slot default.
describe('credential slot resolution (fail closed on unknown credentialId)', () => {
  const okxCreds = { apiKey: 'key-a', apiSecret: 's', passphrase: 'p' }

  function orderParams(credentialId?: string): PluginExecuteParams {
    return {
      capability: 'trading:orders',
      params: {
        action: 'list',
        ...(credentialId ? { credentialId } : {}),
      },
      context: {
        pair: 'BTC-USDT',
        market: 'okx',
        timeframe: '15m',
        mode: 'paper',
        country: '',
      },
    }
  }

  async function makePlugin() {
    const plugin = createOkxMarketConnectorPlugin(okxMarketConnectorManifest)
    await plugin.initialize?.({
      credentialId: 'cred-a',
      ...okxCreds,
      mode: 'paper',
    })
    return plugin
  }

  function trackApiKeys(): { calls: Array<string> } {
    const seen = { calls: [] as Array<string> }
    globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      seen.calls.push(headers['OK-ACCESS-KEY'] ?? '')
      return new Response(JSON.stringify({ code: '0', data: [] }), {
        status: 200,
      })
    }) as unknown as typeof fetch
    return seen
  }

  it('rejects an unknown credentialId without touching the network', async () => {
    const plugin = await makePlugin()
    const seen = trackApiKeys()
    const result = (await plugin.execute(orderParams('cred-nope'))) as {
      success?: boolean
      error?: string
    }
    expect(result.success).toBe(false)
    expect(result.error).toContain("Unknown credential 'cred-nope'")
    expect(seen.calls.length).toBe(0)
  })

  it('routes a known credentialId to its own slot', async () => {
    const plugin = await makePlugin()
    await plugin.initialize?.({
      credentialId: 'cred-b',
      apiKey: 'key-b',
      apiSecret: 's',
      passphrase: 'p',
      mode: 'live',
    })
    const seen = trackApiKeys()
    const result = (await plugin.execute(orderParams('cred-b'))) as {
      open?: Array<unknown>
      error?: string
    }
    expect(result.error).toBeUndefined()
    expect(result.open).toEqual([])
    expect(seen.calls.length).toBeGreaterThan(0)
    for (const key of seen.calls) expect(key).toBe('key-b')
  })

  it('keeps the legacy single-slot default when no credentialId is given', async () => {
    const plugin = await makePlugin()
    const seen = trackApiKeys()
    const result = (await plugin.execute(orderParams())) as {
      open?: Array<unknown>
      error?: string
    }
    expect(result.error).toBeUndefined()
    expect(result.open).toEqual([])
    expect(seen.calls.length).toBeGreaterThan(0)
    for (const key of seen.calls) expect(key).toBe('key-a')
  })

  it('still reports missing credentials when none are configured', async () => {
    const plugin = createOkxMarketConnectorPlugin(okxMarketConnectorManifest)
    const result = (await plugin.execute(orderParams())) as {
      success?: boolean
      error?: string
    }
    expect(result.success).toBe(false)
    expect(result.error).toBe('No credentials configured')
  })
})
