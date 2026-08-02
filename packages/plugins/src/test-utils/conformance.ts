// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { expect } from 'bun:test'
import {
  isMsTimestamp,
  validateCandle,
  validateOrderbookSide,
  validateTicker,
} from '@pairlens/market-engine/validation'
import type {
  Candle,
  NormalizedBalance,
  NormalizedOrderUpdate,
  OrderbookLevel,
  TickerSnapshot,
} from '@pairlens/market-engine/types'

// ── Cross-connector conformance assertions ──
//
// Every connector's parsers must produce normalized output in the EXACT same
// shape, types, and units, so the UI and strategy engine can treat a Binance
// candle identically to an OKX candle. These helpers encode that contract;
// each connector's parser test runs its real output through them. A unit bug
// (e.g. seconds instead of ms, or a string where a number is required) fails
// here regardless of which exchange produced it.

const NUMBER_FIELDS_CANDLE = [
  'ts',
  'open',
  'high',
  'low',
  'close',
  'volume',
] as const

export function assertCandleConformant(c: Candle, label = 'candle'): void {
  for (const k of NUMBER_FIELDS_CANDLE) {
    expect(typeof c[k], `${label}.${k} must be a number`).toBe('number')
  }
  expect(
    isMsTimestamp(c.ts),
    `${label}.ts must be epoch-ms (got ${c.ts})`,
  ).toBe(true)
  expect(validateCandle(c).errors, `${label} failed value validation`).toEqual(
    [],
  )
}

const NUMBER_FIELDS_TICKER = [
  'last',
  'bid',
  'ask',
  'high24h',
  'low24h',
  'volume24h',
  'change24h',
  'ts',
] as const

export function assertTickerConformant(
  t: TickerSnapshot,
  label = 'ticker',
): void {
  for (const k of NUMBER_FIELDS_TICKER) {
    expect(typeof t[k], `${label}.${k} must be a number`).toBe('number')
  }
  expect(
    isMsTimestamp(t.ts),
    `${label}.ts must be epoch-ms (got ${t.ts})`,
  ).toBe(true)
  expect(validateTicker(t).errors, `${label} failed value validation`).toEqual(
    [],
  )
}

export function assertOrderbookConformant(
  bids: Array<OrderbookLevel>,
  asks: Array<OrderbookLevel>,
  label = 'orderbook',
): void {
  expect(
    validateOrderbookSide(bids, 'bids').errors,
    `${label} bids invalid`,
  ).toEqual([])
  expect(
    validateOrderbookSide(asks, 'asks').errors,
    `${label} asks invalid`,
  ).toEqual([])
}

const ORDER_STATUSES: Array<NormalizedOrderUpdate['status']> = [
  'live',
  'partially_filled',
  'filled',
  'cancelled',
]

const STRING_FIELDS_ORDER = [
  'orderId',
  'pair',
  'size',
  'price',
  'fillSize',
  'avgPrice',
  'fee',
  'feeCcy',
] as const

export function assertOrderConformant(
  o: NormalizedOrderUpdate,
  label = 'order',
): void {
  for (const k of STRING_FIELDS_ORDER) {
    expect(typeof o[k], `${label}.${k} must be a string`).toBe('string')
  }
  expect(['buy', 'sell'], `${label}.side`).toContain(o.side)
  expect(['market', 'limit'], `${label}.type`).toContain(o.type)
  expect(ORDER_STATUSES, `${label}.status "${o.status}" not in enum`).toContain(
    o.status,
  )
  expect(typeof o.ts, `${label}.ts must be a number`).toBe('number')
  expect(typeof o.createdAt, `${label}.createdAt must be a number`).toBe(
    'number',
  )
}

const STRING_FIELDS_BALANCE = [
  'currency',
  'available',
  'frozen',
  'total',
] as const

export function assertBalanceConformant(
  b: NormalizedBalance,
  label = 'balance',
): void {
  for (const k of STRING_FIELDS_BALANCE) {
    expect(typeof b[k], `${label}.${k} must be a string`).toBe('string')
  }
}
