// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Aggressor-side conformance across every venue that declares
// `market-data:trades`.
//
// The whole point of Trade.side is that it means the TAKER — the side that
// crossed the spread. Venues report this differently and a wrong mapping
// inverts an entire tape without failing loudly, so the mapping is pinned
// here per venue against real wire payloads rather than left to the
// individual parser suites.
import { describe, expect, it } from 'bun:test'
import { parseOkxTrade } from '../okx-market-connector/parser'
import {
  buildTradeStream,
  parseBinanceTrade,
} from '../binance-market-connector/parser'

describe('OKX trade parsing', () => {
  // Real frame from the `trades` channel.
  const raw = {
    instId: 'BTC-USDT',
    tradeId: '130639474',
    px: '42219.9',
    sz: '0.12060306',
    side: 'buy',
    ts: '1629386781174',
  }

  it('maps a row onto the normalized shape', () => {
    expect(parseOkxTrade(raw)).toEqual({
      id: '130639474',
      price: 42219.9,
      size: 0.12060306,
      side: 'buy',
      ts: 1629386781174,
    })
  })

  it('passes OKX side straight through — it already reports the taker', () => {
    expect(parseOkxTrade({ ...raw, side: 'buy' })?.side).toBe('buy')
    expect(parseOkxTrade({ ...raw, side: 'sell' })?.side).toBe('sell')
  })

  it('drops rows with no id, since dedupe across reconnects needs one', () => {
    expect(parseOkxTrade({ ...raw, tradeId: '' })).toBeNull()
  })

  it('drops non-positive price or size rather than printing a zero', () => {
    expect(parseOkxTrade({ ...raw, px: '0' })).toBeNull()
    expect(parseOkxTrade({ ...raw, sz: '0' })).toBeNull()
    expect(parseOkxTrade({ ...raw, px: 'not-a-number' })).toBeNull()
  })

  it('drops an unrecognized side rather than guessing one', () => {
    expect(parseOkxTrade({ ...raw, side: '' })).toBeNull()
    expect(parseOkxTrade({ ...raw, side: 'unknown' })).toBeNull()
  })

  it('falls back to now when the venue timestamp is unusable', () => {
    const before = Date.now()
    const parsed = parseOkxTrade({ ...raw, ts: '' })
    expect(parsed?.ts).toBeGreaterThanOrEqual(before)
  })
})

describe('Binance trade parsing', () => {
  // Real `@trade` payload. `m` is "was the BUYER the maker?".
  const raw = {
    e: 'trade',
    E: 1672515782136,
    s: 'BNBBTC',
    t: 12345,
    p: '0.001',
    q: '100',
    T: 1672515782136,
    m: true,
    M: true,
  }

  it('maps a frame onto the normalized shape', () => {
    expect(parseBinanceTrade(raw)).toEqual({
      id: '12345',
      price: 0.001,
      size: 100,
      side: 'sell',
      ts: 1672515782136,
    })
  })

  it('INVERTS m — buyer-is-maker means the seller was the aggressor', () => {
    // The single most important assertion in this file: reading `m` as the
    // aggressor directly flips every print in the tape.
    expect(parseBinanceTrade({ ...raw, m: true })?.side).toBe('sell')
    expect(parseBinanceTrade({ ...raw, m: false })?.side).toBe('buy')
  })

  it('drops a frame with no maker flag rather than defaulting a side', () => {
    const { m: _m, ...noFlag } = raw
    expect(parseBinanceTrade(noFlag)).toBeNull()
    expect(parseBinanceTrade({ ...raw, m: 'true' })).toBeNull()
  })

  it('accepts trade id 0, which is falsy but valid', () => {
    expect(parseBinanceTrade({ ...raw, t: 0 })?.id).toBe('0')
  })

  it('drops non-positive price or size', () => {
    expect(parseBinanceTrade({ ...raw, p: '0' })).toBeNull()
    expect(parseBinanceTrade({ ...raw, q: '0' })).toBeNull()
  })

  it('builds the raw trade stream name', () => {
    expect(buildTradeStream('BTC-USDT')).toBe('btcusdt@trade')
  })

  it('builds a stream name that cannot collide with ticker or kline routing', () => {
    // ws-client routes by substring, so '@trade' must not contain the other
    // suffixes and vice versa.
    const stream = buildTradeStream('BTC-USDT')
    expect(stream.includes('@ticker')).toBe(false)
    expect(stream.includes('@kline_')).toBe(false)
    expect(stream.includes('@depth')).toBe(false)
  })
})

describe('cross-venue normalization', () => {
  it('agrees on the meaning of side for the same economic event', () => {
    // A market BUY lifting a resting ask, as each venue reports it.
    const okx = parseOkxTrade({
      instId: 'BTC-USDT',
      tradeId: '1',
      px: '100',
      sz: '1',
      side: 'buy',
      ts: '1700000000000',
    })
    const binance = parseBinanceTrade({
      e: 'trade',
      s: 'BTCUSDT',
      t: 1,
      p: '100',
      q: '1',
      T: 1700000000000,
      m: false, // buyer was the taker
    })
    expect(okx?.side).toBe('buy')
    expect(binance?.side).toBe('buy')
    expect(okx).toEqual(binance!)
  })
})
