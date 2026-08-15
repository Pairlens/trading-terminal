// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two seams the futures runtime adds to shared streaming code, both of
 * which exist because a perp pair carries a settlement leg the spot mappers
 * cannot express.
 *
 * PUBLIC: the hub converts a pair to a ccxt symbol at exactly one place — when
 * a subscription key is created — and every channel reads the result from
 * there. Getting it wrong subscribes the chart, the book and the tape to a
 * symbol the venue cannot resolve.
 *
 * PRIVATE: the authenticated stream maps an order update's unified symbol back
 * to a pair key. Getting THAT wrong is worse than a dead chart — the fill lands
 * in the spot pair's slot in the terminal's pair-keyed position ledger.
 *
 * Both defaults have to stay the spot mapping, because fourteen spot venues
 * share the same two files.
 */

import { describe, expect, it } from 'bun:test'
import { waitFor } from '../../test-utils/async'
import { CcxtStreamHub } from '../../ccxt-connector/watch-driver'
import { createCcxtFuturesConnectorPlugin } from '../index'
import { createCexFuturesConnectorManifest } from '../manifest'
import { toFuturesSymbol } from '../futures-symbols'
import { binanceFuturesCcxtVenue } from '../venues/binance-futures'
import type { ExchangeHostLike } from '../../ccxt-connector/watch-driver'
import type {
  CcxtExchangeCtor,
  CcxtExchangeLike,
} from '../../ccxt-connector/types'
import type { CcxtFuturesVenueConfig } from '../futures-types'
import type { NormalizedOrderUpdate } from '@pairlens/market-engine/types'

/** An exchange that records the symbol it was asked for and never resolves. */
function recordingExchange(calls: Array<string>): CcxtExchangeLike {
  const park = <T>(label: string): Promise<T> => {
    calls.push(label)
    return new Promise<T>(() => {})
  }
  return {
    id: 'fake',
    has: {},
    timeframes: {},
    urls: {},
    options: {},
    markets: { 'BTC/USDT:USDT': {}, 'BTC/USDT': {} },
    setMarkets: () => undefined,
    loadMarkets: async () => undefined,
    market: () => ({}),
    watchOHLCV: (symbol: string) => park(`ohlcv:${symbol}`),
    watchTicker: (symbol: string) => park(`ticker:${symbol}`),
    watchOrderBook: (symbol: string) => park(`book:${symbol}`),
    watchTrades: (symbol: string) => park(`trades:${symbol}`),
    fetchOHLCV: async () => [],
    fetchTickers: async () => ({}),
    close: async () => undefined,
  } as unknown as CcxtExchangeLike
}

function hostFor(exchange: CcxtExchangeLike): ExchangeHostLike {
  return {
    generation: 0,
    peek: () => exchange,
    setCountry: () => false,
    acquire: async () => ({ exchange, generation: 0 }),
    close: async () => undefined,
    destroy: async () => undefined,
  }
}

async function symbolsFor(
  toSymbol: ((pair: string) => string) | undefined,
): Promise<Array<string>> {
  const calls: Array<string> = []
  const exchange = recordingExchange(calls)
  const hub = new CcxtStreamHub({
    // The venue's own seeds and backfill would add REST calls this test has no
    // opinion about; only the subscribe path is under test.
    venue: {
      ...binanceFuturesCcxtVenue,
      seedOrderBook: false,
      seedTrades: false,
    },
    host: hostFor(exchange),
    wakeSource: null,
    livenessTimeoutMs: 0,
    ...(toSymbol ? { toSymbol } : {}),
  })
  try {
    hub.acquire(
      { channel: 'candles', pair: 'BTC-USDT-USDT', timeframe: '1h' },
      '',
      () => {},
    )
    hub.acquire({ channel: 'orderbook', pair: 'BTC-USDT-USDT' }, '', () => {})
    hub.acquire({ channel: 'trades', pair: 'BTC-USDT-USDT' }, '', () => {})
    await new Promise((resolve) => setTimeout(resolve, 5))
    return calls
  } finally {
    await hub.destroy()
  }
}

