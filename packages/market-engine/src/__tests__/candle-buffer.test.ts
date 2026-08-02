// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { CandleBuffer, sortCandlesAscending } from '../candle-buffer'
import type { Candle } from '@pairlens/shared/types'

function candle(ts: number, close = 100): Candle {
  return {
    ts,
    open: close - 1,
    high: close + 1,
    low: close - 1,
    close,
    volume: 50,
  }
}

describe('CandleBuffer', () => {
  it('push and snapshot', () => {
    const buf = new CandleBuffer(5)
    buf.push(candle(1000))
    buf.push(candle(2000))
    expect(buf.length).toBe(2)
    expect(buf.snapshot()).toEqual([candle(1000), candle(2000)])
  })

  it('upserts candle with same timestamp', () => {
    const buf = new CandleBuffer(5)
    buf.push(candle(1000, 100))
    buf.push(candle(1000, 105))
    expect(buf.length).toBe(1)
    expect(buf.last()!.close).toBe(105)
  })

  it('evicts oldest when at capacity', () => {
    const buf = new CandleBuffer(3)
    buf.push(candle(1000))
    buf.push(candle(2000))
    buf.push(candle(3000))
    buf.push(candle(4000))
    expect(buf.length).toBe(3)
    expect(buf.snapshot()[0].ts).toBe(2000)
  })

  it('load replaces all data', () => {
    const buf = new CandleBuffer(3)
    buf.push(candle(1000))
    buf.load([candle(5000), candle(6000)])
    expect(buf.length).toBe(2)
    expect(buf.snapshot()[0].ts).toBe(5000)
  })

  it('load truncates to max', () => {
    const buf = new CandleBuffer(2)
    buf.load([candle(1000), candle(2000), candle(3000)])
    expect(buf.length).toBe(2)
    expect(buf.snapshot()[0].ts).toBe(2000) // keeps last 2
  })

  it('clear empties buffer', () => {
    const buf = new CandleBuffer(5)
    buf.push(candle(1000))
    buf.push(candle(2000))
    buf.clear()
    expect(buf.length).toBe(0)
    expect(buf.last()).toBeNull()
  })

  it('last returns null when empty', () => {
    const buf = new CandleBuffer()
    expect(buf.last()).toBeNull()
  })

  it('snapshot returns a copy', () => {
    const buf = new CandleBuffer(5)
    buf.push(candle(1000))
    const snap = buf.snapshot()
    snap.push(candle(9999))
    expect(buf.length).toBe(1) // buffer unchanged
  })

  it('replaces a recent candle in place on a late out-of-order update', () => {
    const buf = new CandleBuffer(5)
    buf.push(candle(1000, 100))
    buf.push(candle(2000, 200))
    buf.push(candle(3000, 300))
    // Late final confirm for the 2000 bar, arriving after the next bar opened
    buf.push(candle(2000, 250))
    expect(buf.snapshot().map((c) => c.ts)).toEqual([1000, 2000, 3000])
    expect(buf.snapshot()[1].close).toBe(250)
    expect(buf.droppedCount).toBe(0)
  })

  it('drops a stale out-of-order candle with no matching timestamp', () => {
    const buf = new CandleBuffer(5)
    buf.push(candle(2000))
    buf.push(candle(3000))
    buf.push(candle(1500)) // older than last, no matching ts — stale
    expect(buf.snapshot().map((c) => c.ts)).toEqual([2000, 3000])
    expect(buf.droppedCount).toBe(1)
  })

  it('drops a late candle older than the bounded scan window', () => {
    const buf = new CandleBuffer(10)
    for (let i = 1; i <= 8; i++) buf.push(candle(i * 1000))
    buf.push(candle(1000, 999)) // ts exists but beyond the last-5 window
    expect(buf.droppedCount).toBe(1)
    expect(buf.snapshot()[0].close).toBe(100) // untouched
    expect(buf.snapshot().map((c) => c.ts)).toEqual([
      1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000,
    ])
  })

  it('normal append and upsert do not count as dropped', () => {
    const buf = new CandleBuffer(5)
    buf.push(candle(1000, 100))
    buf.push(candle(1000, 105)) // upsert
    buf.push(candle(2000)) // append
    expect(buf.droppedCount).toBe(0)
    expect(buf.snapshot().map((c) => c.ts)).toEqual([1000, 2000])
  })
})

describe('sortCandlesAscending', () => {
  it('sorts a descending series ascending (HTX/Bitget/Cryptocom contract drift)', () => {
    const desc = [candle(3000), candle(2000), candle(1000)]
    expect(sortCandlesAscending(desc).map((c) => c.ts)).toEqual([
      1000, 2000, 3000,
    ])
  })

  it('leaves an already-ascending series unchanged', () => {
    const asc = [candle(1000), candle(2000), candle(3000)]
    expect(sortCandlesAscending(asc).map((c) => c.ts)).toEqual([
      1000, 2000, 3000,
    ])
  })

  it('collapses duplicate timestamps keeping the later write', () => {
    const dup = [candle(1000, 100), candle(2000, 200), candle(1000, 150)]
    const out = sortCandlesAscending(dup)
    expect(out.map((c) => c.ts)).toEqual([1000, 2000])
    // last write wins for the duplicate ts
    expect(out[0].close).toBe(150)
  })

  it('does not mutate the input array', () => {
    const input = [candle(2000), candle(1000)]
    sortCandlesAscending(input)
    expect(input.map((c) => c.ts)).toEqual([2000, 1000])
  })
})
