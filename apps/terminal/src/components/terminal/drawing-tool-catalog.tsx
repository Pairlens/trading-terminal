// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The drawing-tool catalog — every tool the rail can offer, grouped the way
 * the rail groups them.
 *
 * It lives apart from the toolbar because favorites and recents store bare
 * tool keys (`path:star`, `hline`) and have to resolve them back into a label
 * and an icon. One catalog, one place a new tool has to be added.
 */
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  Circle,
  Columns2,
  Columns3,
  Crosshair,
  Diamond,
  Fan,
  GitBranch,
  Grid3x3,
  Hexagon,
  Highlighter,
  LineChart,
  Maximize2,
  MessageSquare,
  Minus,
  MoveRight,
  MoveVertical,
  Octagon,
  Paintbrush,
  Pen,
  PencilLine,
  Radar,
  RotateCw,
  RulerIcon,
  Scaling,
  SeparatorHorizontal,
  Slash,
  Spline,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Triangle,
  Type,
  Waves,
} from 'lucide-react'

import type { DrawingToolType } from '@pairlens/fast-financial-charts/types'
import { drawingToolKey } from '@/lib/chart-drawing-tools'

type IconComponent = React.ComponentType<{ className?: string }>

export type DrawingToolOption = {
  tool: DrawingToolType
  labelKey: string
  icon: IconComponent
  /** Extra metadata passed to the chart engine (e.g., path preset). */
  meta?: Record<string, unknown>
}

/** Circle icon stretched to look like an ellipse. */
const ellipseIconStyle = { transform: 'scaleX(1.3) scaleY(0.8)' } as const

function EllipseIcon({ className }: { className?: string }) {
  return <Circle className={className} style={ellipseIconStyle} />
}

export type ToolCategory = {
  id: string
  labelKey: string
  tools: Array<DrawingToolOption>
  persistKey: string
}

