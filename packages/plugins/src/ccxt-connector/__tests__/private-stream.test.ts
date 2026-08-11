// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Lifecycle suite for the authenticated stream.
 *
 * The native private clients get this coverage from `describePrivateWsLifecycle`,
 * which injects a fake socket into `ReconnectingWsSession`. A ccxt Pro client
 * owns its socket, so that seam does not exist — the injectable surface is the
 * exchange class itself, and the venue config's `loadExchangeClass` is where it
 * goes in. Everything below runs against a fake whose `watchOrders` and
 * `watchBalance` promises are settled by hand, with millisecond-scale backoff
 * knobs so nothing is asserted by stopwatch.
 */

import { describe, expect, it } from 'bun:test'
import { sleep, waitFor } from '../../test-utils/async'
import {
  assertBalanceConformant,
  assertOrderConformant,
} from '../../test-utils/conformance'
import { createCcxtConnectorPlugin } from '../index'
import { CcxtPrivateStream } from '../private-stream'
import { createCexConnectorManifest } from '../../cex-connector'
import type { CcxtExchangeCtor, CcxtVenueConfig } from '../types'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
} from '@pairlens/market-engine/types'

// ── Fakes ────────────────────────────────────────────────────────────────

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

class ClosedByUser extends Error {
  constructor() {
    super('fake closedByUser')
    this.name = 'ExchangeClosedByUser'
  }
}

const RAW_ORDER = {
  id: 'o-1',
  symbol: 'BTC/USDT',
  side: 'buy',
  type: 'limit',
  amount: 0.5,
  price: 60000,
  filled: 0.25,
  average: 59990,
  status: 'open',
  fee: { cost: 0.0001, currency: 'BTC' },
  timestamp: 1_700_000_000_000,
}

const RAW_BALANCE = {
  free: { BTC: 0.5, USDT: 250 },
  used: { BTC: 0.1, USDT: 0 },
  total: { BTC: 0.6, USDT: 250, DOGE: 0 },
  info: {},
}

type FakeConfig = Record<string, unknown>

/** Every instance the host builds, so a test can reach the current one. */
const built: Array<FakeExchange> = []

class FakeExchange {
  readonly id = 'fake'
  readonly has: Record<string, unknown> = {
    watchOrders: true,
    watchBalance: true,
  }
  readonly timeframes: Record<string, string> = {}
  readonly urls: Record<string, unknown> = { api: { rest: 'https://fake' } }
  readonly options: Record<string, unknown> = {}
  markets: Record<string, unknown> | undefined = { 'BTC/USDT': {} }
  readonly config: FakeConfig
  closed = 0
  orderCalls = 0
  balanceCalls = 0
  fetchBalanceCalls = 0
  createOrderCalls: Array<Array<unknown>> = []
  /** When set, the matching watch rejects immediately instead of parking. */
  rejectOrders = false

  private pending: Array<Deferred<never>> = []
  private orderQueue: Array<Deferred<Array<Record<string, unknown>>>> = []
  private balanceQueue: Array<Deferred<Record<string, unknown>>> = []

  constructor(config: FakeConfig) {
    this.config = config
    built.push(this)
    if (FakeExchange.overrides) Object.assign(this.has, FakeExchange.overrides)
  }

  /** `has` patch applied to every instance built during a test. */
  static overrides: Record<string, unknown> | null = null

  watchOrders = () => {
    this.orderCalls++
    if (this.rejectOrders) return Promise.reject(new Error('auth rejected'))
    const entry = deferred<Array<Record<string, unknown>>>()
    this.orderQueue.push(entry)
    this.pending.push(entry as unknown as Deferred<never>)
    return entry.promise
  }

  watchBalance = () => {
    this.balanceCalls++
    const entry = deferred<Record<string, unknown>>()
    this.balanceQueue.push(entry)
    this.pending.push(entry as unknown as Deferred<never>)
    return entry.promise
  }

  fetchBalance = async () => {
    this.fetchBalanceCalls++
    return RAW_BALANCE
  }

  fetchOpenOrders = async () => [RAW_ORDER]

