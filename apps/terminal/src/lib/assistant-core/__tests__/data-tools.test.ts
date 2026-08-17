// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The data tools against a build that HAS an App Server.
 *
 * What is pinned here, in order of how much it would cost to get wrong:
 *
 * The liquidation tool must never accept a wildcard answer. A plugin declaring
 * `markets: ['*']` for a per-venue collector is claiming coverage of every
 * venue, and if the tool took it the model would report a liquidation map for a
 * venue nobody watches. The test asserts both halves: the refusal, and that the
 * wildcard plugin was never asked.
 *
 * Nothing throws. Every failure path is asserted as a returned object, because
 * a throw inside `execute` ends the assistant's whole turn.
 *
 * Unavailability is distinguishable. `not_configured`, `rate_limited` and
 * `upstream_error` come back as themselves rather than as an empty array, which
 * a model would relay as "nothing is scheduled this week".
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { PlatformRestrictedError } from '@pairlens/market-engine/errors'
import { TOOL_OPTIONS, fakePlugin, stubDeps } from './data-tools-fakes'
import type {
  EarningsCalendarResponse,
  EconomicCalendarResponse,
  InsiderTransactionsResponse,
  IpoCalendarResponse,
  LiquidationBucket,
  NewListingsResponse,
} from '@pairlens/shared/instrument-types'

import type { ToolResult } from './data-tools-fakes'

// ── Mocks, registered before the module under test is imported ───────

const realApi = await import('@/lib/api')
const realAuth = await import('@/lib/auth-client')

type Thrower = () => never

const handlers: {
  economic: (days?: number) => unknown
  earnings: (params?: { days?: number; symbols?: Array<string> }) => unknown
  company: (symbol: string) => unknown
  ipo: (params?: { days?: number }) => unknown
  insider: (symbol: string) => unknown
  listings: (days?: number) => unknown
} = {
  economic: () => ({ entries: [], start: '', end: '', fetchedAt: '' }),
  earnings: () => ({ entries: [], start: '', end: '', fetchedAt: '' }),
  company: () => ({ fundamentals: null, nextEarnings: null, fetchedAt: '' }),
  ipo: () => ({ entries: [], fetchedAt: '' }),
  insider: () => ({ symbol: '', transactions: [], fetchedAt: '' }),
  listings: () => ({ entries: [], trackingSince: 0, fetchedAt: '' }),
}

/** What each api call was asked for, so passthrough can be asserted. */
const seen: { earnings?: unknown; listings?: unknown; economic?: unknown } = {}

void mock.module('@/lib/auth-client', () => ({
  ...realAuth,
  hasAppServer: true,
}))

void mock.module('@/lib/api', () => ({
  ...realApi,
  api: {
    ...realApi.api,
    getEconomicCalendar: async (days?: number) => {
      seen.economic = days
      return handlers.economic(days)
    },
    getEarningsCalendar: async (params?: {
      days?: number
      symbols?: Array<string>
    }) => {
      seen.earnings = params
      return handlers.earnings(params)
    },
    getCompanyOverview: async (symbol: string) => handlers.company(symbol),
    getIpoCalendar: async (params?: { days?: number }) => handlers.ipo(params),
    getInsiderTransactions: async (symbol: string) => handlers.insider(symbol),
    getNewListings: async (days?: number) => {
      seen.listings = days
      return handlers.listings(days)
    },
  },
}))

const { buildDataTools, DATA_TOOL_LABELS } = await import('../data-tools')

/** A fundamentals refusal exactly as the api layer raises it. */
function refusal(
  reason: 'not_configured' | 'rate_limited' | 'upstream_error',
): Thrower {
  return () => {
    throw new realApi.EquityFundamentalsUnavailableError(reason)
  }
}

async function run(
  toolName: string,
  args: Record<string, unknown>,
  options = {},
): Promise<ToolResult> {
  const { deps } = stubDeps(options)
  const tools = buildDataTools(deps)
  return (await tools[toolName].execute!(
    args as never,
    TOOL_OPTIONS,
  )) as ToolResult
}

beforeEach(() => {
  handlers.economic = () => ({
    entries: [],
    start: '',
    end: '',
    fetchedAt: '',
  })
  handlers.earnings = () => ({ entries: [], start: '', end: '', fetchedAt: '' })
  handlers.company = () => ({
    fundamentals: null,
    nextEarnings: null,
    fetchedAt: '',
  })
  handlers.ipo = () => ({ entries: [], fetchedAt: '' })
  handlers.insider = () => ({ symbol: '', transactions: [], fetchedAt: '' })
  handlers.listings = () => ({ entries: [], trackingSince: 0, fetchedAt: '' })
})

// ── The hosted calendars ─────────────────────────────────────────────

