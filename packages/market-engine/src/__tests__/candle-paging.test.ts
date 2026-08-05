// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { olderThan, pageEndMs, pageEndSec } from '../candle-paging'
import type { Candle } from '../types'

const bar = (ts: number): Candle => ({
  ts,
  open: 1,
  high: 1,
  low: 1,
  close: 1,
  volume: 1,
})

describe('pageEndMs / pageEndSec', () => {
  it('steps back so an inclusive cursor cannot return the boundary bar', () => {
    expect(pageEndMs(1_700_000_000_000)).toBe(1_699_999_999_999)
    expect(pageEndSec(1_700_000_000_000)).toBe(1_699_999_999)
  })

  it('floors sub-second cursors rather than emitting a fractional param', () => {
    // A fractional second in a query string is rejected by several venues.
    expect(Number.isInteger(pageEndSec(1_700_000_000_499))).toBe(true)
    expect(pageEndSec(1_700_000_000_499)).toBe(1_699_999_999)
  })
})

describe('olderThan', () => {
  // The bug this exists for: venues disagree about cursor inclusivity, and a
  // page containing only the boundary bar filters to empty in the terminal,
  // which reads as end-of-history and latches `exhausted` for the session.
  it('drops a bar sitting exactly on the cursor', () => {
    const out = olderThan([bar(100), bar(200), bar(300)], 300)
    expect(out.map((c) => c.ts)).toEqual([100, 200])
  })

  it('keeps everything strictly older', () => {
    expect(olderThan([bar(100), bar(200)], 300).length).toBe(2)
  })

  it('passes the first (unpaged) load through untouched', () => {
    const seed = [bar(100), bar(200)]
    expect(olderThan(seed, undefined)).toBe(seed)
  })

  it('returns empty when the venue only echoes the boundary', () => {
    expect(olderThan([bar(300)], 300)).toEqual([])
  })
})
