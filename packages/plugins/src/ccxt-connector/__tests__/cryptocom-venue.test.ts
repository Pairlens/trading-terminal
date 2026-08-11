// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crypto.com venue wiring, and the two upstream ccxt defects the venue module
 * repairs.
 *
 * Both were caught by a live cross-venue comparison rather than by types: ccxt
 * reported BTC/USDT at `-0.0156%` while ByBit said `-1.58%` and Bitget
 * `-1.575%` for the same minute, and the bulk snapshot came back with 925 rows
 * against 582 listed spot pairs. Both are silent — the shapes are valid, the
 * numbers are wrong — so they are pinned here.
 */

import { describe, expect, it } from 'bun:test'
import { parseCcxtBulkTickerRow, parseCcxtTicker } from '../parser'
import {
  CRYPTOCOM_ADAPTER_INFO,
  applyCryptocomPaperUrls,
  cryptocomCcxtVenue,
  cryptocomMarketConnectorManifest,
  patchCryptocom,
  scaleCryptocomChangeToPercent,
} from '../venues/cryptocom'
import { PUBLIC_CTX } from './url-context'

function declaration(capability: string) {
  return cryptocomMarketConnectorManifest.capabilities.find(
    (entry) => entry.id === capability,
  )
}

/** What ccxt's two ticker parsers both do with the raw payload. */
function fakeParse(ticker: unknown): Record<string, unknown> {
  const raw = (ticker ?? {}) as Record<string, unknown>
  const last = Number(raw['a'])
  const percentage = Number(raw['c'])
  return {
    symbol: 'BTC/USDT',
    last,
    close: last,
    percentage,
    // safeTicker back-derives the open price from `percentage`, so a wrong
    // percentage silently poisons a second field.
    open: last - (last * percentage) / 100,
  }
}

/**
 * The slice of ccxt's Crypto.com class the patch wraps, reproduced faithfully:
 * `percentage` is the raw `c` field, and REST and WS have SEPARATE parsers
 * (`cryptocom.js:2361`, `pro/cryptocom.js:640`) that make the same mistake.
 */
class FakeCryptocom {
  markets: Record<string, unknown> | undefined = {
    'BTC/USDT': { spot: true },
    'WAL/USD:USD': { spot: false, swap: true },
  }

  constructor(_config: Record<string, unknown>) {}

  parseTicker(ticker: unknown, _market?: unknown): Record<string, unknown> {
    return fakeParse(ticker)
  }

  parseWsTicker(ticker: unknown, _market?: unknown): Record<string, unknown> {
    return fakeParse(ticker)
  }

  async fetchTickers(): Promise<Record<string, unknown>> {
    return {
      'BTC/USDT': fakeParse({ a: '64000', c: '-0.0158' }),
      'WAL/USD:USD': fakeParse({ a: '0.4', c: '0.02' }),
    }
  }
}

/** The shape an upstream de-duplication of the two parsers would produce. */
class FakeCryptocomDelegating extends FakeCryptocom {
  override parseWsTicker(
    ticker: unknown,
    market?: unknown,
  ): Record<string, unknown> {
    return this.parseTicker(ticker, market)
  }
}

describe('cryptocom manifest', () => {
  it('keeps the native identity so persisted state and credentials still resolve', () => {
    expect(cryptocomMarketConnectorManifest.id).toBe(
      'cryptocom-market-connector',
    )
    expect(cryptocomMarketConnectorManifest.name).toBe(
      'Crypto.com Market Connector',
    )
    expect(CRYPTOCOM_ADAPTER_INFO.marketId).toBe('cryptocom')
    expect(CRYPTOCOM_ADAPTER_INFO.displayName).toBe('Crypto.com')
  })

  it('carries the native metadata the terminal reads for the venue card', () => {
    expect(cryptocomMarketConnectorManifest.metadata).toMatchObject({
      assetClass: 'crypto-spot',
      abbr: 'CDC',
      gradient: 'from-blue-700 to-indigo-900',
      triggerOrders: true,
    })
    expect(cryptocomMarketConnectorManifest.metadata?.['requiresDesktop']).toBe(
      undefined,
    )
  })

  it('scopes the bulk snapshot to every market and the tape to cryptocom', () => {
    expect(declaration('market-data:ticker-snapshot')).toMatchObject({
      markets: ['*'],
      priority: 20,
    })
    expect(declaration('market-data:trades')).toMatchObject({
      markets: ['cryptocom'],
      streaming: true,
    })
  })
})

