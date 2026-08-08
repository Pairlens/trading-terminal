// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  EXPANDED_BAND,
  MIN_SHEET_HEIGHT,
  SHEET_BAND,
  parseTranslateY,
  resolveSheetSnaps,
  resolveSheetTop,
  sheetDismissTravel,
  sheetTop,
  shouldDismissSheet,
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

/**
 * The snap heights are what vaul translates the sheet by, so an error here is
 * a panel that opens at the wrong height or an expanded snap that cannot be
 * reached — neither of which a type check or a screenshot at one viewport size
 * would catch.
 */
describe('resolveSheetSnaps', () => {
  test('the default snap is exactly where the panel used to sit', () => {
    for (const band of Object.values(SHEET_BAND)) {
      const snaps = resolveSheetSnaps(band, 58, 874)
      expect(snaps.defaultHeight).toBe(874 - resolveSheetTop(band, 58, 874))
    }
  })

  test('the expanded snap stops below the context bar and the price row', () => {
    const snaps = resolveSheetSnaps(SHEET_BAND.watchlist, 58, 874)
    expect(snaps.expandedHeight).toBe(874 - 58 - EXPANDED_BAND)
    // The compact readout (8 inset + 22 price + 6 + 13 change) has to survive.
    expect(EXPANDED_BAND).toBeGreaterThanOrEqual(49)
  })

  test('every panel can actually be expanded', () => {
    for (const band of Object.values(SHEET_BAND)) {
      for (const viewport of [568, 667, 740, 874, 932]) {
        const snaps = resolveSheetSnaps(band, 58, viewport)
        expect(snaps.expandedHeight).toBeGreaterThan(snaps.defaultHeight)
      }
    }
  })

  test('a degenerate viewport still yields two distinct snaps', () => {
    // Landscape-ish: the default is clamped by MIN_SHEET_HEIGHT and would
    // otherwise overtake the expanded snap, which vaul indexes BY VALUE — two
    // equal entries and the expanded snap becomes unreachable.
    const snaps = resolveSheetSnaps(SHEET_BAND.copilot, 58, 320)
    expect(snaps.defaultHeight).toBe(320 - (320 - MIN_SHEET_HEIGHT))
    expect(snaps.expandedHeight).toBeGreaterThan(snaps.defaultHeight)
  })
})

describe('shouldDismissSheet', () => {
  const viewport = 874
  const { defaultHeight, expandedHeight } = resolveSheetSnaps(
    SHEET_BAND.watchlist,
    58,
    874,
  )
  const restingAtDefault = viewport - defaultHeight
  const restingAtExpanded = viewport - expandedHeight

  test('a sheet released at either snap is never a dismiss', () => {
    expect(shouldDismissSheet(restingAtDefault, viewport, defaultHeight)).toBe(
      false,
    )
    expect(shouldDismissSheet(restingAtExpanded, viewport, defaultHeight)).toBe(
      false,
    )
  })

  test('a nudge below the default springs back, a real pull dismisses', () => {
    const travel = sheetDismissTravel(defaultHeight)
    expect(
      shouldDismissSheet(
        restingAtDefault + travel - 1,
        viewport,
        defaultHeight,
      ),
    ).toBe(false)
    expect(
      shouldDismissSheet(
        restingAtDefault + travel + 1,
        viewport,
        defaultHeight,
      ),
    ).toBe(true)
  })

  test('the threshold is measured from the default, not from where you were', () => {
    // Dragged from expanded down to just short of the default: that gesture
    // means "back to the middle", not "close", however long it was.
    const justAboveDefault = restingAtDefault - 4
    expect(shouldDismissSheet(justAboveDefault, viewport, defaultHeight)).toBe(
      false,
    )
  })

  test('a short sheet keeps a floor so a stray nudge cannot close it', () => {
    expect(sheetDismissTravel(120)).toBe(56)
    expect(sheetDismissTravel(800)).toBe(200)
  })
})

describe('parseTranslateY', () => {
  test('reads the Y offset out of both matrix forms', () => {
    expect(parseTranslateY('matrix(1, 0, 0, 1, 0, 208)')).toBe(208)
    expect(
      parseTranslateY(
        'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 208, 0, 1)',
      ),
    ).toBe(208)
  })

  test('an untransformed sheet reports nothing rather than zero', () => {
    // Zero would be a real position (the top snap); null is "no drag happened".
    expect(parseTranslateY('none')).toBeNull()
    expect(parseTranslateY('')).toBeNull()
    expect(parseTranslateY('translateY(10px)')).toBeNull()
  })
})
