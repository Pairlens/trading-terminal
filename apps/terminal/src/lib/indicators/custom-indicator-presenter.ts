// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Canvas presenter for script-defined indicators.
 *
 * The chart engine hands us a 2D context, the visible bar window and the
 * indicator's value points; everything a script declared — line/step/area/
 * histogram/column/dot/cross plots, per-bar colors, fills between plots,
 * background tints, signal markers and reference levels — is drawn here.
 *
 * Per-bar color never crosses a boundary as a string: the script's colors are
 * folded into a small palette in Python and the value points carry float
 * indices into it under `<key>:c`.
 *
 * The scale math mirrors `@pairlens/fast-financial-charts`' own presenters so an overlay
 * plot lands exactly on the candles it was computed from.
 */
import type {
  ChartBar,
  ChartTheme,
  IndicatorPresenter,
  IndicatorPresenterContext,
} from '@pairlens/fast-financial-charts/types'
import type {
  CustomIndicatorFillSpec,
  CustomIndicatorHLine,
  CustomIndicatorMarkerSpec,
  CustomIndicatorSeriesSpec,
} from '@pairlens/shared/plugin-types'

export type CustomIndicatorRenderSpec = {
  series: Array<CustomIndicatorSeriesSpec>
  hlines?: Array<CustomIndicatorHLine>
  markers?: Array<CustomIndicatorMarkerSpec>
  fills?: Array<CustomIndicatorFillSpec>
  /** Palettes keyed by series key, refreshed by each compute. */
  palettes?: Record<string, Array<string>>
}

type NumericRange = { min: number; max: number }
type ScreenPoint = { x: number; y: number }

/** Colors for series that declared none, indexed by position in the spec. */
const DEFAULT_SERIES_PALETTE = [
  '#4aa8ff',
  '#f5a623',
  '#a78bfa',
  '#2dd4bf',
  '#f472b6',
  '#facc15',
]

const LINE_DASH_SOLID: Array<number> = []
const LINE_DASH_DASHED = [6, 4]
const LINE_DASH_DOTTED = [2, 3]

const AREA_FILL_ALPHA = 0.18
const BAND_FILL_ALPHA = 0.12
const BACKGROUND_ALPHA = 0.16

const MARKER_SIZES: Record<
  NonNullable<CustomIndicatorMarkerSpec['size']>,
  number
> = { tiny: 3, small: 4.5, normal: 6, large: 8.5 }

/** Suffix of the companion output holding per-bar palette indices. */
const COLOR_SUFFIX = ':c'

// ── Scales ──────────────────────────────────────────────────────────────────

const toSafeRange = (range: NumericRange): NumericRange => {
  if (
    Number.isFinite(range.min) &&
    Number.isFinite(range.max) &&
    Math.abs(range.max - range.min) > 1e-10
  ) {
    return range
  }
  return { min: 0, max: 1 }
}

const computePriceRange = (
  bars: Array<ChartBar>,
  paddingRatio = 0.05,
): NumericRange => {
  if (bars.length === 0) return { min: 0, max: 1 }
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const bar of bars) {
    min = Math.min(min, bar.low)
    max = Math.max(max, bar.high)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 }
  const spread = Math.max(1e-9, max - min)
  return { min: min - spread * paddingRatio, max: max + spread * paddingRatio }
}

const computeNumericRange = (
  values: Array<number>,
  fallback: NumericRange,
  paddingRatio = 0.08,
): NumericRange => {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback
  if (max <= min) return { min: min - 1, max: max + 1 }
  const spread = max - min
  return { min: min - spread * paddingRatio, max: max + spread * paddingRatio }
}

const valueToY = (
  value: number,
  range: NumericRange,
  height: number,
): number => {
  const safe = toSafeRange(range)
  const ratio = (value - safe.min) / (safe.max - safe.min)
  return height - Math.max(0, Math.min(1, ratio)) * height
}

const findBarIndexByTs = (bars: Array<ChartBar>, ts: number): number => {
  if (bars.length === 0) return -1
  let lo = 0
  let hi = bars.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid].ts === ts) return mid
    if (bars[mid].ts < ts) lo = mid + 1
    else hi = mid - 1
  }
  return Math.max(0, Math.min(lo, bars.length - 1))
}

