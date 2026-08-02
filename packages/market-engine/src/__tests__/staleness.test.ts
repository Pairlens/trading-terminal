// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { StalenessTracker } from '../staleness'

const T = 30_000 // 30s threshold

describe('StalenessTracker', () => {
  it('is not stale before any activity', () => {
    const s = new StalenessTracker()
    expect(s.hasActivity()).toBe(false)
    expect(s.isStale(1_000_000, T)).toBe(false)
  })

  it('is not stale within the threshold', () => {
    const s = new StalenessTracker()
    s.mark(1_000_000)
    expect(s.isStale(1_000_000 + T - 1, T)).toBe(false)
  })

  it('becomes stale once the threshold elapses without activity', () => {
    const s = new StalenessTracker()
    s.mark(1_000_000)
    expect(s.isStale(1_000_000 + T + 1, T)).toBe(true)
  })

  it('recovers when fresh activity arrives', () => {
    const s = new StalenessTracker()
    s.mark(1_000_000)
    expect(s.isStale(1_100_000, T)).toBe(true)
    s.mark(1_100_000)
    expect(s.isStale(1_100_000, T)).toBe(false)
  })

  it('reset clears activity', () => {
    const s = new StalenessTracker()
    s.mark(1_000_000)
    s.reset()
    expect(s.hasActivity()).toBe(false)
    expect(s.isStale(2_000_000, T)).toBe(false)
  })
})