describe('CcxtStreamHub toSymbol seam', () => {
  it('subscribes every channel to the perp symbol when the futures mapper is supplied', async () => {
    const calls = await symbolsFor(toFuturesSymbol)
    expect(calls).toContain('ohlcv:BTC/USDT:USDT')
    expect(calls).toContain('book:BTC/USDT:USDT')
    expect(calls).toContain('trades:BTC/USDT:USDT')
  })

  it('still defaults to the spot mapper, which every spot venue depends on', async () => {
    const calls = await symbolsFor(undefined)
    // The spot mapper's single-dash replace on a three-segment key.
    expect(calls).toContain('ohlcv:BTC/USDT-USDT')
  })
})

// ── Private stream ───────────────────────────────────────────────────────

const PERP_ORDER = {
  id: 'o-1',
  symbol: 'BTC/USDT:USDT',
  side: 'buy',
  type: 'limit',
  amount: 3,
  price: 60000,
  filled: 0,
  status: 'open',
  timestamp: 1_700_000_000_000,
}

/** Minimal authed exchange: one `watchOrders` answer, then it parks. */
class FakePrivateExchange {
  readonly id = 'fake-perp'
  readonly has: Record<string, unknown> = { watchOrders: true }
  readonly timeframes: Record<string, string> = {}
  readonly urls: Record<string, unknown> = { api: { rest: 'https://fake' } }
  readonly options: Record<string, unknown> = {}
  markets: Record<string, unknown> | undefined = { 'BTC/USDT:USDT': {} }
  private delivered = false

  watchOrders = () => {
    if (this.delivered) return new Promise<never>(() => {})
    this.delivered = true
    return Promise.resolve([PERP_ORDER])
  }

  // Read-path members the structural type requires.
  watchOHLCV = async () => []
  watchTicker = async () => ({})
  watchOrderBook = async () => ({ bids: [], asks: [] })
  watchTrades = async () => []
  fetchOHLCV = async () => []
  fetchTickers = async () => ({})
  fetchBalance = async () => ({ total: {}, free: {}, used: {} })
  setMarkets = () => this.markets
  loadMarkets = async () => this.markets
  market = () => ({})
  close = async () => undefined
}

const FAKE_PERP_VENUE: CcxtFuturesVenueConfig = {
  exchangeId: 'fake-perp',
  marketId: 'fake-perp',
  displayName: 'Fake Perp',
  credentialKeys: [
    { key: 'apiKey', required: true },
    { key: 'apiSecret', required: true },
  ],
  defaultMode: 'live',
  maxLeverage: 20,
  maxHistoryLimit: 100,
  loadExchangeClass: async () =>
    FakePrivateExchange as unknown as CcxtExchangeCtor,
}

describe('futures private stream', () => {
  it('reports a WS fill on the three-segment key, not the spot one', async () => {
    const manifest = createCexFuturesConnectorManifest({
      id: 'fake-perp-market-connector',
      name: 'Fake Perp',
      displayName: 'Fake Perp',
      marketId: 'fake-perp',
      icon: '',
      gradient: '',
      abbr: 'FP',
      timeframes: ['1h'],
      maxLeverage: 20,
    })
    const plugin = createCcxtFuturesConnectorPlugin(FAKE_PERP_VENUE, manifest)
    await plugin.initialize?.({
      credentialId: 'c1',
      apiKey: 'key',
      apiSecret: 'secret-abcdefgh',
    })

    const updates: Array<NormalizedOrderUpdate> = []
    const release = plugin.subscribe?.(
      {
        capability: 'trading:orders',
        params: { credentialId: 'c1' },
        context: { country: '', pair: 'BTC-USDT-USDT', timeframe: '1h' },
      } as never,
      (update) => updates.push(update as NormalizedOrderUpdate),
    )

    try {
      await waitFor(() => updates.length > 0)
      // The spot default would have reported 'BTC-USDT', which is a REAL pair
      // on the same account's spot venue.
      expect(updates[0].pair).toBe('BTC-USDT-USDT')
    } finally {
      release?.()
      await plugin.destroy?.()
    }
  })
})
