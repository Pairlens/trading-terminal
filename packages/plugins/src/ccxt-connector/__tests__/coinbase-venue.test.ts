// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinbase's identity has to be byte-identical to the native connector's — the
 * plugin id is what credential provisioning derives
 * (`${market}-market-connector`) and the manifest is the only thing the
 * terminal reads to decide a venue exists, what it is called and whether it is
 * desktop-only. Everything else here is the venue's two measured quirks: the
 * REST candle window, and the inverted trade side.
 */

import { describe, expect, it } from 'bun:test'
import {
  COINBASE_HISTORY_FOLD,
  coinbaseCandleWindow,
  coinbaseCcxtVenue,
  coinbaseLiveSource,
  coinbaseMarketConnectorManifest,
} from '../venues/coinbase'
import { invertTradeSides } from '../coinbase-trade-side'

describe('coinbase manifest parity', () => {
  const manifest = coinbaseMarketConnectorManifest

  it('keeps the native identity', () => {
    expect(manifest.id).toBe('coinbase-market-connector')
    expect(manifest.name).toBe('Coinbase Market Connector')
    expect(manifest.description).toBe(
      'Direct market data and trading via Coinbase Advanced Trade APIs',
    )
    expect(manifest.metadata?.['abbr']).toBe('CB')
    expect(manifest.metadata?.['gradient']).toBe('from-blue-500 to-indigo-600')
    expect(manifest.metadata?.['requiresDesktop']).toBe(true)
    expect(manifest.metadata?.['triggerOrders']).toBe(true)
  })

  it('declares the venue capabilities the terminal scopes by market', () => {
    const byId = new Map(manifest.capabilities.map((c) => [c.id, c]))
    expect(byId.get('market-data:candles')?.markets).toEqual(['coinbase'])
    expect(byId.get('market-data:trades')?.streaming).toBe(true)
    // The bulk snapshot serves the whole app, behind first-party providers.
    expect(byId.get('market-data:ticker-snapshot')?.markets).toEqual(['*'])
    expect(byId.get('market-data:ticker-snapshot')?.priority).toBe(20)
    expect(byId.has('market-data:discovery')).toBe(false)
  })

  it('refuses in a CORS-constrained browser at the spec level too', () => {
    expect(coinbaseCcxtVenue.requiresDesktop).toBe(true)
  })
})

describe('coinbase candles', () => {
  it('has no candle channel, so every timeframe rides the tape', () => {
    expect(coinbaseLiveSource().kind).toBe('trades')
  })

  it('folds the two timeframes the venue does not serve', () => {
    expect(COINBASE_HISTORY_FOLD).toEqual({ '4h': '1h', '1w': '1d' })
  })

  it('sizes the REST window from the timeframe, in seconds', () => {
    const endTs = Date.UTC(2026, 7, 10, 12)
    const window = coinbaseCandleWindow('1h', 300, endTs)
    const start = Number(window['start'])
    const end = Number(window['end'])
    // Exclusive by a second: the venue returns the bar sitting on the cursor,
    // and one duplicated boundary bar latches `exhausted` for the session.
    expect(end).toBe(endTs / 1000 - 1)
    expect(end - start).toBe(3600 * 301)
  })

  it('never inverts the window, which the venue answers with a 400', () => {
    for (const timeframe of ['1m', '5m', '15m', '30m', '1h', '2h', '1d']) {
      const w = coinbaseCandleWindow(timeframe, 300, Date.UTC(2020, 0, 1))
      expect(Number(w['start'])).toBeLessThan(Number(w['end']))
    }
  })

  it('reads recent history when no cursor is given', () => {
    const window = coinbaseCandleWindow('1m', 300)
    expect(Number(window['end'])).toBeGreaterThan(Date.now() / 1000 - 5)
  })
})

describe('coinbase market ids', () => {
  it('synthesizes BASE-QUOTE, which is what the venue uses', () => {
    expect(coinbaseCcxtVenue.synthesizeMarket?.('BTC-USDT')).toMatchObject({
      id: 'BTC-USDT',
      symbol: 'BTC/USDT',
      base: 'BTC',
      quote: 'USDT',
      spot: true,
    })
  })
})

describe('coinbase trade side', () => {
  it('inverts the maker side into the aggressor', () => {
    const frame = {
      type: 'update',
      trades: [
        { id: '1', price: 100, size: 1, side: 'buy', ts: 1 },
        { id: '2', price: 100, size: 1, side: 'sell', ts: 2 },
      ],
    }
    expect(invertTradeSides(frame)).toEqual({
      type: 'update',
      trades: [
        { id: '1', price: 100, size: 1, side: 'sell', ts: 1 },
        { id: '2', price: 100, size: 1, side: 'buy', ts: 2 },
      ],
    })
  })

  it('leaves a frame that carries no trades untouched', () => {
    const frame = { type: 'snapshot', candles: [] }
    expect(invertTradeSides(frame)).toBe(frame)
    expect(invertTradeSides(null)).toBeNull()
  })
})
