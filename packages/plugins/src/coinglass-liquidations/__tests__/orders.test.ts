// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Paging without a cursor, and the row store that keeps a minute-by-minute
 * refresh from re-reading a whole day.
 *
 * The assertions worth keeping honest are the two that decide whether the
 * response can claim completeness: a slice at the 200-row cap must bisect, and
 * a slice still at the cap on the minute floor must come back FLAGGED rather
 * than quietly short.
 */
import { describe, expect, test } from 'bun:test'

import { COINGLASS_PAGE_CAP } from '../client'
import { createOrderStore, walkWindow } from '../orders'
import { ORDER_ROW_RECORDED, T0 } from './fixtures'
import type { CoinglassLiquidationOrder } from '../client'

const HOUR = 3_600_000

function row(time: number, usd = 100): CoinglassLiquidationOrder {
  return { ...ORDER_ROW_RECORDED, time, usd_value: usd }
}

/** A page of exactly the cap: the signal that a window was too wide. */
function cappedPage(from: number): Array<CoinglassLiquidationOrder> {
  return Array.from({ length: COINGLASS_PAGE_CAP }, (_, i) => row(from + i))
}

describe('walkWindow', () => {
  test('a short page is taken as the whole window', async () => {
    const calls: Array<[number, number]> = []
    const result = await walkWindow({
      startTime: T0,
      endTime: T0 + HOUR,
      fetchPage: async (from, to) => {
        calls.push([from, to])
        return [row(T0 + 1), row(T0 + 2)]
      },
    })
    expect(calls).toEqual([[T0, T0 + HOUR]])
    expect(result.rows).toHaveLength(2)
    expect(result.truncated).toBe(false)
    expect(result.requests).toBe(1)
  })

  test('a capped page bisects, and the newest half goes first', async () => {
    const calls: Array<[number, number]> = []
    const mid = T0 + Math.floor(HOUR / 2)
    const result = await walkWindow({
      startTime: T0,
      endTime: T0 + HOUR,
      fetchPage: async (from, to) => {
        calls.push([from, to])
        // Only the full window is over the cap; both halves come back short.
        return to - from >= HOUR ? cappedPage(from) : [row(from + 1)]
      },
    })
    expect(calls).toEqual([
      [T0, T0 + HOUR],
      [mid + 1, T0 + HOUR],
      [T0, mid],
    ])
    expect(result.rows).toHaveLength(2)
    expect(result.truncated).toBe(false)
  })

  test('sub-windows never overlap, so a boundary print is not double read', async () => {
    const seen: Array<[number, number]> = []
    await walkWindow({
      startTime: T0,
      endTime: T0 + HOUR,
      fetchPage: async (from, to) => {
        seen.push([from, to])
        return to - from >= HOUR ? cappedPage(from) : []
      },
    })
    const leaves = seen.slice(1).sort((a, b) => a[0] - b[0])
    expect(leaves[0][1] + 1).toBe(leaves[1][0])
  })

  test('a minute still over the cap is reported truncated', async () => {
    const result = await walkWindow({
      startTime: T0,
      endTime: T0 + 60_000,
      // Every slice is a cascade; bisection cannot help.
      fetchPage: async (from) => cappedPage(from),
    })
    expect(result.truncated).toBe(true)
    expect(result.rows).toHaveLength(COINGLASS_PAGE_CAP)
    // The floor stops it at one request rather than splitting a minute.
    expect(result.requests).toBe(1)
  })

  test('an exhausted request budget is truncated, not silently short', async () => {
    const result = await walkWindow({
      startTime: T0,
      endTime: T0 + 24 * HOUR,
      maxRequests: 3,
      fetchPage: async (from) => cappedPage(from),
    })
    expect(result.requests).toBe(3)
    expect(result.truncated).toBe(true)
  })

  test('an inverted range asks for nothing', async () => {
    let called = false
    const result = await walkWindow({
      startTime: T0 + HOUR,
      endTime: T0,
      fetchPage: async () => {
        called = true
        return []
      },
    })
    expect(called).toBe(false)
    expect(result.rows).toEqual([])
  })
})