  createOrder = async (...args: Array<unknown>) => {
    this.createOrderCalls.push(args)
    return { id: 'created-1' }
  }

  pushOrders(rows: Array<Record<string, unknown>>): boolean {
    const entry = this.orderQueue.shift()
    if (!entry) return false
    entry.resolve(rows)
    return true
  }

  pushBalance(raw: Record<string, unknown>): boolean {
    const entry = this.balanceQueue.shift()
    if (!entry) return false
    entry.resolve(raw)
    return true
  }

  // Read-path members the structural type requires.
  watchOHLCV = async () => []
  watchTicker = async () => ({})
  watchOrderBook = async () => ({ bids: [], asks: [] })
  watchTrades = async () => []
  fetchOHLCV = async () => []
  fetchTickers = async () => ({})
  setMarkets = (markets: Array<unknown>) => {
    this.markets = { 'BTC/USDT': markets[0] ?? {} }
    return this.markets
  }
  loadMarkets = async () => this.markets
  market = () => ({})
  close = async () => {
    this.closed++
    const parked = this.pending
    this.pending = []
    this.orderQueue = []
    this.balanceQueue = []
    for (const entry of parked) entry.reject(new ClosedByUser())
  }
}

function fakeVenue(overrides: Partial<CcxtVenueConfig> = {}): CcxtVenueConfig {
  return {
    exchangeId: 'fake',
    marketId: 'fake',
    displayName: 'Fakex',
    credentialKeys: [
      { key: 'apiKey', required: true },
      { key: 'apiSecret', required: true },
    ],
    defaultMode: 'live',
    loadExchangeClass: async () => FakeExchange as unknown as CcxtExchangeCtor,
    maxHistoryLimit: 100,
    ...overrides,
  }
}

const CREDENTIALS = { apiKey: 'KEY-abcdefgh', apiSecret: 'SECRET-abcdefgh' }

const FAST = {
  baseBackoffMs: 2,
  maxBackoffMs: 20,
  stableResetMs: 20,
  random: () => 1,
  wakeSource: null,
  livenessTimeoutMs: 0,
} as const

function makeStream(
  overrides: Partial<ConstructorParameters<typeof CcxtPrivateStream>[0]> = {},
): CcxtPrivateStream {
  return new CcxtPrivateStream({
    venue: fakeVenue(),
    ensureMarkets: async () => {},
    ...FAST,
    ...overrides,
  })
}

