// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  assertCandleConformant,
  assertOrderbookConformant,
  assertTickerConformant,
} from '../../test-utils/conformance'
import {
  mapOkxChannelToTimeframe,
  mapTimeframeToOkxBar,
  mapTimeframeToOkxChannel,
  normalizePair,
  parseOkxBookLevels,
  parseOkxCandleRow,
  parseOkxTicker,
} from '../parser'

// Real OKX WS/REST candle row shape:
// [ts(ms), o, h, l, c, vol, volCcy, volCcyQuote, confirm]
const OKX_CANDLE_CLOSED = [
  '1700000000000',
  '42000.1',
  '42100.5',
  '41950.0',
  '42050.2',
  '123.45',
  '5187654.3',
  '5187654.3',
  '1',
]
const OKX_CANDLE_OPEN = [...OKX_CANDLE_CLOSED.slice(0, 8), '0']

// Real OKX tickers channel payload (subset of fields the parser reads).
const OKX_TICKER = {
  last: '42050.2',
  bidPx: '42050.0',
  askPx: '42050.5',
  high24h: '42500',
  low24h: '41000',
  vol24h: '123456',
  sodUtc0: '40000',
  ts: '1700000000000',
}

describe('okx parser — pair & timeframe mapping', () => {
  it('normalizes pairs to OKX format', () => {
    expect(normalizePair('btc/usdt')).toBe('BTC-USDT')
    expect(normalizePair('eth_usdt')).toBe('ETH-USDT')
  })

  it('maps timeframes to OKX bars and channels, round-tripping', () => {
    expect(mapTimeframeToOkxBar('1h')).toBe('1H')
    expect(mapTimeframeToOkxChannel('4h')).toBe('candle4H')
    expect(mapOkxChannelToTimeframe('candle1H')).toBe('1h')
    expect(mapTimeframeToOkxBar('3s')).toBeNull()
  })
})

describe('okx parser — candles', () => {
  it('parses a closed candle with correct values', () => {
    const result = parseOkxCandleRow(OKX_CANDLE_CLOSED)
    expect(result).not.toBeNull()
    const [candle, isClosed] = result!
    expect(candle).toEqual({
      ts: 1700000000000,
      open: 42000.1,
      high: 42100.5,
      low: 41950.0,
      close: 42050.2,
      volume: 123.45,
    })
    expect(isClosed).toBe(true)
    assertCandleConformant(candle)
  })

  it('reports an unconfirmed (in-progress) candle as not closed', () => {
    const [, isClosed] = parseOkxCandleRow(OKX_CANDLE_OPEN)!
    expect(isClosed).toBe(false)
  })

  it('returns null on short or non-numeric rows', () => {
    expect(parseOkxCandleRow(['1700000000000', '42000'])).toBeNull()
    expect(parseOkxCandleRow(['x', 'y', 'z', 'a', 'b', 'c'])).toBeNull()
  })
})

describe('okx parser — ticker', () => {
  it('maps fields and computes change24h as a percent', () => {
    const t = parseOkxTicker(OKX_TICKER)
    expect(t.last).toBe(42050.2)
    expect(t.bid).toBe(42050.0)
    expect(t.ask).toBe(42050.5)
    // (42050.2 - 40000) / 40000 * 100
    expect(t.change24h).toBeCloseTo(5.1255, 3)
    assertTickerConformant(t)
  })
})

describe('okx parser — orderbook', () => {
  it('parses [price, size] levels as numbers', () => {
    const bids = parseOkxBookLevels([
      ['42050.0', '1.5', '0', '2'],
      ['42049.5', '0.8', '0', '1'],
    ])
    const asks = parseOkxBookLevels([['42051.0', '2.1', '0', '3']])
    expect(bids[0]).toEqual([42050.0, 1.5])
    assertOrderbookConformant(bids, asks)
  })
})
