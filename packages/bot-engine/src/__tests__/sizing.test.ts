// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { resolveQuantity } from '../sizing'
import type { SizingResult } from '../sizing'

/** Refusals must carry a reason a user can read, not just a zero. */
function reasonOf(result: SizingResult): string {
  expect(result.quantity).toBe(0)
  expect('reason' in result).toBe(true)
  return 'reason' in result ? result.reason : ''
}

describe('percent-equity', () => {
  test('commits the configured fraction of the balance', () => {
    const result = resolveQuantity(
      { kind: 'percent-equity', value: 0.5 },
      1000,
      100,
    )
    expect(result.quantity).toBe(5)
  })

  test('a full-equity rule uses the whole balance', () => {
    const result = resolveQuantity(
      { kind: 'percent-equity', value: 1 },
      1000,
      250,
    )
    expect(result.quantity).toBe(4)
  })

  test('scales with equity, so the same rule compounds', () => {
    const rule = { kind: 'percent-equity', value: 0.25 } as const
    expect(resolveQuantity(rule, 1000, 100).quantity).toBe(2.5)
    expect(resolveQuantity(rule, 2000, 100).quantity).toBe(5)
  })

  test('refuses leverage rather than silently clamping it', () => {
    const result = resolveQuantity(
      { kind: 'percent-equity', value: 1.5 },
      1000,
      100,
    )
    expect(reasonOf(result)).toContain('percent-equity')
  })
})

describe('fixed-quote', () => {
  test('spends exactly the configured notional', () => {
    const result = resolveQuantity(
      { kind: 'fixed-quote', value: 250 },
      1000,
      50,
    )
    expect(result.quantity).toBe(5)
  })

  test('refuses when the balance cannot cover it', () => {
    const result = resolveQuantity({ kind: 'fixed-quote', value: 250 }, 100, 50)
    expect(reasonOf(result)).toContain('exceeds available')
  })
})

describe('fixed-base', () => {
  test('passes the configured base size through untouched', () => {
    const result = resolveQuantity(
      { kind: 'fixed-base', value: 0.01 },
      1000,
      100,
    )
    expect(result.quantity).toBe(0.01)
  })

  test('refuses when the price has moved beyond what the balance buys', () => {
    const result = resolveQuantity({ kind: 'fixed-base', value: 1 }, 1000, 5000)
    expect(reasonOf(result)).toContain('available')
  })
})

describe('step size', () => {
  test('rounds down, never up', () => {
    const result = resolveQuantity(
      { kind: 'percent-equity', value: 0.5 },
      1000,
      300,
      { stepSize: 0.001 },
    )
    // 1.6666… truncated, not rounded to 1.667.
    expect(result.quantity).toBe(1.666)
  })

  test('leaves an exact multiple alone despite binary-float noise', () => {
    const result = resolveQuantity(
      { kind: 'fixed-base', value: 0.3 },
      1000,
      100,
      {
        stepSize: 0.1,
      },
    )
    expect(result.quantity).toBe(0.3)
  })

  test('handles whole-unit steps', () => {
    const result = resolveQuantity(
      { kind: 'fixed-base', value: 7.9 },
      1000,
      10,
      {
        stepSize: 1,
      },
    )
    expect(result.quantity).toBe(7)
  })

  test('handles exponential steps from venue metadata', () => {
    const result = resolveQuantity(
      { kind: 'fixed-base', value: 0.123456789 },
      1000,
      100,
      { stepSize: 1e-8 },
    )
    expect(result.quantity).toBe(0.12345678)
  })

  test('refuses when rounding leaves nothing', () => {
    const result = resolveQuantity(
      { kind: 'fixed-quote', value: 5 },
      1000,
      50000,
      { stepSize: 0.01 },
    )
    expect(reasonOf(result)).toContain('rounds to zero')
  })

  test('an unusable step is ignored rather than fatal', () => {
    const result = resolveQuantity({ kind: 'fixed-base', value: 2 }, 1000, 10, {
      stepSize: 0,
    })
    expect(result.quantity).toBe(2)
  })
})

describe('venue minimums', () => {
  test('rejects below minNotional with the numbers in the reason', () => {
    const result = resolveQuantity(
      { kind: 'fixed-quote', value: 5 },
      1000,
      100,
      {
        minNotional: 10,
      },
    )
    expect(reasonOf(result)).toContain('10')
  })

  test('accepts exactly minNotional', () => {
    const result = resolveQuantity(
      { kind: 'fixed-quote', value: 10 },
      1000,
      100,
      { minNotional: 10 },
    )
    expect(result.quantity).toBe(0.1)
  })

  test('rejects below minQuantity', () => {
    const result = resolveQuantity(
      { kind: 'fixed-base', value: 0.0005 },
      1000,
      100,
      { minQuantity: 0.001 },
    )
    expect(reasonOf(result)).toContain('venue minimum')
  })

  test('checks the minimums against the ROUNDED size', () => {
    // 0.0019 rounds down to 0.001, which is exactly the floor — a check run
    // before rounding would have waved through a size the venue rejects.
    const rounded = resolveQuantity(
      { kind: 'fixed-base', value: 0.0019 },
      1000,
      100,
      { stepSize: 0.001, minQuantity: 0.0015 },
    )
    expect(reasonOf(rounded)).toContain('0.0015')
  })
})

describe('unusable inputs', () => {
  test('no price', () => {
    expect(
      reasonOf(resolveQuantity({ kind: 'fixed-base', value: 1 }, 1000, 0)),
    ).toContain('price')
    expect(
      reasonOf(
        resolveQuantity({ kind: 'fixed-base', value: 1 }, 1000, Number.NaN),
      ),
    ).toContain('price')
  })

  test('no balance', () => {
    expect(
      reasonOf(resolveQuantity({ kind: 'percent-equity', value: 0.5 }, 0, 100)),
    ).toContain('balance')
    expect(
      reasonOf(
        resolveQuantity({ kind: 'percent-equity', value: 0.5 }, -5, 100),
      ),
    ).toContain('balance')
  })

  test('a non-positive sizing value', () => {
    expect(
      reasonOf(resolveQuantity({ kind: 'fixed-quote', value: 0 }, 1000, 100)),
    ).toContain('positive')
    expect(
      reasonOf(resolveQuantity({ kind: 'fixed-base', value: -1 }, 1000, 100)),
    ).toContain('positive')
  })
})
