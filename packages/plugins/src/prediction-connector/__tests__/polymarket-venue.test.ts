// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Polymarket's venue surface, pinned — and with it the mapped pair-key
 * contract, which is the one piece of prediction addressing that can go wrong
 * silently.
 *
 * A Kalshi key is a passthrough and either resolves or does not. A Polymarket
 * key is a lossy sanitization of ccxt's handle, remembered against the CLOB
 * token id, so the failure mode is a key that looks right and resolves to the
 * wrong outcome — an order on the opposite side of the same question. These
 * tests exist to make that impossible to ship quietly.
 */

import { describe, expect, it } from 'bun:test'
import {
  GeoRestrictedError,
  isGeoRestrictedError,
} from '@pairlens/market-engine/errors'
import {
  POLYMARKET_TIMEFRAMES,
  polymarketMarketConnectorManifest,
  polymarketPredictionVenue,
  polymarketTradeGeoCheck,
} from '../venues/polymarket'
import { buildPredictionOrderCall } from '../orders'
import { OutcomeKeyMap, sanitizeOutcomeKey } from '../outcome-keys'
import { OutcomeResolver, outcomeSearchQueries } from '../outcomes'
import { fetchPredictionEvents } from '../events'
import { fakeEvent, fakeExchange, memoryStorage } from './fake-exchange'
import type { PredictionSlot } from '../types'

const manifest = polymarketMarketConnectorManifest

function resolver(): OutcomeResolver {
  return new OutcomeResolver(
    polymarketPredictionVenue,
    new OutcomeKeyMap('polymarket', memoryStorage()),
  )
}

describe('polymarket manifest', () => {
  it('keeps the plugin id and market id the credential binding depends on', () => {
    expect(manifest.id).toBe('polymarket-market-connector')
    expect(polymarketPredictionVenue.marketId).toBe('polymarket')
  })

  it('declares the prediction capability set, scoped to polymarket', () => {
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
      expect(capability.markets, capability.id).toEqual(['polymarket'])
    }
  })

  it('publishes the prediction asset class and family', () => {
    expect(manifest.metadata?.['assetClass']).toBe('prediction')
    expect(manifest.metadata?.['family']).toBe('predictions')
  })

  it('omits 6h, which the shared Timeframe union does not carry', () => {
    // ccxt publishes 1m/5m/1h/6h/1d; widening the app-wide union for one venue
    // would ripple through every chart control, so 6h waits.
    expect(manifest.metadata?.['timeframes']).toEqual(['1m', '5m', '1h', '1d'])
    expect(polymarketPredictionVenue.timeframes).toEqual([
      ...POLYMARKET_TIMEFRAMES,
    ])
  })

  it('is browser-capable and not limit-only', () => {
    // gamma, clob and data all answer access-control-allow-origin: *.
    expect(manifest.metadata?.['requiresDesktop']).toBeUndefined()
    expect(manifest.metadata?.['limitOnly']).toBeUndefined()
  })

  it('stamps marketOrders so the ticket can read it off the manifest', () => {
    expect(manifest.metadata?.['marketOrders']).toBe('native')
    expect(polymarketPredictionVenue.marketOrders).toBe('native')
  })

  it('names the wallet chain so the connect flow routes to the wallet wizard', () => {
    expect(manifest.metadata?.['walletChain']).toBe('ethereum')
  })
})

describe('polymarket credentials', () => {
  it('is wallet-backed, with no key-pair form to fill in', () => {
    expect(polymarketPredictionVenue.walletCredentials).toBe(true)
    expect(polymarketPredictionVenue.credentialKeys).toEqual([])
  })

  it('maps a resolved wallet key onto privateKey plus the funder address', () => {
    const mapped = polymarketPredictionVenue.toCcxtCredentials({
      privateKey: '0xabc',
      walletAddress: '0xdef',
    })
    expect(mapped).toEqual({ privateKey: '0xabc', walletAddress: '0xdef' })
  })

  it('refuses an address with no key — orders are EIP-712 signed', () => {
    expect(
      polymarketPredictionVenue.toCcxtCredentials({ walletAddress: '0xdef' }),
    ).toBeNull()
  })

  it('is live only — the CTF contracts ccxt signs are mainnet Polygon', () => {
    expect(polymarketPredictionVenue.defaultMode).toBe('live')
  })
})

