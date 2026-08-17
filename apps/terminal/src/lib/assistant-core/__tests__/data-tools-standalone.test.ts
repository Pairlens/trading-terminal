// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The data tools on a build with NO App Server.
 *
 * Its own file because `hasAppServer` is a module constant read from the build
 * env: one value per test process, and this is the other value.
 *
 * Two things are pinned. The hosted reads answer `standalone` rather than the
 * `not_configured` the api layer would raise, because "this build has no server"
 * and "the server has no provider key" are different sentences and only one of
 * them is about the user's deployment. And the connector-backed reads keep
 * working: funding, pool state and bridge quotes never touched the App Server,
 * so a standalone desktop build must not lose them.
 */
import { describe, expect, mock, test } from 'bun:test'

import { TOOL_OPTIONS, fakePlugin, stubDeps } from './data-tools-fakes'
import type { ToolResult } from './data-tools-fakes'

const realApi = await import('@/lib/api')
const realAuth = await import('@/lib/auth-client')

/** Any hosted call is a bug here: the guard runs before the request. */
function unreachable(): never {
  throw new Error('the App Server must not be called on a standalone build')
}

void mock.module('@/lib/auth-client', () => ({
  ...realAuth,
  hasAppServer: false,
}))

void mock.module('@/lib/api', () => ({
  ...realApi,
  api: {
    ...realApi.api,
    getEconomicCalendar: unreachable,
    getEarningsCalendar: unreachable,
    getCompanyOverview: unreachable,
    getIpoCalendar: unreachable,
    getInsiderTransactions: unreachable,
    getNewListings: unreachable,
  },
}))

const { buildDataTools } = await import('../data-tools')

describe('a build with no App Server', () => {
  const hosted: Array<[string, Record<string, unknown>]> = [
    ['get_economic_calendar', {}],
    ['get_earnings_calendar', {}],
    ['get_company_fundamentals', { symbol: 'NVDA' }],
    ['get_ipo_calendar', {}],
    ['get_insider_activity', { symbol: 'NVDA' }],
  ]

  test.each(hosted)(
    '%s says standalone rather than pretending the week is empty',
    async (name, args) => {
      const { deps } = stubDeps()
      const tools = buildDataTools(deps)
      const result = (await tools[name].execute!(
        args as never,
        TOOL_OPTIONS,
      )) as ToolResult

      expect(result.unavailable).toBe('standalone')
      expect(String(result.hint)).toContain('App Server')
      // Not an empty list a model would relay as "nothing scheduled".
      expect(result.entries).toBeUndefined()
    },
  )

  test('liquidations refuse before any plugin is addressed', async () => {
    const collector = fakePlugin({
      id: 'pairlens-intelligence',
      capabilities: [
        { id: 'market-data:liquidations', markets: ['binance-futures'] },
      ],
      execute: () => unreachable(),
    })
    const { deps } = stubDeps({ plugins: [collector.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_liquidation_clusters.execute!(
      { venue: 'binance-futures', pair: 'BTC-USDT-USDT' } as never,
      TOOL_OPTIONS,
    )) as ToolResult

    expect(result.unavailable).toBe('standalone')
    expect(result.venue).toBe('binance-futures')
    expect(collector.calls.length).toBe(0)
  })

  test('new listings still serve the on-chain half, and say why the other is missing', async () => {
    const { deps } = stubDeps({
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
    })
    const tools = buildDataTools(deps)
    const result = (await tools.get_new_listings.execute!(
      { chains: ['base'] } as never,
      TOOL_OPTIONS,
    )) as ToolResult

    const rows = result.listings as Array<Record<string, unknown>>
    expect(rows.length).toBe(1)
    expect(rows[0].kind).toBe('dex')
    expect(result.unavailable).toBeUndefined()
    expect(String((result.notes as Array<string>).join(' '))).toContain(
      'App Server',
    )
    // Nothing was swept, so there is no tracking baseline to quote.
    expect(result.trackingSince).toBeNull()
  })

  test('funding still works: it never went through the App Server', async () => {
    const venue = fakePlugin({
      id: 'binance-futures-connector',
      name: 'Binance Futures Market Connector',
      assetClass: 'crypto-perp',
      capabilities: [
        { id: 'market-data:funding', markets: ['binance-futures'] },
      ],
      execute: ({ params }) =>
        params.action === 'open-interest'
          ? { market: 'binance-futures', entries: [], supported: true, ts: 0 }
          : {
              market: 'binance-futures',
              ts: 0,
              entries: [
                {
                  pair: 'BTC-USDT-USDT',
                  base: 'BTC',
                  quote: 'USDT',
                  fundingRate: 0.0001,
                  intervalHours: 8,
                  intervalKnown: true,
                },
              ],
            },
    })
    const { deps } = stubDeps({ plugins: [venue.instance] })
    const tools = buildDataTools(deps)
    const result = (await tools.get_funding_rates.execute!(
      {} as never,
      TOOL_OPTIONS,
    )) as ToolResult

    const venues = result.venues as Array<Record<string, unknown>>
    expect((venues[0].rates as Array<Record<string, unknown>>)[0].pair).toBe(
      'BTC-USDT-USDT',
    )
    expect(result.unavailable).toBeUndefined()
  })

  test('pool stats still work: the provider is a plugin, not the server', async () => {
    const { deps } = stubDeps({
      managerExecute: () => ({
        network: 'base',
        address: '0xpool',
        name: 'WETH / USDC 0.05%',
        dexName: 'uniswap-v3',
        baseSymbol: 'WETH',
        quoteSymbol: 'USDC',
        priceUsd: 3_100,
        quotePriceUsd: 1,
        priceInQuote: 3_100,
        change1hPct: null,
        change24hPct: null,
        volume1hUsd: null,
        volume24hUsd: null,
        reserveUsd: 12_000_000,
        baseReserve: 3_800,
        quoteReserve: 6_000_000,
        feeTier: 0.0005,
        trades24h: null,
        buyVolume24hUsd: null,
        sellVolume24hUsd: null,
        createdAt: null,
        fdvUsd: null,
        source: 'geckoterminal' as const,
      }),
    })
    const tools = buildDataTools(deps)
    const result = (await tools.get_pool_stats.execute!(
      { market: 'base', pair: 'WETH-USDC' } as never,
      TOOL_OPTIONS,
    )) as ToolResult
    expect(result.reserveUsd).toBe(12_000_000)
    expect(result.unavailable).toBeUndefined()
  })
})
