// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { insiderValue, summarizeInsiderActivity } from '../insider-activity'
import type { InsiderTransaction } from '@pairlens/shared/instrument-types'

function tx(over: Partial<InsiderTransaction> = {}): InsiderTransaction {
  return {
    name: 'Doe Jane',
    title: 'Director',
    type: 'disposal',
    date: '2026-07-31',
    shares: 100,
    sharePrice: 10,
    security: 'Common Stock',
    ...over,
  }
}

describe('insiderValue', () => {
  it('multiplies what both halves are known', () => {
    expect(insiderValue(781, 286.725)).toBeCloseTo(223_932.2, 1)
  })

  it('is null on a grant, never zero', () => {
    // A grant has no price. A $0 in a column of dollars reads as a worthless
    // trade rather than as one that was never a purchase.
    expect(insiderValue(4500, null)).toBeNull()
    expect(insiderValue(null, 286.725)).toBeNull()
    expect(insiderValue(null, null)).toBeNull()
  })
})

describe('summarizeInsiderActivity', () => {
  it('counts each direction and spans the filings actually loaded', () => {
    const summary = summarizeInsiderActivity([
      tx({ type: 'acquisition', date: '2026-07-31' }),
      tx({ type: 'disposal', date: '2026-07-01' }),
      tx({ type: 'disposal', date: '2026-05-02' }),
    ])
    expect(summary.buys).toBe(1)
    expect(summary.sells).toBe(2)
    // 2026-05-02 to 2026-07-31 inclusive.
    expect(summary.spanDays).toBe(91)
  })

  it('spans one day for a single filing, not zero', () => {
    expect(summarizeInsiderActivity([tx()]).spanDays).toBe(1)
  })

  it('has no span with nothing to span', () => {
    expect(summarizeInsiderActivity([])).toEqual({
      buys: 0,
      sells: 0,
      spanDays: null,
    })
  })

  it('does not assume the list arrives sorted', () => {
    // The server sorts newest-first, but the summary must not depend on it:
    // a wrong span is a claim about how long the selling has been going on.
    const summary = summarizeInsiderActivity([
      tx({ date: '2026-06-15' }),
      tx({ date: '2026-08-01' }),
      tx({ date: '2026-01-02' }),
    ])
    expect(summary.spanDays).toBe(212)
  })
})