describe('polymarket pair keys', () => {
  it('sanitizes a ccxt handle into a route-safe key', () => {
    expect(sanitizeOutcomeKey('fed-decision-jan_cut-25bps:YES')).toBe(
      'FED-DECISION-JAN-CUT-25BPS-YES',
    )
  })

  it('is idempotent, so a key normalized twice is unchanged', () => {
    const once = sanitizeOutcomeKey('a_b:c')
    expect(sanitizeOutcomeKey(once)).toBe(once)
  })

  it('resolves a registered key back to the CLOB token id', () => {
    const r = resolver()
    const key = r.register({
      outcome: 'FED_DECISION_JAN_CUT_25BPS:YES',
      outcomeId: '7112233445566778899',
    })
    expect(key).toBe('FED-DECISION-JAN-CUT-25BPS-YES')
    // The token id, not the handle: it is the one-request resolution path.
    expect(r.peek(key)).toBe('7112233445566778899')
  })

  it('falls back to the handle when the listing carried no token id', () => {
    const r = resolver()
    const key = r.register({ outcome: 'FED_DECISION:NO' })
    expect(r.peek(key)).toBe('FED_DECISION:NO')
  })

  it('keeps YES and NO on the same question distinct', () => {
    const r = resolver()
    const yes = r.register({ outcome: 'FED_CUT:YES', outcomeId: '111' })
    const no = r.register({ outcome: 'FED_CUT:NO', outcomeId: '222' })
    expect(yes).not.toBe(no)
    expect(r.peek(yes)).toBe('111')
    expect(r.peek(no)).toBe('222')
  })

  it('returns null for a key it has never seen', () => {
    expect(resolver().peek('NEVER-SEEN-YES')).toBeNull()
  })

  it('survives a reload through the persisted map', async () => {
    const storage = memoryStorage()
    const first = new OutcomeKeyMap('polymarket', storage)
    const key = first.register('FED_CUT:YES', '111')
    // Registration marks the map dirty and queues one write for the end of the
    // task; a bulk caller flushes explicitly, and this is the backstop for a
    // caller that does not.
    await Promise.resolve()
    const reloaded = new OutcomeKeyMap('polymarket', storage)
    expect(reloaded.resolve(key)).toBe('111')
  })

  it('persists immediately when a caller flushes', () => {
    const storage = memoryStorage()
    const first = new OutcomeKeyMap('polymarket', storage)
    const key = first.register('FED_CUT:YES', '111')
    first.flush()
    expect(new OutcomeKeyMap('polymarket', storage).resolve(key)).toBe('111')
  })

  it('runs on an in-memory copy when storage is unavailable', () => {
    const map = new OutcomeKeyMap('polymarket', null)
    const key = map.register('FED_CUT:YES', '111')
    expect(map.resolve(key)).toBe('111')
  })
})

