// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { fetchHistoryDepth } from '../fetch-depth'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'

const MINUTE = 60_000

/** A venue holding `total` bars, capping every response at `cap`. */
function makeVenue(total: number, cap: number) {
  const all: Array<ChartBar> = Array.from({ length: total }, (_, i) => ({
    ts: i * MINUTE,
    open: i,
    high: i + 1,
    low: i - 1,
    close: i,
    volume: 1,
  }))
  const calls: Array<{ limit: number; endTs?: number }> = []
  const fetchPage = async (limit: number, endTs?: number) => {
    calls.push({ limit, endTs })
    const window =
      endTs === undefined ? all : all.filter((bar) => bar.ts < endTs)
    return window.slice(-Math.min(limit, cap))
  }
  return { all, calls, fetchPage }
}

describe('fetchHistoryDepth', () => {
  it('pages past a venue cap to reach the requested depth', async () => {
    const venue = makeVenue(2000, 300)
    const bars = await fetchHistoryDepth(venue.fetchPage, 1000, 300)

    expect(bars).toHaveLength(1000)
    expect(venue.calls.length).toBeGreaterThan(1)
    // Oldest-first, contiguous, and ending at the venue's newest bar.
    expect(bars[0].ts).toBeLessThan(bars[bars.length - 1].ts)
    expect(bars[bars.length - 1].ts).toBe(venue.all[venue.all.length - 1].ts)
    for (let i = 1; i < bars.length; i += 1) {
      expect(bars[i].ts - bars[i - 1].ts).toBe(MINUTE)
    }
  })

  it('does not page when the first response already covers the target', async () => {
    const venue = makeVenue(2000, 300)
    const bars = await fetchHistoryDepth(venue.fetchPage, 200, 300)

    expect(bars).toHaveLength(200)
    expect(venue.calls).toHaveLength(1)
    expect(venue.calls[0].limit).toBe(200)
  })

  it('stops at the start of available history instead of looping', async () => {
    const venue = makeVenue(420, 300)
    const bars = await fetchHistoryDepth(venue.fetchPage, 2000, 300)

    expect(bars).toHaveLength(420)
    // Two pages: 300, then the remaining 120 (a short page ends it).
    expect(venue.calls).toHaveLength(2)
  })

  it('stops when the venue replays a full page it already gave us', async () => {
    // A full page every time, always the same bars: without the no-progress
    // guard this would loop until the page cap.
    const page: Array<ChartBar> = Array.from({ length: 4 }, (_, i) => ({
      ts: i * MINUTE,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
    }))
    let calls = 0
    const stuck = async () => {
      calls += 1
      return page
    }
    const bars = await fetchHistoryDepth(stuck, 1000, 4)

    expect(bars).toHaveLength(4)
    expect(calls).toBe(2)
  })

  it('de-duplicates overlapping pages', async () => {
    const all: Array<ChartBar> = Array.from({ length: 10 }, (_, i) => ({
      ts: i * MINUTE,
      open: i,
      high: i,
      low: i,
      close: i,
      volume: 1,
    }))
    // Every page includes one bar the previous page already returned.
    const overlapping = async (limit: number, endTs?: number) => {
      const window =
        endTs === undefined ? all : all.filter((bar) => bar.ts <= endTs)
      return window.slice(-Math.min(limit, 4))
    }
    const bars = await fetchHistoryDepth(overlapping, 10, 4)

    const seen = new Set(bars.map((bar) => bar.ts))
    expect(seen.size).toBe(bars.length)
  })

  it('handles empty, null and non-positive targets without throwing', async () => {
    expect(await fetchHistoryDepth(async () => [], 500)).toEqual([])
    expect(await fetchHistoryDepth(async () => null, 500)).toEqual([])
    expect(await fetchHistoryDepth(async () => undefined, 500)).toEqual([])

    const venue = makeVenue(100, 300)
    expect(await fetchHistoryDepth(venue.fetchPage, 0)).toEqual([])
    expect(venue.calls).toHaveLength(0)
  })
})