describe('get_economic_calendar', () => {
  test('answers with the window, the entries and a real release instant', async () => {
    const response: EconomicCalendarResponse = {
      entries: [
        {
          id: 'bls-cpi-2026-08-20',
          title: 'CPI',
          source: 'BLS',
          date: '2026-08-20',
          releaseMs: Date.UTC(2026, 7, 20, 12, 30),
          importance: 'high',
          country: 'US',
          consensus: '0.2%',
          prior: '0.3%',
        },
        {
          id: 'fed-minutes-2026-08-21',
          title: 'FOMC Minutes',
          source: 'Fed',
          date: '2026-08-21',
          // Day-level: the agency states no clock time.
          releaseMs: null,
          importance: 'medium',
          country: 'US',
        },
      ],
      start: '2026-08-17',
      end: '2026-08-31',
      fetchedAt: '2026-08-17T00:00:00.000Z',
    }
    handlers.economic = () => response

    const result = await run('get_economic_calendar', { days: 14 })

    expect(seen.economic).toBe(14)
    expect(result.start).toBe('2026-08-17')
    expect(result.total).toBe(2)
    expect(result.truncated).toBe(false)
    const entries = result.entries as Array<Record<string, unknown>>
    expect(entries[0].releaseAt).toBe('2026-08-20T12:30:00.000Z')
    expect(entries[0].consensus).toBe('0.2%')
    // A day-level entry must not grow a clock it never had.
    expect(entries[1].releaseAt).toBeNull()
  })

  test('caps the list and states what it capped from', async () => {
    handlers.economic = () => ({
      entries: Array.from({ length: 80 }, (_, i) => ({
        id: `e${i}`,
        title: `Release ${i}`,
        source: 'BLS',
        date: '2026-08-20',
        releaseMs: null,
        importance: 'low' as const,
        country: 'US',
      })),
      start: '2026-08-17',
      end: '2026-10-01',
      fetchedAt: '2026-08-17T00:00:00.000Z',
    })

    const result = await run('get_economic_calendar', {})

    expect((result.entries as Array<unknown>).length).toBe(50)
    expect(result.truncated).toBe(true)
    expect(result.total).toBe(80)
  })

  test('relays a throttled provider as throttled, not as an empty week', async () => {
    handlers.economic = refusal('rate_limited')
    const result = await run('get_economic_calendar', {})
    expect(result.unavailable).toBe('rate_limited')
    expect(result.entries).toBeUndefined()
    expect(String(result.hint)).toContain('few minutes')
  })

  test('relays a deployment with no provider as configuration', async () => {
    handlers.economic = refusal('not_configured')
    expect((await run('get_economic_calendar', {})).unavailable).toBe(
      'not_configured',
    )
  })

  test('maps an untyped failure to upstream_error rather than throwing', async () => {
    handlers.economic = () => {
      throw new Error('socket hang up')
    }
    const result = await run('get_economic_calendar', {})
    expect(result.unavailable).toBe('upstream_error')
  })
})

describe('get_earnings_calendar', () => {
  test('passes the window and symbols through, and never invents a bell slot', async () => {
    const response: EarningsCalendarResponse = {
      entries: [
        {
          symbol: 'NVDA',
          name: 'NVIDIA CORP',
          reportDate: '2026-08-27',
          fiscalDateEnding: '2026-07-31',
          epsEstimate: 1.24,
          currency: 'USD',
          reportTime: 'amc',
        },
        {
          symbol: 'AAPL',
          name: 'APPLE INC',
          reportDate: '2026-08-28',
          fiscalDateEnding: null,
          epsEstimate: null,
          currency: null,
        },
      ],
      start: '2026-08-17',
      end: '2026-08-31',
      fetchedAt: '2026-08-17T00:00:00.000Z',
    }
    handlers.earnings = () => response

    const result = await run('get_earnings_calendar', {
      days: 14,
      symbols: ['NVDA', 'AAPL'],
    })

    expect(seen.earnings).toEqual({ days: 14, symbols: ['NVDA', 'AAPL'] })
    const entries = result.entries as Array<Record<string, unknown>>
    expect(entries[0].reportTime).toBe('amc')
    // No source committed to a slot, so the tool says nothing rather than 'bmo'.
    expect(entries[1].reportTime).toBeNull()
  })
})

describe('get_company_fundamentals', () => {
  test('separates "no such company" from "no provider"', async () => {
    handlers.company = () => ({
      fundamentals: null,
      nextEarnings: null,
      fetchedAt: '2026-08-17T00:00:00.000Z',
    })
    const uncovered = await run('get_company_fundamentals', { symbol: 'btc' })
    expect(uncovered.covered).toBe(false)
    expect(uncovered.unavailable).toBeUndefined()

    handlers.company = refusal('not_configured')
    const unconfigured = await run('get_company_fundamentals', {
      symbol: 'NVDA',
    })
    expect(unconfigured.unavailable).toBe('not_configured')
  })

  test('refuses an empty ticker as returned data', async () => {
    const result = await run('get_company_fundamentals', { symbol: '   ' })
    expect(typeof result.error).toBe('string')
  })
})

