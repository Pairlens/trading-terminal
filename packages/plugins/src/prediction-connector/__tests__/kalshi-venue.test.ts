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
  KALSHI_BROWSE_CATEGORIES,
  KALSHI_NO_SUFFIX,
  KALSHI_TIMEFRAMES,
  browseKalshiEvents,
  createKalshiMarketConnectorPlugin,
  interleavePages,
  kalshiMarketConnectorManifest,
  kalshiPredictionVenue,
  normalizeKalshiPem,
  searchEntryToRawEvent,
} from '../venues/kalshi'
import { buildPredictionOrderCall } from '../orders'
import { fetchPredictionEvents } from '../events'
import { OutcomeKeyMap, sanitizeOutcomeKey } from '../outcome-keys'
import { OutcomeResolver } from '../outcomes'
import { fakeExchange, memoryStorage } from './fake-exchange'
import { pinCliPlatform } from './platform-pin'
import type { PredictionSlot } from '../types'

pinCliPlatform()

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

  it('carries the open time onto the market summary as the listing instant', async () => {
    // The wiring test for `marketCreatedMs` on this venue: ccxt sets
    // `created: undefined` on every prediction market, so a New sort has
    // nothing to rank unless the projection reads `open_time` off the payload.
    const exchange = fakeExchange({
      fetchEvents: async () => [
        {
          id: 'e1',
          title: 'An event',
          markets: [
            {
              id: 'KXNHSALES-26AUG25-T560000',
              market: 'x',
              outcomes: [],
              info: {
                title: 'Will US new home sales be above 560,000?',
                open_time: '2026-08-17T17:34:53Z',
                // Kalshi zero-fills this one on a market it has not opened.
                created_time: '0001-01-01T00:00:00Z',
              },
            },
          ],
        },
      ],
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
    expect(response.events[0]?.markets[0]?.createdMs).toBe(
      Date.parse('2026-08-17T17:34:53Z'),
    )
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

// ── The cold open ────────────────────────────────────────────────────────
//
// The board used to open on one hardcoded category, which cost 60 requests and
// 26 seconds and put exactly one chip on the category rail. It opens on
// Kalshi's own ranked feed now, fanned across categories. Two things have to
// hold for that to be an improvement rather than a different bug: the merge
// must not let live sport crowd every thin category off the board, and the
// search feed's payload must translate into the raw event shape ccxt parses.
//
// The entry below is copied off `/v1/search/series?category=Economics` on
// 2026-08-20, trimmed to the fields the adapter reads.

const SEARCH_ENTRY = {
  type: 'contract',
  recent_volume: 403_538,
  series_ticker: 'KXFEDDECISION',
  event_ticker: 'KXFEDDECISION-26SEP',
  event_title: 'Fed decision in September?',
  event_subtitle: 'On Sep 16, 2026',
  category: 'Economics',
  total_volume: 11_214_720,
  markets: [
    {
      ticker: 'KXFEDDECISION-26SEP-H0',
      yes_subtitle: 'Fed maintains rate',
      no_subtitle: '',
      title: '',
      yes_bid_dollars: '0.7200',
      yes_ask_dollars: '0.7300',
      last_price_dollars: '0.7300',
      previous_price_dollars: '0.7100',
      volume: 8_913_021,
      close_ts: '2026-09-16T17:59:00Z',
      open_ts: '2025-09-29T14:00:00Z',
      expected_expiration_ts: '2026-09-16T18:05:00Z',
      result: '',
    },
  ],
}

function firstMarket(raw: Record<string, unknown>): Record<string, unknown> {
  const markets = raw['markets'] as Array<Record<string, unknown>>
  return markets[0] ?? {}
}

describe('kalshi search-entry adapter', () => {
  it('translates the feed payload into the raw event shape ccxt parses', () => {
    const raw = searchEntryToRawEvent(SEARCH_ENTRY)
    expect(raw['event_ticker']).toBe('KXFEDDECISION-26SEP')
    expect(raw['title']).toBe('Fed decision in September?')
    expect(raw['sub_title']).toBe('On Sep 16, 2026')
    expect(raw['category']).toBe('Economics')

    const market = firstMarket(raw)
    expect(market['ticker']).toBe('KXFEDDECISION-26SEP-H0')
    // The ticker is the pair key on a passthrough venue, so getting this wrong
    // is a browse whose every row charts nothing.
    expect(market['event_ticker']).toBe('KXFEDDECISION-26SEP')
    expect(market['yes_sub_title']).toBe('Fed maintains rate')
    expect(market['close_time']).toBe('2026-09-16T17:59:00Z')
    expect(market['open_time']).toBe('2025-09-29T14:00:00Z')
    expect(market['expiration_time']).toBe('2026-09-16T18:05:00Z')
    // Prices need no translation: the feed already uses the `*_dollars` names
    // `parseMarket` and `marketChange24h` read.
    expect(market['last_price_dollars']).toBe('0.7300')
    expect(market['previous_price_dollars']).toBe('0.7100')
  })

  it('synthesises a status, because the feed states only a result', () => {
    // Without one `parseEvent` reports every browsed event as inactive, and a
    // board of closed-looking events is worse than no board.
    const open = searchEntryToRawEvent(SEARCH_ENTRY)
    expect(firstMarket(open)['status']).toBe('active')

    const settled = searchEntryToRawEvent({
      ...SEARCH_ENTRY,
      markets: [{ ...SEARCH_ENTRY.markets[0], result: 'yes' }],
    })
    expect(firstMarket(settled)['status']).toBe('settled')
  })

  it('survives an entry with nothing in it', () => {
    const raw = searchEntryToRawEvent({})
    expect(raw['markets']).toEqual([])
    expect(raw['title']).toBe('')
  })
})

describe('kalshi cold-open merge', () => {
  const entry = (category: string, rank: number, volume: number) => ({
    event_ticker: `${category}-${rank}`,
    category,
    recent_volume: volume,
  })

  it('takes one from every category before a second from any', () => {
    // A live tennis match trades four million contracts a day and a Health
    // event trades a few hundred. Concatenating and sorting by volume would
    // put five sports rows on the board and no Health row at all, which is the
    // one-chip rail this replaced.
    const pages = [
      [
        entry('Sports', 1, 4_000_000),
        entry('Sports', 2, 3_000_000),
        entry('Sports', 3, 2_000_000),
      ],
      [entry('Health', 1, 300), entry('Health', 2, 200)],
      [entry('World', 1, 90)],
    ]
    const merged = interleavePages(pages, 4)
    expect(merged.map((e) => e['event_ticker'])).toEqual([
      'Sports-1',
      'Health-1',
      'World-1',
      'Sports-2',
    ])
  })

  it('orders each round by the venue own volume', () => {
    const pages = [[entry('Health', 1, 300)], [entry('Sports', 1, 4_000_000)]]
    expect(interleavePages(pages, 2).map((e) => e['category'])).toEqual([
      'Sports',
      'Health',
    ])
  })

  it('honours the limit and tolerates empty pages', () => {
    const pages = [[], [entry('World', 1, 5)], []]
    expect(interleavePages(pages, 10)).toHaveLength(1)
    expect(interleavePages([], 10)).toEqual([])
  })
})

describe('kalshi cold-open browse', () => {
  function searchExchange(
    reply: (params: Record<string, unknown>) => unknown,
  ): {
    exchange: ReturnType<typeof fakeExchange>
    calls: Array<Record<string, unknown>>
  } {
    const calls: Array<Record<string, unknown>> = []
    const exchange = fakeExchange({
      parseEvent: (event) => event,
    }) as ReturnType<typeof fakeExchange> & Record<string, unknown>
    exchange['electionsPublicGetSearchSeries'] = async (
      params: Record<string, unknown>,
    ) => {
      calls.push(params)
      return reply(params)
    }
    return { exchange, calls }
  }

  it('asks every category for its own busiest events', async () => {
    const { exchange, calls } = searchExchange(() => ({
      current_page: [SEARCH_ENTRY],
    }))

    const events = await browseKalshiEvents(exchange, 40)

    expect(calls).toHaveLength(KALSHI_BROWSE_CATEGORIES.length)
    expect(calls.map((c) => c['category']).sort()).toEqual(
      [...KALSHI_BROWSE_CATEGORIES].sort(),
    )
    // 40 events over sixteen categories is three each, floored at two.
    expect(calls[0]?.['page_size']).toBe(3)
    expect(events).toHaveLength(KALSHI_BROWSE_CATEGORIES.length)
  })

  it('never asks for fewer than two, so a thin category still reaches the rail', async () => {
    const { exchange, calls } = searchExchange(() => ({ current_page: [] }))
    await browseKalshiEvents(exchange, 1)
    expect(calls[0]?.['page_size']).toBe(2)
  })

  it('keeps the board when one category refuses', async () => {
    const { exchange } = searchExchange((params) => {
      if (params['category'] === 'Sports') throw new Error('502')
      return { current_page: [SEARCH_ENTRY] }
    })

    const events = await browseKalshiEvents(exchange, 40)

    expect(events).toHaveLength(KALSHI_BROWSE_CATEGORIES.length - 1)
  })

  it('reports the failure when nothing answered at all', async () => {
    // An empty board and a broken host look identical to a reader, so a browse
    // where every category refused has to say so rather than return nothing.
    const { exchange } = searchExchange(() => {
      throw new Error('elections host is down')
    })

    await expect(browseKalshiEvents(exchange, 40)).rejects.toThrow(
      'elections host is down',
    )
  })

  it('refuses clearly when the endpoint is not on the exchange', async () => {
    await expect(browseKalshiEvents(fakeExchange({}), 40)).rejects.toThrow(
      'browsable event listing',
    )
  })
})
