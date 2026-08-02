// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { evaluateRisk, updateExtreme } from '../risk'
import type { BotBar, BotPosition, BotSide } from '../types'

function position(
  side: BotSide,
  overrides: Partial<BotPosition> = {},
): BotPosition {
  return {
    side,
    quantity: 1,
    entryPrice: 100,
    entryTs: 0,
    barsHeld: 0,
    extremePrice: 100,
    ...overrides,
  }
}

function bar(high: number, low: number, close = (high + low) / 2): BotBar {
  return { ts: 0, open: close, high, low, close }
}

describe('evaluateRisk — long', () => {
  test('stop-loss fires on the low and fills at the trigger level', () => {
    const exit = evaluateRisk(position('long'), bar(101, 97), {
      stopLoss: 0.02,
    })
    expect(exit).toEqual({ reason: 'stop-loss', price: 98 })
  })

  test('a gap straight through the stop still reports the stop level', () => {
    // The alternative — filling at the close — would make every gap look like
    // a stop that magically worked.
    const exit = evaluateRisk(position('long'), bar(90, 80, 85), {
      stopLoss: 0.02,
    })
    expect(exit).toEqual({ reason: 'stop-loss', price: 98 })
  })

  test('a bar that never reaches the stop leaves the position open', () => {
    expect(
      evaluateRisk(position('long'), bar(101, 99), { stopLoss: 0.02 }),
    ).toBe(null)
  })

  test('an exact touch of the level counts as a trigger', () => {
    const exit = evaluateRisk(position('long'), bar(101, 98), {
      stopLoss: 0.02,
    })
    expect(exit).toEqual({ reason: 'stop-loss', price: 98 })
  })

  test('take-profit fires on the high and fills at the target', () => {
    const exit = evaluateRisk(position('long'), bar(106, 99), {
      takeProfit: 0.05,
    })
    expect(exit).toEqual({ reason: 'take-profit', price: 105 })
  })

  test('trailing stop measures from the extreme, not the entry', () => {
    const held = position('long', { extremePrice: 110 })
    const exit = evaluateRisk(held, bar(111, 104), { trailingStop: 0.05 })
    expect(exit).toEqual({ reason: 'trailing-stop', price: 104.5 })
  })

  test('max-bars fires at the close once the position is old enough', () => {
    const exit = evaluateRisk(position('long', { barsHeld: 5 }), bar(101, 99), {
      maxBars: 5,
    })
    expect(exit).toEqual({ reason: 'max-bars', price: 100 })
  })

  test('max-bars does not fire a bar early', () => {
    expect(
      evaluateRisk(position('long', { barsHeld: 4 }), bar(101, 99), {
        maxBars: 5,
      }),
    ).toBe(null)
  })

  test('no configured risk means no exit', () => {
    expect(evaluateRisk(position('long'), bar(200, 1), {})).toBe(null)
  })

  test('zero-valued limits read as unconfigured, not as instant exits', () => {
    expect(
      evaluateRisk(position('long'), bar(101, 99), {
        stopLoss: 0,
        takeProfit: 0,
        trailingStop: 0,
        maxBars: 0,
      }),
    ).toBe(null)
  })
})

describe('evaluateRisk — short symmetry', () => {
  test('stop-loss fires above the entry', () => {
    const exit = evaluateRisk(position('short'), bar(103, 99), {
      stopLoss: 0.02,
    })
    expect(exit).toEqual({ reason: 'stop-loss', price: 102 })
  })

  test('take-profit fires below the entry', () => {
    const exit = evaluateRisk(position('short'), bar(101, 94), {
      takeProfit: 0.05,
    })
    expect(exit).toEqual({ reason: 'take-profit', price: 95 })
  })

  test('trailing stop trails the lowest low', () => {
    const held = position('short', { extremePrice: 90 })
    const exit = evaluateRisk(held, bar(95, 89), { trailingStop: 0.05 })
    expect(exit).toEqual({ reason: 'trailing-stop', price: 94.5 })
  })

  test('max-bars exits at the close', () => {
    const exit = evaluateRisk(
      position('short', { barsHeld: 3 }),
      bar(101, 99),
      {
        maxBars: 3,
      },
    )
    expect(exit).toEqual({ reason: 'max-bars', price: 100 })
  })

  test('a favourable bar alone does not exit', () => {
    expect(
      evaluateRisk(position('short'), bar(100.5, 96), {
        stopLoss: 0.02,
        takeProfit: 0.05,
      }),
    ).toBe(null)
  })
})

