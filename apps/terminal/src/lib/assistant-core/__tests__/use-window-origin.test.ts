// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { ASSISTANT_PLACEMENT_VALUES } from '../placement'
import {
  ASSISTANT_ORIGIN_FALLBACK,
  assistantWindowOrigin,
} from '../use-window-origin'

/** The window as the three placements park it, 440x660. */
const FRAME = { left: 820, top: 100, width: 440, height: 660 }

function origin(orb: { left: number; top: number }) {
  const result = assistantWindowOrigin(FRAME, {
    ...orb,
    width: 30,
    height: 30,
  })
  if (!result) throw new Error('expected a measured origin')
  return result
}

function parse(value: string) {
  const [x, y] = value.split(' ').map((part) => Number.parseFloat(part))
  return { x, y }
}

describe('assistant window origin', () => {
  test('the origin is the orb centre in the window’s coordinates', () => {
    // Floating: the orb sits just under the window's bottom-right corner.
    const point = parse(origin({ left: 1215, top: 775 }).transformOrigin)
    expect(point.x).toBe(1215 + 15 - FRAME.left)
    expect(point.y).toBe(775 + 15 - FRAME.top)
  })

  test('the collapsed window travels toward the orb, not just down', () => {
    // Rail placement: the orb is up and to the LEFT, so the panel has to
    // fold that way. The old fixed `y: 12` sent it downward from every
    // placement, which is the bug this whole module exists to fix.
    const rail = origin({ left: 20, top: 140 })
    expect(rail.offset.x).toBeLessThan(0)
    expect(rail.offset.y).toBeLessThan(0)

    const floating = origin({ left: 1215, top: 775 })
    expect(floating.offset.x).toBeGreaterThan(0)
    expect(floating.offset.y).toBeGreaterThan(0)
  })

  test('a window dragged across the screen still only leans at the orb', () => {
    // Otherwise the panel swoops the width of the display, which reads as
    // a bug rather than as an origin.
    const far = origin({ left: 0, top: 0 })
    const point = parse(far.transformOrigin)
    expect(point.x).toBeGreaterThanOrEqual(-72)
    expect(point.y).toBeGreaterThanOrEqual(-72)
    expect(Math.hypot(far.offset.x, far.offset.y)).toBeLessThanOrEqual(17)
  })

  test('a box with no area cannot be measured', () => {
    // What an element that has not been laid out yet reports. Callers
    // fall back to the placement default rather than animating from 0,0.
    expect(
      assistantWindowOrigin(FRAME, { left: 0, top: 0, width: 0, height: 0 }),
    ).toBeNull()
    expect(
      assistantWindowOrigin(
        { left: 0, top: 0, width: 0, height: 0 },
        { left: 0, top: 0, width: 30, height: 30 },
      ),
    ).toBeNull()
  })

  test('every placement has a fallback for the paint before the measure', () => {
    for (const placement of ASSISTANT_PLACEMENT_VALUES) {
      expect(ASSISTANT_ORIGIN_FALLBACK[placement].transformOrigin).toBeTruthy()
    }
  })
})
