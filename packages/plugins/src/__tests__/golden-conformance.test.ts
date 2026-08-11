// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  BOOK_SCENARIO as B,
  CANDLE_SCENARIO as C,
  TICKER_SCENARIO as T,
  assertMatchesBookScenario,
  assertMatchesCandleScenario,
  assertMatchesTickerScenario,
} from '../test-utils/golden-scenarios'

// Connector parsers
import * as okx from '../okx-market-connector/parser'
import * as binance from '../binance-market-connector/parser'
import * as bybit from '../bybit-market-connector/parser'
import * as bitvavo from '../bitvavo-market-connector/parser'
import * as mexc from '../mexc-market-connector/parser'
import * as kucoin from '../kucoin-market-connector/parser'
import * as gate from '../gate-market-connector/parser'
import * as coinbase from '../coinbase-market-connector/parser'
import * as bitget from '../bitget-market-connector/parser'
import * as kraken from '../kraken-market-connector/parser'
import * as htx from '../htx-market-connector/parser'
import * as cryptocom from '../cryptocom-market-connector/parser'
import * as bitfinex from '../bitfinex-market-connector/parser'
import * as upbit from '../upbit-market-connector/parser'
import * as ccxt from '../ccxt-connector/parser'
import type {
  OrderbookLevel,
  TickerSnapshot,
} from '@pairlens/market-engine/types'
import type { Candle } from '@pairlens/shared/types'

// ── Per-connector adapters ──
//
// Each adapter encodes the CANONICAL scenario in that exchange's own wire shape
// and runs it through the connector's real parser. The shared assertions then
// require the normalized output to match the canonical values, so every
// connector is held to one definition of "correct".

type CandleAdapter = { encode: () => any; parse: (raw: any) => Candle | null }
type TickerAdapter = { encode: () => any; parse: (raw: any) => TickerSnapshot }
type BookAdapter = {
  encodeBids: () => any
  encodeAsks: () => any
  parse: (raw: any) => Array<OrderbookLevel>
}
type ConnectorGolden = {
  name: string
  candle?: CandleAdapter
  ticker?: TickerAdapter
  book?: BookAdapter
}

