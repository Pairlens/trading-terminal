// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crosshair placement — the arithmetic behind drawing with a finger.
 *
 * Desktop draws by dragging: press where the line starts, release where it
 * ends. Under a thumb that is close to unusable — the hand covers the anchor,
 * and a 6px pixel budget does not survive a finger's contact patch. The phone
 * answer (TradingView's, and now ours) is a reticle: arming a tool parks a
 * crosshair on the chart, a drag *moves* the reticle rather than the chart, and
 * a Confirm button commits one point at a time.
 *
 * Everything here is pure so the parts that are easy to get quietly wrong —
 * how many taps a tool costs, how the reticle is clamped out of the axis
 * gutters, what object a placed pair of points becomes — are testable without a
 * chart, a canvas or a finger.
 *
 * The drawing shapes mirror `createDefault` in the charts package
 * (`src/core/drawings/tools/*-tool.ts`). We build the object ourselves rather
 * than driving the engine's pointer state machine because a synthesized
 * pointerdown/move/up sequence would couple the phone's UX to the engine's
 * internal drag modes and to the DOM order of its canvases; a plain
 * `addDrawing` command lands in exactly the same store, fires the same
 * `drawingsChange`, and therefore persists through exactly the same path a
 * hand-drawn object does. The cost is this file: the per-tool defaults below
 * are a mirror, and `placementCoversMobileTools` in the tests is what stops a
 * newly exposed tool from silently falling out of placement mode.
 */
import type {
  CustomDrawingObject,
  DrawingObject,
  DrawingPoint,
  DrawingStyleDefaults,
  DrawingToolType,
  PathShapePreset,
} from '@pairlens/fast-financial-charts/types'

/**
 * How far above the fingertip the reticle floats, in px.
 *
 * A reticle under the finger is a reticle nobody can see. 48 clears an adult
 * fingertip with room for the readout chip beneath the crosshair.
 */
export const RETICLE_FINGER_OFFSET_Y = 48

/**
 * Tools whose point count is not 2, mirroring `pointCount` in the charts
 * registry. Absent means 2 — the overwhelming majority.
 */
const PLACEMENT_POINTS: Partial<Record<DrawingToolType, number>> = {
  hline: 1,
  hray: 1,
  vline: 1,
  crossline: 1,
  text: 1,
  'anchored-vwap': 1,
  channel: 3,
  pitchfork: 3,
  'fib-extension': 3,
  'fib-channel': 3,
  'triangle-pattern': 3,
  arc: 3,
  'rotated-rectangle': 3,
  'fib-wedge': 3,
  'abcd-pattern': 4,
  'xabcd-pattern': 5,
  'head-shoulders': 7,
}

/**
 * Freehand tools keep the engine's own drag path.
 *
 * A stroke is the one gesture a finger is genuinely better at than a mouse,
 * and reducing it to two confirmed endpoints would turn a brush into a
 * straight line. Placement mode does not mount for these, so dragging draws.
 */
const FREEHAND_TOOLS: ReadonlySet<string> = new Set([
  'brush',
  'highlighter',
  'polyline',
  'elliott-wave',
])

/**
 * Taps a tool costs in placement mode, or 0 when the tool is not placeable
 * (the cursor, freehand tools, and plugin-registered `custom:*` shapes whose
 * point arity this build cannot know).
 */
export function placementPointCount(tool: DrawingToolType | null): number {
  if (!tool || tool === 'select') return 0
  if (FREEHAND_TOOLS.has(tool)) return 0
  if (tool.startsWith('custom:')) return 0
  return PLACEMENT_POINTS[tool] ?? 2
}

/** Whether arming this tool should raise the reticle. */
export function isPlaceableTool(tool: DrawingToolType | null): boolean {
  return placementPointCount(tool) > 0
}

/** The chart's pixel box, and the two gutters the plot does not occupy. */
export type PlacementFrame = {
  width: number
  height: number
  /** Right gutter — the price scale. */
  priceAxisWidth: number
  /** Bottom gutter — the time axis. */
  timeAxisHeight: number
}

export type ReticlePoint = { x: number; y: number }

/**
 * Keep the reticle inside the plot.
 *
 * The axes are not placeable space: the engine clamps an x past the plot width
 * to the last bar, so a reticle allowed into the price gutter would report one
 * price and commit another. Clamping here means the readout never lies.
 */
export function clampToPlot(
  point: ReticlePoint,
  frame: PlacementFrame,
): ReticlePoint {
  const maxX = Math.max(0, frame.width - frame.priceAxisWidth - 1)
  const maxY = Math.max(0, frame.height - frame.timeAxisHeight - 1)
  return {
    x: Math.min(Math.max(point.x, 0), maxX),
    y: Math.min(Math.max(point.y, 0), maxY),
  }
}

/** Where the reticle parks when a tool is armed: the middle of the plot. */
export function centreOfPlot(frame: PlacementFrame): ReticlePoint {
  return clampToPlot(
    {
      x: (frame.width - frame.priceAxisWidth) / 2,
      y: (frame.height - frame.timeAxisHeight) / 2,
    },
    frame,
  )
}

/**
 * The reticle position for a touch at `touch`, floated above the fingertip and
 * clamped into the plot.
 */
export function reticleForTouch(
  touch: ReticlePoint,
  frame: PlacementFrame,
): ReticlePoint {
  return clampToPlot(
    { x: touch.x, y: touch.y - RETICLE_FINGER_OFFSET_Y },
    frame,
  )
}

// ── Drawing construction ─────────────────────────────────────────────────

/** `DEFAULT_DRAWING_COLOR` in the charts package's drawing models. */
const DEFAULT_COLOR = '#ffb020'
/** `DEFAULT_DRAWING_LINE_WIDTH` in the charts package's drawing models. */
const DEFAULT_LINE_WIDTH = 1.5

/** Per-tool overrides of the two constants above, from each tool's factory. */
const TOOL_PAINT: Partial<
  Record<DrawingToolType, { color?: string; lineWidth?: number }>
> = {
  'long-position': { color: '#22c55e', lineWidth: 1 },
  'short-position': { color: '#ef4444', lineWidth: 1 },
  measure: { color: '#8b8b8b', lineWidth: 1 },
  text: { lineWidth: 1 },
}

/** `DEFAULT_FIB_LEVELS` / `DEFAULT_FIB_EXTENSION_LEVELS`, per tool. */
const TOOL_LEVELS: Partial<Record<DrawingToolType, Array<number>>> = {
  fibonacci: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
  'fib-extension': [0, 0.236, 0.382, 0.5, 0.618, 1, 1.618, 2.618],
  'fib-channel': [0, 0.236, 0.382, 0.5, 0.618, 1],
}

/** The one preset the charts shape catalog fills by default. */
const FILLED_PATH_PRESETS: ReadonlySet<string> = new Set(['heart'])

export type PlacedDrawingInput = {
  tool: DrawingToolType
  /** Catalog metadata — currently only `preset` for the path shapes. */
  meta?: Record<string, unknown> | null
  /** Confirmed points, in placement order. */
  points: Array<DrawingPoint>
  /** The primary series the drawing belongs to. */
  seriesId?: string
  /** The user's last-used style per tool, applied over the built-in defaults. */
  styleDefaults?: DrawingStyleDefaults
  /** Content for the two text-bearing shapes. */
  content?: string
}

/**
 * The `addDrawing` command's payload — the engine mints the id.
 *
 * Distributive on purpose: a plain `Omit<DrawingObject, 'id'>` over a union
 * collapses to the keys every member shares, which is the base style fields
 * and nothing that describes a shape. `CustomDrawingObject` is excluded
 * because its index signature survives the Omit as a `string` key and swallows
 * the discriminant — and because `placementPointCount` never places one.
 */
export type PlacedDrawing = DistributiveOmit<
  Exclude<DrawingObject, CustomDrawingObject>,
  'id'
>

type DistributiveOmit<T, TKey extends PropertyKey> = T extends unknown
  ? Omit<T, TKey>
  : never

/**
 * Build the object a completed placement produces, or null when the tool is
 * not placeable or too few points were confirmed.
 */
export function buildPlacedDrawing(
  input: PlacedDrawingInput,
): PlacedDrawing | null {
  const { tool, points, seriesId } = input
  const needed = placementPointCount(tool)
  if (needed === 0 || points.length < needed) return null

  const paint = TOOL_PAINT[tool]
  const override = input.styleDefaults?.[tool]
  const base = {
    color: override?.color ?? paint?.color ?? DEFAULT_COLOR,
    lineWidth: override?.lineWidth ?? paint?.lineWidth ?? DEFAULT_LINE_WIDTH,
    ...(override?.lineStyle !== undefined
      ? { lineStyle: override.lineStyle }
      : {}),
    visible: true,
    ...(seriesId !== undefined ? { seriesId } : {}),
  }

  const first = points[0]

  switch (tool) {
    case 'hline':
      return { ...base, type: 'hline', price: first.price }
    case 'hray':
      return { ...base, type: 'hray', price: first.price, ts: first.ts }
    case 'vline':
      return { ...base, type: 'vline', ts: first.ts }
    case 'crossline':
      return { ...base, type: 'crossline', point: first }
    case 'anchored-vwap':
      return { ...base, type: 'anchored-vwap', point: first }
    case 'text':
      return {
        ...base,
        type: 'text',
        point: first,
        content: input.content?.trim() || 'Text',
        fontSize: 12,
      }
    case 'callout':
      return {
        ...base,
        type: 'callout',
        points: [first, points[1]],
        content: input.content?.trim() || 'Label',
      }
    case 'ray':
      return {
        ...base,
        type: 'ray',
        points: [first, points[1]],
        extend: 'right',
      }
    case 'path': {
      const preset =
        typeof input.meta?.preset === 'string'
          ? (input.meta.preset as PathShapePreset)
          : 'triangle'
      return {
        ...base,
        type: 'path',
        points: [first, points[1]],
        preset,
        fill: FILLED_PATH_PRESETS.has(preset),
      }
    }
    default: {
      const levels = TOOL_LEVELS[tool]
      // Every remaining shape in the union is `base & { points }` (plus the
      // optional levels above). TypeScript cannot see that across a union this
      // wide, so the shape is asserted once, here, rather than at 30 call
      // sites — `placementPointCount` is what guarantees the arity.
      return {
        ...base,
        type: tool,
        points: points.slice(0, needed),
        ...(levels ? { levels } : {}),
      } as PlacedDrawing
    }
  }
}

/** Text-bearing shapes get a content step after their points are placed. */
export function toolTakesContent(tool: DrawingToolType | null): boolean {
  return tool === 'text' || tool === 'callout'
}
