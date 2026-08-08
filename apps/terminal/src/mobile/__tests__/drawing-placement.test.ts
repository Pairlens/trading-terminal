// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crosshair placement is the one path on the phone that *creates* a drawing,
 * and nothing about it is visible in a type: a tool with the wrong point count
 * commits half a channel, an unclamped reticle reads a price out of the axis
 * gutter and commits a different one, and a shape built with the wrong field
 * name is a drawing the engine renders as nothing at all.
 *
 * The coverage test at the bottom is the important one: it fails the moment a
 * tool is added to the phone's sheet without a placement plan, which is the
 * only way this feature can silently lose a tool.
 */
import { describe, expect, test } from 'bun:test'

import {
  RETICLE_FINGER_OFFSET_Y,
  buildPlacedDrawing,
  centreOfPlot,
  clampToPlot,
  isPlaceableTool,
  placementPointCount,
  reticleForTouch,
  toolTakesContent,
} from '../chart/drawing-placement'
import { MOBILE_DRAWING_TOOL_KEYS } from '../chart/drawing-sections'
import type { DrawingPoint } from '@pairlens/fast-financial-charts/types'
import { findDrawingTool } from '@/components/terminal/drawing-tool-catalog'

/** The chart band on an iPhone 16 Pro with the drawing toolbar docked. */
const FRAME = {
  width: 402,
  height: 620,
  priceAxisWidth: 56,
  timeAxisHeight: 22,
}

const P = (ts: number, price: number): DrawingPoint => ({ ts, price })

describe('placementPointCount', () => {
  test('the cursor is not a placement', () => {
    expect(placementPointCount('select')).toBe(0)
    expect(placementPointCount(null)).toBe(0)
    expect(isPlaceableTool(null)).toBe(false)
  })

  test('freehand tools keep the engine drag path', () => {
    // Two confirmed endpoints would turn a brush stroke into a straight line.
    expect(placementPointCount('brush')).toBe(0)
    expect(placementPointCount('highlighter')).toBe(0)
    expect(placementPointCount('polyline')).toBe(0)
    expect(placementPointCount('elliott-wave')).toBe(0)
  })

  test('a plugin shape of unknown arity is never placed', () => {
    expect(placementPointCount('custom:my-plugin-shape')).toBe(0)
  })

  test('arity matches the charts registry', () => {
    expect(placementPointCount('line')).toBe(2)
    expect(placementPointCount('rectangle')).toBe(2)
    expect(placementPointCount('hline')).toBe(1)
    expect(placementPointCount('vline')).toBe(1)
    expect(placementPointCount('text')).toBe(1)
    expect(placementPointCount('channel')).toBe(3)
    expect(placementPointCount('fib-extension')).toBe(3)
    expect(placementPointCount('head-shoulders')).toBe(7)
  })
})

describe('reticle geometry', () => {
  test('it parks in the middle of the plot, not the middle of the band', () => {
    // The price gutter and the time axis are not plot: a reticle centred on
    // the element would sit right of centre and low.
    expect(centreOfPlot(FRAME)).toEqual({ x: 173, y: 299 })
  })

  test('the reticle floats above the fingertip', () => {
    const touch = { x: 200, y: 400 }
    expect(reticleForTouch(touch, FRAME)).toEqual({
      x: 200,
      y: 400 - RETICLE_FINGER_OFFSET_Y,
    })
  })

  test('a touch near the top pins the reticle to the top of the plot', () => {
    expect(reticleForTouch({ x: 10, y: 12 }, FRAME).y).toBe(0)
  })

  test('the reticle never enters the price gutter or the time axis', () => {
    const corner = clampToPlot({ x: 10_000, y: 10_000 }, FRAME)
    expect(corner.x).toBe(FRAME.width - FRAME.priceAxisWidth - 1)
    expect(corner.y).toBe(FRAME.height - FRAME.timeAxisHeight - 1)
    expect(clampToPlot({ x: -40, y: -40 }, FRAME)).toEqual({ x: 0, y: 0 })
  })

  test('a degenerate frame clamps to the origin rather than going negative', () => {
    const tiny = {
      width: 20,
      height: 10,
      priceAxisWidth: 56,
      timeAxisHeight: 22,
    }
    expect(clampToPlot({ x: 5, y: 5 }, tiny)).toEqual({ x: 0, y: 0 })
    expect(centreOfPlot(tiny)).toEqual({ x: 0, y: 0 })
  })
})

