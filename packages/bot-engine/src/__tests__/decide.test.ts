// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { decideTransition } from '../decide'
import type { BotPosition, BotSide } from '../types'

function held(side: BotSide): BotPosition {
  return {
    side,
    quantity: 1,
    entryPrice: 100,
    entryTs: 0,
    barsHeld: 0,
    extremePrice: 100,
  }
}

function decide(
  position: BotPosition | null,
  target: number,
  allowShort = true,
) {
  return decideTransition({ position, target, allowShort, barIndex: 42 })
}

describe('decideTransition — entries', () => {
  test('flat to long buys', () => {
    expect(decide(null, 1)).toEqual({
      kind: 'enter',
      side: 'buy',
      targetSide: 'long',
      reason: 'signal-entry',
      barIndex: 42,
    })
  })

  test('flat to short sells', () => {
    expect(decide(null, -1)).toEqual({
      kind: 'enter',
      side: 'sell',
      targetSide: 'short',
      reason: 'signal-entry',
      barIndex: 42,
    })
  })
})

describe('decideTransition — exits', () => {
  test('long to flat sells', () => {
    expect(decide(held('long'), 0)).toEqual({
      kind: 'exit',
      side: 'sell',
      targetSide: null,
      reason: 'signal-exit',
      barIndex: 42,
    })
  })

  test('short to flat buys', () => {
    expect(decide(held('short'), 0)).toEqual({
      kind: 'exit',
      side: 'buy',
      targetSide: null,
      reason: 'signal-exit',
      barIndex: 42,
    })
  })
})

describe('decideTransition — reversals', () => {
  test('long to short is a single sell flip, never an exit plus an entry', () => {
    expect(decide(held('long'), -1)).toEqual({
      kind: 'flip',
      side: 'sell',
      targetSide: 'short',
      reason: 'signal-flip',
      barIndex: 42,
    })
  })

  test('short to long is a single buy flip', () => {
    expect(decide(held('short'), 1)).toEqual({
      kind: 'flip',
      side: 'buy',
      targetSide: 'long',
      reason: 'signal-flip',
      barIndex: 42,
    })
  })
})

describe('decideTransition — no-ops', () => {
  test('flat and asked to be flat', () => {
    expect(decide(null, 0)).toBe(null)
  })

  test('long and asked to be long', () => {
    expect(decide(held('long'), 1)).toBe(null)
  })

  test('short and asked to be short', () => {
    expect(decide(held('short'), -1)).toBe(null)
  })

  test('a target the strategy scales does not re-enter an existing position', () => {
    expect(decide(held('long'), 0.5)).toBe(null)
    expect(decide(held('short'), -3)).toBe(null)
  })
})

describe('decideTransition — allowShort', () => {
  test('a short target on a long-only deployment stays flat', () => {
    expect(decide(null, -1, false)).toBe(null)
  })

  test('a short target on a long-only deployment still closes a long', () => {
    expect(decide(held('long'), -1, false)).toEqual({
      kind: 'exit',
      side: 'sell',
      targetSide: null,
      reason: 'signal-exit',
      barIndex: 42,
    })
  })

  test('long targets are unaffected', () => {
    expect(decide(null, 1, false)).toEqual({
      kind: 'enter',
      side: 'buy',
      targetSide: 'long',
      reason: 'signal-entry',
      barIndex: 42,
    })
  })
})

describe('decideTransition — broken targets', () => {
  test('a NaN target flattens rather than holding risk on a bad computation', () => {
    expect(decide(held('long'), Number.NaN)).toEqual({
      kind: 'exit',
      side: 'sell',
      targetSide: null,
      reason: 'signal-exit',
      barIndex: 42,
    })
    expect(decide(null, Number.NaN)).toBe(null)
  })

  test('an infinite target does not open a position', () => {
    expect(decide(null, Number.POSITIVE_INFINITY)).toBe(null)
  })
})

describe('decideTransition — bar index', () => {
  test('the deciding bar rides along on the intent', () => {
    const intent = decideTransition({
      position: null,
      target: 1,
      allowShort: true,
      barIndex: 7,
    })
    expect(intent?.barIndex).toBe(7)
  })
})