function reset(): void {
  built.length = 0
  FakeExchange.overrides = null
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('CcxtPrivateStream', () => {
  it('delivers one NormalizedOrderUpdate per order event', async () => {
    reset()
    const orders: Array<NormalizedOrderUpdate> = []
    const stream = makeStream()
    stream.connect(
      CREDENTIALS,
      '',
      false,
      (update) => orders.push(update as NormalizedOrderUpdate),
      () => {},
    )

    await waitFor(() => built.length > 0 && built[0].orderCalls > 0)
    expect(built[0].pushOrders([RAW_ORDER, { ...RAW_ORDER, id: 'o-2' }])).toBe(
      true,
    )
    await waitFor(() => orders.length === 2)

    for (const order of orders) assertOrderConformant(order)
    expect(orders[0].orderId).toBe('o-1')
    expect(orders[0].status).toBe('partially_filled')
    stream.destroy()
  })

  it('never signs a public instance — credentials land only on this one', async () => {
    reset()
    const stream = makeStream()
    stream.connect(
      CREDENTIALS,
      '',
      false,
      () => {},
      () => {},
    )
    await waitFor(() => built.length > 0)
    expect(built[0].config['apiKey']).toBe(CREDENTIALS.apiKey)
    expect(built[0].config['secret']).toBe(CREDENTIALS.apiSecret)
    stream.destroy()
  })

  it('delivers balances as normalized rows with zero totals dropped', async () => {
    reset()
    const seen: Array<Array<NormalizedBalance>> = []
    const stream = makeStream()
    stream.connect(
      CREDENTIALS,
      '',
      false,
      () => {},
      (balances) => seen.push(balances as Array<NormalizedBalance>),
    )

    await waitFor(() => built.length > 0 && built[0].balanceCalls > 0)
    built[0].pushBalance(RAW_BALANCE)
    await waitFor(() => seen.length > 0)

    const rows = seen[0]
    for (const row of rows) assertBalanceConformant(row)
    expect(rows.map((r) => r.currency)).toEqual(['BTC', 'USDT'])
    stream.destroy()
  })

  it('REST-polls balances where ccxt has no watchBalance (Coinbase)', async () => {
    reset()
    FakeExchange.overrides = { watchBalance: false }
    const seen: Array<Array<NormalizedBalance>> = []
    const stream = makeStream({ pollIntervalMs: 5 })
    stream.connect(
      CREDENTIALS,
      '',
      false,
      () => {},
      (balances) => seen.push(balances as Array<NormalizedBalance>),
    )

    await waitFor(() => seen.length >= 2)
    expect(built[0].fetchBalanceCalls).toBeGreaterThanOrEqual(2)
    expect(built[0].balanceCalls).toBe(0)
    for (const row of seen[0]) assertBalanceConformant(row)
    stream.destroy()
  })

  it('backs off on a rejected watchOrders instead of hot-looping', async () => {
    reset()
    const stream = makeStream()
    stream.connect(
      CREDENTIALS,
      '',
      false,
      () => {},
      () => {},
    )

    await waitFor(() => built.length > 0)
    built[0].rejectOrders = true
    await waitFor(() => built[0].orderCalls > 1)
    const start = built[0].orderCalls
    await sleep(40)
    // Equal-jitter backoff from base 2 ms capped at 20 ms fits a handful of
    // attempts in 40 ms; an unpaced loop would fit thousands.
    expect(built[0].orderCalls - start).toBeLessThan(12)
    stream.destroy()
  })

  it('re-enters immediately after a close we asked for', async () => {
    reset()
    const stream = makeStream()
    stream.connect(
      CREDENTIALS,
      '',
      false,
      () => {},
      () => {},
    )

    await waitFor(() => built.length > 0 && built[0].orderCalls > 0)
    // A liveness/wake restart discards the instance; the loop must rebuild
    // rather than sit in a backoff it did not earn.
    await built[0].close()
    await waitFor(() => built.length > 1 && built[1].orderCalls > 0)
    stream.destroy()
  })

  it('reconnects on a wake event', async () => {
    reset()
    let listener: (() => void) | null = null
    const stream = makeStream({
      wakeSource: {
        subscribe: (fn: () => void) => {
          listener = fn
          return () => {
            listener = null
          }
        },
      } as never,
    })
    stream.connect(
      CREDENTIALS,
      '',
      false,
      () => {},
      () => {},
    )

    await waitFor(() => built.length > 0 && built[0].orderCalls > 0)
    expect(listener).not.toBeNull()
    listener!()

    await waitFor(() => built[0].closed > 0)
    await waitFor(() => built.length > 1)
    stream.destroy()
  })

  it('closes the exchange and stops both loops on destroy', async () => {
    reset()
    const orders: Array<unknown> = []
    const stream = makeStream()
    stream.connect(
      CREDENTIALS,
      '',
      false,
      (u) => orders.push(u),
      () => {},
    )

    await waitFor(() => built.length > 0 && built[0].orderCalls > 0)
    const exchange = built[0]
    stream.destroy()

    await waitFor(() => exchange.closed > 0)
    const callsAfterDestroy = exchange.orderCalls
    await sleep(30)
    expect(exchange.orderCalls).toBe(callsAfterDestroy)
    expect(built.length).toBe(1)
    expect(orders.length).toBe(0)
  })

  it('ignores a repeat connect rather than orphaning a second pair of loops', async () => {
    reset()
    const stream = makeStream()
    stream.connect(
      CREDENTIALS,
      '',
      false,
      () => {},
      () => {},
    )
    await waitFor(() => built.length > 0)
    stream.connect(
      CREDENTIALS,
      '',
      false,
      () => {},
      () => {},
    )
    await sleep(20)
    expect(built.length).toBe(1)
    stream.destroy()
  })

  it('refuses to connect without credentials', () => {
    reset()
    const scopes: Array<string> = []
    const stream = makeStream({ onError: (scope) => scopes.push(scope) })
    stream.connect(
      { apiKey: '', apiSecret: '' },
      '',
      false,
      () => {},
      () => {},
    )
    expect(built.length).toBe(0)
    expect(scopes).toContain('connect')
    stream.destroy()
  })
})

// ── Through the shell ────────────────────────────────────────────────────

const FAKE_MANIFEST = createCexConnectorManifest({
  id: 'fake-market-connector',
  name: 'Fakex Market Connector',
  displayName: 'Fakex',
  marketId: 'fake',
  icon: 'https://example.invalid/icon.png',
  gradient: 'from-zinc-800 to-zinc-900',
  abbr: 'FK',
})

describe('the shell wraps balances in the {type:"balance"} envelope', () => {
  it('delivers the envelope to a trading:balances subscriber', async () => {
    reset()
    const plugin = createCcxtConnectorPlugin(fakeVenue(), FAKE_MANIFEST, {
      marketsStorage: {
        get: async () => null,
        set: async () => {},
      },
      privateStream: { ...FAST },
    })
    await plugin.initialize?.({
      credentialId: 'cred-1',
      ...CREDENTIALS,
      mode: 'live',
      country: '',
    })

    const envelopes: Array<unknown> = []
    const context = {
      pair: 'BTC-USDT',
      market: 'fake',
      timeframe: '1h',
      mode: 'live' as const,
      country: '',
    }
    const releaseBalances = plugin.subscribe!(
      {
        capability: 'trading:balances' as never,
        params: { credentialId: 'cred-1' },
        context,
      },
      (data) => envelopes.push(data),
    )
    const releaseOrders = plugin.subscribe!(
      {
        capability: 'trading:orders' as never,
        params: { credentialId: 'cred-1' },
        context,
      },
      () => {},
    )

    await waitFor(() => built.length > 0 && built[0].balanceCalls > 0)
    built[0].pushBalance(RAW_BALANCE)
    await waitFor(() => envelopes.length > 0)

    const envelope = envelopes[0] as {
      type: string
      balances: Array<NormalizedBalance>
    }
    expect(envelope.type).toBe('balance')
    for (const row of envelope.balances) assertBalanceConformant(row)

    releaseOrders()
    releaseBalances()
    await plugin.destroy?.()
  })
})

// ── Paper safety ─────────────────────────────────────────────────────────

describe('paper mode on a venue with no sandbox', () => {
  const context = {
    pair: 'BTC-USDT',
    market: 'fake',
    timeframe: '1h',
    mode: 'paper' as const,
    country: '',
  }

  async function placeOn(venue: CcxtVenueConfig) {
    const plugin = createCcxtConnectorPlugin(venue, FAKE_MANIFEST, {
      marketsStorage: { get: async () => null, set: async () => {} },
      privateStream: { ...FAST },
    })
    await plugin.initialize?.({
      credentialId: 'cred-1',
      ...CREDENTIALS,
      mode: 'paper',
      country: '',
    })
    const result = (await plugin.execute({
      capability: 'trading:orders' as never,
      params: {
        action: 'place',
        pair: 'BTC-USDT',
        side: 'buy',
        type: 'market',
        size: '0.001',
      },
      context,
    })) as { success: boolean; orderId?: string; error?: string }
    await plugin.destroy?.()
    return result
  }

  it('refuses rather than routing the order at the live matching engine', async () => {
    reset()
    const result = await placeOn(fakeVenue())
    expect(result.success).toBe(false)
    expect(result.error).toContain('no paper trading environment')
    expect(built[0]?.createOrderCalls.length ?? 0).toBe(0)
  })

  it('accepts the order as a dry run where the venue has one (Kraken validate)', async () => {
    reset()
    const result = await placeOn(
      fakeVenue({ paperOrderParams: { validate: true } }),
    )
    expect(result).toEqual({ success: true, orderId: 'created-1' })
    const params = built[0].createOrderCalls[0][5] as Record<string, unknown>
    expect(params['validate']).toBe(true)
  })
})