describe('get_ipo_calendar', () => {
  test('returns the pipeline with its own totals', async () => {
    const response: IpoCalendarResponse = {
      entries: [
        {
          symbol: 'ACME',
          name: 'Acme Robotics',
          date: '2026-09-02',
          exchange: 'NASDAQ',
          priceRangeLow: 17,
          priceRangeHigh: 19,
          currency: 'USD',
        },
      ],
      fetchedAt: '2026-08-17T00:00:00.000Z',
    }
    handlers.ipo = () => response
    const result = await run('get_ipo_calendar', { days: 60 })
    expect(result.total).toBe(1)
    expect((result.entries as Array<Record<string, unknown>>)[0].symbol).toBe(
      'ACME',
    )
  })
})

describe('get_insider_activity', () => {
  const filings: InsiderTransactionsResponse = {
    symbol: 'NVDA',
    transactions: [
      {
        name: 'A Seller',
        title: 'Director',
        type: 'disposal',
        date: '2026-08-10',
        shares: 1000,
        sharePrice: 120,
        security: 'Common Stock',
      },
      {
        name: 'A Grantee',
        title: null,
        type: 'acquisition',
        date: '2026-06-01',
        shares: 500,
        // A grant has no price, so it has no dollar value either.
        sharePrice: null,
        security: 'Stock Option',
      },
    ],
    fetchedAt: '2026-08-17T00:00:00.000Z',
  }

  test('summarises every filing on file, then caps the rows', async () => {
    handlers.insider = () => filings
    const result = await run('get_insider_activity', {
      symbol: 'nvda',
      limit: 1,
    })

    // The summary covers both filings even though one row came back.
    expect(result.summary).toEqual({ buys: 1, sells: 1, spanDays: 71 })
    expect((result.transactions as Array<unknown>).length).toBe(1)
    expect(result.total).toBe(2)
    expect(result.truncated).toBe(true)
  })

  test('values a grant as unknown rather than as zero', async () => {
    handlers.insider = () => filings
    const result = await run('get_insider_activity', { symbol: 'NVDA' })
    const rows = result.transactions as Array<Record<string, unknown>>
    expect(rows[0].valueUsd).toBe(120_000)
    expect(rows[1].valueUsd).toBeNull()
  })

  test('an empty filing history is data, not a refusal', async () => {
    handlers.insider = () => ({
      symbol: 'QUIET',
      transactions: [],
      fetchedAt: '2026-08-17T00:00:00.000Z',
    })
    const result = await run('get_insider_activity', { symbol: 'QUIET' })
    expect(result.unavailable).toBeUndefined()
    expect(result.summary).toEqual({ buys: 0, sells: 0, spanDays: null })
  })
})

// ── New listings: two sources, one feed ──────────────────────────────

