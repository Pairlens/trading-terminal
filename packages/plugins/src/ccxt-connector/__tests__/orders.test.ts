// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The trading path, at two altitudes.
 *
 * The pure block drives `buildCcxtOrderCall` and the normalizers directly —
 * that is where the whole per-venue capability matrix (trigger spellings,
 * stop-market gaps, quote-denominated sizing) is decided, and it decides it
 * from `exchange.has`, so a plain object is a complete venue for those tests.
 *
 * The signed block goes through the real thing: the real CEX shell, the real
 * ccxt Binance and OKX classes, real HMAC signing, with `globalThis.fetch`
 * stubbed. That works because `restFetch` delegates to the global fetch and the
 * bridge injects it as ccxt's `fetchImplementation` — the same seam the native
 * order-executor suites use, and the reason a CCXT client holding its own HTTP
 * agent would have been untestable here.
 *
 * What it cannot cover: an authenticated round trip against a real venue. That
 * needs user-supplied testnet keys; see the integration note in the report.
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { hmacSignHex } from '@pairlens/market-engine/hmac-signer'
import {
  assertBalanceConformant,
  assertOrderConformant,
} from '../../test-utils/conformance'
import {
  buildCcxtOrderCall,
  normalizeCcxtBalances,
  normalizeCcxtOrder,
  redactSecrets,
} from '../orders'
import { createCcxtConnectorPlugin } from '../index'
import {
  binanceCcxtVenue,
  binanceMarketConnectorManifest,
} from '../venues/binance'
import { okxCcxtVenue, okxMarketConnectorManifest } from '../venues/okx'
import type { MarketsStorage } from '../markets'
import type { CcxtMarketSeed, CcxtVenueConfig } from '../types'
import type { PluginInstance } from '@pairlens/plugin-system/types'
import type { OrderParams } from '@pairlens/market-engine/types'

// ── Fixtures ─────────────────────────────────────────────────────────────

const API_KEY = 'KEY-0123456789abcdef'
const API_SECRET = 'SECRET-0123456789abcdef'
const PASSPHRASE = 'PASSPHRASE-0123456789'

const CREDENTIAL_CONFIG = {
  credentialId: 'cred-1',
  apiKey: API_KEY,
  apiSecret: API_SECRET,
  passphrase: PASSPHRASE,
}

const BINANCE_MARKET: CcxtMarketSeed = {
  id: 'BTCUSDT',
  lowercaseId: 'btcusdt',
  symbol: 'BTC/USDT',
  base: 'BTC',
  quote: 'USDT',
  baseId: 'BTC',
  quoteId: 'USDT',
  type: 'spot',
  spot: true,
  active: true,
  precision: { amount: 0.00001, price: 0.01 },
  limits: { amount: { min: 0.00001 }, cost: { min: 5 } },
  // Binance is the only venue whose createOrder reads market.info.
  info: {
    orderTypes: [
      'LIMIT',
      'LIMIT_MAKER',
      'MARKET',
      'STOP_LOSS',
      'STOP_LOSS_LIMIT',
      'TAKE_PROFIT',
      'TAKE_PROFIT_LIMIT',
    ],
    status: 'TRADING',
    permissions: ['SPOT'],
  },
}

const OKX_MARKET: CcxtMarketSeed = {
  ...BINANCE_MARKET,
  id: 'BTC-USDT',
  lowercaseId: 'btc-usdt',
  precision: { amount: 0.00000001, price: 0.1 },
  info: {},
}

/** A markets cache that is always warm, so no test ever hits `loadMarkets`. */
function warmMarkets(market: CcxtMarketSeed): MarketsStorage {
  return {
    get: async () => ({ savedAt: Date.now(), markets: [market] }),
    set: async () => {},
  }
}

type Captured = { url: string; method: string; body: string; headers: Headers }

type StubOptions = {
  /** Path fragment → response body. First match wins. */
  routes?: Array<[string, unknown, number?]>
  throwOn?: string
}

function stubFetch(options: StubOptions = {}): {
  captured: Array<Captured>
  restore: () => void
} {
  const captured: Array<Captured> = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    captured.push({
      url,
      method: String(init?.method ?? 'GET'),
      body: typeof init?.body === 'string' ? init.body : '',
      headers: new Headers((init?.headers as HeadersInit) ?? {}),
    })
    if (options.throwOn && url.includes(options.throwOn)) {
      throw new TypeError('socket hang up')
    }
    for (const [fragment, payload, status] of options.routes ?? []) {
      if (url.includes(fragment)) {
        return new Response(JSON.stringify(payload), {
          status: status ?? 200,
          headers: { 'content-type': 'application/json' },
        })
      }
    }
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { captured, restore: () => void (globalThis.fetch = original) }
}