const ADAPTERS: Array<ConnectorGolden> = [
  {
    name: 'okx',
    // OKX candle row: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    candle: {
      encode: () => [
        String(C.ts),
        String(C.open),
        String(C.high),
        String(C.low),
        String(C.close),
        String(C.volume),
        '0',
        '0',
        '1',
      ],
      parse: (raw: any) => okx.parseOkxCandleRow(raw)?.[0] ?? null,
    },
    // OKX ticker: change derived from (last - sodUtc0) / sodUtc0 * 100
    ticker: {
      encode: () => ({
        last: String(T.last),
        bidPx: String(T.bid),
        askPx: String(T.ask),
        high24h: String(T.high24h),
        low24h: String(T.low24h),
        vol24h: String(T.volume24h),
        sodUtc0: String(T.prevPrice),
        ts: String(C.ts),
      }),
      parse: (raw: any) => okx.parseOkxTicker(raw),
    },
    book: {
      encodeBids: () => B.bids.map(([p, s]) => [String(p), String(s)]),
      encodeAsks: () => B.asks.map(([p, s]) => [String(p), String(s)]),
      parse: (raw: any) => okx.parseOkxBookLevels(raw),
    },
  },
  {
    name: 'binance',
    // Binance WS kline { t, o, h, l, c, v, x, i }
    candle: {
      encode: () => ({
        t: C.ts,
        o: String(C.open),
        h: String(C.high),
        l: String(C.low),
        c: String(C.close),
        v: String(C.volume),
        x: true,
        i: '1h',
      }),
      parse: (raw: any) => binance.parseBinanceWsKline(raw)?.[0] ?? null,
    },
    // Binance ticker: P is already a percent
    ticker: {
      encode: () => ({
        c: String(T.last),
        b: String(T.bid),
        a: String(T.ask),
        h: String(T.high24h),
        l: String(T.low24h),
        v: String(T.volume24h),
        P: String(T.changePct),
      }),
      parse: (raw: any) => binance.parseBinanceTicker(raw),
    },
    book: {
      encodeBids: () => B.bids.map(([p, s]) => [String(p), String(s)]),
      encodeAsks: () => B.asks.map(([p, s]) => [String(p), String(s)]),
      parse: (raw: any) => binance.parseBinanceBookLevels(raw),
    },
  },
  {
    name: 'bybit',
    // ByBit WS kline { start, open, high, low, close, volume, confirm }
    candle: {
      encode: () => ({
        start: C.ts,
        open: String(C.open),
        high: String(C.high),
        low: String(C.low),
        close: String(C.close),
        volume: String(C.volume),
        confirm: true,
      }),
      parse: (raw: any) => bybit.parseBybitWsKline(raw)?.[0] ?? null,
    },
    // ByBit ticker: price24hPcnt is a FRACTION (0.05) → must scale to 5%
    ticker: {
      encode: () => ({
        lastPrice: String(T.last),
        bid1Price: String(T.bid),
        ask1Price: String(T.ask),
        highPrice24h: String(T.high24h),
        lowPrice24h: String(T.low24h),
        volume24h: String(T.volume24h),
        price24hPcnt: String(T.changeFraction),
      }),
      parse: (raw: any) => bybit.parseBybitTicker(raw),
    },
    book: {
      encodeBids: () => B.bids.map(([p, s]) => [String(p), String(s)]),
      encodeAsks: () => B.asks.map(([p, s]) => [String(p), String(s)]),
      parse: (raw: any) => bybit.parseBybitBookLevels(raw),
    },
  },
  {
    name: 'bitvavo',
    // candle row [ts(ms), open, high, low, close, volume] — all strings
    candle: {
      encode: () => [
        String(C.ts),
        String(C.open),
        String(C.high),
        String(C.low),
        String(C.close),
        String(C.volume),
      ],
      parse: (raw: any) => bitvavo.parseBitvavoCandle(raw),
    },
    // ticker24h exposes no percent field — change is derived from open → last
    ticker: {
      encode: () => ({
        open: String(T.prevPrice),
        high: String(T.high24h),
        low: String(T.low24h),
        last: String(T.last),
        volume: String(T.volume24h),
        bid: String(T.bid),
        ask: String(T.ask),
        timestamp: String(C.ts),
      }),
      parse: (raw: any) => bitvavo.parseBitvavoTicker(raw),
    },
    book: {
      encodeBids: () => B.bids.map(([p, s]) => [String(p), String(s)]),
      encodeAsks: () => B.asks.map(([p, s]) => [String(p), String(s)]),
      parse: (raw: any) => bitvavo.parseBitvavoBookLevels(raw),
    },
  },
  {
    name: 'mexc',
    // REST kline (Binance layout, ms): [ts, o, h, l, c, volume]
    candle: {
      encode: () => [
        String(C.ts),
        String(C.open),
        String(C.high),
        String(C.low),
        String(C.close),
        String(C.volume),
      ],
      parse: (raw: any) => mexc.parseMexcRestKline(raw),
    },
    // ticker is protobuf-decoded in the ws-client (no pure parser) — covered live.
  },
  {
    name: 'kucoin',
    // REST kline OCHL (ts in seconds): [ts, open, close, high, low, volume]
    candle: {
      encode: () => [
        String(C.ts / 1000),
        String(C.open),
        String(C.close),
        String(C.high),
        String(C.low),
        String(C.volume),
      ],
      parse: (raw: any) => kucoin.parseKucoinRestKline(raw),
    },
    // stats: changeRate is a FRACTION → *100
    ticker: {
      encode: () => ({
        last: String(T.last),
        changeRate: String(T.changeFraction),
        buy: String(T.bid),
        sell: String(T.ask),
        high: String(T.high24h),
        low: String(T.low24h),
        vol: String(T.volume24h),
        time: String(C.ts),
      }),
      parse: (raw: any) => kucoin.parseKucoinStats(raw),
    },
  },
  {
    name: 'gate',
    // REST kline (ts in seconds): [ts, quoteVol, close, high, low, open, baseVol]
    candle: {
      encode: () => [
        String(C.ts / 1000),
        '0',
        String(C.close),
        String(C.high),
        String(C.low),
        String(C.open),
        String(C.volume),
      ],
      parse: (raw: any) => gate.parseGateRestKline(raw),
    },
    // change_percentage is already a percent
    ticker: {
      encode: () => ({
        last: String(T.last),
        change_percentage: String(T.changePct),
        highest_bid: String(T.bid),
        lowest_ask: String(T.ask),
        high_24h: String(T.high24h),
        low_24h: String(T.low24h),
        base_volume: String(T.volume24h),
      }),
      parse: (raw: any) => gate.parseGateTicker(raw),
    },
  },
  {
    name: 'coinbase',
    // candle { start(sec), open, high, low, close, volume }
    candle: {
      encode: () => ({
        start: String(C.ts / 1000),
        open: String(C.open),
        high: String(C.high),
        low: String(C.low),
        close: String(C.close),
        volume: String(C.volume),
      }),
      parse: (raw: any) => coinbase.parseCoinbaseRestCandle(raw),
    },
    // price_percent_chg_24_h is already a percent
    ticker: {
      encode: () => ({
        price: String(T.last),
        best_bid: String(T.bid),
        best_ask: String(T.ask),
        high_24_h: String(T.high24h),
        low_24_h: String(T.low24h),
        volume_24_h: String(T.volume24h),
        price_percent_chg_24_h: String(T.changePct),
      }),
      parse: (raw: any) => coinbase.parseCoinbaseTicker(raw),
    },
  },
  {
    name: 'bitget',
    // candle [ts(ms), open, high, low, close, volume]
    candle: {
      encode: () => [
        String(C.ts),
        String(C.open),
        String(C.high),
        String(C.low),
        String(C.close),
        String(C.volume),
      ],
      parse: (raw: any) => bitget.parseBitgetCandle(raw),
    },
    // change24h is a FRACTION (verified live) → *100
    ticker: {
      encode: () => ({
        lastPr: String(T.last),
        bidPr: String(T.bid),
        askPr: String(T.ask),
        high24h: String(T.high24h),
        low24h: String(T.low24h),
        baseVolume: String(T.volume24h),
        change24h: String(T.changeFraction),
        ts: String(C.ts),
      }),
      parse: (raw: any) => bitget.parseBitgetTicker(raw),
    },
  },
  {
    name: 'kraken',
    // REST candle (ts in seconds): [ts, open, high, low, close, vwap, volume]
    candle: {
      encode: () => [
        C.ts / 1000,
        String(C.open),
        String(C.high),
        String(C.low),
        String(C.close),
        '0',
        String(C.volume),
      ],
      parse: (raw: any) => kraken.parseRestCandle(raw),
    },
    // WS ticker: change_pct is a percent
    ticker: {
      encode: () => ({
        last: T.last,
        bid: T.bid,
        ask: T.ask,
        high: T.high24h,
        low: T.low24h,
        volume: T.volume24h,
        change: 5,
        change_pct: T.changePct,
      }),
      parse: (raw: any) => kraken.parseWsTicker(raw),
    },
  },
  {
    name: 'htx',
    // candle { id(sec), open, high, low, close, amount }
    candle: {
      encode: () => ({
        id: C.ts / 1000,
        open: C.open,
        high: C.high,
        low: C.low,
        close: C.close,
        amount: C.volume,
      }),
      parse: (raw: any) => htx.parseHtxCandle(raw),
    },
    // change derived from (close - open) / open * 100; bbo carries bid/ask
    ticker: {
      encode: () => ({
        detail: {
          open: T.prevPrice,
          close: T.last,
          high: T.high24h,
          low: T.low24h,
          amount: T.volume24h,
        },
        bbo: { bid: T.bid, ask: T.ask },
      }),
      parse: (raw: any) => htx.parseHtxTicker(raw.detail, raw.bbo),
    },
  },
  {
    name: 'cryptocom',
    // candle { t(ms), o, h, l, c, v }
    candle: {
      encode: () => ({
        t: C.ts,
        o: C.open,
        h: C.high,
        l: C.low,
        c: C.close,
        v: C.volume,
      }),
      parse: (raw: any) => cryptocom.parseCryptocomCandle(raw),
    },
    // c is a decimal/FRACTION change → *100
    ticker: {
      encode: () => ({
        a: T.last,
        b: T.bid,
        k: T.ask,
        h: T.high24h,
        l: T.low24h,
        v: T.volume24h,
        c: T.changeFraction,
        t: C.ts,
      }),
      parse: (raw: any) => cryptocom.parseCryptocomTicker(raw),
    },
  },
  {
    name: 'bitfinex',
    // candle [MTS(ms), OPEN, CLOSE, HIGH, LOW, VOLUME] (close=2, high=3, low=4)
    candle: {
      encode: () => [C.ts, C.open, C.close, C.high, C.low, C.volume],
      parse: (raw: any) => bitfinex.parseBfxCandle(raw),
    },
    // ticker [BID, BID_SZ, ASK, ASK_SZ, DAILY_CHG, DAILY_CHG_REL, LAST, VOL, HIGH, LOW]
    // DAILY_CHANGE_RELATIVE is a FRACTION → *100
    ticker: {
      encode: () => [
        T.bid,
        10,
        T.ask,
        10,
        5,
        T.changeFraction,
        T.last,
        T.volume24h,
        T.high24h,
        T.low24h,
      ],
      parse: (raw: any) => bitfinex.parseBfxTicker(raw),
    },
  },
  {
    name: 'upbit',
    // candle: candle_date_time_utc is ISO without trailing Z (parser appends Z)
    candle: {
      encode: () => ({
        candle_date_time_utc: '2023-11-14T22:13:20',
        opening_price: C.open,
        high_price: C.high,
        low_price: C.low,
        trade_price: C.close,
        candle_acc_trade_volume: C.volume,
      }),
      parse: (raw: any) => upbit.parseUpbitCandle(raw),
    },
    // signed_change_rate is a FRACTION → *100
    ticker: {
      encode: () => ({
        trade_price: T.last,
        opening_price: T.prevPrice,
        high_price: T.high24h,
        low_price: T.low24h,
        acc_trade_volume_24h: T.volume24h,
        signed_change_rate: T.changeFraction,
        best_bid_price: T.bid,
        best_ask_price: T.ask,
        trade_timestamp: C.ts,
      }),
      parse: (raw: any) => upbit.parseUpbitTicker(raw),
    },
  },
  {
    // The CCXT bridge's unified row. Not a fifteenth venue — it is the shape
    // every ccxt-backed connector normalizes from, so this single row is the
    // regression gate for all of them at once. The native rows above stay: they
    // are still the reference for what "correct" means, and while a venue is
    // mid-migration both parsers have to agree with the same scenario.
    name: 'ccxt (unified)',
    // ccxt OHLCV: [ts(ms), open, high, low, close, volume], numeric — except on
    // Kraken's WS, where they arrive as strings, hence the mixed encoding.
    candle: {
      encode: () => [C.ts, C.open, String(C.high), C.low, C.close, C.volume],
      parse: (raw: any) => ccxt.parseCcxtOhlcv(raw),
    },
    // ccxt has ALREADY converted every venue's native unit into `percentage`,
    // a percent. The one thing this row exists to catch is the bridge
    // multiplying it a second time.
    ticker: {
      encode: () => ({
        symbol: 'BTC/USDT',
        last: T.last,
        close: T.last,
        bid: T.bid,
        ask: T.ask,
        high: T.high24h,
        low: T.low24h,
        baseVolume: T.volume24h,
        open: T.prevPrice,
        percentage: T.changePct,
        timestamp: C.ts,
      }),
      parse: (raw: any) => ccxt.parseCcxtTicker(raw),
    },
    book: {
      encodeBids: () => B.bids.map(([p, s]) => [p, s]),
      encodeAsks: () => B.asks.map(([p, s]) => [p, s]),
      parse: (raw: any) => ccxt.parseCcxtBookLevels(raw),
    },
  },
]

describe('golden cross-connector conformance', () => {
  for (const a of ADAPTERS) {
    describe(a.name, () => {
      if (a.candle) {
        it('normalizes the canonical candle identically', () => {
          const c = a.candle!.parse(a.candle!.encode())
          expect(c, `${a.name} candle parsed`).not.toBeNull()
          assertMatchesCandleScenario(c!, a.name)
        })
      }
      if (a.ticker) {
        it('normalizes the canonical ticker identically (change24h as percent)', () => {
          const t = a.ticker!.parse(a.ticker!.encode())
          assertMatchesTickerScenario(t, a.name)
        })
      }
      if (a.book) {
        it('normalizes the canonical orderbook identically', () => {
          const bids = a.book!.parse(a.book!.encodeBids())
          const asks = a.book!.parse(a.book!.encodeAsks())
          assertMatchesBookScenario(bids, asks, a.name)
        })
      }
    })
  }
})