describe('polymarket cold-miss recovery', () => {
  it('resolves a key it has never seen through the venue search', async () => {
    const r = resolver()
    let searched: Record<string, unknown> | undefined
    const exchange = fakeExchange({
      fetchEvents: async (params) => {
        searched = params
        return [
          fakeEvent({
            id: 'fed-decision-jan',
            title: 'Fed decision, January',
            marketId: '0xcond',
            marketTitle: 'Will the Fed cut 25bps?',
            outcomes: [
              { outcome: 'FED_CUT_25BPS:YES', outcomeId: '111', label: 'Yes' },
              { outcome: 'FED_CUT_25BPS:NO', outcomeId: '222', label: 'No' },
            ],
          }),
        ]
      },
    })

    const resolved = await r.resolve(exchange, 'FED-CUT-25BPS-YES')
    expect(resolved).toBe('111')
    // Shortest prefix FIRST: the venue's search matches event titles, so the
    // full handle-derived query is the one least likely to hit. Measured on
    // gamma 2026-08-15 — twelve words returned nothing for every key tried,
    // two words resolved all six.
    expect(searched?.['query']).toBe('fed cut')
  })

  it('walks up to longer prefixes when the shortest one misses', async () => {
    const r = resolver()
    const tried: Array<string> = []
    const exchange = fakeExchange({
      fetchEvents: async (params) => {
        const query = String(params?.['query'] ?? '')
        tried.push(query)
        // Only the three-word prefix names this event.
        if (query !== 'fed cut 25bps') return []
        return [
          fakeEvent({
            id: 'fed',
            title: 'Fed',
            marketId: '0xc',
            marketTitle: 'Will the Fed cut 25bps?',
            outcomes: [
              { outcome: 'FED_CUT_25BPS:YES', outcomeId: '111', label: 'Yes' },
            ],
          }),
        ]
      },
    })
    expect(await r.resolve(exchange, 'FED-CUT-25BPS-YES')).toBe('111')
    expect(tried).toEqual(['fed cut', 'fed cut 25bps'])
  })

  it('drops purely numeric slug tokens from the recovery query', () => {
    // Strikes, years and slug disambiguators are venue artifacts a title
    // search does not index; the result is re-checked against the exact key,
    // so a broader query only adds recall.
    expect(outcomeSearchQueries('BTC-ABOVE-2026-53000-YES')).toContain(
      'btc above yes',
    )
  })

  it('fails with a sentence the user can act on when nothing matches', async () => {
    const r = resolver()
    const exchange = fakeExchange({ fetchEvents: async () => [] })
    await expect(r.resolve(exchange, 'GONE-YES')).rejects.toThrow(
      'events browser',
    )
  })

  it('derives no query from a bare token id', () => {
    expect(outcomeSearchQueries('7112233445566778899')).toEqual([])
  })
})