describe('get_new_listings', () => {
  const cex: NewListingsResponse = {
    entries: [
      {
        venue: 'okx',
        pairKey: 'NEW-USDT',
        base: 'NEW',
        quote: 'USDT',
        firstSeenAt: Date.UTC(2026, 7, 16),
      },
    ],
    trackingSince: Date.UTC(2026, 6, 1),
    fetchedAt: '2026-08-17T00:00:00.000Z',
  }

  test('merges venue listings with on-chain pools, newest first', async () => {
    handlers.listings = () => cex
    const result = await run(
      'get_new_listings',
      { days: 7, chains: ['base'] },
      {
        managerExecute: () => ({
          network: 'base',
          source: 'geckoterminal' as const,
          pools: [
            {
              network: 'base',
              address: '0xpool',
              name: 'FRESH / WETH',
              dexName: 'uniswap-v3',
              priceUsd: 0.42,
              change24hPct: null,
              volume24hUsd: 10_000,
              reserveUsd: 50_000,
              baseSymbol: 'FRESH',
              quoteSymbol: 'WETH',
              baseAddress: '0xbase',
              createdAtMs: Date.UTC(2026, 7, 17),
            },
          ],
        }),
      },
    )

    expect(seen.listings).toBe(7)
    const rows = result.listings as Array<Record<string, unknown>>
    expect(rows.length).toBe(2)
    // Newest first: the pool was created a day after the listing was seen.
    expect(rows[0].kind).toBe('dex')
    expect(rows[0].label).toBe('FRESH / WETH')
    expect(rows[1].kind).toBe('cex')
    expect(rows[1].market).toBe('okx')
    expect(result.trackingSince).toBe('2026-07-01T00:00:00.000Z')
  })

  test('drops a pool below the liquidity floor rather than listing a deployment', async () => {
    handlers.listings = () => ({
      entries: [],
      trackingSince: 0,
      fetchedAt: '',
    })
    const result = await run(
      'get_new_listings',
      { chains: ['base'] },
      {
        managerExecute: () => ({
          network: 'base',
          source: 'geckoterminal' as const,
          pools: [
            {
              network: 'base',
              address: '0xdust',
              name: 'DUST / WETH',
              dexName: 'uniswap-v3',
              priceUsd: 0.0001,
              change24hPct: null,
              volume24hUsd: 1,
              // Under the thousand-dollar floor: a deployment, not a market.
              reserveUsd: 40,
              baseSymbol: 'DUST',
              quoteSymbol: 'WETH',
              baseAddress: '0xdustbase',
              createdAtMs: Date.UTC(2026, 7, 17),
            },
          ],
        }),
      },
    )
    expect((result.listings as Array<unknown>).length).toBe(0)
  })

  test('caps the merged feed and reports the true total, not the cap', async () => {
    handlers.listings = () => ({
      entries: Array.from({ length: 64 }, (_, i) => ({
        venue: 'okx',
        pairKey: `NEW${i}-USDT`,
        base: `NEW${i}`,
        quote: 'USDT',
        firstSeenAt: Date.UTC(2026, 7, 16) - i * 1_000,
      })),
      trackingSince: Date.UTC(2026, 6, 1),
      fetchedAt: '2026-08-17T00:00:00.000Z',
    })
    const result = await run('get_new_listings', { chains: [] })
    expect((result.listings as Array<unknown>).length).toBe(50)
    expect(result.truncated).toBe(true)
    // 64 rows cleared the floor; the cap must not be reported as the total.
    expect(result.total).toBe(64)
  })

  test('a chain that refuses becomes a note, not a thrown turn', async () => {
    handlers.listings = () => cex
    const result = await run(
      'get_new_listings',
      { chains: ['base', 'jupiter'] },
      {
        managerExecute: (_capability, params) => {
          if (params.market === 'jupiter') throw new Error('429')
          return {
            network: 'base',
            source: 'geckoterminal' as const,
            pools: [],
          }
        },
      },
    )
    expect((result.listings as Array<unknown>).length).toBe(1)
    expect(String((result.notes as Array<string>).join(' '))).toContain(
      'jupiter',
    )
  })
})

// ── Liquidations: the wildcard refusal ───────────────────────────────

