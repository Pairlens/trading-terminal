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
import { parseCoinbaseTrade } from '../coinbase-market-connector/parser'
import { parseBybitTrade } from '../bybit-market-connector/parser'
import { parseKrakenTrade } from '../kraken-market-connector/parser'
import { parseKucoinTrade } from '../kucoin-market-connector/parser'
import { parseGateTrade } from '../gate-market-connector/parser'
import { parseBitgetTrade } from '../bitget-market-connector/parser'
import { parseHtxTrade } from '../htx-market-connector/parser'
import { parseCryptocomTrade } from '../cryptocom-market-connector/parser'
import { parseBfxTrade } from '../bitfinex-market-connector/parser'
import { parseBitvavoTrade } from '../bitvavo-market-connector/parser'
import { parseUpbitTrade } from '../upbit-market-connector/parser'

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

// ── Every other venue, against payloads captured from its live socket ────
//
// Each `side` assertion below is a MEASURED fact, not a reading of docs. The
// mapping was established by correlating live prints against top-of-book
// through the real connectors (prints at the ask are buys, at the bid are
// sells), with OKX and Binance as controls. Coinbase is the one venue that
// reports the MAKER, which is exactly what that exercise caught: 11% agreement
// before the inversion, 87% after, against 99% for the controls in the same
// run. Change a mapping here only with fresh measurement.

describe('Coinbase trade parsing', () => {
  const raw = {
    product_id: 'BTC-USD',
    trade_id: '1066323241',
    price: '63668.64',
    size: '0.00000004',
    time: '2026-08-03T21:26:18.003202Z',
    side: 'BUY',
  }

  it('INVERTS side — Coinbase reports the maker, not the taker', () => {
    // The single highest-risk assertion in the file: reading Coinbase's side
    // directly mislabels ~90% of the tape.
    expect(parseCoinbaseTrade({ ...raw, side: 'BUY' })?.side).toBe('sell')
    expect(parseCoinbaseTrade({ ...raw, side: 'SELL' })?.side).toBe('buy')
  })

  it('parses the ISO-8601 timestamp rather than expecting epoch-ms', () => {
    expect(parseCoinbaseTrade(raw)?.ts).toBe(
      Date.parse('2026-08-03T21:26:18.003202Z'),
    )
  })

  it('drops rows with an unusable price, size, or side', () => {
    expect(parseCoinbaseTrade({ ...raw, price: '0' })).toBeNull()
    expect(parseCoinbaseTrade({ ...raw, size: '0' })).toBeNull()
    expect(parseCoinbaseTrade({ ...raw, side: '' })).toBeNull()
    expect(parseCoinbaseTrade({ ...raw, trade_id: '' })).toBeNull()
  })
})

describe('ByBit trade parsing', () => {
  const raw = {
    i: '2290000001187102996',
    T: 1785792380594,
    p: '63729.8',
    v: '0.000019',
    S: 'Sell',
    s: 'BTCUSDT',
  }

  it('lowercases the title-cased taker side', () => {
    expect(parseBybitTrade(raw)).toEqual({
      id: '2290000001187102996',
      price: 63729.8,
      size: 0.000019,
      side: 'sell',
      ts: 1785792380594,
    })
    expect(parseBybitTrade({ ...raw, S: 'Buy' })?.side).toBe('buy')
  })

  it('drops an unrecognized side', () => {
    expect(parseBybitTrade({ ...raw, S: 'Unknown' })).toBeNull()
  })
})

describe('Kraken trade parsing', () => {
  const raw = {
    symbol: 'BTC/USD',
    side: 'buy',
    price: 63669.7,
    qty: 0.00039266,
    ord_type: 'market',
    trade_id: 104698144,
    timestamp: '2026-08-03T21:27:11.202953Z',
  }

  it('handles JSON numbers and an ISO timestamp', () => {
    expect(parseKrakenTrade(raw)).toEqual({
      id: '104698144',
      price: 63669.7,
      size: 0.00039266,
      side: 'buy',
      ts: Date.parse('2026-08-03T21:27:11.202953Z'),
    })
  })

  it('takes the taker side directly', () => {
    expect(parseKrakenTrade({ ...raw, side: 'sell' })?.side).toBe('sell')
  })
})

describe('KuCoin trade parsing', () => {
  const raw = {
    makerOrderId: '6a710820719e5e0007172230',
    price: '63709.4',
    sequence: '23804295948025856',
    side: 'sell',
    size: '0.00001894',
    symbol: 'BTC-USDT',
    takerOrderId: '6a71082366d78900072ebf14',
    time: '1785792547705000000',
    tradeId: '23804295948025856',
    type: 'match',
  }

  it('converts nanosecond timestamps to milliseconds', () => {
    // Reading `time` as ms would put every print ~50,000 years in the future.
    const parsed = parseKucoinTrade(raw)
    expect(parsed?.ts).toBe(1785792547705)
    expect(parsed?.side).toBe('sell')
  })
})