export const TOOL_CATEGORIES: Array<ToolCategory> = [
  {
    id: 'lines',
    labelKey: 'chart.drawing.categories.lines',
    persistKey: 'drawing-last-lines',
    tools: [
      {
        tool: 'line',
        labelKey: 'chart.drawing.trendLine',
        icon: PencilLine,
      },
      {
        tool: 'ray',
        labelKey: 'chart.drawing.ray',
        icon: MoveRight,
      },
      {
        tool: 'xline',
        labelKey: 'chart.drawing.extendedLine',
        icon: Maximize2,
      },
      {
        tool: 'info-line',
        labelKey: 'chart.drawing.infoLine',
        icon: Slash,
      },
      {
        tool: 'trend-angle',
        labelKey: 'chart.drawing.trendAngle',
        icon: ArrowDownRight,
      },
      {
        tool: 'hline',
        labelKey: 'chart.drawing.horizontalLine',
        icon: Minus,
      },
      {
        tool: 'hray',
        labelKey: 'chart.drawing.horizontalRay',
        icon: MoveRight,
      },
      {
        tool: 'vline',
        labelKey: 'chart.drawing.verticalLine',
        icon: MoveVertical,
      },
      {
        tool: 'crossline',
        labelKey: 'chart.drawing.crossLine',
        icon: Crosshair,
      },
    ],
  },
  {
    id: 'channels',
    labelKey: 'chart.drawing.categories.channels',
    persistKey: 'drawing-last-channels',
    tools: [
      {
        tool: 'channel',
        labelKey: 'chart.drawing.channel',
        icon: Columns2,
      },
      {
        tool: 'pitchfork',
        labelKey: 'chart.drawing.pitchfork',
        icon: GitBranch,
      },
      {
        tool: 'polyline',
        labelKey: 'chart.drawing.polyline',
        icon: Pen,
      },
    ],
  },
  {
    id: 'shapes',
    labelKey: 'chart.drawing.categories.shapes',
    persistKey: 'drawing-last-shapes',
    tools: [
      {
        tool: 'rectangle',
        labelKey: 'chart.drawing.rectangle',
        icon: SeparatorHorizontal,
      },
      {
        tool: 'circle',
        labelKey: 'chart.drawing.circle',
        icon: Circle,
      },
      {
        tool: 'ellipse',
        labelKey: 'chart.drawing.ellipse',
        icon: EllipseIcon,
      },
      {
        tool: 'path',
        labelKey: 'chart.drawing.triangle',
        icon: Triangle,
        meta: { preset: 'triangle' },
      },
      {
        tool: 'path',
        labelKey: 'chart.drawing.diamond',
        icon: Diamond,
        meta: { preset: 'diamond' },
      },
      {
        tool: 'path',
        labelKey: 'chart.drawing.star',
        icon: Star,
        meta: { preset: 'star' },
      },
      {
        tool: 'path',
        labelKey: 'chart.drawing.hexagon',
        icon: Hexagon,
        meta: { preset: 'hexagon' },
      },
      {
        tool: 'rotated-rectangle',
        labelKey: 'chart.drawing.rotatedRectangle',
        icon: RotateCw,
      },
      {
        tool: 'arc',
        labelKey: 'chart.drawing.arc',
        icon: Spline,
      },
    ],
  },
  {
    id: 'annotations',
    labelKey: 'chart.drawing.categories.annotations',
    persistKey: 'drawing-last-annotations',
    tools: [
      {
        tool: 'text',
        labelKey: 'chart.drawing.text',
        icon: Type,
      },
      {
        tool: 'arrow',
        labelKey: 'chart.drawing.arrow',
        icon: ArrowUpRight,
      },
      {
        tool: 'callout',
        labelKey: 'chart.drawing.callout',
        icon: MessageSquare,
      },
      {
        tool: 'brush',
        labelKey: 'chart.drawing.brush',
        icon: Paintbrush,
      },
      {
        tool: 'highlighter',
        labelKey: 'chart.drawing.highlighter',
        icon: Highlighter,
      },
    ],
  },
  {
    id: 'fibonacci',
    labelKey: 'chart.drawing.categories.fibonacci',
    persistKey: 'drawing-last-fibonacci',
    tools: [
      {
        tool: 'fibonacci',
        labelKey: 'chart.drawing.fibonacci',
        icon: TrendingUp,
      },
      {
        tool: 'fib-extension',
        labelKey: 'chart.drawing.fibExtension',
        icon: Spline,
      },
      {
        tool: 'fib-channel',
        labelKey: 'chart.drawing.fibChannel',
        icon: Columns2,
      },
      {
        tool: 'fib-time-zone',
        labelKey: 'chart.drawing.fibTimeZone',
        icon: Columns3,
      },
      {
        tool: 'fib-wedge',
        labelKey: 'chart.drawing.fibWedge',
        icon: Radar,
      },
    ],
  },
  {
    id: 'gann',
    labelKey: 'chart.drawing.categories.gann',
    persistKey: 'drawing-last-gann',
    tools: [
      {
        tool: 'gann-fan',
        labelKey: 'chart.drawing.gannFan',
        icon: Fan,
      },
      {
        tool: 'gann-box',
        labelKey: 'chart.drawing.gannBox',
        icon: Grid3x3,
      },
    ],
  },
  {
    id: 'patterns',
    labelKey: 'chart.drawing.categories.patterns',
    persistKey: 'drawing-last-patterns',
    tools: [
      {
        tool: 'triangle-pattern',
        labelKey: 'chart.drawing.trianglePattern',
        icon: Triangle,
      },
      {
        tool: 'abcd-pattern',
        labelKey: 'chart.drawing.abcdPattern',
        icon: Activity,
      },
      {
        tool: 'xabcd-pattern',
        labelKey: 'chart.drawing.xabcdPattern',
        icon: Octagon,
      },
      {
        tool: 'head-shoulders',
        labelKey: 'chart.drawing.headShoulders',
        icon: Activity,
      },
      {
        tool: 'elliott-wave',
        labelKey: 'chart.drawing.elliottWave',
        icon: Waves,
      },
    ],
  },
  {
    id: 'projection',
    labelKey: 'chart.drawing.categories.projection',
    persistKey: 'drawing-last-projection',
    tools: [
      {
        tool: 'long-position',
        labelKey: 'chart.drawing.longPosition',
        icon: TrendingUp,
      },
      {
        tool: 'short-position',
        labelKey: 'chart.drawing.shortPosition',
        icon: TrendingDown,
      },
      {
        tool: 'forecast',
        labelKey: 'chart.drawing.forecast',
        icon: Target,
      },
      {
        tool: 'anchored-vwap',
        labelKey: 'chart.drawing.anchoredVwap',
        icon: LineChart,
      },
    ],
  },
  {
    id: 'measure',
    labelKey: 'chart.drawing.categories.measure',
    persistKey: 'drawing-last-measure',
    tools: [
      {
        tool: 'measure',
        labelKey: 'chart.drawing.measure',
        icon: RulerIcon,
      },
      {
        tool: 'date-range',
        labelKey: 'chart.drawing.dateRange',
        icon: CalendarRange,
      },
      {
        tool: 'price-date-range',
        labelKey: 'chart.drawing.priceDateRange',
        icon: Scaling,
      },
    ],
  },
]

/** Unique key for a tool option — differentiates path presets from each other. */
export const toolKey = (opt: DrawingToolOption): string =>
  drawingToolKey(opt.tool, opt.meta)

const TOOLS_BY_KEY = new Map<string, DrawingToolOption>(
  TOOL_CATEGORIES.flatMap((category) =>
    category.tools.map((option) => [toolKey(option), option] as const),
  ),
)

/**
 * Resolve a stored key back to its option, or `undefined` when the key names a
 * tool this build no longer ships. Callers drop those rather than rendering a
 * blank button — a favorites list saved by a newer version stays readable here.
 */
export const findDrawingTool = (key: string): DrawingToolOption | undefined =>
  TOOLS_BY_KEY.get(key)