describe('polymarket events projection', () => {
  it('maps the venue hierarchy onto the events contract and feeds the key map', async () => {
    const r = resolver()
    const exchange = fakeExchange({
      fetchEvents: async () => [
        fakeEvent({
          id: 'fed-decision-jan',
          title: 'Fed decision, January',
          marketId: '0xcond',
          marketTitle: 'Will the Fed cut 25bps?',
          end: 1_800_000_000_000,
          outcomes: [
            { outcome: 'FED_CUT_25BPS:YES', outcomeId: '111', label: 'Yes' },
            { outcome: 'FED_CUT_25BPS:NO', outcomeId: '222', label: 'No' },
          ],
        }),
      ],
    })

    // A query is a scope selector, so this exercises the fetchEvents path.
    const response = await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: r },
      { query: 'fed' },
    )

    expect(response.market).toBe('polymarket')
    expect(response.events.length).toBe(1)
    const event = response.events[0]
    expect(event?.title).toBe('Fed decision, January')
    const market = event?.markets[0]
    expect(market?.status).toBe('open')
    expect(market?.endMs).toBe(1_800_000_000_000)
    expect(market?.outcomes.map((o) => o.pairKey)).toEqual([
      'FED-CUT-25BPS-YES',
      'FED-CUT-25BPS-NO',
    ])
    // Browsing IS how a mapped venue learns the keys its chart is later asked
    // for, so the projection must have registered both.
    expect(r.peek('FED-CUT-25BPS-YES')).toBe('111')
    expect(r.peek('FED-CUT-25BPS-NO')).toBe('222')
  })

  it('carries the gamma listing instant onto the market summary', async () => {
    // The wiring test for `marketCreatedMs`: ccxt sets `created: undefined` on
    // every prediction market, so the projection has to read the venue payload.
    // Without this the board's New sort silently ranks nothing.
    const exchange = fakeExchange({
      fetchEvents: async () => [
        {
          id: 'e1',
          event: 'e1',
          title: 'An event',
          markets: [
            {
              id: '0xcond',
              market: 'x',
              outcomes: [],
              info: {
                createdAt: '2026-08-13T12:30:06Z',
                startDate: '2026-08-14T00:00:00Z',
              },
            },
          ],
        },
      ],
    })

    const response = await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: resolver() },
      { query: 'anything' },
    )

    expect(response.events[0]?.markets[0]?.createdMs).toBe(
      Date.parse('2026-08-13T12:30:06Z'),
    )
  })

  it('browses the venue listing, NOT fetchEvents, when the query is empty', async () => {
    // Regression: `fetchEvents({status, sort, limit})` throws
    // ArgumentsRequired, because polymarket declares no `eventScopeParams` and
    // none of those three is a scope selector. An unsearched Events pane died
    // on it. The browse must go to the venue's own trending listing instead.
    const r = resolver()
    let listParams: Record<string, unknown> | undefined
    let fetchEventsCalls = 0
    const exchange = fakeExchange({
      fetchEvents: async () => {
        fetchEventsCalls++
        throw new Error(
          'polymarket fetchEvents() requires at least one of query, queries, tags, eventId, slug to scope the search',
        )
      },
      fetchRawEventsList: async (params) => {
        listParams = params
        return [{ raw: true }]
      },
      parseEventToMarkets: () => [{ market: 'FED_CUT:YES' }],
      parseEvent: () =>
        fakeEvent({
          id: 'fed-cut',
          title: 'Fed decision',
          marketId: '0xcond',
          marketTitle: 'Will the Fed cut?',
          outcomes: [
            { outcome: 'FED_CUT:YES', outcomeId: '111', label: 'Yes' },
          ],
        }),
      populateOutcomes: () => {},
    })

    const response = await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: r },
      {},
    )

    expect(fetchEventsCalls).toBe(0)
    expect(response.events.length).toBe(1)
    expect(response.events[0]?.title).toBe('Fed decision')
    // Volume-ordered active events: the venue's own front-page ranking.
    expect(listParams?.['sort']).toBe('volume')
    expect(listParams?.['status']).toBe('active')
    expect(listParams?.['limit']).toBe(40)
  })

  it('registers browsed markets so ccxt resolves them without a round trip', async () => {
    const registered: Record<string, unknown> = {}
    const r = resolver()
    const exchange = fakeExchange({
      fetchRawEventsList: async () => [{ raw: true }],
      parseEventToMarkets: () => [{ market: 'FED_CUT:YES', id: '0xcond' }],
      parseEvent: () =>
        fakeEvent({
          id: 'fed-cut',
          title: 'Fed decision',
          marketId: '0xcond',
          marketTitle: 'Will the Fed cut?',
          outcomes: [
            { outcome: 'FED_CUT:YES', outcomeId: '111', label: 'Yes' },
          ],
        }),
      populateOutcomes: () => {},
      markets: registered,
    })
    await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: r },
      {},
    )
    expect(registered['FED_CUT:YES']).toBeDefined()
  })

  it('refuses clearly when the venue publishes no browsable listing', async () => {
    const exchange = fakeExchange({ fetchRawEventsList: undefined })
    await expect(
      fetchPredictionEvents(
        exchange,
        { venue: polymarketPredictionVenue, resolver: resolver() },
        {},
      ),
    ).rejects.toThrow('browsable event listing')
  })

  it('scopes by category when one is given', async () => {
    const r = resolver()
    let scope: Record<string, unknown> | undefined
    const exchange = fakeExchange({
      fetchEvents: async (params) => {
        scope = params
        return []
      },
    })
    await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: r },
      { category: 'Politics' },
    )
    // A category IS a scope selector (`tags`), so this path keeps fetchEvents.
    expect(scope?.['tags']).toEqual(['Politics'])
    expect(scope?.['sort']).toBeUndefined()
  })
})