describe('cryptocom 24h change is a fraction upstream', () => {
  it('scales the raw field, so the derived open price is right too', () => {
    expect(scaleCryptocomChangeToPercent({ a: '64000', c: '-0.0158' })).toEqual(
      {
        a: '64000',
        c: '-1.58',
      },
    )
  })

  it('does not ship a binary floating point artifact into a UI label', () => {
    // -0.0161 * 100 is -1.6099999999999999 in IEEE 754.
    expect(scaleCryptocomChangeToPercent({ c: '-0.0161' })).toEqual({
      c: '-1.61',
    })
  })

  it('leaves a missing or unparseable change alone rather than inventing 0', () => {
    expect(scaleCryptocomChangeToPercent({ a: '1' })).toEqual({ a: '1' })
    expect(scaleCryptocomChangeToPercent({ c: '' })).toEqual({ c: '' })
    expect(scaleCryptocomChangeToPercent({ c: 'n/a' })).toEqual({ c: 'n/a' })
    expect(scaleCryptocomChangeToPercent(null)).toBe(null)
  })

  it('fixes the REST parser and the WS parser — they are separate methods', () => {
    const Patched = patchCryptocom(FakeCryptocom)
    const exchange = new Patched({})
    const raw = { a: '64000', c: '-0.0158' }

    expect(exchange.parseTicker(raw)['percentage']).toBe(-1.58)
    // handleTicker calls parseWsTicker, not parseTicker: patching one leaves
    // the live chart header 100x low while the markets scanner reads right.
    expect(exchange.parseWsTicker(raw)['percentage']).toBe(-1.58)
  })

  it('scales once even if upstream makes the WS parser delegate to the REST one', () => {
    // Both overrides would then see the same payload; a second multiply is as
    // silent as the bug being fixed, just 100x the other way.
    const Patched = patchCryptocom(FakeCryptocomDelegating)
    const exchange = new Patched({})
    expect(
      exchange.parseWsTicker({ a: '64000', c: '-0.0158' })['percentage'],
    ).toBe(-1.58)
  })

  it('reaches the app as a percent through the shared normalizer', () => {
    const Patched = patchCryptocom(FakeCryptocom)
    const exchange = new Patched({})
    const ticker = parseCcxtTicker(
      exchange.parseWsTicker({ a: '64000', c: '-0.0158' }),
    )
    expect(ticker.change24h).toBe(-1.58)
    expect(ticker.last).toBe(64000)
  })
})

describe('cryptocom bulk snapshot is the listing signal', () => {
  it('drops perpetuals, which would arrive as plausible-looking spot rows', async () => {
    const Patched = patchCryptocom(FakeCryptocom)
    const exchange = new Patched({})
    const tickers = await exchange.fetchTickers()
    expect(Object.keys(tickers)).toEqual(['BTC/USDT'])
  })

  it('is not something the shared parser can catch on its own', () => {
    // A perp's unified symbol loses its settlement suffix on the way to a
    // Pairlens pair, so it looks exactly like a listed spot pair.
    const row = parseCcxtBulkTickerRow('WAL/USD:USD', {
      last: 0.4,
      percentage: 2,
    })
    expect(row?.symbol).toBe('WAL-USD')
  })

  it('passes the tickers through untouched when no market table is loaded yet', async () => {
    const Patched = patchCryptocom(FakeCryptocom)
    const exchange = new Patched({})
    exchange.markets = undefined
    expect(Object.keys(await exchange.fetchTickers())).toHaveLength(2)
  })
})

describe('cryptocom urls', () => {
  it('points every REST section at production, whatever the mode', () => {
    const exchange = { urls: { api: { base: '', v1: '', v2: '' } } }
    cryptocomCcxtVenue.applyUrls?.(
      exchange as unknown as Parameters<
        NonNullable<typeof cryptocomCcxtVenue.applyUrls>
      >[0],
      '',
      PUBLIC_CTX,
    )
    expect(exchange.urls.api).toEqual({
      base: 'https://api.crypto.com',
      v1: 'https://api.crypto.com/exchange/v1',
      v2: 'https://api.crypto.com/v2',
    })
  })

  it('keeps the UAT sandbox opt-in, so paper charts still read the real market', () => {
    const exchange = {
      urls: { api: { base: 'https://api.crypto.com', v1: '', v2: '', ws: {} } },
    }
    applyCryptocomPaperUrls(exchange)
    expect(exchange.urls.api.base).toBe('https://uat-api.3ona.co')
    expect(exchange.urls.api.ws).toEqual({
      public: 'wss://uat-stream.3ona.co/exchange/v1/market',
      private: 'wss://uat-stream.3ona.co/exchange/v1/user',
    })
  })
})

describe('cryptocom venue config', () => {
  it('caps a page at the 300 candles the endpoint serves', () => {
    expect(cryptocomCcxtVenue.maxHistoryLimit).toBe(300)
  })

  it('nudges the inclusive `end_ts` cursor', () => {
    expect(cryptocomCcxtVenue.historyPageParams?.(1_700_000_000_000)).toEqual({
      until: 1_699_999_999_999,
    })
  })

  it('keeps 2h (served, absent from ccxt s table) and not 3d (not served)', () => {
    expect(cryptocomCcxtVenue.timeframeOverrides?.['2h']).toBe('2h')
    expect(cryptocomCcxtVenue.timeframeOverrides?.['3d']).toBe(undefined)
    expect(CRYPTOCOM_ADAPTER_INFO.supportedTimeframes).not.toContain('3d')
  })

  it('synthesizes the underscore market id a cold profile needs to subscribe', () => {
    expect(cryptocomCcxtVenue.synthesizeMarket?.('BTC-USDT')).toMatchObject({
      id: 'BTC_USDT',
      symbol: 'BTC/USDT',
      spot: true,
    })
  })
})
