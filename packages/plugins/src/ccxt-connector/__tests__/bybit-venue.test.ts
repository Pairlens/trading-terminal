// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * ByBit venue wiring.
 *
 * The read path itself is covered by the shared bridge suites — what is
 * venue-specific here is the refusal logic, the region routing, and the two
 * constants that throw at runtime when they are wrong (the spot depth enum and
 * `defaultType`).
 */

import { describe, expect, it } from 'bun:test'
import {
  BYBIT_ADAPTER_INFO,
  bybitCcxtVenue,
  bybitMarketConnectorManifest,
} from '../venues/bybit'
import {
  BYBIT_SPOT_BOOK_DEPTHS,
  applyBybitCcxtUrls,
  clampBybitBookDepth,
  resolveBybitRegion,
} from '../venues/bybit-regions'

function declaration(capability: string) {
  return bybitMarketConnectorManifest.capabilities.find(
    (entry) => entry.id === capability,
  )
}

describe('bybit manifest', () => {
  it('keeps the native identity so persisted state and credentials still resolve', () => {
    expect(bybitMarketConnectorManifest.id).toBe('bybit-market-connector')
    expect(bybitMarketConnectorManifest.name).toBe('ByBit Market Connector')
    expect(BYBIT_ADAPTER_INFO.marketId).toBe('bybit')
    expect(BYBIT_ADAPTER_INFO.displayName).toBe('ByBit')
  })

  it('carries the native metadata the terminal reads for the venue card', () => {
    expect(bybitMarketConnectorManifest.metadata).toMatchObject({
      assetClass: 'crypto-spot',
      abbr: 'BB',
      gradient: 'from-orange-500 to-orange-600',
      logoUrl: 'https://www.bybit.com/favicon.ico',
      triggerOrders: true,
    })
    // ByBit reaches the browser directly — no desktop gate, in either half.
    expect(bybitMarketConnectorManifest.metadata?.['requiresDesktop']).toBe(
      undefined,
    )
    expect(bybitCcxtVenue.requiresDesktop).toBe(undefined)
  })

  it('scopes the bulk snapshot to every market and the tape to bybit', () => {
    expect(declaration('market-data:ticker-snapshot')).toMatchObject({
      markets: ['*'],
      priority: 20,
      streaming: false,
    })
    expect(declaration('market-data:trades')).toMatchObject({
      markets: ['bybit'],
      priority: 1,
      streaming: true,
    })
  })
})

describe('bybit geo refusal', () => {
  it('blocks every capability in the US, not just market data', () => {
    for (const capability of [
      'market-data:candles',
      'market-data:ticker-snapshot',
      'trading:orders',
      'trading:balances',
    ]) {
      let thrown: unknown = null
      try {
        bybitCcxtVenue.geoCheck?.('US', capability)
      } catch (error) {
        thrown = error
      }
      expect((thrown as Error | null)?.name).toBe('GeoRestrictedError')
      // The terminal's guards key off the sentinel, never `instanceof` — it may
      // hold a second copy of the errors module.
      expect(
        (thrown as { __geoRestricted?: boolean } | null)?.__geoRestricted,
      ).toBe(true)
    }
  })

  it('is case-insensitive about the country code', () => {
    expect(() =>
      bybitCcxtVenue.geoCheck?.('us', 'market-data:candles'),
    ).toThrow('ByBit is not available in your region (us)')
  })

  it('serves the regions the router can route', () => {
    expect(() =>
      bybitCcxtVenue.geoCheck?.('DE', 'market-data:candles'),
    ).not.toThrow()
    expect(() =>
      bybitCcxtVenue.geoCheck?.('', 'market-data:candles'),
    ).not.toThrow()
    expect(() =>
      bybitCcxtVenue.geoCheck?.('SG', 'trading:orders'),
    ).not.toThrow()
  })
})