describe('get_liquidation_clusters', () => {
  const collector = (buckets: Array<LiquidationBucket>) =>
    fakePlugin({
      id: 'pairlens-intelligence',
      capabilities: [
        {
          id: 'market-data:liquidations',
          markets: ['binance-futures', 'bybit-futures'],
        },
      ],
      execute: () => ({
        venue: 'binance-futures',
        pairKey: 'BTC-USDT-USDT',
        bucketWidth: 50,
        resolutionMs: 60_000,
        retentionMs: 72 * 3_600_000,
        trackedSince: Date.UTC(2026, 7, 1),
        completeness: 'sampled' as const,
        buckets,
        fetchedAt: '2026-08-17T00:00:00.000Z',
      }),
    })

  test('refuses a wildcard provider and never asks it', async () => {
    // A plugin claiming every venue is a claim it cannot keep for a per-venue
    // collector. Taking it would report coverage that does not exist.
    const wildcard = fakePlugin({
      id: 'over-claiming-plugin',
      capabilities: [{ id: 'market-data:liquidations', markets: ['*'] }],
      execute: () => {
        throw new Error('this must never run')
      },
    })

    const { deps } = stubDeps({ plugins: [wildcard.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_liquidation_clusters.execute!(
      { venue: 'binance-futures', pair: 'BTC-USDT-USDT' } as never,
      TOOL_OPTIONS,
    )) as ToolResult

    expect(result.unavailable).toBe('not_tracked')
    expect(wildcard.calls.length).toBe(0)
    expect(result.trackedVenues).toEqual([])
  })

  test('names the venues that ARE collected when the asked-for one is not', async () => {
    const plugin = collector([])
    const { deps } = stubDeps({ plugins: [plugin.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_liquidation_clusters.execute!(
      { venue: 'kraken-futures', pair: 'BTC-USD-USD' } as never,
      TOOL_OPTIONS,
    )) as ToolResult

    expect(result.unavailable).toBe('not_tracked')
    expect(result.trackedVenues).toEqual(['binance-futures', 'bybit-futures'])
    expect(plugin.calls.length).toBe(0)
  })

  test('never routes through the resolver, which would fall back', async () => {
    const plugin = collector([])
    const { deps, managerCalls } = stubDeps({ plugins: [plugin.instance] })
    const tools = buildDataTools(deps)
    await tools.get_liquidation_clusters.execute!(
      { venue: 'binance-futures', pair: 'BTC-USDT-USDT', hours: 6 } as never,
      TOOL_OPTIONS,
    )
    expect(managerCalls).toEqual([])
    expect(plugin.calls[0].capability).toBe('market-data:liquidations')
    expect(plugin.calls[0].params).toEqual({
      venue: 'binance-futures',
      pair: 'BTC-USDT-USDT',
      hours: 6,
    })
  })

  test('collapses minute buckets onto prices and keeps the sides apart', async () => {
    const buckets: Array<LiquidationBucket> = [
      {
        ts: 1,
        price: 60_000,
        side: 'long',
        notionalUsd: 100_000,
        count: 4,
      },
      { ts: 2, price: 60_000, side: 'short', notionalUsd: 20_000, count: 1 },
      { ts: 3, price: 61_000, side: 'short', notionalUsd: 70_000, count: 2 },
    ]
    const plugin = collector(buckets)
    const { deps } = stubDeps({ plugins: [plugin.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_liquidation_clusters.execute!(
      { venue: 'binance-futures', pair: 'BTC-USDT-USDT' } as never,
      TOOL_OPTIONS,
    )) as ToolResult

    const clusters = result.clusters as Array<Record<string, unknown>>
    expect(clusters.length).toBe(2)
    expect(clusters[0]).toMatchObject({
      price: 60_000,
      longNotionalUsd: 100_000,
      shortNotionalUsd: 20_000,
      dominantSide: 'long',
    })
    expect(clusters[1].dominantSide).toBe('short')
    expect(result.totals).toEqual({
      longNotionalUsd: 100_000,
      shortNotionalUsd: 90_000,
      totalNotionalUsd: 190_000,
      events: 7,
    })
    // The venue stream samples during cascades, so magnitudes undercount.
    expect(result.completeness).toBe('sampled')
    expect(result.retentionHours).toBe(72)
  })

  test('over the bucket cap it keeps the heaviest and stays in price order', async () => {
    const buckets: Array<LiquidationBucket> = Array.from(
      { length: 250 },
      (_, i) => ({
        ts: i,
        price: 50_000 + i,
        side: 'long' as const,
        // Ascending weight, so the lightest 50 prices are the ones dropped.
        notionalUsd: 1_000 + i,
        count: 1,
      }),
    )
    const plugin = collector(buckets)
    const { deps } = stubDeps({ plugins: [plugin.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_liquidation_clusters.execute!(
      { venue: 'binance-futures', pair: 'BTC-USDT-USDT' } as never,
      TOOL_OPTIONS,
    )) as ToolResult

    const clusters = result.clusters as Array<{ price: number }>
    expect(clusters.length).toBe(200)
    expect(result.total).toBe(250)
    expect(result.truncated).toBe(true)
    // The heaviest survived, the lightest did not, and prices still ascend.
    expect(clusters[clusters.length - 1].price).toBe(50_249)
    expect(clusters[0].price).toBe(50_050)
    for (let i = 1; i < clusters.length; i++) {
      expect(clusters[i].price).toBeGreaterThan(clusters[i - 1].price)
    }
  })

  test('relays the collector still warming up as collecting', async () => {
    const warming = fakePlugin({
      id: 'pairlens-intelligence',
      capabilities: [
        { id: 'market-data:liquidations', markets: ['binance-futures'] },
      ],
      execute: () => ({
        error: 'liquidations_unavailable',
        reason: 'collecting',
        trackedSince: Date.UTC(2026, 7, 17),
        fetchedAt: '2026-08-17T00:00:00.000Z',
      }),
    })
    const { deps } = stubDeps({ plugins: [warming.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_liquidation_clusters.execute!(
      { venue: 'binance-futures', pair: 'BTC-USDT-USDT' } as never,
      TOOL_OPTIONS,
    )) as ToolResult
    expect(result.unavailable).toBe('collecting')
    expect(result.trackedSince).toBe('2026-08-17T00:00:00.000Z')
  })

  test('a thrown connector failure comes back as returned data', async () => {
    const broken = fakePlugin({
      id: 'pairlens-intelligence',
      capabilities: [
        { id: 'market-data:liquidations', markets: ['binance-futures'] },
      ],
      execute: () => {
        throw new Error('collector offline')
      },
    })
    const { deps } = stubDeps({ plugins: [broken.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_liquidation_clusters.execute!(
      { venue: 'binance-futures', pair: 'BTC-USDT-USDT' } as never,
      TOOL_OPTIONS,
    )) as ToolResult
    expect(result.error).toBe('collector offline')
  })
})

// ── Funding and open interest ────────────────────────────────────────

describe('get_funding_rates', () => {
  function fundingVenue(
    id: string,
    market: string,
    rates: Array<{ pair: string; base: string; rate: number }>,
    opts: { throws?: unknown; oiSupported?: boolean } = {},
  ) {
    return fakePlugin({
      id,
      name: `${market} Market Connector`,
      assetClass: 'crypto-perp',
      capabilities: [{ id: 'market-data:funding', markets: [market] }],
      execute: ({ params }) => {
        if (opts.throws) throw opts.throws
        if (params.action === 'open-interest') {
          if (opts.oiSupported === false) {
            return { market, entries: [], supported: false, ts: 0 }
          }
          return {
            market,
            supported: true,
            ts: 0,
            entries: (params.pairs as Array<string>).map((pair) => ({
              pair,
              base: pair.split('-')[0],
              amount: 1_000,
              contractSize: 0.001,
              value: 42_000_000,
            })),
          }
        }
        return {
          market,
          ts: 0,
          entries: rates.map((r) => ({
            pair: r.pair,
            base: r.base,
            quote: 'USDT',
            fundingRate: r.rate,
            intervalHours: 8,
            intervalKnown: true,
          })),
        }
      },
    })
  }

  test('ranks an unscoped sweep by absolute rate and annualises it', async () => {
    const binance = fundingVenue(
      'binance-futures-connector',
      'binance-futures',
      [
        { pair: 'BTC-USDT-USDT', base: 'BTC', rate: 0.0001 },
        { pair: 'DOGE-USDT-USDT', base: 'DOGE', rate: -0.0009 },
      ],
    )
    const { deps } = stubDeps({ plugins: [binance.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_funding_rates.execute!(
      {} as never,
      TOOL_OPTIONS,
    )) as ToolResult

    const venues = result.venues as Array<Record<string, unknown>>
    const rates = venues[0].rates as Array<Record<string, unknown>>
    // The most extreme carry is what a trader asked about.
    expect(rates[0].pair).toBe('DOGE-USDT-USDT')
    expect(venues[0].rankedBy).toBe('absolute funding rate, descending')
    expect(rates[0].annualizedPct).toBeCloseTo(-0.0009 * 1095 * 100, 6)
    // Open interest rode along on the same set of contracts.
    expect(rates[0].openInterest).toMatchObject({
      contracts: 1_000,
      contractSize: 0.001,
    })
  })

  test('keeps the venue order when contracts were named', async () => {
    const binance = fundingVenue(
      'binance-futures-connector',
      'binance-futures',
      [
        { pair: 'BTC-USDT-USDT', base: 'BTC', rate: 0.0001 },
        { pair: 'ETH-USDT-USDT', base: 'ETH', rate: -0.0009 },
      ],
    )
    const { deps } = stubDeps({ plugins: [binance.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_funding_rates.execute!(
      { pairs: ['BTC-USDT-USDT', 'ETH-USDT-USDT'] } as never,
      TOOL_OPTIONS,
    )) as ToolResult

    const venues = result.venues as Array<Record<string, unknown>>
    const rates = venues[0].rates as Array<Record<string, unknown>>
    expect(rates[0].pair).toBe('BTC-USDT-USDT')
    expect(venues[0].rankedBy).toBe('venue order')
    expect(binance.calls[0].params).toMatchObject({
      action: 'funding-rates',
      pairs: ['BTC-USDT-USDT', 'ETH-USDT-USDT'],
    })
  })

  test('reports a desktop-only venue as restricted, never as zero funding', async () => {
    const reachable = fundingVenue(
      'binance-futures-connector',
      'binance-futures',
      [{ pair: 'BTC-USDT-USDT', base: 'BTC', rate: 0.0001 }],
    )
    const restricted = fundingVenue(
      'kucoin-futures-connector',
      'kucoin-futures',
      [],
      { throws: new PlatformRestrictedError('KuCoin Futures') },
    )
    const { deps } = stubDeps({
      plugins: [reachable.instance, restricted.instance],
    })
    const tools = buildDataTools(deps)
    const result = (await tools.get_funding_rates.execute!(
      {} as never,
      TOOL_OPTIONS,
    )) as ToolResult

    const venues = result.venues as Array<Record<string, unknown>>
    const kucoin = venues.find((v) => v.venue === 'kucoin-futures')!
    expect(kucoin.desktopOnly).toBe(true)
    expect(kucoin.error).toBeNull()
    expect((kucoin.rates as Array<unknown>).length).toBe(0)
  })

  test('says so when a venue publishes no open interest at all', async () => {
    const kraken = fundingVenue(
      'kraken-futures-connector',
      'kraken-futures',
      [{ pair: 'BTC-USD-USD', base: 'BTC', rate: 0.00002 }],
      { oiSupported: false },
    )
    const { deps } = stubDeps({ plugins: [kraken.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_funding_rates.execute!(
      {} as never,
      TOOL_OPTIONS,
    )) as ToolResult
    const venues = result.venues as Array<Record<string, unknown>>
    expect(venues[0].openInterestSupported).toBe(false)
    expect(
      (venues[0].rates as Array<Record<string, unknown>>)[0].openInterest,
    ).toBeNull()
  })

  test('returns the active venue list when asked about one that is not', async () => {
    const binance = fundingVenue(
      'binance-futures-connector',
      'binance-futures',
      [],
    )
    const { deps } = stubDeps({ plugins: [binance.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_funding_rates.execute!(
      { venues: ['hyperliquid'] } as never,
      TOOL_OPTIONS,
    )) as ToolResult
    expect(result.activeVenues).toEqual(['binance-futures'])
  })

  test('with no perpetual connector installed it says that, not nothing', async () => {
    const { deps } = stubDeps({ plugins: [] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_funding_rates.execute!(
      {} as never,
      TOOL_OPTIONS,
    )) as ToolResult
    expect(result.unavailable).toBe('no_futures_venue')
  })

  test('caps a venue-wide sweep and states the total', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      pair: `A${i}-USDT-USDT`,
      base: `A${i}`,
      rate: i / 100_000,
    }))
    const binance = fundingVenue(
      'binance-futures-connector',
      'binance-futures',
      many,
    )
    const { deps } = stubDeps({ plugins: [binance.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_funding_rates.execute!(
      { openInterest: false } as never,
      TOOL_OPTIONS,
    )) as ToolResult
    const venues = result.venues as Array<Record<string, unknown>>
    expect((venues[0].rates as Array<unknown>).length).toBe(50)
    expect(venues[0].total).toBe(120)
    expect(venues[0].truncated).toBe(true)
    // The second pass was declined, so only the rates call was made.
    expect(binance.calls.length).toBe(1)
  })
})

// ── Pool state ───────────────────────────────────────────────────────

describe('get_pool_stats', () => {
  const stats = {
    network: 'base',
    address: '0xpool',
    name: 'WETH / USDC 0.05%',
    dexName: 'uniswap-v3',
    baseSymbol: 'WETH',
    quoteSymbol: 'USDC',
    priceUsd: 3_100,
    quotePriceUsd: 1,
    priceInQuote: 3_100,
    change1hPct: 0.4,
    change24hPct: -1.2,
    volume1hUsd: 90_000,
    volume24hUsd: 4_000_000,
    reserveUsd: 12_000_000,
    baseReserve: null,
    quoteReserve: null,
    feeTier: 0.0005,
    trades24h: null,
    buyVolume24hUsd: null,
    sellVolume24hUsd: null,
    createdAt: '2025-01-04T00:00:00.000Z',
    fdvUsd: null,
    source: 'geckoterminal' as const,
  }

  test('reads the primary provider and says when reserves are unpublished', async () => {
    const { deps, managerCalls } = stubDeps({ managerExecute: () => stats })
    const tools = buildDataTools(deps)
    const result = (await tools.get_pool_stats.execute!(
      { market: 'base', pair: 'WETH-USDC' } as never,
      TOOL_OPTIONS,
    )) as ToolResult

    expect(managerCalls[0]).toEqual({
      capability: 'market-data:pool-stats',
      params: { action: 'stats', market: 'base', pair: 'WETH-USDC' },
    })
    expect(result.reserveUsd).toBe(12_000_000)
    expect(result.baseReserve).toBeNull()
    // Missing reserves are stated, not reported as zero depth.
    expect(String(result.reservesNote)).toContain('per-side')
  })

  test('does not carry a reserves note when the provider published them', async () => {
    const { deps } = stubDeps({
      managerExecute: () => ({
        ...stats,
        baseReserve: 3_800,
        quoteReserve: 6_000_000,
      }),
    })
    const tools = buildDataTools(deps)
    const result = (await tools.get_pool_stats.execute!(
      { market: 'base', pair: 'WETH-USDC' } as never,
      TOOL_OPTIONS,
    )) as ToolResult
    expect(result.reservesNote).toBeUndefined()
  })

  test('defaults to the charted market and pair', async () => {
    const { deps, managerCalls } = stubDeps({
      focus: { market: 'jupiter', pair: 'SOL-USDC' },
      managerExecute: () => stats,
    })
    const tools = buildDataTools(deps)
    await tools.get_pool_stats.execute!({} as never, TOOL_OPTIONS)
    expect(managerCalls[0].params).toMatchObject({
      market: 'jupiter',
      pair: 'SOL-USDC',
    })
  })

  test('an answered "no pool here" is not an error', async () => {
    const { deps } = stubDeps({ managerExecute: () => null })
    const tools = buildDataTools(deps)
    const result = (await tools.get_pool_stats.execute!(
      { market: 'base', pair: 'NOPE-USDC' } as never,
      TOOL_OPTIONS,
    )) as ToolResult
    expect(result.noPool).toBe(true)
    expect(result.error).toBeUndefined()
  })
})

// ── Bridge quotes, and only quotes ───────────────────────────────────

describe('get_bridge_quote', () => {
  const bridgePlugin = (answer: unknown) =>
    fakePlugin({
      id: 'lifi-bridge-connector',
      capabilities: [{ id: 'market-data:bridge', markets: ['*'] }],
      execute: () => answer,
    })

  test('prices a route and hands back the floor beside the expectation', async () => {
    const plugin = bridgePlugin({
      fromMarket: 'ethereum',
      toMarket: 'base',
      symbol: 'USDC',
      toSymbol: 'USDC',
      amount: 250,
      amountOut: 249.1,
      amountOutMin: 247.8,
      feeUsd: 0.4,
      feeIncluded: true,
      gasUsd: 1.9,
      etaSeconds: 40,
      tool: 'across',
      provider: 'lifi',
      quotedAt: Date.UTC(2026, 7, 17, 9),
    })
    const { deps } = stubDeps({ plugins: [plugin.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_bridge_quote.execute!(
      {
        fromMarket: 'ethereum',
        toMarket: 'base',
        symbol: 'USDC',
        amount: '250',
      } as never,
      TOOL_OPTIONS,
    )) as ToolResult

    expect(result.amountOut).toBe(249.1)
    // The floor never travels without the expectation.
    expect(result.amountOutMin).toBe(247.8)
    // Two fee numbers, never one.
    expect(result.feeUsd).toBe(0.4)
    expect(result.gasUsd).toBe(1.9)
    expect(result.quotedAt).toBe('2026-08-17T09:00:00.000Z')
    expect(plugin.calls[0].params).toMatchObject({ action: 'quote' })
  })

  test('relays a refused route as the reason, not as a failure', async () => {
    const plugin = bridgePlugin({
      refused: true,
      reason: 'same-chain',
      market: 'base',
      symbol: null,
    })
    const { deps } = stubDeps({ plugins: [plugin.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_bridge_quote.execute!(
      {
        fromMarket: 'base',
        toMarket: 'base',
        symbol: 'USDC',
        amount: '10',
      } as never,
      TOOL_OPTIONS,
    )) as ToolResult
    expect(result.refused).toBe(true)
    expect(result.reason).toBe('same-chain')
  })

  test('refuses when no bridge connector is active', async () => {
    const { deps } = stubDeps({ plugins: [] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_bridge_quote.execute!(
      {
        fromMarket: 'ethereum',
        toMarket: 'base',
        symbol: 'USDC',
        amount: '250',
      } as never,
      TOOL_OPTIONS,
    )) as ToolResult
    expect(result.unavailable).toBe('no_bridge_plugin')
    expect(String(result.hint)).toContain('Plugin Store')
  })

  test('rejects a non-positive amount before asking anyone', async () => {
    const plugin = bridgePlugin(null)
    const { deps } = stubDeps({ plugins: [plugin.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_bridge_quote.execute!(
      {
        fromMarket: 'ethereum',
        toMarket: 'base',
        symbol: 'USDC',
        amount: '0',
      } as never,
      TOOL_OPTIONS,
    )) as ToolResult
    expect(typeof result.error).toBe('string')
    expect(plugin.calls.length).toBe(0)
  })

  test('offers no execution tool at all', () => {
    const { deps } = stubDeps()
    const names = Object.keys(buildDataTools(deps))
    // Executing a bridge is the user's own action in the Bridge pane.
    expect(
      names.some((n) => n.includes('bridge') && n !== 'get_bridge_quote'),
    ).toBe(false)
  })
})

// ── The set itself ───────────────────────────────────────────────────

describe('the data tool set', () => {
  test('every tool carries a chip label', () => {
    const { deps } = stubDeps()
    const names = Object.keys(buildDataTools(deps))
    const missing = names.filter((name) => !(name in DATA_TOOL_LABELS))
    expect(missing).toEqual([])
  })

  test('declares the ten reads round 2 had no sentence for', () => {
    const { deps } = stubDeps()
    expect(Object.keys(buildDataTools(deps)).sort()).toEqual([
      'get_bridge_quote',
      'get_company_fundamentals',
      'get_earnings_calendar',
      'get_economic_calendar',
      'get_funding_rates',
      'get_insider_activity',
      'get_ipo_calendar',
      'get_liquidation_clusters',
      'get_new_listings',
      'get_pool_stats',
    ])
  })

  test('every tool describes what it answers', () => {
    const { deps } = stubDeps()
    for (const [name, definition] of Object.entries(buildDataTools(deps))) {
      const description = (definition as { description?: string }).description
      expect(typeof description).toBe('string')
      expect(description!.length).toBeGreaterThan(60)
      // Dashes are the house tell for generated prose. Not in a shipped string.
      expect(`${name}: ${description}`).not.toMatch(/[—–]/)
    }
  })
})
