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

import * as ccxt from '../ccxt-connector/parser'
import type {
  OrderbookLevel,
  TickerSnapshot,
} from '@pairlens/market-engine/types'
import type { Candle } from '@pairlens/shared/types'

// ── Per-connector adapters ──
//
// Each adapter encodes the CANONICAL scenario in a wire shape and runs it
// through a real parser. The shared assertions then require the normalized
// output to match the canonical values, so every connector is held to one
// definition of "correct".
//
// This file used to carry a row per CEX, each encoding that exchange's own wire
// shape. Every CEX now reads through the ccxt bridge, which normalizes all of
// them with ONE parser, so those rows collapsed into the single `ccxt (unified)`
// row below. The cross-venue invariant they existed to enforce — change24h is a
// percent, never a fraction — is now enforced in two places: here, on the
// unified row, and per venue in ccxt-connector/__tests__/*-venue.test.ts, where
// the venue-specific handling that feeds this parser is pinned.

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
    // The CCXT bridge's unified row. Not a venue — it is the shape every
    // ccxt-backed connector normalizes from, so this single row is the
    // regression gate for all fourteen at once.
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
