// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  isMsTimestamp,
  validateCandle,
  validateOrderbookSide,
  validateTicker,
} from '../validation'
import type { Candle } from '@pairlens/shared/types'
import type { OrderbookLevel, TickerSnapshot } from '../types'

const NOW_MS = 1_700_000_000_000 // 2023-11-14, a known good ms timestamp

function candle(over: Partial<Candle> = {}): Candle {
  return {
    ts: NOW_MS,
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 50,
    ...over,
  }
}

function ticker(over: Partial<TickerSnapshot> = {}): TickerSnapshot {
  return {
    last: 100,
    bid: 99.9,
    ask: 100.1,
    high24h: 120,
    low24h: 90,
    volume24h: 1000,
    change24h: 5.2,
    ts: NOW_MS,
    ...over,
  }
}

describe('isMsTimestamp', () => {
  it('accepts plausible epoch-ms values', () => {
    expect(isMsTimestamp(NOW_MS)).toBe(true)
    expect(isMsTimestamp(1_000_000_000_000)).toBe(true)
  })

  it('rejects seconds-epoch values (the classic connector bug)', () => {
    expect(isMsTimestamp(1_700_000_000)).toBe(false) // seconds, not ms
  })

  it('rejects NaN, zero, negative, and absurdly large values', () => {
    expect(isMsTimestamp(NaN)).toBe(false)
    expect(isMsTimestamp(0)).toBe(false)
    expect(isMsTimestamp(-NOW_MS)).toBe(false)
    expect(isMsTimestamp(1e15)).toBe(false)
  })
})

describe('validateCandle', () => {
  it('passes a well-formed candle', () => {
    expect(validateCandle(candle())).toEqual({ ok: true, errors: [] })
  })

  it('flags a seconds timestamp', () => {
    const r = validateCandle(candle({ ts: 1_700_000_000 }))
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('epoch-ms')
  })

  it('flags high below open/close/low', () => {
    const r = validateCandle(candle({ high: 90 }))
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('high'))).toBe(true)
  })

  it('flags low above open/close/high', () => {
    const r = validateCandle(candle({ low: 120 }))
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('low'))).toBe(true)
  })

  it('flags NaN / non-positive prices and negative volume', () => {
    expect(validateCandle(candle({ close: NaN })).ok).toBe(false)
    expect(validateCandle(candle({ open: 0 })).ok).toBe(false)
    expect(validateCandle(candle({ volume: -1 })).ok).toBe(false)
  })

  it('allows zero volume', () => {
    expect(validateCandle(candle({ volume: 0 })).ok).toBe(true)
  })
})

describe('validateTicker', () => {
  it('passes a well-formed ticker', () => {
    expect(validateTicker(ticker())).toEqual({ ok: true, errors: [] })
  })

  it('allows bid/ask of 0 (not provided) without flagging a crossed book', () => {
    expect(validateTicker(ticker({ bid: 0, ask: 0 })).ok).toBe(true)
  })

  it('flags a crossed book when both sides populated', () => {
    const r = validateTicker(ticker({ bid: 101, ask: 100 }))
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('crossed book')
  })

  it('allows negative change24h (price down) but flags NaN', () => {
    expect(validateTicker(ticker({ change24h: -8.3 })).ok).toBe(true)
    expect(validateTicker(ticker({ change24h: NaN })).ok).toBe(false)
  })

  it('flags a seconds timestamp', () => {
    expect(validateTicker(ticker({ ts: 1_700_000_000 })).ok).toBe(false)
  })
})

describe('validateOrderbookSide', () => {
  it('passes well-formed levels', () => {
    const bids: Array<OrderbookLevel> = [
      [100, 1],
      [99.5, 2],
    ]
    expect(validateOrderbookSide(bids, 'bids').ok).toBe(true)
  })

  it('allows zero size (a deletion marker)', () => {
    expect(validateOrderbookSide([[100, 0]], 'asks').ok).toBe(true)
  })

  it('flags non-positive price and NaN', () => {
    expect(validateOrderbookSide([[0, 1]], 'bids').ok).toBe(false)
    expect(validateOrderbookSide([[NaN, 1]], 'bids').ok).toBe(false)
  })
})