describe('buildPlacedDrawing', () => {
  const two = [P(1000, 10), P(2000, 20)]

  test('a trend line carries both points', () => {
    const drawing = buildPlacedDrawing({ tool: 'line', points: two })
    expect(drawing).toMatchObject({
      type: 'line',
      points: two,
      visible: true,
      color: '#ffb020',
      lineWidth: 1.5,
    })
  })

  test('a half-placed tool builds nothing', () => {
    expect(buildPlacedDrawing({ tool: 'line', points: [P(1000, 10)] })).toBe(
      null,
    )
    expect(buildPlacedDrawing({ tool: 'channel', points: two })).toBe(null)
  })

  test('freehand tools refuse to be built from taps', () => {
    expect(buildPlacedDrawing({ tool: 'brush', points: two })).toBe(null)
  })

  test('a horizontal line is a price, not a pair of points', () => {
    const drawing = buildPlacedDrawing({ tool: 'hline', points: [P(1000, 42)] })
    expect(drawing).toMatchObject({ type: 'hline', price: 42 })
    expect(drawing).not.toHaveProperty('points')
  })

  test('a vertical line is a timestamp', () => {
    expect(
      buildPlacedDrawing({ tool: 'vline', points: [P(1700, 42)] }),
    ).toMatchObject({ type: 'vline', ts: 1700 })
  })

  test('text takes the typed label, or the catalog default when blank', () => {
    expect(
      buildPlacedDrawing({
        tool: 'text',
        points: [P(1000, 10)],
        content: '  supply  ',
      }),
    ).toMatchObject({ type: 'text', content: 'supply', fontSize: 12 })

    expect(
      buildPlacedDrawing({
        tool: 'text',
        points: [P(1000, 10)],
        content: '   ',
      }),
    ).toMatchObject({ content: 'Text' })
  })

  test('a callout keeps two points and its own default label', () => {
    expect(buildPlacedDrawing({ tool: 'callout', points: two })).toMatchObject({
      type: 'callout',
      points: two,
      content: 'Label',
    })
  })

  test('a ray extends right, the way the engine creates one', () => {
    expect(buildPlacedDrawing({ tool: 'ray', points: two })).toMatchObject({
      extend: 'right',
    })
  })

  test('a path shape carries its preset and the catalog fill rule', () => {
    expect(
      buildPlacedDrawing({
        tool: 'path',
        meta: { preset: 'triangle' },
        points: two,
      }),
    ).toMatchObject({ type: 'path', preset: 'triangle', fill: false })

    expect(
      buildPlacedDrawing({
        tool: 'path',
        meta: { preset: 'heart' },
        points: two,
      }),
    ).toMatchObject({ preset: 'heart', fill: true })
  })

  test('fib tools arrive with their level sets', () => {
    expect(
      buildPlacedDrawing({ tool: 'fibonacci', points: two }),
    ).toMatchObject({ levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] })
  })

  test('a three-point tool keeps exactly three', () => {
    const three = [...two, P(3000, 30)]
    expect(
      buildPlacedDrawing({ tool: 'channel', points: [...three, P(4000, 40)] }),
    ).toMatchObject({ type: 'channel', points: three })
  })

  test('position tools keep their own paint', () => {
    expect(
      buildPlacedDrawing({ tool: 'long-position', points: two }),
    ).toMatchObject({ color: '#22c55e', lineWidth: 1 })
    expect(
      buildPlacedDrawing({ tool: 'short-position', points: two }),
    ).toMatchObject({ color: '#ef4444', lineWidth: 1 })
  })

  test("the user's last-used style beats the built-in default", () => {
    expect(
      buildPlacedDrawing({
        tool: 'line',
        points: two,
        styleDefaults: {
          line: { color: '#ff0000', lineWidth: 3, lineStyle: 'dashed' },
        },
      }),
    ).toMatchObject({ color: '#ff0000', lineWidth: 3, lineStyle: 'dashed' })
  })

  test('the primary series is stamped on so the drawing has an anchor', () => {
    expect(
      buildPlacedDrawing({ tool: 'line', points: two, seriesId: 'BTC-USDT' }),
    ).toMatchObject({ seriesId: 'BTC-USDT' })
  })
})

describe('every tool a thumb can reach', () => {
  test('resolves in the catalog', () => {
    for (const key of MOBILE_DRAWING_TOOL_KEYS) {
      expect(findDrawingTool(key)).toBeDefined()
    }
  })

  test('is either placeable or a documented freehand exclusion', () => {
    const freehand = new Set(['brush', 'highlighter'])
    for (const key of MOBILE_DRAWING_TOOL_KEYS) {
      const option = findDrawingTool(key)
      if (!option) continue
      const placeable = isPlaceableTool(option.tool)
      expect({ key, placeable }).toEqual({
        key,
        placeable: !freehand.has(option.tool),
      })
    }
  })

  test('builds a real object from the taps it asks for', () => {
    for (const key of MOBILE_DRAWING_TOOL_KEYS) {
      const option = findDrawingTool(key)
      if (!option) continue
      const needed = placementPointCount(option.tool)
      if (needed === 0) continue
      const points = Array.from({ length: needed }, (_, index) =>
        P(1000 * (index + 1), 10 * (index + 1)),
      )
      const drawing = buildPlacedDrawing({
        tool: option.tool,
        meta: option.meta,
        points,
      })
      expect({ key, built: drawing !== null }).toEqual({ key, built: true })
      expect(drawing).toMatchObject({ type: option.tool, visible: true })
    }
  })

  test('only the two text-bearing shapes ask for content', () => {
    const asking = MOBILE_DRAWING_TOOL_KEYS.filter((key) => {
      const option = findDrawingTool(key)
      return option ? toolTakesContent(option.tool) : false
    })
    expect(asking).toEqual(['text', 'callout'])
  })
})
