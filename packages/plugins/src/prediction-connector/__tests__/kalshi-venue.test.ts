// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kalshi's venue surface, pinned.
 *
 * The manifest is a contract with the terminal — the venue picker, the
 * credential wizard and the chart's timeframe control all read it, and none of
 * them fails loudly when a field drifts. So the shape is asserted rather than
 * assumed: the capability set and its market scoping, the three timeframes the
 * venue actually serves, the desktop gate, and the limit-only flag the ticket
 * reads before it offers a market order that would be rejected on submit.
 */

import { describe, expect, it } from 'bun:test'
import {
  KALSHI_NO_SUFFIX,
  KALSHI_TIMEFRAMES,
  createKalshiMarketConnectorPlugin,
  kalshiMarketConnectorManifest,
  kalshiPredictionVenue,
  normalizeKalshiPem,
} from '../venues/kalshi'
import { buildPredictionOrderCall } from '../orders'
import { fetchPredictionEvents } from '../events'
import { OutcomeKeyMap, sanitizeOutcomeKey } from '../outcome-keys'
import { OutcomeResolver } from '../outcomes'
import { fakeExchange, memoryStorage } from './fake-exchange'
import type { PredictionSlot } from '../types'

const manifest = kalshiMarketConnectorManifest

describe('kalshi manifest', () => {
  it('keeps the plugin id and market id the credential binding depends on', () => {
    expect(manifest.id).toBe('kalshi-market-connector')
    expect(kalshiPredictionVenue.marketId).toBe('kalshi')
  })

  it('declares exactly the prediction capability set, scoped to kalshi', () => {
    const ids = manifest.capabilities.map((c): string => c.id).sort()
    expect(ids).toEqual(
      [
        'market-data:candles',
        'market-data:discovery:search',
        'market-data:events',
        'market-data:history',
        'market-data:orderbook',
        'market-data:ticker',
        'market-data:trades',
        'trading:balances',
        'trading:orders',
        'trading:positions',
      ].sort(),
    )
    for (const capability of manifest.capabilities) {
      expect(capability.markets, capability.id).toEqual(['kalshi'])
      expect(capability.priority, capability.id).toBe(1)
    }
  })

  it('marks trading:orders as side-effecting so it is never re-routed', () => {
    const orders = manifest.capabilities.find((c) => c.id === 'trading:orders')
    expect(orders?.sideEffect).toBe(true)
    const balances = manifest.capabilities.find(
      (c) => c.id === 'trading:balances',
    )
    expect(balances?.sideEffect).toBeUndefined()
  })

  it('publishes the prediction asset class and family', () => {
    expect(manifest.metadata?.['assetClass']).toBe('prediction')
    expect(manifest.metadata?.['family']).toBe('predictions')
  })

  it('publishes only the three timeframes the venue serves', () => {
    // period_interval accepts 1, 60 and 1440 minutes; anything else 400s.
    expect(manifest.metadata?.['timeframes']).toEqual(['1m', '1h', '1d'])
    expect(kalshiPredictionVenue.timeframes).toEqual([...KALSHI_TIMEFRAMES])
  })

  it('declares requiresDesktop and limitOnly', () => {
    // The REST hosts 403 any foreign Origin, and every order is a limit order.
    expect(manifest.metadata?.['requiresDesktop']).toBe(true)
    expect(manifest.metadata?.['limitOnly']).toBe(true)
  })

  it('stamps marketOrders so the ticket can read it off the manifest', () => {
    expect(manifest.metadata?.['marketOrders']).toBe('none')
    expect(kalshiPredictionVenue.marketOrders).toBe('none')
  })
})

