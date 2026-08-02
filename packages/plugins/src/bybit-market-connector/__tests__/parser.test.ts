// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  assertCandleConformant,
  assertOrderbookConformant,
  assertTickerConformant,
} from '../../test-utils/conformance'
import {
  buildKlineTopic,
  mapBybitIntervalToTimeframe,
  mapTimeframeToBybitInterval,
  normalizePair,
  parseBybitBookLevels,
  parseBybitRestKline,
  parseBybitTicker,
  parseBybitWsKline,
  parseKlineTopic,
} from '../parser'

// Real ByBit WS kline entry (epoch-ms `start`).
const BYBIT_WS_KLINE = {
  start: 1700000000000,
  open: '42000.00',
  high: '42100.00',
  low: '41950.00',
  close: '42050.00',
  volume: '123.4',
  confirm: true,
}

// Real ByBit REST kline row: [startTime(ms), o, h, l, c, v, turnover]
const BYBIT_REST_KLINE = [
  '1700000000000',
  '42000.00',
  '42100.00',
  '41950.00',
  '42050.00',
  '123.4',
  '5187654.3',
]

// Real ByBit tickers payload: price24hPcnt is a FRACTION (0.0512 => 5.12%).
const BYBIT_TICKER = {
  lastPrice: '42050.00',
  bid1Price: '42049.00',
  ask1Price: '42051.00',
  highPrice24h: '42500.00',
  lowPrice24h: '41000.00',
  volume24h: '123456',
  price24hPcnt: '0.0512',
}

describe('bybit parser — timeframe & topic mapping', () => {
  it('maps timeframes both ways', () => {
    expect(mapTimeframeToBybitInterval('1h')).toBe('60')
    expect(mapBybitIntervalToTimeframe('60')).toBe('1h')
    expect(mapTimeframeToBybitInterval('3s')).toBeNull()
  })

  it('builds and parses kline topics', () => {
    expect(buildKlineTopic('BTC-USDT', '1h')).toBe('kline.60.BTCUSDT')
    expect(parseKlineTopic('kline.60.BTCUSDT')).toEqual(['60', 'BTCUSDT'])
    expect(parseKlineTopic('tickers.BTCUSDT')).toBeNull()
    expect(normalizePair('btc/usdt')).toBe('BTCUSDT')
  })
})

describe('bybit parser — candles', () => {
  it('parses a WS kline with confirm flag', () => {
    const result = parseBybitWsKline(BYBIT_WS_KLINE)
    expect(result).not.toBeNull()
    const [candle, isClosed] = result!
    expect(candle).toEqual({
      ts: 1700000000000,
      open: 42000,
      high: 42100,
      low: 41950,
      close: 42050,
      volume: 123.4,
    })
    expect(isClosed).toBe(true)
    assertCandleConformant(candle)
  })

  it('parses a REST kline row', () => {
    const candle = parseBybitRestKline(BYBIT_REST_KLINE)
    expect(candle).not.toBeNull()
    expect(candle!.ts).toBe(1700000000000)
    assertCandleConformant(candle!)
  })

  it('returns null on malformed input', () => {
    expect(parseBybitWsKline({ start: 'x' })).toBeNull()
    expect(parseBybitRestKline(['1700000000000', '42000'])).toBeNull()
  })
})

describe('bybit parser — ticker', () => {
  it('scales price24hPcnt fraction to a percent (0.0512 => 5.12)', () => {
    const t = parseBybitTicker(BYBIT_TICKER)
    expect(t.last).toBe(42050)
    expect(t.bid).toBe(42049)
    expect(t.ask).toBe(42051)
    expect(t.change24h).toBeCloseTo(5.12, 5)
    assertTickerConformant(t)
  })
})

describe('bybit parser — orderbook', () => {
  it('parses [price, size] levels as numbers', () => {
    const bids = parseBybitBookLevels([
      ['42049.00', '1.2'],
      ['42048.50', '0.5'],
    ])
    const asks = parseBybitBookLevels([['42051.00', '2.1']])
    expect(bids[0]).toEqual([42049, 1.2])
    assertOrderbookConformant(bids, asks)
  })
})