describe('createOrderStore', () => {
  test('a cold read walks the whole window', async () => {
    const store = createOrderStore({ now: () => T0 + HOUR })
    const walked: Array<[number, number]> = []
    const result = await store.read('binance-futures:BTC-USDT-USDT', {
      since: T0,
      until: T0 + HOUR,
      walk: async (from, to) => {
        walked.push([from, to])
        return { rows: [row(T0 + 10)], truncated: false, requests: 1 }
      },
    })
    expect(walked).toEqual([[T0, T0 + HOUR]])
    expect(result.rows).toHaveLength(1)
  })

  test('a refresh reads only the tail, with a small overlap', async () => {
    const store = createOrderStore({ now: () => T0 + HOUR })
    await store.read('k', {
      since: T0,
      until: T0 + HOUR,
      walk: async () => ({
        rows: [row(T0 + 10)],
        truncated: false,
        requests: 1,
      }),
    })
    const walked: Array<[number, number]> = []
    await store.read('k', {
      since: T0 + 60_000,
      until: T0 + HOUR + 60_000,
      walk: async (from, to) => {
        walked.push([from, to])
        return { rows: [row(T0 + HOUR + 10)], truncated: false, requests: 1 }
      },
    })
    expect(walked).toHaveLength(1)
    // Starts two minutes behind the old cursor, not at the window start.
    expect(walked[0][0]).toBe(T0 + HOUR - 120_000)
    expect(walked[0][1]).toBe(T0 + HOUR + 60_000)
  })

  test('an overlapping refresh does not double count a print', async () => {
    const store = createOrderStore({ now: () => T0 + HOUR })
    const duplicate = row(T0 + HOUR - 30_000, 500)
    await store.read('k', {
      since: T0,
      until: T0 + HOUR,
      walk: async () => ({ rows: [duplicate], truncated: false, requests: 1 }),
    })
    const result = await store.read('k', {
      since: T0,
      until: T0 + HOUR + 1_000,
      // The same print comes back inside the overlap window.
      walk: async () => ({
        rows: [{ ...duplicate }],
        truncated: false,
        requests: 1,
      }),
    })
    expect(result.rows).toHaveLength(1)
  })

  test('a window reaching further back than the coverage re-walks it', async () => {
    const store = createOrderStore({ now: () => T0 + 24 * HOUR })
    await store.read('k', {
      since: T0 + 23 * HOUR,
      until: T0 + 24 * HOUR,
      walk: async () => ({ rows: [], truncated: false, requests: 1 }),
    })
    const walked: Array<[number, number]> = []
    await store.read('k', {
      // The 24h chip after the 1h chip: the store holds none of this.
      since: T0,
      until: T0 + 24 * HOUR,
      walk: async (from, to) => {
        walked.push([from, to])
        return { rows: [], truncated: false, requests: 1 }
      },
    })
    expect(walked).toEqual([[T0, T0 + 24 * HOUR]])
  })

  test('truncation is sticky across a refresh but reset by a cold walk', async () => {
    const store = createOrderStore({ now: () => T0 + HOUR })
    await store.read('k', {
      since: T0,
      until: T0 + HOUR,
      walk: async () => ({ rows: [], truncated: true, requests: 1 }),
    })
    const refreshed = await store.read('k', {
      since: T0,
      until: T0 + HOUR + 1_000,
      walk: async () => ({ rows: [], truncated: false, requests: 1 }),
    })
    expect(refreshed.truncated).toBe(true)

    const cold = await store.read('k', {
      since: T0 - HOUR,
      until: T0 + HOUR,
      walk: async () => ({ rows: [], truncated: false, requests: 1 }),
    })
    expect(cold.truncated).toBe(false)
  })

  test('rows older than the retention floor are dropped', async () => {
    const now = T0 + 8 * 24 * HOUR
    const store = createOrderStore({
      now: () => now,
      retentionMs: 7 * 24 * HOUR,
    })
    const result = await store.read('k', {
      since: T0,
      until: now,
      walk: async () => ({
        rows: [row(T0), row(now - HOUR)],
        truncated: false,
        requests: 1,
      }),
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].time).toBe(now - HOUR)
  })

  test('pairs beyond the cap are evicted least-recently-read first', async () => {
    const store = createOrderStore({ now: () => T0 })
    for (let i = 0; i < 10; i += 1) {
      await store.read(`pair-${i}`, {
        since: T0,
        until: T0 + 1_000,
        walk: async () => ({ rows: [], truncated: false, requests: 1 }),
      })
    }
    expect(store.size()).toBe(8)
  })
})
