// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The curve reconstruction, pinned against the venue's own figures.
 *
 * The samples below are real: market cap and `bondingCurve` read together off
 * `datapi.jup.ag/v1/pools/gems` on 2026-08-22 with SOL at $94.03. They are the
 * regression that stops the naive `mcap / target` ratio from creeping back in
 * — it passes a spot check at 90% and is off by twenty points at 60%, so a
 * test with one sample near the top would not have caught it.
 */
import { describe, expect, test } from 'bun:test'

import {
  GRADUATING_FLOOR,
  ageMsOf,
  curveProgressOf,
  graduationTargetUsd,
  isGraduating,
} from '../graduation'

const SOL = 94.03

/** [venue-reported curve %, market cap USD] for pump.fun tokens. */
const SAMPLES: ReadonlyArray<readonly [number, number]> = [
  [63.4, 9309],
  [64.3, 9653],
  [65.4, 9859],
  [68.9, 10959],
  [72.1, 11941],
  [76.2, 13853],
  [78.0, 14581],
  [82.3, 17124],
  [86.7, 23030],
  [94.2, 29056],
]

describe('curveProgressOf', () => {
  test('reconstructs the venue percentage across the whole curve', () => {
    const errors: Array<number> = []
    for (const [reported, marketCapUsd] of SAMPLES) {
      const progress = curveProgressOf({
        launchpad: 'pump.fun',
        marketCapUsd,
        solPriceUsd: SOL,
        graduatedAt: null,
      })
      expect(progress).not.toBeNull()
      errors.push(Math.abs(progress! * 100 - reported))
    }
    // Two bounds rather than one, because they pin different things. The
    // median pins the SHAPE: a wrong curve loses it immediately, and it is
    // what a re-fit of the constant must not degrade. The per-sample ceiling
    // is deliberately loose, because market cap and the venue's percentage are
    // not read at the same instant and one sample in ten drifts a couple of
    // points from that alone. Tightening it would make the suite fail on
    // sampling noise, and chasing that outlier with the constant costs
    // accuracy on the other nine.
    const median = [...errors].sort((a, b) => a - b)[
      Math.floor(errors.length / 2)
    ]
    expect(median).toBeLessThan(0.5)
    expect(Math.max(...errors)).toBeLessThan(3)
  })

  test('a linear ratio would fail the low end, which is why the curve is inverted', () => {
    // Same 63.4% sample. The naive reconstruction the curve math replaced.
    const target = graduationTargetUsd('pump.fun', SOL)!
    const naive = (9309 / target) * 100
    expect(Math.abs(naive - 63.4)).toBeGreaterThan(15)
  })

  test('is monotonic in market cap', () => {
    const progressAt = (mcap: number) =>
      curveProgressOf({
        launchpad: 'pump.fun',
        marketCapUsd: mcap,
        solPriceUsd: SOL,
        graduatedAt: null,
      })!
    let previous = -1
    for (const mcap of [2_000, 5_000, 10_000, 20_000, 30_000, 38_000]) {
      const current = progressAt(mcap)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
  })

  test('a graduated token is complete, never 99%', () => {
    expect(
      curveProgressOf({
        launchpad: 'pump.fun',
        // Post-graduation prints dump well below the threshold. Reading the
        // market cap here would put a migrated token back at 60%.
        marketCapUsd: 12_000,
        solPriceUsd: SOL,
        graduatedAt: '2026-08-21T23:07:38Z',
      }),
    ).toBe(1)
  })

  test('clamps rather than reporting over 100% or a negative', () => {
    expect(
      curveProgressOf({
        launchpad: 'pump.fun',
        marketCapUsd: 5_000_000,
        solPriceUsd: SOL,
        graduatedAt: null,
      }),
    ).toBe(1)
    expect(
      curveProgressOf({
        launchpad: 'pump.fun',
        marketCapUsd: 1,
        solPriceUsd: SOL,
        graduatedAt: null,
      }),
    ).toBe(0)
  })

  test('an unknown launchpad answers null, never a confident zero', () => {
    expect(
      curveProgressOf({
        launchpad: 'some-new-launchpad',
        marketCapUsd: 20_000,
        solPriceUsd: SOL,
        graduatedAt: null,
      }),
    ).toBeNull()
    // BONK predates curves entirely: no launchpad, so no progress to report.
    expect(
      curveProgressOf({
        launchpad: null,
        marketCapUsd: 270_000_000,
        solPriceUsd: SOL,
        graduatedAt: null,
      }),
    ).toBeNull()
  })

  test('a missing SOL price degrades to unknown rather than to a wrong number', () => {
    expect(
      curveProgressOf({
        launchpad: 'pump.fun',
        marketCapUsd: 20_000,
        solPriceUsd: null,
        graduatedAt: null,
      }),
    ).toBeNull()
  })
})

describe('graduationTargetUsd', () => {
  test('tracks the SOL price, because the threshold is denominated in SOL', () => {
    const cheap = graduationTargetUsd('pump.fun', 94.03)!
    const dear = graduationTargetUsd('pump.fun', 224)!
    expect(dear / cheap).toBeCloseTo(224 / 94.03, 5)
    // The figure the market quotes when SOL trades in the low 200s.
    expect(dear).toBeGreaterThan(80_000)
    expect(dear).toBeLessThan(100_000)
  })

  test('is null for a launchpad with no fitted curve', () => {
    expect(graduationTargetUsd('daos.fun', 94.03)).toBeNull()
    expect(graduationTargetUsd(null, 94.03)).toBeNull()
  })
})

describe('isGraduating', () => {
  test('excludes the completed and the barely started', () => {
    expect(isGraduating(1)).toBe(false)
    expect(isGraduating(0.1)).toBe(false)
    expect(isGraduating(null)).toBe(false)
    expect(isGraduating(GRADUATING_FLOOR)).toBe(true)
    expect(isGraduating(0.97)).toBe(true)
  })
})

describe('ageMsOf', () => {
  const now = Date.parse('2026-08-22T00:00:00Z')

  test('measures forward from the timestamp', () => {
    expect(ageMsOf('2026-08-21T23:00:00Z', now)).toBe(3_600_000)
  })

  test('answers null for missing or unparsable input', () => {
    expect(ageMsOf(null, now)).toBeNull()
    expect(ageMsOf('not a date', now)).toBeNull()
  })
})
