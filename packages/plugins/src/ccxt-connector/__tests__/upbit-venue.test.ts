// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Upbit's two ways to be silently wrong: a market id built the usual way round
 * (its ids are QUOTE-BASE) and a host left on ccxt's Korean default, which is a
 * different exchange with a different market list. Both are asserted here,
 * along with the manifest identity and the timeframes that need folding.
 */

import { describe, expect, it } from 'bun:test'
import {
  UPBIT_HISTORY_FOLD,
  upbitCcxtVenue,
  upbitLiveSource,
  upbitMarketConnectorManifest,
} from '../venues/upbit'
import {
  resolveUpbitHost,
  resolveUpbitQuoteCurrencies,
} from '../venues/upbit-regions'
import { scaleSnapshotChange, scaleTickerChange } from '../upbit-change-percent'
import { fromCcxtSymbol, toCcxtSymbol } from '../parser'
import { assertTickerConformant } from '../../test-utils/conformance'
import { PUBLIC_CTX } from './url-context'
import type { CcxtExchangeLike } from '../types'
import type { TickerSnapshot } from '@pairlens/market-engine/types'

describe('upbit manifest parity', () => {
  const manifest = upbitMarketConnectorManifest

  it('keeps the native identity, including the display name', () => {
    expect(manifest.id).toBe('upbit-market-connector')
    expect(manifest.name).toBe('Upbit Market Connector')
    // 'Upbit Global' is what the store card reads; the terminal's venue label
    // comes from `name` minus the suffix, so the two differ on purpose.
    expect(manifest.description).toContain('Upbit Global')
    expect(manifest.metadata?.['abbr']).toBe('UPB')
    expect(manifest.metadata?.['gradient']).toBe('from-blue-500 to-blue-700')
  })

  it('advertises no trigger orders, because the venue has none at all', () => {
    expect(manifest.metadata?.['triggerOrders']).toBeUndefined()
  })

  it('is not desktop-gated — every regional host is CORS-open', () => {
    expect(manifest.metadata?.['requiresDesktop']).toBeUndefined()
    expect(upbitCcxtVenue.requiresDesktop).toBeUndefined()
  })
})

describe('upbit market ids are reversed', () => {
  it('synthesizes QUOTE-BASE while keeping the unified symbol BASE/QUOTE', () => {
    const market = upbitCcxtVenue.synthesizeMarket?.('BTC-USDT')
    expect(market).toMatchObject({
      id: 'USDT-BTC',
      symbol: 'BTC/USDT',
      base: 'BTC',
      quote: 'USDT',
      baseId: 'BTC',
      quoteId: 'USDT',
    })
  })

  it('round-trips the app pair through the ccxt symbol both ways', () => {
    const market = upbitCcxtVenue.synthesizeMarket?.('ETH-SGD')
    expect(market?.symbol).toBe(toCcxtSymbol('ETH-SGD'))
    expect(fromCcxtSymbol(market?.symbol ?? '')).toBe('ETH-SGD')
    // The reversal must not leak into the app-facing pair.
    expect(fromCcxtSymbol('SGD/ETH')).not.toBe('ETH-SGD')
  })
})

describe('upbit regional routing', () => {
  it('never leaves ccxt on the Korean host', () => {
    expect(resolveUpbitHost('')).toBe('sg-api.upbit.com')
    expect(resolveUpbitHost('sg')).toBe('sg-api.upbit.com')
    expect(resolveUpbitHost('ID')).toBe('id-api.upbit.com')
    expect(resolveUpbitHost('th')).toBe('th-api.upbit.com')
    expect(resolveUpbitHost('KR')).toBe('sg-api.upbit.com')
  })

  it('moves REST and the socket together through `hostname`', () => {
    const exchange = {
      hostname: 'api.upbit.com',
      urls: { api: {} },
    } as unknown as CcxtExchangeLike
    upbitCcxtVenue.applyUrls?.(exchange, 'ID', PUBLIC_CTX)
    expect(exchange.hostname).toBe('id-api.upbit.com')
  })

  it('keeps the region quote contract the native encodes', () => {
    expect(resolveUpbitQuoteCurrencies('ID')).toEqual(['IDR', 'BTC', 'USDT'])
    expect(resolveUpbitQuoteCurrencies('TH')).toEqual(['THB', 'BTC', 'USDT'])
    expect(resolveUpbitQuoteCurrencies('')).toEqual(['SGD', 'BTC', 'USDT'])
  })
})

describe('upbit candles', () => {
  it('takes every timeframe off the tape — watchOHLCV only does 1s', () => {
    expect(upbitLiveSource().kind).toBe('trades')
  })

  it('folds 2h, the one terminal timeframe the minutes endpoint lacks', () => {
    expect(UPBIT_HISTORY_FOLD).toEqual({ '2h': '1h' })
  })

  it('pages with an ISO cursor nudged off the inclusive boundary', () => {
    const endTs = Date.UTC(2026, 7, 10, 12)
    const params = upbitCcxtVenue.historyPageParams?.(endTs) ?? {}
    expect(params['to']).toBe(new Date(endTs - 1).toISOString())
  })

  it('asks for no more than the 200 the count parameter allows', () => {
    expect(upbitCcxtVenue.maxHistoryLimit).toBe(200)
  })
})

describe('upbit 24h change is a rate until we scale it', () => {
  it('turns the streamed fraction into a percent', () => {
    // Measured live: 0.0166674566 for a +1.67% move.
    const ticker: TickerSnapshot = {
      last: 64352,
      bid: 64350,
      ask: 64355,
      high24h: 64535,
      low24h: 63000,
      volume24h: 12,
      change24h: 0.0166674566,
      ts: Date.now(),
    }
    const scaled = scaleTickerChange({ type: 'ticker', ticker }) as {
      ticker: TickerSnapshot
    }
    expect(scaled.ticker.change24h).toBeCloseTo(1.66674566, 6)
    assertTickerConformant(scaled.ticker, 'upbit ticker')
  })

  it('scales every row of the bulk snapshot', () => {
    const snapshot = {
      market: 'upbit',
      ts: 1,
      tickers: [
        { symbol: 'BTC-SGD', price: 83370, change24h: -0.001640581 },
        { symbol: 'ETH-SGD', price: 2400, change24h: -0.0239934933 },
      ],
    }
    const scaled = scaleSnapshotChange(snapshot) as typeof snapshot
    expect(scaled.tickers[0]?.change24h).toBeCloseTo(-0.1640581, 6)
    expect(scaled.tickers[1]?.change24h).toBeCloseTo(-2.39934933, 6)
    expect(scaled.market).toBe('upbit')
  })

  it('leaves a payload it does not recognise alone', () => {
    const frame = { type: 'ticker' }
    expect(scaleTickerChange(frame)).toBe(frame)
    expect(scaleSnapshotChange(null)).toBeNull()
  })
})