// ── Colors ──────────────────────────────────────────────────────────────────

/**
 * The theme slots color tokens map onto. Kept structural so both the engine's
 * fully-resolved `ChartTheme` and the app's partial theme input work.
 */
export type SeriesColorTheme = {
  upCandle?: string
  downCandle?: string
  axisText?: string
  crosshair?: string
  indicator?: { macd?: { signal?: string } }
}

/**
 * Resolve a declared color to a concrete CSS color. `token:*` names map onto
 * the active chart theme so scripts restyle with the app; anything else is
 * passed through, and a missing color falls back to the default palette.
 */
export const resolveSeriesColor = (
  color: string | undefined,
  seriesIndex: number,
  theme: SeriesColorTheme,
): string => {
  const fallback =
    DEFAULT_SERIES_PALETTE[
      Math.abs(seriesIndex) % DEFAULT_SERIES_PALETTE.length
    ]
  if (!color) return fallback
  if (!color.startsWith('token:')) return color
  switch (color) {
    case 'token:up':
      return theme.upCandle || fallback
    case 'token:down':
      return theme.downCandle || fallback
    case 'token:muted':
      return theme.axisText || fallback
    case 'token:primary':
      return theme.crosshair || fallback
    case 'token:accent':
      return theme.indicator?.macd?.signal || fallback
    default:
      return fallback
  }
}

/**
 * Per-bar color lookup for one series: the palette the script built at compute
 * time (or the one it declared on the spec), plus the value point's index into
 * it. Returns null when the series has no per-bar coloring.
 */
const makeColorLookup = (
  spec: CustomIndicatorSeriesSpec,
  index: number,
  theme: ChartTheme,
  palettes: Record<string, Array<string>> | undefined,
): ((point: IndicatorPresenterContext['values'][number]) => string) | null => {
  const raw = palettes?.[spec.key] ?? spec.palette
  if (!raw || raw.length === 0) return null
  const resolved = raw.map((color) => resolveSeriesColor(color, index, theme))
  const fallback = resolveSeriesColor(spec.color, index, theme)
  // A background tint has no meaningful value of its own, so when the script
  // declared a palette without wrapping the output in plot(), read the index
  // straight off the value. Every other style requires the `:c` companion.
  const useOwnValue =
    spec.style === 'background' && palettes?.[spec.key] === undefined
  const colorKey = useOwnValue ? spec.key : spec.key + COLOR_SUFFIX
  return (point) => {
    const slot = Number(point[colorKey])
    if (!Number.isFinite(slot)) return fallback
    return resolved[
      Math.max(0, Math.min(resolved.length - 1, Math.round(slot)))
    ]
  }
}

const dashForStyle = (
  lineStyle: CustomIndicatorSeriesSpec['lineStyle'],
): Array<number> => {
  if (lineStyle === 'dashed') return LINE_DASH_DASHED
  if (lineStyle === 'dotted') return LINE_DASH_DOTTED
  return LINE_DASH_SOLID
}

// ── Geometry ────────────────────────────────────────────────────────────────

/** Pixels per bar slot in the current viewport. */
const barPitch = (context: IndicatorPresenterContext): number => {
  const total = Math.max(
    1,
    context.viewport.endIndex - context.viewport.startIndex + 1,
  )
  return context.width / total
}

/**
 * Visible value points paired with their screen x. Walking the viewport once
 * and reusing this for every style keeps the per-frame cost proportional to
 * what's on screen rather than to the whole history buffer.
 */
type VisiblePoint = {
  point: IndicatorPresenterContext['values'][number]
  index: number
  x: number
}

const visiblePoints = (
  context: IndicatorPresenterContext,
): Array<VisiblePoint> => {
  const { bars, values, viewport } = context
  const pitch = barPitch(context)
  const out: Array<VisiblePoint> = []
  for (const point of values) {
    const index = findBarIndexByTs(bars, point.ts)
    if (index < viewport.startIndex || index > viewport.endIndex) continue
    out.push({
      point,
      index,
      x: (index - viewport.startIndex + 0.5) * pitch,
    })
  }
  return out
}

