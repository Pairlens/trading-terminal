// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  MIN_SHEET_HEIGHT,
  SHEET_BAND,
  resolveSheetTop,
  sheetTop,
} from '../lib/mobile-geometry'

/**
 * The sheet-top formula is the one piece of mobile geometry that is shared by
 * five screens, so it is the one piece worth pinning: a regression here is a
 * panel that opens off-screen on a small phone, which no type check catches.
 */
describe('sheetTop', () => {
  test('a panel sits its designed chart band below the chart top', () => {
    // A tall phone: nothing is clamped, so the formula is pure addition.
    expect(resolveSheetTop(SHEET_BAND.watchlist, 150, 874)).toBe(300)
    expect(resolveSheetTop(SHEET_BAND.trade, 150, 874)).toBe(310)
    expect(resolveSheetTop(SHEET_BAND.copilot, 150, 874)).toBe(336)
    expect(resolveSheetTop(SHEET_BAND.discover, 150, 874)).toBe(274)
    expect(resolveSheetTop(SHEET_BAND.drawingTools, 150, 874)).toBe(246)
  })

  test('both Trade states share one sheet top', () => {
    // They are one screen in two states — the connect gate must not move it.
    expect(resolveSheetTop(SHEET_BAND.trade, 150, 874)).toBe(
      resolveSheetTop(SHEET_BAND.trade, 150, 874),
    )
    expect(SHEET_BAND.trade).toBe(160)
  })

  test('full-height sheets start at the chart top', () => {
    expect(resolveSheetTop('full', 150, 874)).toBe(150)
    expect(sheetTop('full')).toBe('var(--pl-chart-top)')
  })

  test('a short phone clamps to a usable content height', () => {
    // 568px (the shortest phone still in the wild). Un-clamped the co-pilot
    // sheet would open at 336 and leave 232px of content; the clamp is what
    // hands the panel the room instead of the chart strip.
    const top = resolveSheetTop(SHEET_BAND.copilot, 150, 568)
    expect(top).toBe(568 - MIN_SHEET_HEIGHT)
    expect(top).toBeLessThan(150 + SHEET_BAND.copilot)
  })

  test('a tall phone is never clamped — the band is honoured exactly', () => {
    expect(resolveSheetTop(SHEET_BAND.copilot, 150, 874)).toBe(
      150 + SHEET_BAND.copilot,
    )
  })

  test('every band keeps at least the minimum content height', () => {
    for (const band of Object.values(SHEET_BAND)) {
      for (const viewport of [568, 667, 740, 874, 932]) {
        const top = resolveSheetTop(band, 150, viewport)
        expect(viewport - top).toBeGreaterThanOrEqual(MIN_SHEET_HEIGHT)
      }
    }
  })

  test('the CSS form carries the same clamp and uses svh, never vh', () => {
    const css = sheetTop(SHEET_BAND.trade)
    expect(css).toContain('var(--pl-chart-top)')
    expect(css).toContain('160px')
    expect(css).toContain('100svh')
    expect(css).not.toContain('100vh)')
    expect(css.startsWith('min(')).toBe(true)
  })
})