function captureWarnings(): { lines: Array<string>; restore: () => void } {
  const lines: Array<string> = []
  const original = console.warn
  console.warn = (...args: Array<unknown>) => {
    lines.push(args.map((a) => String(a)).join(' '))
  }
  return { lines, restore: () => void (console.warn = original) }
}

const BINANCE_ORDER_ACK = {
  symbol: 'BTCUSDT',
  orderId: 28,
  clientOrderId: 'plens-1',
  transactTime: 1_700_000_000_000,
  price: '0.00000000',
  origQty: '0.00100000',
  executedQty: '0.00000000',
  status: 'NEW',
  timeInForce: 'GTC',
  type: 'MARKET',
  side: 'BUY',
}

async function build(
  venue: CcxtVenueConfig,
  manifest: typeof binanceMarketConnectorManifest,
  market: CcxtMarketSeed,
  config: Record<string, unknown> = {},
): Promise<PluginInstance> {
  const plugin = createCcxtConnectorPlugin(venue, manifest, {
    marketsStorage: warmMarkets(market),
  })
  await plugin.initialize?.({ ...CREDENTIAL_CONFIG, ...config })
  return plugin
}

function context(country = '') {
  return {
    pair: 'BTC-USDT',
    market: 'binance',
    timeframe: '1h',
    mode: 'paper' as const,
    country,
  }
}

async function place(
  plugin: PluginInstance,
  params: Record<string, unknown>,
  country = '',
) {
  return (await plugin.execute({
    capability: 'trading:orders' as never,
    params: { action: 'place', pair: 'BTC-USDT', ...params },
    context: context(country),
  })) as { success: boolean; orderId?: string; error?: string }
}

const openPlugins: Array<PluginInstance> = []
async function track(plugin: PluginInstance): Promise<PluginInstance> {
  openPlugins.push(plugin)
  return plugin
}

afterEach(async () => {
  while (openPlugins.length > 0) await openPlugins.pop()?.destroy?.()
})

// ── Pure mapping ─────────────────────────────────────────────────────────

const BASE_ORDER: OrderParams = {
  market: 'binance',
  pair: 'BTC-USDT',
  side: 'buy',
  type: 'market',
  size: '0.001',
  mode: 'live',
}

const VENUE = { displayName: 'Testex' }