describe('polymarket market titles', () => {
  async function titleOf(
    market: Record<string, unknown>,
  ): Promise<string | undefined> {
    const exchange = fakeExchange({
      fetchEvents: async () => [
        { id: 'e1', title: 'An event', markets: [market] },
      ],
    })
    const response = await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: resolver() },
      { query: 'anything' },
    )
    return response.events[0]?.markets[0]?.title
  }

  const HASH =
    '0x895e01dbf3e6a33cd9a44ca0f8cdb5df1bd2b0b6ebed5300d28f8da7145145e4'

  it('reads the question out of the venue payload', async () => {
    // Regression: ccxt's prediction market row has NO unified `title`, so the
    // fallback was the id — a 66-char condition hash that, on a categorical
    // event, was the only thing telling two candidates apart.
    expect(
      await titleOf({
        id: HASH,
        market: 'x',
        outcomes: [],
        info: {
          question: 'Will Donald Trump win the 2028 Republican nomination?',
          groupItemTitle: 'Donald Trump',
        },
      }),
    ).toBe('Will Donald Trump win the 2028 Republican nomination?')
  })

  it('prefers the question over the short group label', async () => {
    // 'Donald Trump' is meaningless in a pair-picker row or a watchlist; the
    // question reads correctly everywhere.
    const title = await titleOf({
      id: HASH,
      market: 'x',
      outcomes: [],
      info: { question: 'Will X happen?', groupItemTitle: 'X' },
    })
    expect(title).not.toBe('X')
  })

  it('falls back to the group label when there is no question', async () => {
    expect(
      await titleOf({
        id: HASH,
        market: 'x',
        outcomes: [],
        info: { groupItemTitle: 'October 31, 2025' },
      }),
    ).toBe('October 31, 2025')
  })

  it('uses the condition hash only as a last resort', async () => {
    expect(
      await titleOf({ id: HASH, market: 'x', outcomes: [], info: {} }),
    ).toBe(HASH)
  })

  it('reads endMs from expiry, which is where ccxt puts it', async () => {
    // The unified `end` is never populated on a prediction market row.
    const exchange = fakeExchange({
      fetchEvents: async () => [
        {
          id: 'e1',
          title: 'An event',
          markets: [
            {
              id: HASH,
              market: 'x',
              outcomes: [],
              expiry: 1_857_168_000_000,
              info: { question: 'Q?', volume: '26728066.9' },
            },
          ],
        },
      ],
    })
    const response = await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: resolver() },
      { query: 'anything' },
    )
    const market = response.events[0]?.markets[0]
    expect(market?.endMs).toBe(1_857_168_000_000)
    // Volume likewise lives on the venue payload, not the unified row.
    expect(market?.volume).toBeCloseTo(26_728_066.9, 1)
  })
})

describe('polymarket order mapping', () => {
  const venue = polymarketPredictionVenue

  it('builds a native market order on both sides', () => {
    for (const side of ['buy', 'sell'] as const) {
      const call = buildPredictionOrderCall(
        {
          market: 'polymarket',
          pair: 'FED-CUT-25BPS-YES',
          side,
          type: 'market',
          size: '40',
          mode: 'live',
        },
        venue,
      )
      expect(call.kind, side).toBe('order')
      expect(call.kind === 'order' && call.type).toBe('market')
    }
  })

  it('builds a limit order at a probability price', () => {
    const call = buildPredictionOrderCall(
      {
        market: 'polymarket',
        pair: 'FED-CUT-25BPS-YES',
        side: 'buy',
        type: 'limit',
        size: '40',
        price: '0.62',
        mode: 'live',
      },
      venue,
    )
    expect(call).toEqual({
      kind: 'order',
      type: 'limit',
      side: 'buy',
      amount: 40,
      price: 0.62,
    })
  })
})