describe('kalshi credentials', () => {
  it('requires both the key id and the PEM', () => {
    expect(kalshiPredictionVenue.credentialKeys).toEqual([
      { key: 'apiKey', required: true },
      { key: 'apiSecret', required: true },
    ])
  })

  it('maps the PEM onto ccxt privateKey, never onto secret', () => {
    const mapped = kalshiPredictionVenue.toCcxtCredentials({
      apiKey: 'key-uuid',
      apiSecret: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    })
    expect(mapped?.apiKey).toBe('key-uuid')
    expect(mapped?.privateKey).toContain('BEGIN PRIVATE KEY')
    expect(mapped?.secret).toBeUndefined()
  })

  it('refuses to build credentials when either field is missing', () => {
    expect(
      kalshiPredictionVenue.toCcxtCredentials({ apiKey: 'k', apiSecret: '' }),
    ).toBeNull()
    expect(
      kalshiPredictionVenue.toCcxtCredentials({ apiKey: '', apiSecret: 'p' }),
    ).toBeNull()
  })

  it('un-escapes a PEM pasted with literal backslash-n', () => {
    const escaped =
      '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----'
    expect(normalizeKalshiPem(escaped)).toBe(
      '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    )
  })

  it('leaves a PEM with real newlines alone', () => {
    const real = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'
    expect(normalizeKalshiPem(real)).toBe(real)
  })
})

describe('kalshi pair keys', () => {
  const resolver = new OutcomeResolver(
    kalshiPredictionVenue,
    new OutcomeKeyMap('kalshi', memoryStorage()),
  )

  it('passes a raw ticker straight through', () => {
    // Both forms are id-form outcome symbols ccxt resolves on demand, so a
    // Kalshi key needs no persisted map and can never go stale.
    expect(resolver.peek('KXBTCD-26AUG15-T53')).toBe('KXBTCD-26AUG15-T53')
  })

  it('passes the NO sibling straight through', () => {
    expect(resolver.peek('KXBTCD-26AUG15-T53-NO')).toBe('KXBTCD-26AUG15-T53-NO')
  })

  it('round-trips through the sanitizer unchanged', () => {
    const ticker = 'KXBTCD-26AUG15-T53'
    expect(sanitizeOutcomeKey(sanitizeOutcomeKey(ticker))).toBe(ticker)
  })

  it('uppercases a lowercased link', () => {
    expect(resolver.peek('kxbtcd-26aug15-t53')).toBe('KXBTCD-26AUG15-T53')
  })

  it('keys a listing row on the raw ticker, not the unified handle', () => {
    // Regression: a listing row carries BOTH forms, and registering the handle
    // produced 'KXNHSALES-26AUG25-US-NEW-HOME-SALES-JULY-2026-ABOVE-560-000-YES'
    // — no longer a handle (the `_` and `:` are gone) and not a ticker either,
    // so every row out of the events browser charted nothing.
    expect(
      resolver.register({
        outcome:
          'KXNHSALES_26AUG25_US_NEW_HOME_SALES_JULY_2026_ABOVE_560_000:YES',
        outcomeId: 'KXNHSALES-26AUG25-T560000',
      }),
    ).toBe('KXNHSALES-26AUG25-T560000')
  })

  it('keys the NO sibling on the ticker plus the suffix', () => {
    expect(
      resolver.register({
        outcome:
          'KXNHSALES_26AUG25_US_NEW_HOME_SALES_JULY_2026_ABOVE_560_000:NO',
        outcomeId: `KXNHSALES-26AUG25-T560000${KALSHI_NO_SUFFIX}`,
      }),
    ).toBe('KXNHSALES-26AUG25-T560000-NO')
  })

  it('falls back to the handle only when a row carries no id', () => {
    expect(resolver.register({ outcome: 'A_B:YES' })).toBe('A-B-YES')
  })
})

describe('kalshi market titles', () => {
  async function titlesOf(
    markets: Array<Record<string, unknown>>,
  ): Promise<Array<string>> {
    const exchange = fakeExchange({
      fetchEvents: async () => [{ id: 'e1', title: 'An event', markets }],
    })
    const response = await fetchPredictionEvents(
      exchange,
      {
        venue: kalshiPredictionVenue,
        resolver: new OutcomeResolver(
          kalshiPredictionVenue,
          new OutcomeKeyMap('kalshi', memoryStorage()),
        ),
      },
      { query: 'anything' },
    )
    return (response.events[0]?.markets ?? []).map((m) => m.title)
  }

  it('reads the question out of the venue payload', () => {
    // ccxt sets no unified `title` on a prediction market row on this venue
    // either; without the payload read the fallback was the bare ticker.
    return expect(
      titlesOf([
        {
          id: 'KXNHSALES-26AUG25-T560000',
          market: 'x',
          outcomes: [],
          info: {
            title: 'Will US new home sales for July 2026 be above 560,000?',
            yes_sub_title: 'Above 560,000',
          },
        },
      ]),
    ).resolves.toEqual([
      'Will US new home sales for July 2026 be above 560,000?',
    ])
  })

  it('appends the strike when scalar siblings share a question', async () => {
    // Measured on KXBARRELS: every market under "U.S. oil production per day"
    // carries the same title, and only the sub-title separates them. Two rows
    // with identical names and different prices is the hex-hash defect wearing
    // a disguise.
    const titles = await titlesOf([
      {
        id: 'KXBARRELS-26-T13.75',
        market: 'a',
        outcomes: [],
        info: {
          title: 'How many oil barrels per day will the US produce this year?',
          yes_sub_title: 'At least 13.75M bpd',
        },
      },
      {
        id: 'KXBARRELS-26-T13.80',
        market: 'b',
        outcomes: [],
        info: {
          title: 'How many oil barrels per day will the US produce this year?',
          yes_sub_title: 'At least 13.80M bpd',
        },
      },
    ])
    expect(titles[0]).toBe(
      'How many oil barrels per day will the US produce this year? · At least 13.75M bpd',
    )
    expect(new Set(titles).size).toBe(2)
  })

  it('does not repeat a strike the question already states', async () => {
    const titles = await titlesOf([
      {
        id: 'KXNHSALES-26AUG25-T560000',
        market: 'x',
        outcomes: [],
        info: {
          title: 'Will US new home sales for July 2026 be above 560,000?',
          yes_sub_title: 'Above 560,000',
        },
      },
    ])
    expect(titles[0]).not.toContain('·')
  })
})

describe('kalshi order mapping', () => {
  const venue = kalshiPredictionVenue

  it('builds a limit order in contracts at a probability price', () => {
    const call = buildPredictionOrderCall(
      {
        market: 'kalshi',
        pair: 'KXBTCD-26AUG15-T53',
        side: 'buy',
        type: 'limit',
        size: '25',
        price: '0.53',
        mode: 'live',
      },
      venue,
    )
    expect(call).toEqual({
      kind: 'order',
      type: 'limit',
      side: 'buy',
      amount: 25,
      price: 0.53,
    })
  })

  it('refuses a market order with a sentence naming what to do instead', () => {
    const call = buildPredictionOrderCall(
      {
        market: 'kalshi',
        pair: 'KXBTCD-26AUG15-T53',
        side: 'buy',
        type: 'market',
        size: '25',
        mode: 'live',
      },
      venue,
    )
    expect(call.kind).toBe('reject')
    expect(call.kind === 'reject' && call.error).toContain('limit-only')
  })

  it('refuses a limit price outside the probability range', () => {
    for (const price of ['0', '1', '53', '-0.2']) {
      const call = buildPredictionOrderCall(
        {
          market: 'kalshi',
          pair: 'KXBTCD-26AUG15-T53',
          side: 'buy',
          type: 'limit',
          size: '25',
          price,
          mode: 'live',
        },
        venue,
      )
      expect(call.kind, `price ${price}`).toBe('reject')
    }
  })

  it('refuses a trigger order the venue has no id space for', () => {
    const call = buildPredictionOrderCall(
      {
        market: 'kalshi',
        pair: 'KXBTCD-26AUG15-T53',
        side: 'buy',
        type: 'limit',
        size: '25',
        price: '0.53',
        trigger: { triggerPrice: '0.6', triggerType: 'tp' },
        mode: 'live',
      },
      venue,
    )
    expect(call.kind).toBe('reject')
  })

  it('refuses a non-positive contract count', () => {
    for (const size of ['0', '-3', 'abc']) {
      const call = buildPredictionOrderCall(
        {
          market: 'kalshi',
          pair: 'KXBTCD-26AUG15-T53',
          side: 'buy',
          type: 'limit',
          size,
          price: '0.53',
          mode: 'live',
        },
        venue,
      )
      expect(call.kind, `size ${size}`).toBe('reject')
    }
  })
})

describe('kalshi geo posture', () => {
  it('gates no market-data capability', () => {
    // Kalshi's data is open; only the venue's own eligibility rules apply.
    expect(kalshiPredictionVenue.geoCheck).toBeUndefined()
  })

  it('allows every region at trade time', () => {
    // US-regulated but internationally onboarded — a blanket non-US refusal
    // would lock out accounts the venue itself accepts.
    for (const country of ['US', 'DE', 'GB', 'SG', '']) {
      const slot = { country } as PredictionSlot
      expect(() => kalshiPredictionVenue.tradeGeoCheck?.(slot)).not.toThrow()
    }
  })
})

describe('kalshi timeframe gate', () => {
  it('refuses an unsupported timeframe before any request is made', async () => {
    const plugin = createKalshiMarketConnectorPlugin(manifest)
    try {
      // ccxt's fetchOHLCV throws BadRequest naming the raw interval, which
      // reaches the chart as an unexplained failure; this refuses first.
      await expect(
        plugin.execute({
          capability: 'market-data:history',
          params: { pair: 'KXBTCD-26AUG15-T53', timeframe: '15m' },
          context: {
            pair: 'KXBTCD-26AUG15-T53',
            market: 'kalshi',
            timeframe: '15m',
            mode: 'paper',
            country: 'US',
          },
        }),
      ).rejects.toThrow('1m, 1h, 1d')
    } finally {
      await plugin.destroy?.()
    }
  })
})