describe('buildCcxtOrderCall', () => {
  it('passes a plain order straight through', () => {
    const call = buildCcxtOrderCall(BASE_ORDER, {}, VENUE)
    expect(call.kind).toBe('order')
    if (call.kind !== 'order') return
    expect(call.symbol).toBe('BTC/USDT')
    expect(call.amount).toBe(0.001)
    expect(call.price).toBeUndefined()
  })

  it('carries clientOrderId into params so a double submit cannot execute twice', () => {
    const call = buildCcxtOrderCall(
      { ...BASE_ORDER, clientOrderId: 'plens-abc' },
      {},
      VENUE,
    )
    expect(call.kind === 'order' && call.params['clientOrderId']).toBe(
      'plens-abc',
    )
  })

  it('refuses a limit order with no price, and a non-numeric size', () => {
    expect(
      buildCcxtOrderCall({ ...BASE_ORDER, type: 'limit' }, {}, VENUE),
    ).toEqual({ kind: 'reject', error: 'A limit order needs a limit price' })
    expect(
      buildCcxtOrderCall({ ...BASE_ORDER, size: 'abc' }, {}, VENUE),
    ).toEqual({ kind: 'reject', error: "Invalid order size 'abc'" })
  })

  it('maps a trigger to triggerPrice when the venue declares createTriggerOrder', () => {
    const call = buildCcxtOrderCall(
      {
        ...BASE_ORDER,
        type: 'limit',
        price: '60000',
        trigger: { triggerPrice: '61000', triggerType: 'sl' },
      },
      { createTriggerOrder: true },
      VENUE,
    )
    expect(call.kind === 'order' && call.params['triggerPrice']).toBe(61000)
  })

  it('falls back to the TP/SL spelling where that is what the venue declares', () => {
    const tp = buildCcxtOrderCall(
      {
        ...BASE_ORDER,
        type: 'limit',
        price: '60000',
        trigger: { triggerPrice: '61000', triggerType: 'tp' },
      },
      { createTakeProfitOrder: true },
      VENUE,
    )
    expect(tp.kind === 'order' && tp.params['takeProfitPrice']).toBe(61000)

    const sl = buildCcxtOrderCall(
      {
        ...BASE_ORDER,
        type: 'limit',
        price: '60000',
        trigger: { triggerPrice: '59000', triggerType: 'sl' },
      },
      { createStopLossOrder: true },
      VENUE,
    )
    expect(sl.kind === 'order' && sl.params['stopLossPrice']).toBe(59000)
  })

  it('refuses a trigger order on a venue that has none at all (Upbit)', () => {
    const call = buildCcxtOrderCall(
      { ...BASE_ORDER, trigger: { triggerPrice: '61000', triggerType: 'sl' } },
      {},
      VENUE,
    )
    expect(call).toEqual({
      kind: 'reject',
      error: 'Testex does not support trigger (TP/SL) orders',
    })
  })

  it('refuses a MARKET trigger where the venue declares no stop-market', () => {
    const call = buildCcxtOrderCall(
      { ...BASE_ORDER, trigger: { triggerPrice: '61000', triggerType: 'sl' } },
      { createTriggerOrder: true, createStopMarketOrder: false },
      VENUE,
    )
    expect(call.kind).toBe('reject')
    expect(call.kind === 'reject' && call.error).toContain('limit price')
  })

  it('routes a quote-denominated market buy to the cost call', () => {
    const call = buildCcxtOrderCall(
      { ...BASE_ORDER, size: '25', tgtCcy: 'quote_ccy' },
      { createMarketBuyOrderWithCost: true },
      VENUE,
    )
    expect(call.kind).toBe('cost')
    expect(call.kind === 'cost' && call.cost).toBe(25)
  })

  it('refuses quote denomination where ccxt has no cost entry point', () => {
    const call = buildCcxtOrderCall(
      { ...BASE_ORDER, size: '25', tgtCcy: 'quote_ccy' },
      {},
      VENUE,
    )
    expect(call.kind).toBe('reject')
    expect(call.kind === 'reject' && call.error).toContain('quote-denominated')
  })

  it('leaves a LIMIT order base-denominated even under quote_ccy', () => {
    const call = buildCcxtOrderCall(
      { ...BASE_ORDER, type: 'limit', price: '60000', tgtCcy: 'quote_ccy' },
      { createMarketBuyOrderWithCost: true },
      VENUE,
    )
    expect(call.kind).toBe('order')
  })
})

describe('normalizeCcxtOrder', () => {
  it('maps a partially filled open order and satisfies the order contract', () => {
    const order = normalizeCcxtOrder({
      id: '123',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.5,
      price: 60000,
      filled: 0.2,
      average: 59990,
      status: 'open',
      fee: { cost: 0.0001, currency: 'BTC' },
      timestamp: 1_700_000_000_000,
      lastUpdateTimestamp: 1_700_000_060_000,
    })
    assertOrderConformant(order)
    expect(order.status).toBe('partially_filled')
    expect(order.pair).toBe('BTC-USDT')
    expect(order.fillSize).toBe('0.2')
    expect(order.feeCcy).toBe('BTC')
    expect(order.ts).toBe(1_700_000_060_000)
    expect(order.createdAt).toBe(1_700_000_000_000)
  })

  it('collapses closed/canceled/expired/rejected onto the four-state union', () => {
    const of = (status: string, filled = 0) =>
      normalizeCcxtOrder({ id: '1', status, filled }).status
    expect(of('closed')).toBe('filled')
    expect(of('canceled')).toBe('cancelled')
    expect(of('expired')).toBe('cancelled')
    expect(of('rejected')).toBe('cancelled')
    expect(of('open')).toBe('live')
    expect(of('open', 1)).toBe('partially_filled')
  })

  it('tags a resting trigger order so cancellation routes correctly', () => {
    const order = normalizeCcxtOrder({
      id: 'algo-1',
      symbol: 'BTC/USDT',
      status: 'open',
      triggerPrice: 61000,
    })
    assertOrderConformant(order)
    expect(order.triggerOrder).toBe(true)
    expect(order.triggerPrice).toBe('61000')
  })

  it('leaves absent money fields empty rather than zero', () => {
    const order = normalizeCcxtOrder({ id: '1', status: 'open' })
    assertOrderConformant(order)
    expect(order.avgPrice).toBe('')
    expect(order.fee).toBe('')
  })
})

