// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  assertCandleConformant,
  assertOrderbookConformant,
  assertTickerConformant,
} from '../../test-utils/conformance'
import {
  buildKlineStream,
  mapTimeframeToBinanceInterval,
  normalizePair,
  parseBinanceBookLevels,
  parseBinanceRestKline,
  parseBinanceTicker,
  parseBinanceWsKline,
  toStreamSymbol,
} from '../parser'

// Real Binance WS kline `k` object (epoch-ms `t`).
const BINANCE_WS_KLINE = {
  t: 1700000000000,
  o: '42000.00',
  h: '42100.00',
  l: '41950.00',
  c: '42050.00',
  v: '123.4',
  x: true,
  i: '1h',
}

// Real Binance REST kline row: [openTime(ms), o, h, l, c, v, closeTime, ...]
const BINANCE_REST_KLINE = [
  1700000000000,
  '42000.00',
  '42100.00',
  '41950.00',
  '42050.00',
  '123.4',
  1700003599999,
  '5187654.3',
]

// Real Binance 24hr ticker payload (P is already a percent).
const BINANCE_TICKER = {
  c: '42050.00',
  b: '42049.00',
  a: '42051.00',
  h: '42500.00',
  l: '41000.00',
  v: '123456',
  P: '5.12',
}

describe('binance parser — pair & timeframe mapping', () => {
  it('normalizes pairs and stream symbols', () => {
    expect(normalizePair('btc-usdt')).toBe('BTCUSDT')
    expect(toStreamSymbol('BTC-USDT')).toBe('btcusdt')
  })

  it('maps timeframes and builds kline stream names', () => {
    expect(mapTimeframeToBinanceInterval('1h')).toBe('1h')
    expect(buildKlineStream('BTC-USDT', '1h')).toBe('btcusdt@kline_1h')
    expect(buildKlineStream('BTC-USDT', '3s')).toBeNull()
  })
})

describe('binance parser — candles', () => {
  it('parses a WS kline with values, close flag, and interval', () => {
    const result = parseBinanceWsKline(BINANCE_WS_KLINE)
    expect(result).not.toBeNull()
    const [candle, isClosed, interval] = result!
    expect(candle).toEqual({
      ts: 1700000000000,
      open: 42000,
      high: 42100,
      low: 41950,
      close: 42050,
      volume: 123.4,
    })
    expect(isClosed).toBe(true)
    expect(interval).toBe('1h')
    assertCandleConformant(candle)
  })

  it('parses a REST kline row', () => {
    const candle = parseBinanceRestKline(BINANCE_REST_KLINE)
    expect(candle).not.toBeNull()
    expect(candle!.ts).toBe(1700000000000)
    expect(candle!.close).toBe(42050)
    assertCandleConformant(candle!)
  })

  it('returns null on malformed input', () => {
    expect(parseBinanceWsKline({ t: 'x', o: 'y' })).toBeNull()
    expect(parseBinanceRestKline([1700000000000, '42000'])).toBeNull()
  })
})

describe('binance parser — ticker', () => {
  it('maps fields; P is consumed as a percent (no extra scaling)', () => {
    const t = parseBinanceTicker(BINANCE_TICKER)
    expect(t.last).toBe(42050)
    expect(t.bid).toBe(42049)
    expect(t.ask).toBe(42051)
    expect(t.change24h).toBe(5.12)
    assertTickerConformant(t)
  })
})

describe('binance parser — orderbook', () => {
  it('parses bid/ask levels as numbers', () => {
    const bids = parseBinanceBookLevels([
      ['42049.00', '1.2'],
      ['42048.50', '0.5'],
    ])
    const asks = parseBinanceBookLevels([['42051.00', '2.1']])
    expect(bids[0]).toEqual([42049, 1.2])
    assertOrderbookConformant(bids, asks)
  })
})