describe('Gate trade parsing', () => {
  const raw = {
    id: 214400578,
    create_time: 1785792388,
    create_time_ms: '1785792388267.293000',
    side: 'sell',
    currency_pair: 'BTC_USDT',
    amount: '0.000156',
    price: '63731.5',
  }

  it('truncates the fractional-millisecond string timestamp', () => {
    expect(parseGateTrade(raw)).toEqual({
      id: '214400578',
      price: 63731.5,
      size: 0.000156,
      side: 'sell',
      ts: 1785792388267,
    })
  })
})

describe('Bitget trade parsing', () => {
  const raw = {
    ts: '1785792388208',
    price: '63734.38',
    size: '0.00215',
    side: 'sell',
    tradeId: '1468285185034010628',
  }

  it('maps a row onto the normalized shape', () => {
    expect(parseBitgetTrade(raw)).toEqual({
      id: '1468285185034010628',
      price: 63734.38,
      size: 0.00215,
      side: 'sell',
      ts: 1785792388208,
    })
  })
})

describe('HTX trade parsing', () => {
  const raw = {
    id: '1923390356301657433726452764',
    ts: 1785792532579,
    tradeId: 103627129980,
    amount: 9.99e-4,
    price: 63711.79,
    direction: 'sell',
  }

  it('reads scientific-notation amounts and the taker direction', () => {
    expect(parseHtxTrade(raw)).toEqual({
      id: '103627129980',
      price: 63711.79,
      size: 0.000999,
      side: 'sell',
      ts: 1785792532579,
    })
  })
})

describe('Crypto.com trade parsing', () => {
  const raw = {
    d: '1785792397502162053',
    t: 1785792397502,
    p: '63726.03',
    q: '0.02350',
    s: 'SELL',
    i: 'BTC_USDT',
  }

  it('lowercases the uppercase taker side', () => {
    expect(parseCryptocomTrade(raw)).toEqual({
      id: '1785792397502162053',
      price: 63726.03,
      size: 0.0235,
      side: 'sell',
      ts: 1785792397502,
    })
    expect(parseCryptocomTrade({ ...raw, s: 'BUY' })?.side).toBe('buy')
  })
})

describe('Bitfinex trade parsing', () => {
  // [ID, MTS, AMOUNT, PRICE] — the sign of AMOUNT is the only side signal.
  it('reads side from the sign of amount and size from its magnitude', () => {
    expect(
      parseBfxTrade([1954452436, 1785792394726, -0.00392745, 63757]),
    ).toEqual({
      id: '1954452436',
      price: 63757,
      size: 0.00392745,
      side: 'sell',
      ts: 1785792394726,
    })
    expect(
      parseBfxTrade([1954452426, 1785792371631, 0.00019624, 63767]),
    ).toEqual({
      id: '1954452426',
      price: 63767,
      size: 0.00019624,
      side: 'buy',
      ts: 1785792371631,
    })
  })

  it('drops a zero-amount row, which carries no side at all', () => {
    expect(parseBfxTrade([1, 1785792371631, 0, 63767])).toBeNull()
  })

  it('drops a malformed tuple', () => {
    expect(parseBfxTrade([1, 2] as unknown as Array<number>)).toBeNull()
  })
})

describe('Bitvavo trade parsing', () => {
  const raw = {
    event: 'trade',
    id: '00000000-0000-0431-0000-0000036275c9',
    amount: '0.00045068',
    price: '55316',
    timestamp: 1785792508187,
    market: 'BTC-EUR',
    side: 'buy',
  }

  it('maps a row onto the normalized shape', () => {
    expect(parseBitvavoTrade(raw)).toEqual({
      id: '00000000-0000-0431-0000-0000036275c9',
      price: 55316,
      size: 0.00045068,
      side: 'buy',
      ts: 1785792508187,
    })
  })
})

describe('Upbit trade parsing', () => {
  const raw = {
    type: 'trade',
    code: 'KRW-BTC',
    trade_timestamp: 1785792512585,
    trade_price: 90630000,
    trade_volume: 0.00055169,
    ask_bid: 'BID',
    sequential_id: 17857925125850000,
    best_ask_price: 90630000,
    best_bid_price: 90554000,
  }

  it('maps BID to a buy — the taker lifted the ask', () => {
    // Self-evident from this very payload: trade_price === best_ask_price.
    expect(parseUpbitTrade(raw)).toEqual({
      id: '17857925125850000',
      price: 90630000,
      size: 0.00055169,
      side: 'buy',
      ts: 1785792512585,
    })
    expect(parseUpbitTrade({ ...raw, ask_bid: 'ASK' })?.side).toBe('sell')
  })

  it('drops an unrecognized ask_bid rather than defaulting', () => {
    expect(parseUpbitTrade({ ...raw, ask_bid: '' })).toBeNull()
  })
})
