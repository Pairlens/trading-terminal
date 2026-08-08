// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  LIMIT_GRAB_HALF,
  clampLimitDragY,
  limitStripBottom,
  placeLimitLine,
} from '../chart/limit-line-geometry'
import { EXPANDED_BAND, SHEET_BAND } from '../lib/mobile-geometry'

/**
 * The chart is full height in every view and the Trade sheet covers it, so the
 * limit line's usable range is set by the sheet's snap and not by the plot.
 * These are the numbers at 402 × 874: chart top 58, slot bottom 50px above the
 * tab bar, plot 702 − 22 (time axis) = 680.
 */
const PLOT = 680

describe('limitStripBottom', () => {
  test('a docked Trade sheet cuts the range to its visible band', () => {
    // 160px of chart on screen, and the line stops half a grab strip short of
    // the sheet so the tag and its 44px target stay whole.
    expect(limitStripBottom(PLOT, SHEET_BAND.trade)).toBe(138)
    expect(limitStripBottom(PLOT, SHEET_BAND.trade)).toBe(
      SHEET_BAND.trade - LIMIT_GRAB_HALF,
    )
  })

  test('the expanded snap shrinks it to the same rule', () => {
    expect(limitStripBottom(PLOT, EXPANDED_BAND)).toBe(42)
  })

  test('nothing covering the chart means the whole plot', () => {
    expect(limitStripBottom(PLOT, Number.POSITIVE_INFINITY)).toBe(PLOT)
  })

  test('a strip taller than the plot never reaches past the plot', () => {
    // Short chart, tall band (a landscape phone): the engine's own bottom wins.
    expect(limitStripBottom(120, 400)).toBe(120)
  })

  test('a strip shorter than the grab strip floors at the top', () => {
    expect(limitStripBottom(PLOT, 10)).toBe(0)
  })
})

describe('placeLimitLine', () => {
  test('a level inside the strip is drawn at its own y', () => {
    expect(placeLimitLine(90, PLOT, SHEET_BAND.trade)).toEqual({
      y: 90,
      pinned: false,
      visible: true,
    })
  })

  test('a level under the sheet pins to the strip and says so', () => {
    // The regression this exists for: on the full-height chart the y is real,
    // it is simply behind a z-40 sheet.
    expect(placeLimitLine(430, PLOT, SHEET_BAND.trade)).toEqual({
      y: 138,
      pinned: true,
      visible: true,
    })
  })

  test('expanding the sheet re-pins into the smaller strip', () => {
    const y = 100
    expect(placeLimitLine(y, PLOT, SHEET_BAND.trade).pinned).toBe(false)
    expect(placeLimitLine(y, PLOT, EXPANDED_BAND)).toEqual({
      y: 42,
      pinned: true,
      visible: true,
    })
  })

  test('a price off the plot still hides rather than pinning', () => {
    // Above the chart top, past the plot's bottom, unmappable: not "covered",
    // not on the chart at all. Pinning those would invent a level.
    expect(placeLimitLine(-4, PLOT, SHEET_BAND.trade).visible).toBe(false)
    expect(placeLimitLine(PLOT + 1, PLOT, SHEET_BAND.trade).visible).toBe(false)
    expect(placeLimitLine(null, PLOT, SHEET_BAND.trade).visible).toBe(false)
    expect(placeLimitLine(Number.NaN, PLOT, SHEET_BAND.trade).visible).toBe(
      false,
    )
  })

  test('landing exactly on the floor does not read as pinned', () => {
    // A drag that ends at the floor writes back a ROUNDED price, which maps a
    // fraction of a pixel lower. Without the tolerance the tag would flag
    // itself pinned the moment the user let go of it there.
    expect(placeLimitLine(138, PLOT, SHEET_BAND.trade).pinned).toBe(false)
    expect(placeLimitLine(138.4, PLOT, SHEET_BAND.trade).pinned).toBe(false)
    expect(placeLimitLine(140, PLOT, SHEET_BAND.trade).pinned).toBe(true)
  })
})

describe('clampLimitDragY', () => {
  test('a drag cannot leave the strip in either direction', () => {
    expect(clampLimitDragY(-40, PLOT, SHEET_BAND.trade)).toBe(0)
    expect(clampLimitDragY(70, PLOT, SHEET_BAND.trade)).toBe(70)
    // Pointer capture keeps delivering moves over the sheet; they all land here.
    expect(clampLimitDragY(600, PLOT, SHEET_BAND.trade)).toBe(138)
  })

  test('the drag floor is the same number the placement pins to', () => {
    for (const strip of [SHEET_BAND.trade, EXPANDED_BAND, 96, 124]) {
      expect(clampLimitDragY(9999, PLOT, strip)).toBe(
        placeLimitLine(PLOT, PLOT, strip).y,
      )
    }
  })
})
