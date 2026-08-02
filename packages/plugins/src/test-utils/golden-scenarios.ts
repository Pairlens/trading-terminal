// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { expect } from 'bun:test'
import {
  assertCandleConformant,
  assertOrderbookConformant,
  assertTickerConformant,
} from './conformance'
import type { Candle } from '@pairlens/shared/types'
import type {
  OrderbookLevel,
  TickerSnapshot,
} from '@pairlens/market-engine/types'

// ── Canonical market scenarios ──
//
// One fixed market state, expressed once. Every connector must normalize its
// own exchange-specific wire encoding of THIS scenario to THESE same values.
// That is what guarantees the UI can treat all connectors identically: a unit
// bug (seconds vs ms, a 24h change as a fraction instead of a percent, a price
// left as a string) makes a connector's output diverge from the canonical
// expectation and fails the shared test — no per-connector judgement required.

export const CANDLE_SCENARIO = {
  ts: 1_700_000_000_000, // epoch ms
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 1234.5,
} as const

export const TICKER_SCENARIO = {
  last: 105,
  bid: 104.9,
  ask: 105.1,
  high24h: 120,
  low24h: 90,
  volume24h: 50000,
  prevPrice: 100, // price 24h ago → change24h = (105-100)/100*100 = 5%
  changePct: 5,
  changeFraction: 0.05,
} as const

export const BOOK_SCENARIO = {
  bids: [
    [104.9, 1],
    [104.8, 2],
  ] as Array<[number, number]>,
  asks: [
    [105.1, 1.5],
    [105.2, 3],
  ] as Array<[number, number]>,
} as const

// ── Shared assertions: a connector's normalized output must match canonical ──

export function assertMatchesCandleScenario(c: Candle, label: string): void {
  assertCandleConformant(c, `${label} candle`)
  expect(c.ts, `${label} candle.ts`).toBe(CANDLE_SCENARIO.ts)
  expect(c.open, `${label} candle.open`).toBeCloseTo(CANDLE_SCENARIO.open, 8)
  expect(c.high, `${label} candle.high`).toBeCloseTo(CANDLE_SCENARIO.high, 8)
  expect(c.low, `${label} candle.low`).toBeCloseTo(CANDLE_SCENARIO.low, 8)
  expect(c.close, `${label} candle.close`).toBeCloseTo(CANDLE_SCENARIO.close, 8)
  expect(c.volume, `${label} candle.volume`).toBeCloseTo(
    CANDLE_SCENARIO.volume,
    6,
  )
}

export function assertMatchesTickerScenario(
  t: TickerSnapshot,
  label: string,
): void {
  assertTickerConformant(t, `${label} ticker`)
  expect(t.last, `${label} ticker.last`).toBeCloseTo(TICKER_SCENARIO.last, 6)
  expect(t.high24h, `${label} ticker.high24h`).toBeCloseTo(
    TICKER_SCENARIO.high24h,
    6,
  )
  expect(t.low24h, `${label} ticker.low24h`).toBeCloseTo(
    TICKER_SCENARIO.low24h,
    6,
  )
  expect(t.volume24h, `${label} ticker.volume24h`).toBeCloseTo(
    TICKER_SCENARIO.volume24h,
    2,
  )
  // The critical cross-connector invariant: change24h is a PERCENT (~5), never
  // a fraction (~0.05) or an absolute delta (~5 USD only by coincidence here).
  expect(
    t.change24h,
    `${label} ticker.change24h must be ~5% (percent)`,
  ).toBeCloseTo(TICKER_SCENARIO.changePct, 2)
}

export function assertMatchesBookScenario(
  bids: Array<OrderbookLevel>,
  asks: Array<OrderbookLevel>,
  label: string,
): void {
  assertOrderbookConformant(bids, asks, `${label} book`)
  expect(bids.slice(0, 2), `${label} book.bids`).toEqual([
    [104.9, 1],
    [104.8, 2],
  ])
  expect(asks.slice(0, 2), `${label} book.asks`).toEqual([
    [105.1, 1.5],
    [105.2, 3],
  ])
}
