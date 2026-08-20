// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  MIN_HEALTHY_SEED_BARS,
  mergeDeeperSnapshot,
  shouldBackfillOlderHistory,
  snapshotDeepensSeed,
  viewportAfterPrepend,
} from '../chart-seed'

const bar = (ts: number) => ({ ts, close: 1 })

describe('snapshotDeepensSeed', () => {
  it('accepts a snapshot that reaches further back than the seed', () => {
    expect(snapshotDeepensSeed(1_000, 700)).toBe(true)
  })

  it('refuses a snapshot that starts at or after the seed', () => {
    // The connector's 500-bar buffer slices its oldest bar as it grows, so
    // the first ts creeps FORWARD on every live update. Treating that as new
    // history would rebuild the chart on every candle.
    expect(snapshotDeepensSeed(1_000, 1_000)).toBe(false)
    expect(snapshotDeepensSeed(1_000, 1_300)).toBe(false)
  })

  it('refuses when there is no seed yet — that is the first-seed path', () => {
    expect(snapshotDeepensSeed(null, 700)).toBe(false)
  })
})

describe('mergeDeeperSnapshot', () => {
  it('keeps pan-left backfilled bars the snapshot does not carry', () => {
    const seeded = [bar(100), bar(200), bar(300), bar(400)]
    const snapshot = [bar(300), bar(400), bar(500)]
    expect(mergeDeeperSnapshot(seeded, snapshot).map((c) => c.ts)).toEqual([
      100, 200, 300, 400, 500,
    ])
  })

  it('replaces a stub seed wholesale', () => {
    const snapshot = [bar(100), bar(200), bar(300)]
    expect(mergeDeeperSnapshot([bar(300)], snapshot)).toEqual(snapshot)
  })

  it('never drops the seed for an empty snapshot', () => {
    const seeded = [bar(100), bar(200)]
    expect(mergeDeeperSnapshot(seeded, [])).toEqual(seeded)
  })
})

describe('shouldBackfillOlderHistory', () => {
  it('fires when a loaded chart is panned to its left edge', () => {
    expect(shouldBackfillOlderHistory(300, 4)).toBe(true)
  })

  it('holds off while the chart is panned away from the left edge', () => {
    expect(shouldBackfillOlderHistory(300, 120)).toBe(false)
  })

  it('refuses a stub seed, whose window starts at 0 by construction', () => {
    // The shipped bug: a two-bar first paint (a venue whose REST backfill was
    // rate-limited) reported startIndex 0, the backfill prepended 300 bars,
    // and the window was re-anchored onto the tail — one live candle with
    // empty space to its right until a manual Fit Content.
    expect(shouldBackfillOlderHistory(2, 0)).toBe(false)
    expect(shouldBackfillOlderHistory(MIN_HEALTHY_SEED_BARS - 1, 0)).toBe(false)
    expect(shouldBackfillOlderHistory(MIN_HEALTHY_SEED_BARS, 0)).toBe(true)
  })
})

describe('viewportAfterPrepend', () => {
  it('keeps the same bars on screen when the window lies inside the data', () => {
    expect(
      viewportAfterPrepend({ startIndex: 10, endIndex: 210 }, 300, 800),
    ).toEqual({ startIndex: 310, endIndex: 510 })
  })

  it('never starts past the newest bar', () => {
    // Backstop for a window already sitting off the end of its series: the
    // shift assumes the window lies inside the data, so without the clamp
    // this walks further into empty space every prepend.
    expect(
      viewportAfterPrepend({ startIndex: 40, endIndex: 61 }, 5, 30),
    ).toEqual({ startIndex: 29, endIndex: 50 })
  })

  it('holds the window at the start of a series shorter than the prepend', () => {
    expect(viewportAfterPrepend({ startIndex: 0, endIndex: 21 }, 5, 1)).toEqual(
      { startIndex: 0, endIndex: 21 },
    )
  })
})

describe('MIN_HEALTHY_SEED_BARS', () => {
  it('matches the backfill trigger window it gates', () => {
    expect(MIN_HEALTHY_SEED_BARS).toBe(30)
  })
})