describe('evaluateRisk — precedence when one bar spans several levels', () => {
  test('stop-loss beats take-profit on the same long bar', () => {
    const exit = evaluateRisk(position('long'), bar(106, 97), {
      stopLoss: 0.02,
      takeProfit: 0.05,
    })
    expect(exit).toEqual({ reason: 'stop-loss', price: 98 })
  })

  test('stop-loss beats take-profit on the same short bar', () => {
    const exit = evaluateRisk(position('short'), bar(103, 94), {
      stopLoss: 0.02,
      takeProfit: 0.05,
    })
    expect(exit).toEqual({ reason: 'stop-loss', price: 102 })
  })

  test('trailing stop beats take-profit', () => {
    const held = position('long', { extremePrice: 110 })
    const exit = evaluateRisk(held, bar(120, 100), {
      takeProfit: 0.05,
      trailingStop: 0.05,
    })
    expect(exit).toEqual({ reason: 'trailing-stop', price: 104.5 })
  })

  test('the price stop beats max-bars on the bar the clock also runs out', () => {
    const exit = evaluateRisk(position('long', { barsHeld: 9 }), bar(101, 90), {
      stopLoss: 0.02,
      maxBars: 9,
    })
    expect(exit).toEqual({ reason: 'stop-loss', price: 98 })
  })

  test('when both stops trigger, the one price touched first wins (long)', () => {
    // Trailing sits at 104.5, the hard stop at 90: falling from 110 the
    // position is already closed by the time 90 prints.
    const held = position('long', { extremePrice: 110 })
    const exit = evaluateRisk(held, bar(111, 85), {
      stopLoss: 0.1,
      trailingStop: 0.05,
    })
    expect(exit).toEqual({ reason: 'trailing-stop', price: 104.5 })
  })

  test('a loose trailing stop yields to the tighter hard stop (long)', () => {
    const exit = evaluateRisk(position('long'), bar(101, 70), {
      stopLoss: 0.1,
      trailingStop: 0.2,
    })
    expect(exit).toEqual({ reason: 'stop-loss', price: 90 })
  })

  test('when both stops trigger, the one price touched first wins (short)', () => {
    const held = position('short', { extremePrice: 90 })
    const exit = evaluateRisk(held, bar(115, 89), {
      stopLoss: 0.1,
      trailingStop: 0.05,
    })
    expect(exit).toEqual({ reason: 'trailing-stop', price: 94.5 })
  })

  test('identical stop levels report the explicit stop-loss', () => {
    const exit = evaluateRisk(position('long'), bar(101, 94), {
      stopLoss: 0.05,
      trailingStop: 0.05,
    })
    expect(exit).toEqual({ reason: 'stop-loss', price: 95 })
  })
})

describe('trailing stop across bars', () => {
  test('a favourable run lifts the stop, and the pullback then hits it', () => {
    const spec = { trailingStop: 0.1 }
    let held = position('long')

    // Bar 1 runs up. The stop for THIS bar is still measured from the entry,
    // so a low of 95 is safe (level 90).
    const up = bar(120, 95)
    expect(evaluateRisk(held, up, spec)).toBe(null)
    held = { ...held, extremePrice: updateExtreme(held, up), barsHeld: 1 }
    expect(held.extremePrice).toBe(120)

    // Bar 2 gives back more than a tenth of the run: 108 is the new stop.
    const down = bar(118, 107)
    expect(evaluateRisk(held, down, spec)).toEqual({
      reason: 'trailing-stop',
      price: 108,
    })
  })

  test('the stop never ratchets back down after an adverse bar', () => {
    const spec = { trailingStop: 0.1 }
    let held = position('long')
    const up = bar(120, 99)
    held = { ...held, extremePrice: updateExtreme(held, up) }

    const flat = bar(112, 109)
    expect(evaluateRisk(held, flat, spec)).toBe(null)
    held = { ...held, extremePrice: updateExtreme(held, flat) }
    expect(held.extremePrice).toBe(120)

    expect(evaluateRisk(held, bar(112, 107.9), spec)).toEqual({
      reason: 'trailing-stop',
      price: 108,
    })
  })

  test('shorts trail downwards the same way', () => {
    const spec = { trailingStop: 0.1 }
    let held = position('short')
    const down = bar(101, 80)
    expect(evaluateRisk(held, down, spec)).toBe(null)
    held = { ...held, extremePrice: updateExtreme(held, down) }
    expect(held.extremePrice).toBe(80)

    expect(evaluateRisk(held, bar(88.1, 82), spec)).toEqual({
      reason: 'trailing-stop',
      price: 88,
    })
  })
})

describe('updateExtreme', () => {
  test('longs keep the highest high', () => {
    expect(updateExtreme(position('long'), bar(120, 90))).toBe(120)
    expect(
      updateExtreme(position('long', { extremePrice: 130 }), bar(120, 90)),
    ).toBe(130)
  })

  test('shorts keep the lowest low', () => {
    expect(updateExtreme(position('short'), bar(120, 90))).toBe(90)
    expect(
      updateExtreme(position('short', { extremePrice: 80 }), bar(120, 90)),
    ).toBe(80)
  })

  test('an unset extreme falls back to the entry price', () => {
    const held = position('long', { extremePrice: Number.NaN })
    expect(updateExtreme(held, bar(99, 98))).toBe(100)
  })
})