describe('normalizeCcxtBalances', () => {
  it('drops zero totals and stringifies the rest', () => {
    const balances = normalizeCcxtBalances({
      free: { BTC: 0.5, USDT: 100, ETH: 0 },
      used: { BTC: 0.1, USDT: 0, ETH: 0 },
      total: { BTC: 0.6, USDT: 100, ETH: 0 },
      info: {},
    })
    expect(balances.map((b) => b.currency)).toEqual(['BTC', 'USDT'])
    for (const balance of balances) assertBalanceConformant(balance)
    expect(balances[0]).toEqual({
      currency: 'BTC',
      available: '0.5',
      frozen: '0.1',
      total: '0.6',
    })
  })
})

describe('redactSecrets', () => {
  it('scrubs credential material out of a venue error message', () => {
    const message = redactSecrets(`rejected for key ${API_KEY} sig`, {
      apiKey: API_KEY,
      apiSecret: API_SECRET,
    })
    expect(message).not.toContain(API_KEY)
    expect(message).toContain('***')
  })
})

// ── Signed requests: Binance ─────────────────────────────────────────────

describe('binance through the spec hooks', () => {
  it('routes a paper order at the testnet and signs the body', async () => {
    const stub = stubFetch({ routes: [['/order', BINANCE_ORDER_ACK]] })
    try {
      const plugin = await track(
        await build(
          binanceCcxtVenue,
          binanceMarketConnectorManifest,
          BINANCE_MARKET,
          { mode: 'paper' },
        ),
      )
      const result = await place(plugin, {
        side: 'buy',
        type: 'market',
        size: '0.001',
        clientOrderId: 'plens-1',
      })

      expect(result).toEqual({ success: true, orderId: '28' })
      const request = stub.captured.at(-1)
      expect(request?.url).toContain(
        'https://testnet.binance.vision/api/v3/order',
      )
      expect(request?.headers.get('X-MBX-APIKEY')).toBe(API_KEY)
      // clientOrderId reaches Binance's own idempotency field.
      expect(request?.body).toContain('newClientOrderId=plens-1')

      const [payload, signature] = (request?.body ?? '').split('&signature=')
      expect(await hmacSignHex(API_SECRET, payload ?? '')).toBe(signature)
      // The signature is derived from the secret; the secret itself is not sent.
      expect(request?.body).not.toContain(API_SECRET)
    } finally {
      stub.restore()
    }
  })

  it('routes a live US order at binance.us', async () => {
    const stub = stubFetch({ routes: [['/order', BINANCE_ORDER_ACK]] })
    try {
      const plugin = await track(
        await build(
          binanceCcxtVenue,
          binanceMarketConnectorManifest,
          BINANCE_MARKET,
          { mode: 'live', country: 'US' },
        ),
      )
      await place(
        plugin,
        { side: 'sell', type: 'limit', size: '0.001', price: '70000' },
        'US',
      )
      expect(stub.captured.at(-1)?.url).toContain('https://api.binance.us/')
    } finally {
      stub.restore()
    }
  })

  it('swaps quantity for quoteOrderQty under tgtCcy quote_ccy', async () => {
    const stub = stubFetch({ routes: [['/order', BINANCE_ORDER_ACK]] })
    try {
      const plugin = await track(
        await build(
          binanceCcxtVenue,
          binanceMarketConnectorManifest,
          BINANCE_MARKET,
          { mode: 'live' },
        ),
      )
      await place(plugin, {
        side: 'buy',
        type: 'market',
        size: '25',
        tgtCcy: 'quote_ccy',
      })
      const body = stub.captured.at(-1)?.body ?? ''
      expect(body).toContain('quoteOrderQty=25')
      expect(body).not.toContain('quantity=')
    } finally {
      stub.restore()
    }
  })

  it('maps a stop-loss limit trigger onto STOP_LOSS_LIMIT + stopPrice', async () => {
    const stub = stubFetch({ routes: [['/order', BINANCE_ORDER_ACK]] })
    try {
      const plugin = await track(
        await build(
          binanceCcxtVenue,
          binanceMarketConnectorManifest,
          BINANCE_MARKET,
          { mode: 'live' },
        ),
      )
      await place(plugin, {
        side: 'sell',
        type: 'limit',
        size: '0.001',
        price: '60000',
        trigger: { triggerPrice: '61000', triggerType: 'sl' },
      })
      const body = stub.captured.at(-1)?.body ?? ''
      expect(body).toContain('type=STOP_LOSS_LIMIT')
      expect(body).toContain('stopPrice=61000')
      expect(body).toContain('price=60000')
    } finally {
      stub.restore()
    }
  })

  it('refuses a market trigger without reaching the wire', async () => {
    const stub = stubFetch({ routes: [['/order', BINANCE_ORDER_ACK]] })
    try {
      const plugin = await track(
        await build(
          binanceCcxtVenue,
          binanceMarketConnectorManifest,
          BINANCE_MARKET,
          { mode: 'live' },
        ),
      )
      const result = await place(plugin, {
        side: 'sell',
        type: 'market',
        size: '0.001',
        trigger: { triggerPrice: '61000', triggerType: 'sl' },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('limit price')
      expect(stub.captured.some((c) => c.url.includes('/order'))).toBe(false)
    } finally {
      stub.restore()
    }
  })

  it('returns {success:false} on a venue rejection, and never logs the secret', async () => {
    const stub = stubFetch({
      routes: [
        [
          '/order',
          // A body that names the credential, so redaction is what is measured
          // rather than the absence of an opportunity to leak.
          {
            code: -2010,
            msg: `Account has insufficient balance ${API_SECRET}`,
          },
          400,
        ],
      ],
    })
    const warnings = captureWarnings()
    try {
      const plugin = await track(
        await build(
          binanceCcxtVenue,
          binanceMarketConnectorManifest,
          BINANCE_MARKET,
          { mode: 'live' },
        ),
      )
      const result = await place(plugin, {
        side: 'buy',
        type: 'market',
        size: '0.001',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.error).not.toContain(API_SECRET)
      expect(warnings.lines.length).toBeGreaterThan(0)
      for (const line of warnings.lines) {
        expect(line).not.toContain(API_SECRET)
        expect(line).not.toContain(API_KEY)
        expect(line).not.toContain(PASSPHRASE)
      }
    } finally {
      warnings.restore()
      stub.restore()
    }
  })

  it('returns {success:false} when the transport throws', async () => {
    const stub = stubFetch({ throwOn: '/order' })
    const warnings = captureWarnings()
    try {
      const plugin = await track(
        await build(
          binanceCcxtVenue,
          binanceMarketConnectorManifest,
          BINANCE_MARKET,
          { mode: 'live' },
        ),
      )
      const result = await place(plugin, {
        side: 'buy',
        type: 'market',
        size: '0.001',
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    } finally {
      warnings.restore()
      stub.restore()
    }
  })

  it("answers 'list' with conformant open and history arrays", async () => {
    const openOrder = {
      symbol: 'BTCUSDT',
      orderId: 91,
      clientOrderId: 'x1',
      price: '60000.00',
      origQty: '0.00100000',
      executedQty: '0.00000000',
      status: 'NEW',
      type: 'LIMIT',
      side: 'BUY',
      time: 1_700_000_000_000,
      updateTime: 1_700_000_000_000,
    }
    const stub = stubFetch({
      routes: [
        ['/openOrders', [openOrder]],
        ['/allOrders', [{ ...openOrder, orderId: 92, status: 'FILLED' }]],
        ['/order', BINANCE_ORDER_ACK],
      ],
    })
    try {
      const plugin = await track(
        await build(
          binanceCcxtVenue,
          binanceMarketConnectorManifest,
          BINANCE_MARKET,
          { mode: 'live' },
        ),
      )
      // Binance's closed-order list is `'emulated'` over fetchOrders and needs a
      // symbol. `placeOrder` keeping `slot.currentPair` current (parity item 65)
      // is what supplies one.
      await place(plugin, { side: 'buy', type: 'market', size: '0.001' })

      const listed = (await plugin.execute({
        capability: 'trading:orders' as never,
        params: { action: 'list', pair: 'BTC-USDT' },
        context: context(),
      })) as { open: Array<never>; history: Array<never> }

      expect(listed.history.length).toBeGreaterThan(0)
      for (const order of [...listed.open, ...listed.history]) {
        assertOrderConformant(order)
      }
      // The trigger pass is deduplicated by order id — a venue that ignores the
      // flag answers with the regular book again, and two copies of one order
      // in the order pane is indistinguishable from two real orders.
      expect(listed.open.length).toBe(1)
      expect(stub.captured.some((c) => c.url.includes('allOrders'))).toBe(true)
    } finally {
      stub.restore()
    }
  })

  it('returns conformant balances with zero rows dropped', async () => {
    const stub = stubFetch({
      routes: [
        [
          '/account',
          {
            balances: [
              { asset: 'BTC', free: '0.50000000', locked: '0.10000000' },
              { asset: 'ETH', free: '0.00000000', locked: '0.00000000' },
            ],
          },
        ],
      ],
    })
    try {
      const plugin = await track(
        await build(
          binanceCcxtVenue,
          binanceMarketConnectorManifest,
          BINANCE_MARKET,
          { mode: 'live' },
        ),
      )
      const balances = (await plugin.execute({
        capability: 'trading:balances' as never,
        params: {},
        context: context(),
      })) as Array<never>

      expect(balances.length).toBe(1)
      for (const balance of balances) assertBalanceConformant(balance)
    } finally {
      stub.restore()
    }
  })
})

// ── Signed requests: OKX ─────────────────────────────────────────────────

describe('okx through the spec hooks', () => {
  const ACK = { code: '0', msg: '', data: [{ ordId: '77', sCode: '0' }] }

  it('adds x-simulated-trading in paper and omits it live', async () => {
    const stub = stubFetch({ routes: [['/api/v5/', ACK]] })
    try {
      const paper = await track(
        await build(okxCcxtVenue, okxMarketConnectorManifest, OKX_MARKET, {
          mode: 'paper',
        }),
      )
      await place(paper, { side: 'buy', type: 'market', size: '0.001' })
      expect(stub.captured.at(-1)?.headers.get('x-simulated-trading')).toBe('1')

      const live = await track(
        await build(okxCcxtVenue, okxMarketConnectorManifest, OKX_MARKET, {
          credentialId: 'cred-2',
          mode: 'live',
        }),
      )
      await place(live, {
        credentialId: 'cred-2',
        side: 'buy',
        type: 'market',
        size: '0.001',
      })
      expect(
        stub.captured.at(-1)?.headers.get('x-simulated-trading'),
      ).toBeNull()
    } finally {
      stub.restore()
    }
  })

  it('keeps orders on the regional host', async () => {
    const stub = stubFetch({ routes: [['/api/v5/', ACK]] })
    try {
      const plugin = await track(
        await build(okxCcxtVenue, okxMarketConnectorManifest, OKX_MARKET, {
          mode: 'live',
          country: 'US',
        }),
      )
      await place(plugin, { side: 'buy', type: 'market', size: '0.001' }, 'US')
      expect(stub.captured.at(-1)?.url).toContain('https://us.okx.com/')
    } finally {
      stub.restore()
    }
  })

  it('cancels a trigger order through the algo endpoint', async () => {
    const stub = stubFetch({ routes: [['/api/v5/', ACK]] })
    try {
      const plugin = await track(
        await build(okxCcxtVenue, okxMarketConnectorManifest, OKX_MARKET, {
          mode: 'live',
        }),
      )
      const result = (await plugin.execute({
        capability: 'trading:orders' as never,
        params: {
          action: 'cancel',
          orderId: '888',
          pair: 'BTC-USDT',
          trigger: true,
        },
        context: context(),
      })) as { success: boolean }

      expect(result.success).toBe(true)
      expect(stub.captured.at(-1)?.url).toContain('cancel-algos')
    } finally {
      stub.restore()
    }
  })
})

// ── Shell-level refusals ─────────────────────────────────────────────────

describe('refusals', () => {
  it("reports 'No credentials configured' rather than throwing", async () => {
    const plugin = await track(
      createCcxtConnectorPlugin(
        binanceCcxtVenue,
        binanceMarketConnectorManifest,
        { marketsStorage: warmMarkets(BINANCE_MARKET) },
      ),
    )
    const result = await place(plugin, { side: 'buy', size: '0.001' })
    expect(result).toEqual({
      success: false,
      error: 'No credentials configured',
    })
  })

  it("reports an unknown credential id rather than using another slot's", async () => {
    const plugin = await track(
      await build(
        binanceCcxtVenue,
        binanceMarketConnectorManifest,
        BINANCE_MARKET,
        { mode: 'live' },
      ),
    )
    const result = await place(plugin, {
      credentialId: 'nope',
      side: 'buy',
      size: '0.001',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain("Unknown credential 'nope'")
  })
})
