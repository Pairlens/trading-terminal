// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `market-data:funding` as the terminal reaches it: through the plugin.
 *
 * The factory answers this capability itself, in FRONT of the shared CEX shell,
 * and three properties of that override are worth pinning because each fails
 * silently rather than loudly:
 *
 * - the funding request reaches the provider and comes back in the wire shape,
 * - every other capability still falls through to the shell, so wrapping
 *   `execute` did not shadow the fourteen branches it already had,
 * - a region refusal is thrown as the TYPED error, which is what raises the
 *   terminal's region dialog rather than leaving the pane empty.
 */

import { describe, expect, it } from 'bun:test'
import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { createCcxtFuturesConnectorPlugin } from '../index'
import { createCexFuturesConnectorManifest } from '../manifest'
import { memoryFuturesMarketsStorage } from '../futures-markets'
import type { FundingSnapshotResponse } from '@pairlens/shared/instrument-types'
import type { CcxtExchangeCtor } from '../../ccxt-connector/types'
import type { CcxtFuturesVenueConfig } from '../futures-types'

const PERP_MARKET = {
  id: 'BTCUSDT',
  symbol: 'BTC/USDT:USDT',
  base: 'BTC',
  quote: 'USDT',
  settle: 'USDT',
  type: 'swap',
  spot: false,
  swap: true,
  linear: true,
  inverse: false,
  contract: true,
  index: false,
  active: true,
  contractSize: 1,
}

/** Enough exchange for the host to build and the provider to read. */
class FakeFuturesExchange {
  readonly id = 'fake-perp'
  readonly has: Record<string, unknown> = { fetchFundingRates: true }
  readonly timeframes: Record<string, string> = { '1h': '1h' }
  readonly urls: Record<string, unknown> = { api: { rest: 'https://fake' } }
  readonly options: Record<string, unknown> = {}
  markets: Record<string, unknown> | undefined = undefined

  setMarkets(markets: Array<Record<string, unknown>>): void {
    this.markets = Object.fromEntries(
      markets.map((market) => [market['symbol'] as string, market]),
    )
  }
  async loadMarkets(): Promise<unknown> {
    this.setMarkets([PERP_MARKET])
    return this.markets
  }
  market(symbol: string): Record<string, unknown> {
    return (this.markets?.[symbol] ?? {}) as Record<string, unknown>
  }
  async fetchFundingRates(): Promise<Record<string, unknown>> {
    return {
      'BTC/USDT:USDT': {
        symbol: 'BTC/USDT:USDT',
        fundingRate: 0.0001,
        markPrice: 63_121,
        indexPrice: 63_052,
        fundingTimestamp: 1_800_000_000_000,
      },
    }
  }
  async fetchOHLCV(): Promise<Array<never>> {
    return []
  }
  async fetchTickers(): Promise<Record<string, never>> {
    return {}
  }
  async watchOHLCV(): Promise<Array<never>> {
    return new Promise(() => {})
  }
  async watchTicker(): Promise<never> {
    return new Promise(() => {})
  }
  async watchOrderBook(): Promise<never> {
    return new Promise(() => {})
  }
  async watchTrades(): Promise<never> {
    return new Promise(() => {})
  }
  async close(): Promise<void> {}
}

function buildPlugin(over: Partial<CcxtFuturesVenueConfig> = {}) {
  const venue: CcxtFuturesVenueConfig = {
    exchangeId: 'fake-perp',
    marketId: 'fake-futures',
    displayName: 'Fake Futures',
    credentialKeys: [],
    defaultMode: 'paper',
    maxLeverage: 20,
    maxHistoryLimit: 500,
    fundingIntervalHours: 8,
    loadExchangeClass: async () =>
      FakeFuturesExchange as unknown as CcxtExchangeCtor,
    ...over,
  }
  const manifest = createCexFuturesConnectorManifest({
    id: 'fake-futures-market-connector',
    name: 'Fake Futures',
    displayName: 'Fake Futures',
    marketId: 'fake-futures',
    icon: '',
    gradient: '',
    abbr: 'FF',
    timeframes: ['1h'],
    maxLeverage: 20,
  })
  return createCcxtFuturesConnectorPlugin(venue, manifest, {
    marketsStorage: memoryFuturesMarketsStorage(),
  })
}

const CONTEXT = {
  pair: '',
  market: 'fake-futures',
  timeframe: '',
  mode: 'paper' as const,
  country: 'DE',
}

describe('market-data:funding through the plugin', () => {
  it('declares the capability scoped to its own market', () => {
    const plugin = buildPlugin()
    const declaration = plugin.manifest.capabilities.find(
      (entry) => entry.id === 'market-data:funding',
    )
    expect(declaration).toMatchObject({ markets: ['fake-futures'] })
  })

  it('answers a rates sweep in the wire shape', async () => {
    const plugin = buildPlugin()
    const response = (await plugin.execute({
      capability: 'market-data:funding',
      params: { action: 'funding-rates' },
      context: CONTEXT,
    })) as FundingSnapshotResponse

    expect(response.market).toBe('fake-futures')
    expect(response.entries).toHaveLength(1)
    expect(response.entries[0]).toMatchObject({
      pair: 'BTC-USDT-USDT',
      base: 'BTC',
      fundingRate: 0.0001,
      intervalHours: 8,
      intervalKnown: false,
      markPrice: 63_121,
      indexPrice: 63_052,
    })
    await plugin.destroy?.()
  })

  it('leaves every other capability to the shell', async () => {
    // Wrapping `execute` must not shadow the shell's own dispatch; the message
    // is the shell's, which is how we know the call reached it.
    const plugin = buildPlugin()
    await expect(
      plugin.execute({
        capability: 'theme:override',
        params: {},
        context: CONTEXT,
      }),
    ).rejects.toThrow(/unsupported execute capability/)
    await plugin.destroy?.()
  })

  it('refuses a blocked region with the typed error the dialog keys on', async () => {
    const plugin = buildPlugin({
      geoCheck: (country) => {
        if (country === 'US') throw new GeoRestrictedError('Fake Futures', 'US')
      },
    })
    await expect(
      plugin.execute({
        capability: 'market-data:funding',
        params: { action: 'funding-rates' },
        context: { ...CONTEXT, country: 'US' },
      }),
    ).rejects.toBeInstanceOf(GeoRestrictedError)
    await plugin.destroy?.()
  })
})
