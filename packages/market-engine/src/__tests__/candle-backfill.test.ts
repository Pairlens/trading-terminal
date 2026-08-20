// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { backfillCandles } from '../candle-backfill'
import type { Candle } from '../types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const CANDLES: Array<Candle> = [
  { ts: 1_700_000_000_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
]

describe('backfillCandles', () => {
  it('applies fetched candles when the subscription is live', async () => {
    const applied: Array<Array<Candle>> = []
    backfillCandles({
      fetch: () => Promise.resolve(CANDLES),
      isLive: () => true,
      apply: (c) => applied.push(c),
    })
    await sleep(5)
    expect(applied).toEqual([CANDLES])
  })

  it('does not apply results after the subscription is released', async () => {
    const applied: Array<Array<Candle>> = []
    let live = true
    backfillCandles({
      fetch: async () => {
        live = false // released mid-fetch
        return CANDLES
      },
      isLive: () => live,
      apply: (c) => applied.push(c),
    })
    await sleep(5)
    expect(applied.length).toBe(0)
  })

  it('retries once after a failed fetch, then applies', async () => {
    const applied: Array<Array<Candle>> = []
    let calls = 0
    backfillCandles({
      fetch: () => {
        calls++
        return calls === 1
          ? Promise.reject(new Error('rate limited'))
          : Promise.resolve(CANDLES)
      },
      isLive: () => true,
      apply: (c) => applied.push(c),
      retryDelayMs: 5,
    })
    await sleep(25)
    expect(calls).toBe(2)
    expect(applied).toEqual([CANDLES])
  })

  it('gives up after the retry budget (no retry storm)', async () => {
    let calls = 0
    backfillCandles({
      fetch: () => {
        calls++
        return Promise.reject(new Error('down'))
      },
      isLive: () => true,
      apply: () => {},
      retryDelayMs: 5,
    })
    // 5 + 10 + 20 = 35ms of retries after the first attempt.
    await sleep(120)
    expect(calls).toBe(4)
  })

  it('retries an empty result, then applies the last one', async () => {
    const applied: Array<Array<Candle>> = []
    let calls = 0
    backfillCandles({
      fetch: () => {
        calls++
        return Promise.resolve([])
      },
      isLive: () => true,
      apply: (c) => applied.push(c),
      retryDelayMs: 5,
    })
    await sleep(120)
    // An empty answer is retried like a failure — a rate-limited venue that
    // returns [] must not settle the backfill on nothing — but the last
    // attempt applies so a pair with no REST history still resolves.
    expect(calls).toBe(4)
    expect(applied).toEqual([[]])
  })

  it('stops retrying an empty result as soon as candles arrive', async () => {
    const applied: Array<Array<Candle>> = []
    let calls = 0
    backfillCandles({
      fetch: () => {
        calls++
        return Promise.resolve(calls === 1 ? [] : CANDLES)
      },
      isLive: () => true,
      apply: (c) => applied.push(c),
      retryDelayMs: 5,
    })
    await sleep(120)
    expect(calls).toBe(2)
    expect(applied).toEqual([CANDLES])
  })

  it('skips the retry when the subscription was released', async () => {
    let calls = 0
    let live = true
    backfillCandles({
      fetch: () => {
        calls++
        return Promise.reject(new Error('down'))
      },
      isLive: () => live,
      apply: () => {},
      retryDelayMs: 5,
    })
    await sleep(1)
    live = false
    await sleep(20)
    expect(calls).toBe(1)
  })
})