describe('polymarket geo posture', () => {
  it('leaves market data open worldwide', () => {
    expect(polymarketPredictionVenue.geoCheck).toBeUndefined()
  })

  it('refuses US order placement with the typed error the dialog reads', () => {
    let thrown: unknown
    try {
      polymarketTradeGeoCheck({ country: 'US' } as PredictionSlot)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(GeoRestrictedError)
    // The cross-bundle sentinel, not instanceof, is what the region dialog
    // actually branches on.
    expect(isGeoRestrictedError(thrown)).toBe(true)
    expect((thrown as Error).message).toContain('Polymarket')
  })

  it('is case-insensitive about the country code', () => {
    expect(() =>
      polymarketTradeGeoCheck({ country: 'us' } as PredictionSlot),
    ).toThrow()
  })

  it('allows every other region', () => {
    for (const country of ['DE', 'GB', 'SG', 'BR', '']) {
      expect(() =>
        polymarketTradeGeoCheck({ country } as PredictionSlot),
      ).not.toThrow()
    }
  })
})

describe('bulk registration costs one write', () => {
  function countingStorage(): {
    storage: {
      getItem: (k: string) => string | null
      setItem: (k: string, v: string) => void
    }
    writes: () => number
  } {
    const map = new Map<string, string>()
    let writes = 0
    return {
      storage: {
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => {
          writes++
          map.set(k, v)
        },
      },
      writes: () => writes,
    }
  }

  it('persists once per browse, not once per key', async () => {
    // A browse registers several hundred outcomes. Persisting per key meant
    // several hundred JSON.stringify passes over a map of up to 4000 entries,
    // each followed by a synchronous setItem on the main thread.
    const { storage, writes } = countingStorage()
    const r = new OutcomeResolver(
      polymarketPredictionVenue,
      new OutcomeKeyMap('polymarket', storage),
    )
    const outcomes = Array.from({ length: 40 }, (_, i) => ({
      outcome: `EVENT_MARKET_${i}:YES`,
      outcomeId: String(i),
      label: 'Yes',
    }))
    const exchange = fakeExchange({
      fetchEvents: async () => [
        fakeEvent({
          id: 'e1',
          title: 'Big event',
          marketId: '0xc',
          marketTitle: 'A question?',
          outcomes,
        }),
      ],
    })

    await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: r },
      { query: 'big' },
    )

    expect(writes()).toBe(1)
    expect(r.peek('EVENT-MARKET-39-YES')).toBe('39')
  })

  it('registers each outcome once, not once per walk', async () => {
    // The projection needs the pair key anyway, so a separate pre-pass over
    // the same payload registered every outcome a second time for nothing.
    let registrations = 0
    const { storage } = countingStorage()
    const map = new OutcomeKeyMap('polymarket', storage)
    const counting = new Proxy(map, {
      get(target, prop, receiver) {
        if (prop === 'register') {
          return (...args: Array<unknown>) => {
            registrations++
            return (target.register as (...a: Array<unknown>) => string).apply(
              target,
              args,
            )
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
    const exchange = fakeExchange({
      fetchEvents: async () => [
        fakeEvent({
          id: 'e1',
          title: 'Big event',
          marketId: '0xc',
          marketTitle: 'A question?',
          outcomes: [
            { outcome: 'A:YES', outcomeId: '1', label: 'Yes' },
            { outcome: 'A:NO', outcomeId: '2', label: 'No' },
          ],
        }),
      ],
    })

    await fetchPredictionEvents(
      exchange,
      {
        venue: polymarketPredictionVenue,
        resolver: new OutcomeResolver(polymarketPredictionVenue, counting),
      },
      { query: 'big' },
    )
    expect(registrations).toBe(2)
  })
})