describe('bybit region routing', () => {
  it('sends the EU/EEA to bybit.nl and everyone else to bybit.com', () => {
    expect(resolveBybitRegion('DE')?.hostname).toBe('bybit.nl')
    expect(resolveBybitRegion('no')?.hostname).toBe('bybit.nl')
    expect(resolveBybitRegion('SG')?.hostname).toBe('bybit.com')
    expect(resolveBybitRegion('')?.hostname).toBe('bybit.com')
  })

  it('returns null exactly where the native connector refuses', () => {
    expect(resolveBybitRegion('US')).toBe(null)
  })

  it('moves REST and the socket together, because both templates take {hostname}', () => {
    const exchange = { urls: { api: {}, test: {} }, hostname: 'bybit.com' }
    applyBybitCcxtUrls(exchange, 'FR')
    expect(exchange.hostname).toBe('bybit.nl')
  })

  it('falls back to the global host for an unserved region rather than leaving urls half-built', () => {
    // geoCheck has already refused by the time anything reaches the instance;
    // a blank hostname would turn that typed refusal into a request failure.
    const exchange = { urls: { api: {} }, hostname: 'bybit.com' }
    applyBybitCcxtUrls(exchange, 'US')
    expect(exchange.hostname).toBe('bybit.com')
  })

  it('swaps in the testnet table only for paper mode', () => {
    const exchange = {
      urls: {
        api: { public: 'https://api.{hostname}', ws: { spot: 'live' } },
        test: {
          public: 'https://api-testnet.{hostname}',
          ws: { spot: 'test' },
        },
      },
      hostname: 'bybit.com',
    }
    applyBybitCcxtUrls(exchange, 'SG')
    expect(exchange.urls.api.public).toBe('https://api.{hostname}')

    applyBybitCcxtUrls(exchange, 'SG', true)
    expect(exchange.urls.api.public).toBe('https://api-testnet.{hostname}')
    expect(exchange.urls.api.ws).toEqual({ spot: 'test' })
  })
})

describe('bybit orderbook depth', () => {
  it('snaps up to the next spot channel — ccxt throws on anything off-enum', () => {
    expect(clampBybitBookDepth(1)).toBe(1)
    expect(clampBybitBookDepth(2)).toBe(50)
    expect(clampBybitBookDepth(20)).toBe(50)
    expect(clampBybitBookDepth(51)).toBe(200)
    expect(clampBybitBookDepth(5_000)).toBe(1_000)
  })

  it('subscribes at orderbook.200, not the native s orderbook.50', () => {
    // 50 levels is a ~0.04% band on BTC/USDT and reads as a near-flat ladder;
    // 200 widens it to ~0.19%, matching OKX's `books` and Binance's 500. The
    // 21ms → 99ms push rate that comes with it is the deliberate half of the
    // trade — see BYBIT_DEFAULT_BOOK_DEPTH.
    expect(clampBybitBookDepth()).toBe(200)
    expect(clampBybitBookDepth(Number.NaN)).toBe(200)
    expect(bybitCcxtVenue.orderbookDepth).toBe(200)
  })

  it('never configures a depth ccxt would reject', () => {
    expect(BYBIT_SPOT_BOOK_DEPTHS).toContain(
      bybitCcxtVenue.orderbookDepth as (typeof BYBIT_SPOT_BOOK_DEPTHS)[number],
    )
  })
})

describe('bybit venue config', () => {
  it('forces spot — ccxt ships this venue defaulting to swap', () => {
    const options = bybitCcxtVenue.options?.['options'] as Record<
      string,
      unknown
    >
    expect(options['defaultType']).toBe('spot')
  })

  it('keeps the native 200-bar page so paging behaves as it was tuned', () => {
    expect(bybitCcxtVenue.maxHistoryLimit).toBe(200)
  })

  it('nudges the inclusive `end` cursor so a page is never just the boundary bar', () => {
    expect(bybitCcxtVenue.historyPageParams?.(1_700_000_000_000)).toEqual({
      until: 1_699_999_999_999,
    })
  })

  it('synthesizes the concatenated market id a cold profile needs to subscribe', () => {
    expect(bybitCcxtVenue.synthesizeMarket?.('BTC-USDT')).toMatchObject({
      id: 'BTCUSDT',
      lowercaseId: 'btcusdt',
      symbol: 'BTC/USDT',
      base: 'BTC',
      quote: 'USDT',
      spot: true,
      type: 'spot',
    })
    expect(bybitCcxtVenue.synthesizeMarket?.('BTCUSDT')).toBe(null)
  })
})