/** Split a series into polylines, breaking on NaN/undefined gaps. */
const toSegments = (
  points: Array<VisiblePoint>,
  key: string,
  yFromValue: (value: number) => number,
): Array<Array<ScreenPoint>> => {
  const segments: Array<Array<ScreenPoint>> = []
  let current: Array<ScreenPoint> | null = null
  for (const { point, x } of points) {
    const numeric = Number(point[key])
    if (!Number.isFinite(numeric)) {
      current = null
      continue
    }
    if (!current) {
      current = []
      segments.push(current)
    }
    current.push({ x, y: yFromValue(numeric) })
  }
  return segments
}

// ── Drawing ─────────────────────────────────────────────────────────────────

const strokeSegments = (
  ctx: CanvasRenderingContext2D,
  segments: Array<Array<ScreenPoint>>,
  color: string,
  lineWidth: number,
  dash: Array<number>,
  step: boolean,
): void => {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.setLineDash(dash)
  for (const segment of segments) {
    if (segment.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(segment[0].x, segment[0].y)
    for (let i = 1; i < segment.length; i += 1) {
      if (step) ctx.lineTo(segment[i].x, segment[i - 1].y)
      ctx.lineTo(segment[i].x, segment[i].y)
    }
    ctx.stroke()
  }
  ctx.setLineDash(LINE_DASH_SOLID)
  ctx.restore()
}

/**
 * Stroke a polyline in per-bar colors. Each span of same-colored bars is one
 * path, so a two-tone trend line costs two strokes, not one per bar.
 */
const strokeSegmentsColored = (
  ctx: CanvasRenderingContext2D,
  points: Array<VisiblePoint>,
  key: string,
  colorAt: (point: VisiblePoint['point']) => string,
  yFromValue: (value: number) => number,
  lineWidth: number,
  dash: Array<number>,
  step: boolean,
): void => {
  ctx.save()
  ctx.lineWidth = lineWidth
  ctx.setLineDash(dash)
  let previous: ScreenPoint | null = null
  for (const { point, x } of points) {
    const numeric = Number(point[key])
    if (!Number.isFinite(numeric)) {
      previous = null
      continue
    }
    const current = { x, y: yFromValue(numeric) }
    if (previous) {
      ctx.strokeStyle = colorAt(point)
      ctx.beginPath()
      ctx.moveTo(previous.x, previous.y)
      if (step) ctx.lineTo(current.x, previous.y)
      ctx.lineTo(current.x, current.y)
      ctx.stroke()
    }
    previous = current
  }
  ctx.setLineDash(LINE_DASH_SOLID)
  ctx.restore()
}

const fillSegmentsToBase = (
  ctx: CanvasRenderingContext2D,
  segments: Array<Array<ScreenPoint>>,
  color: string,
  baseY: number,
  alpha: number,
): void => {
  ctx.save()
  ctx.fillStyle = color
  ctx.globalAlpha = alpha
  for (const segment of segments) {
    if (segment.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(segment[0].x, baseY)
    for (const point of segment) ctx.lineTo(point.x, point.y)
    ctx.lineTo(segment[segment.length - 1].x, baseY)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

const drawBars = (
  context: IndicatorPresenterContext,
  points: Array<VisiblePoint>,
  spec: CustomIndicatorSeriesSpec,
  color: string,
  colorAt: ((point: VisiblePoint['point']) => string) | null,
  yFromValue: (value: number) => number,
  widthRatio: number,
): void => {
  const { ctx, height, theme } = context
  const barWidth = Math.max(1, barPitch(context) * widthRatio)
  const baseY = Math.min(height, Math.max(0, yFromValue(0)))
  ctx.save()
  if (spec.opacity !== undefined) ctx.globalAlpha = spec.opacity
  for (const { point, x } of points) {
    const numeric = Number(point[spec.key])
    if (!Number.isFinite(numeric)) continue
    const y = yFromValue(numeric)
    ctx.fillStyle = colorAt
      ? colorAt(point)
      : spec.upDown
        ? numeric >= 0
          ? theme.upCandle
          : theme.downCandle
        : color
    ctx.fillRect(
      x - barWidth / 2,
      Math.min(y, baseY),
      barWidth,
      Math.max(1, Math.abs(baseY - y)),
    )
  }
  ctx.restore()
}

const drawDots = (
  context: IndicatorPresenterContext,
  points: Array<VisiblePoint>,
  spec: CustomIndicatorSeriesSpec,
  color: string,
  colorAt: ((point: VisiblePoint['point']) => string) | null,
  yFromValue: (value: number) => number,
  shape: 'circles' | 'cross',
): void => {
  const { ctx } = context
  const radius = Math.max(1, spec.width ?? 2)
  ctx.save()
  ctx.lineWidth = Math.max(1, radius * 0.6)
  for (const { point, x } of points) {
    const numeric = Number(point[spec.key])
    if (!Number.isFinite(numeric)) continue
    const y = yFromValue(numeric)
    const paint = colorAt ? colorAt(point) : color
    if (shape === 'circles') {
      ctx.fillStyle = paint
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.strokeStyle = paint
      ctx.beginPath()
      ctx.moveTo(x - radius, y - radius)
      ctx.lineTo(x + radius, y + radius)
      ctx.moveTo(x + radius, y - radius)
      ctx.lineTo(x - radius, y + radius)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Full-height per-bar tint (Pine's `bgcolor`). */
const drawBackground = (
  context: IndicatorPresenterContext,
  points: Array<VisiblePoint>,
  spec: CustomIndicatorSeriesSpec,
  color: string,
  colorAt: ((point: VisiblePoint['point']) => string) | null,
): void => {
  const { ctx, height } = context
  const pitch = barPitch(context)
  ctx.save()
  ctx.globalAlpha = spec.opacity ?? BACKGROUND_ALPHA
  for (const { point, x } of points) {
    const numeric = Number(point[spec.key])
    if (!Number.isFinite(numeric)) continue
    ctx.fillStyle = colorAt ? colorAt(point) : color
    ctx.fillRect(x - pitch / 2, 0, Math.max(1, pitch), height)
  }
  ctx.restore()
}

/**
 * Shade between two plots (or a plot and a level). A two-color palette flips
 * the tint wherever the plots cross, which is what makes a ribbon readable.
 */
const drawFill = (
  context: IndicatorPresenterContext,
  points: Array<VisiblePoint>,
  spec: CustomIndicatorFillSpec,
  index: number,
  yFromValue: (value: number) => number,
): void => {
  const { ctx, theme } = context
  const above = resolveSeriesColor(
    spec.palette?.[0] ?? spec.color,
    index,
    theme,
  )
  const below = resolveSeriesColor(
    spec.palette?.[1] ?? spec.palette?.[0] ?? spec.color,
    index,
    theme,
  )
  const alpha = spec.opacity ?? BAND_FILL_ALPHA

  // Walk the visible window, accumulating a ribbon and flushing it whenever
  // the fill color flips or the data gaps.
  let top: Array<ScreenPoint> = []
  let bottom: Array<ScreenPoint> = []
  let currentColor: string | null = null

  const flush = (): void => {
    if (top.length >= 2 && currentColor) {
      ctx.save()
      ctx.fillStyle = currentColor
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.moveTo(top[0].x, top[0].y)
      for (let i = 1; i < top.length; i += 1) ctx.lineTo(top[i].x, top[i].y)
      for (let i = bottom.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(bottom[i].x, bottom[i].y)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    top = []
    bottom = []
  }

  for (const { point, x } of points) {
    const a = Number(point[spec.from])
    const b = spec.to !== undefined ? Number(point[spec.to]) : spec.level
    if (!Number.isFinite(a) || b === undefined || !Number.isFinite(b)) {
      flush()
      currentColor = null
      continue
    }
    const color = a >= b ? above : below
    if (currentColor !== null && color !== currentColor) {
      // Carry the crossing point into both ribbons so they meet cleanly.
      const joinY = yFromValue(b)
      top.push({ x, y: joinY })
      bottom.push({ x, y: joinY })
      flush()
      top.push({ x, y: joinY })
      bottom.push({ x, y: joinY })
    }
    currentColor = color
    top.push({ x, y: yFromValue(a) })
    bottom.push({ x, y: yFromValue(b) })
  }
  flush()
}

const drawMarkerShape = (
  ctx: CanvasRenderingContext2D,
  shape: CustomIndicatorMarkerSpec['shape'],
  x: number,
  y: number,
  size: number,
): void => {
  ctx.beginPath()
  switch (shape) {
    case 'triangle_up':
    case 'arrow_up':
      ctx.moveTo(x, y - size)
      ctx.lineTo(x + size, y + size * 0.8)
      ctx.lineTo(x - size, y + size * 0.8)
      ctx.closePath()
      ctx.fill()
      break
    case 'triangle_down':
    case 'arrow_down':
      ctx.moveTo(x, y + size)
      ctx.lineTo(x + size, y - size * 0.8)
      ctx.lineTo(x - size, y - size * 0.8)
      ctx.closePath()
      ctx.fill()
      break
    case 'square':
      ctx.fillRect(x - size, y - size, size * 2, size * 2)
      break
    case 'diamond':
      ctx.moveTo(x, y - size)
      ctx.lineTo(x + size, y)
      ctx.lineTo(x, y + size)
      ctx.lineTo(x - size, y)
      ctx.closePath()
      ctx.fill()
      break
    case 'cross':
      ctx.lineWidth = Math.max(1.5, size * 0.4)
      ctx.moveTo(x - size, y)
      ctx.lineTo(x + size, y)
      ctx.moveTo(x, y - size)
      ctx.lineTo(x, y + size)
      ctx.stroke()
      break
    case 'x':
      ctx.lineWidth = Math.max(1.5, size * 0.4)
      ctx.moveTo(x - size, y - size)
      ctx.lineTo(x + size, y + size)
      ctx.moveTo(x + size, y - size)
      ctx.lineTo(x - size, y + size)
      ctx.stroke()
      break
    case 'flag':
      ctx.lineWidth = Math.max(1, size * 0.3)
      ctx.moveTo(x - size * 0.6, y + size)
      ctx.lineTo(x - size * 0.6, y - size)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - size * 0.6, y - size)
      ctx.lineTo(x + size, y - size * 0.5)
      ctx.lineTo(x - size * 0.6, y)
      ctx.closePath()
      ctx.fill()
      break
    default:
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
  }
}

const drawMarkers = (
  context: IndicatorPresenterContext,
  points: Array<VisiblePoint>,
  markers: Array<CustomIndicatorMarkerSpec>,
  yFromValue: (value: number) => number,
): void => {
  const { ctx, bars, height, theme } = context
  for (let index = 0; index < markers.length; index += 1) {
    const spec = markers[index]
    const color = resolveSeriesColor(spec.color, index, theme)
    const size = MARKER_SIZES[spec.size ?? 'normal']
    ctx.save()
    ctx.fillStyle = color
    ctx.strokeStyle = color
    for (const { point, index: barIndex, x } of points) {
      const flag = Number(point[spec.key])
      if (!Number.isFinite(flag) || flag === 0) continue

      let y: number
      switch (spec.position) {
        case 'series': {
          const anchor = Number(point[spec.at ?? ''])
          if (!Number.isFinite(anchor)) continue
          y = yFromValue(anchor)
          break
        }
        case 'above':
          y = yFromValue(bars[barIndex].high) - size * 2
          break
        case 'below':
          y = yFromValue(bars[barIndex].low) + size * 2
          break
        case 'top':
          y = size * 2
          break
        default:
          y = height - size * 2
      }

      drawMarkerShape(ctx, spec.shape, x, y, size)

      if (spec.text) {
        ctx.font = `9px ${theme.fontFamilyMono}`
        ctx.textAlign = 'center'
        ctx.fillText(
          spec.text,
          x,
          spec.position === 'below' || spec.position === 'bottom'
            ? y + size * 2.2
            : y - size * 1.6,
        )
      }
    }
    ctx.restore()
  }
}

const drawHlines = (
  context: IndicatorPresenterContext,
  hlines: Array<CustomIndicatorHLine>,
  yFromValue: (value: number) => number,
): void => {
  const { ctx, width, theme } = context
  for (const hline of hlines) {
    const y = yFromValue(hline.value)
    const color = hline.color
      ? resolveSeriesColor(hline.color, 0, theme)
      : theme.axisText
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash(LINE_DASH_DASHED)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
    ctx.setLineDash(LINE_DASH_SOLID)
    ctx.fillStyle = theme.axisText
    ctx.font = `10px ${theme.fontFamilyMono}`
    ctx.textAlign = 'right'
    ctx.fillText(hline.label ?? String(hline.value), width - 4, y - 3)
    ctx.restore()
  }
}

/** Value range across every drawn series (plus fill levels and hlines). */
const computeSpecRange = (
  context: IndicatorPresenterContext,
  spec: CustomIndicatorRenderSpec,
): NumericRange => {
  const numeric: Array<number> = []
  // Background tints carry palette indices, not values — they must not drag
  // the pane's scale toward zero.
  const scaled = spec.series.filter((s) => s.style !== 'background')
  for (const point of context.values) {
    for (const series of scaled) {
      const value = Number(point[series.key])
      if (Number.isFinite(value)) numeric.push(value)
    }
  }
  for (const hline of spec.hlines ?? []) {
    if (Number.isFinite(hline.value)) numeric.push(hline.value)
  }
  for (const fill of spec.fills ?? []) {
    if (fill.level !== undefined && Number.isFinite(fill.level)) {
      numeric.push(fill.level)
    }
  }
  return computeNumericRange(numeric, { min: -1, max: 1 }, 0.08)
}

/**
 * Build the presenter for one script's render spec. Overlay indicators scale
 * against the visible price range (so they sit on the candles); sub-pane
 * indicators scale against their own values.
 */
export const createCustomIndicatorPresenter = (
  spec: CustomIndicatorRenderSpec,
): IndicatorPresenter => {
  return (context) => {
    const { ctx, height, theme, indicator } = context
    const isOverlay = indicator.pane === 'overlay'
    const range = isOverlay
      ? computePriceRange(
          context.bars.slice(
            context.viewport.startIndex,
            context.viewport.endIndex + 1,
          ),
        )
      : computeSpecRange(context, spec)
    const yFromValue = (value: number): number => valueToY(value, range, height)
    const points = visiblePoints(context)

    // Painter's order: background, fills, reference levels, plots, markers.
    spec.series.forEach((series, index) => {
      if (series.style !== 'background' || series.hidden) return
      drawBackground(
        context,
        points,
        series,
        resolveSeriesColor(series.color, index, theme),
        makeColorLookup(series, index, theme, spec.palettes),
      )
    })

    spec.fills?.forEach((fill, index) => {
      drawFill(context, points, fill, index, yFromValue)
    })

    if (spec.hlines && spec.hlines.length > 0) {
      drawHlines(context, spec.hlines, yFromValue)
    }

    spec.series.forEach((series, index) => {
      if (series.hidden || series.style === 'background') return
      const color = resolveSeriesColor(series.color, index, theme)
      const colorAt = makeColorLookup(series, index, theme, spec.palettes)

      switch (series.style) {
        case 'histogram':
          drawBars(context, points, series, color, colorAt, yFromValue, 0.6)
          return
        case 'columns':
          drawBars(context, points, series, color, colorAt, yFromValue, 0.85)
          return
        case 'circles':
        case 'cross':
          drawDots(
            context,
            points,
            series,
            color,
            colorAt,
            yFromValue,
            series.style,
          )
          return
        default:
          break
      }

      const step = series.style === 'stepline'
      if (series.style === 'area') {
        const baseY = Math.min(height, Math.max(0, yFromValue(0)))
        fillSegmentsToBase(
          ctx,
          toSegments(points, series.key, yFromValue),
          color,
          baseY,
          series.opacity ?? AREA_FILL_ALPHA,
        )
      }

      const width = series.width ?? 1.5
      const dash = dashForStyle(series.lineStyle)
      if (colorAt) {
        strokeSegmentsColored(
          ctx,
          points,
          series.key,
          colorAt,
          yFromValue,
          width,
          dash,
          step,
        )
      } else {
        strokeSegments(
          ctx,
          toSegments(points, series.key, yFromValue),
          color,
          width,
          dash,
          step,
        )
      }
    })

    if (spec.markers && spec.markers.length > 0) {
      drawMarkers(context, points, spec.markers, yFromValue)
    }

    if (!isOverlay) {
      const title =
        spec.series.find((series) => series.title)?.title ??
        indicator.type.replace(/^custom:/, '')
      ctx.save()
      ctx.textAlign = 'left'
      ctx.fillStyle = indicator.color
      ctx.font = `bold 10px ${theme.fontFamilyMono}`
      ctx.fillText(title, 4, 12)
      ctx.restore()
    }
  }
}
