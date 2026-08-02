// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  Circle,
  Columns2,
  Columns3,
  Crosshair,
  Diamond,
  Eraser,
  Fan,
  GitBranch,
  Grid3x3,
  Hexagon,
  Highlighter,
  LineChart,
  Maximize2,
  MessageSquare,
  Minus,
  MousePointer2,
  MoveRight,
  MoveVertical,
  Octagon,
  Paintbrush,
  Pen,
  PencilLine,
  Pin,
  PinOff,
  Radar,
  Redo2,
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
  Undo2,
  Waves,
} from 'lucide-react'

import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import { Kbd } from '@pairlens/ui/components/ui/kbd'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import { Separator } from '@pairlens/ui/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import type {
  DrawingToolMode,
  DrawingToolType,
} from '@pairlens/fast-financial-charts/types'
import { ShortcutHint } from '@/components/shortcut-hints'
import { usePersistedState } from '@/hooks/use-persisted-state'

type IconComponent = React.ComponentType<{ className?: string }>

type DrawingToolOption = {
  tool: DrawingToolType
  labelKey: string
  shortcutLabel: string
  icon: IconComponent
  /** Extra metadata passed to the chart engine (e.g., path preset). */
  meta?: Record<string, unknown>
}

/** Circle icon stretched to look like an ellipse. */
const ellipseIconStyle = { transform: 'scaleX(1.3) scaleY(0.8)' } as const

function EllipseIcon({ className }: { className?: string }) {
  return <Circle className={className} style={ellipseIconStyle} />
}

type ToolCategory = {
  id: string
  labelKey: string
  tools: Array<DrawingToolOption>
  persistKey: string
}

const TOOL_CATEGORIES: Array<ToolCategory> = [
  {
    id: 'lines',
    labelKey: 'chart.drawing.categories.lines',
    persistKey: 'drawing-last-lines',
    tools: [
      {
        tool: 'line',
        labelKey: 'chart.drawing.trendLine',
        shortcutLabel: '⌥T',
        icon: PencilLine,
      },
      {
        tool: 'ray',
        labelKey: 'chart.drawing.ray',
        shortcutLabel: '⌥Y',
        icon: MoveRight,
      },
      {
        tool: 'xline',
        labelKey: 'chart.drawing.extendedLine',
        shortcutLabel: '⌥E',
        icon: Maximize2,
      },
      {
        tool: 'info-line',
        labelKey: 'chart.drawing.infoLine',
        shortcutLabel: '⌥I',
        icon: Slash,
      },
      {
        tool: 'trend-angle',
        labelKey: 'chart.drawing.trendAngle',
        shortcutLabel: '',
        icon: ArrowDownRight,
      },
      {
        tool: 'hline',
        labelKey: 'chart.drawing.horizontalLine',
        shortcutLabel: '⌥H',
        icon: Minus,
      },
      {
        tool: 'hray',
        labelKey: 'chart.drawing.horizontalRay',
        shortcutLabel: '',
        icon: MoveRight,
      },
      {
        tool: 'vline',
        labelKey: 'chart.drawing.verticalLine',
        shortcutLabel: '⌥V',
        icon: MoveVertical,
      },
      {
        tool: 'crossline',
        labelKey: 'chart.drawing.crossLine',
        shortcutLabel: '⌥C',
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
        shortcutLabel: '',
        icon: Columns2,
      },
      {
        tool: 'pitchfork',
        labelKey: 'chart.drawing.pitchfork',
        shortcutLabel: '',
        icon: GitBranch,
      },
      {
        tool: 'polyline',
        labelKey: 'chart.drawing.polyline',
        shortcutLabel: '',
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
        shortcutLabel: '⌥R',
        icon: SeparatorHorizontal,
      },
      {
        tool: 'circle',
        labelKey: 'chart.drawing.circle',
        shortcutLabel: '',
        icon: Circle,
      },
      {
        tool: 'ellipse',
        labelKey: 'chart.drawing.ellipse',
        shortcutLabel: '',
        icon: EllipseIcon,
      },
      {
        tool: 'path',
        labelKey: 'chart.drawing.triangle',
        shortcutLabel: '',
        icon: Triangle,
        meta: { preset: 'triangle' },
      },
      {
        tool: 'path',
        labelKey: 'chart.drawing.diamond',
        shortcutLabel: '',
        icon: Diamond,
        meta: { preset: 'diamond' },
      },
      {
        tool: 'path',
        labelKey: 'chart.drawing.star',
        shortcutLabel: '',
        icon: Star,
        meta: { preset: 'star' },
      },
      {
        tool: 'path',
        labelKey: 'chart.drawing.hexagon',
        shortcutLabel: '',
        icon: Hexagon,
        meta: { preset: 'hexagon' },
      },
      {
        tool: 'rotated-rectangle',
        labelKey: 'chart.drawing.rotatedRectangle',
        shortcutLabel: '',
        icon: RotateCw,
      },
      {
        tool: 'arc',
        labelKey: 'chart.drawing.arc',
        shortcutLabel: '',
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
        shortcutLabel: '⌥X',
        icon: Type,
      },
      {
        tool: 'arrow',
        labelKey: 'chart.drawing.arrow',
        shortcutLabel: '⌥A',
        icon: ArrowUpRight,
      },
      {
        tool: 'callout',
        labelKey: 'chart.drawing.callout',
        shortcutLabel: '',
        icon: MessageSquare,
      },
      {
        tool: 'brush',
        labelKey: 'chart.drawing.brush',
        shortcutLabel: '',
        icon: Paintbrush,
      },
      {
        tool: 'highlighter',
        labelKey: 'chart.drawing.highlighter',
        shortcutLabel: '',
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
        shortcutLabel: '⌥F',
        icon: TrendingUp,
      },
      {
        tool: 'fib-extension',
        labelKey: 'chart.drawing.fibExtension',
        shortcutLabel: '',
        icon: Spline,
      },
      {
        tool: 'fib-channel',
        labelKey: 'chart.drawing.fibChannel',
        shortcutLabel: '',
        icon: Columns2,
      },
      {
        tool: 'fib-time-zone',
        labelKey: 'chart.drawing.fibTimeZone',
        shortcutLabel: '',
        icon: Columns3,
      },
      {
        tool: 'fib-wedge',
        labelKey: 'chart.drawing.fibWedge',
        shortcutLabel: '',
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
        shortcutLabel: '',
        icon: Fan,
      },
      {
        tool: 'gann-box',
        labelKey: 'chart.drawing.gannBox',
        shortcutLabel: '',
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
        shortcutLabel: '',
        icon: Triangle,
      },
      {
        tool: 'abcd-pattern',
        labelKey: 'chart.drawing.abcdPattern',
        shortcutLabel: '',
        icon: Activity,
      },
      {
        tool: 'xabcd-pattern',
        labelKey: 'chart.drawing.xabcdPattern',
        shortcutLabel: '',
        icon: Octagon,
      },
      {
        tool: 'head-shoulders',
        labelKey: 'chart.drawing.headShoulders',
        shortcutLabel: '',
        icon: Activity,
      },
      {
        tool: 'elliott-wave',
        labelKey: 'chart.drawing.elliottWave',
        shortcutLabel: '',
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
        shortcutLabel: '⌥L',
        icon: TrendingUp,
      },
      {
        tool: 'short-position',
        labelKey: 'chart.drawing.shortPosition',
        shortcutLabel: '⌥S',
        icon: TrendingDown,
      },
      {
        tool: 'forecast',
        labelKey: 'chart.drawing.forecast',
        shortcutLabel: '',
        icon: Target,
      },
      {
        tool: 'anchored-vwap',
        labelKey: 'chart.drawing.anchoredVwap',
        shortcutLabel: '',
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
        shortcutLabel: '⌥M',
        icon: RulerIcon,
      },
      {
        tool: 'date-range',
        labelKey: 'chart.drawing.dateRange',
        shortcutLabel: '⌥D',
        icon: CalendarRange,
      },
      {
        tool: 'price-date-range',
        labelKey: 'chart.drawing.priceDateRange',
        shortcutLabel: '',
        icon: Scaling,
      },
    ],
  },
]

type ChartDrawingToolbarProps = {
  activeTool: DrawingToolType | null
  activeToolMeta?: Record<string, unknown> | null
  toolMode: DrawingToolMode
  onToolChange: (
    tool: DrawingToolType | null,
    meta?: Record<string, unknown>,
  ) => void
  onToolModeChange: (mode: DrawingToolMode) => void
  onClearAll: () => void
  onClearDrawings: () => void
  onClearIndicators: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

/** Unique key for a tool option — differentiates path presets from each other. */
const toolKey = (opt: DrawingToolOption): string =>
  opt.meta?.preset ? `${opt.tool}:${opt.meta.preset}` : opt.tool

/** Build an active tool key from the tool type + optional meta (same format as toolKey). */
const activeKey = (
  tool: DrawingToolType | null,
  meta?: Record<string, unknown> | null,
): string | null => {
  if (!tool) return null
  return meta?.preset ? `${tool}:${meta.preset}` : tool
}

function CategoryGroup({
  category,
  activeToolKey,
  onToolChange,
}: {
  category: ToolCategory
  activeToolKey: string | null
  onToolChange: (tool: DrawingToolType, meta?: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const [lastUsedKey, setLastUsedKey] = usePersistedState<string>(
    category.persistKey,
    toolKey(category.tools[0]),
  )
  const [open, setOpen] = useState(false)

  const lastUsedTool =
    category.tools.find((o) => toolKey(o) === lastUsedKey) ?? category.tools[0]
  const activeOption = activeToolKey
    ? category.tools.find((o) => toolKey(o) === activeToolKey)
    : undefined
  const isActive = !!activeOption
  const displayTool = activeOption ?? lastUsedTool
  const Icon = displayTool.icon

  // Single tool in category — no flyout needed
  if (category.tools.length === 1) {
    const tool = category.tools[0]
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant={toolKey(tool) === activeToolKey ? 'default' : 'ghost'}
              className="size-7"
              onClick={() => onToolChange(tool.tool, tool.meta)}
              aria-label={t(tool.labelKey)}
            />
          }
        >
          <tool.icon className="size-3.5" />
          {tool.shortcutLabel && <ShortcutHint keys={tool.shortcutLabel} />}
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {t(tool.labelKey)}
          {tool.shortcutLabel && (
            <Kbd className="ml-1">{tool.shortcutLabel}</Kbd>
          )}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant={isActive ? 'default' : 'ghost'}
                className="size-7 rounded-r-none pr-0"
                onClick={() => {
                  onToolChange(displayTool.tool, displayTool.meta)
                  setLastUsedKey(toolKey(displayTool))
                }}
                aria-label={t(displayTool.labelKey)}
              />
            }
          >
            <Icon className="size-3.5" />
            {displayTool.shortcutLabel && (
              <ShortcutHint keys={displayTool.shortcutLabel} />
            )}
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {t(displayTool.labelKey)}
            {displayTool.shortcutLabel && (
              <Kbd className="ml-1">{displayTool.shortcutLabel}</Kbd>
            )}
          </TooltipContent>
        </Tooltip>
        <PopoverTrigger
          render={
            <Button
              size="icon-sm"
              variant={isActive ? 'default' : 'ghost'}
              className="size-7 w-3 rounded-l-none pl-0"
              aria-label={t(category.labelKey)}
            />
          }
        >
          <ChevronDown className="size-2.5" />
        </PopoverTrigger>
      </div>
      <PopoverContent side="right" align="start" className="w-auto p-1">
        <div className="flex flex-col gap-0.5">
          {category.tools.map((option) => (
            <Button
              key={toolKey(option)}
              size="sm"
              variant={toolKey(option) === activeToolKey ? 'default' : 'ghost'}
              className="justify-start gap-2 px-2 text-xs"
              onClick={() => {
                onToolChange(option.tool, option.meta)
                setLastUsedKey(toolKey(option))
                setOpen(false)
              }}
            >
              <option.icon className="size-3.5" />
              {t(option.labelKey)}
              {option.shortcutLabel && (
                <Kbd className="ml-auto text-[10px]">
                  {option.shortcutLabel}
                </Kbd>
              )}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ChartDrawingToolbar({
  activeTool,
  activeToolMeta,
  toolMode,
  onToolChange,
  onToolModeChange,
  onClearAll,
  onClearDrawings,
  onClearIndicators,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ChartDrawingToolbarProps) {
  const { t } = useTranslation()
  const StickyModeIcon = toolMode === 'sticky' ? Pin : PinOff
  const activeToolKey = activeKey(activeTool, activeToolMeta)

  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 border-r py-2">
      {/* Select / Pan */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant={activeTool === null ? 'default' : 'ghost'}
              className="size-7"
              onClick={() => onToolChange(null)}
              aria-label={t('chart.drawing.selectPan')}
            />
          }
        >
          <MousePointer2 className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {t('chart.drawing.selectPan')}
          <Kbd className="ml-1">Esc</Kbd>
        </TooltipContent>
      </Tooltip>

      <Separator className="my-1 w-6" />

      {/* Category groups */}
      {TOOL_CATEGORIES.map((category) => (
        <CategoryGroup
          key={category.id}
          category={category}
          activeToolKey={activeToolKey}
          onToolChange={onToolChange}
        />
      ))}

      {/* Bottom actions */}
      <div className="mt-auto flex flex-col items-center gap-0.5">
        <Separator className="mb-1 w-6" />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-7"
                      aria-label={t('chart.drawing.clearMenu', 'Clear…')}
                    />
                  }
                />
              }
            >
              <Eraser className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="right">
              {t('chart.drawing.clearMenu', 'Clear…')}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuItem onClick={onClearDrawings}>
              {t('chart.drawing.clearDrawings', 'Clear drawings')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onClearIndicators}>
              {t('chart.drawing.clearIndicators', 'Clear indicators')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClearAll}>
              {t('chart.drawing.clearAll')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant={toolMode === 'sticky' ? 'default' : 'ghost'}
                className="size-7"
                onClick={() =>
                  onToolModeChange(
                    toolMode === 'sticky' ? 'single-use' : 'sticky',
                  )
                }
                aria-label={
                  toolMode === 'sticky'
                    ? t('chart.drawing.stickyEnabled')
                    : t('chart.drawing.singleUseEnabled')
                }
              />
            }
          >
            <StickyModeIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent side="right">
            {toolMode === 'sticky'
              ? t('chart.drawing.stickyTools')
              : t('chart.drawing.singleUseTools')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-7"
                disabled={!canUndo}
                onClick={onUndo}
                aria-label={t('chart.drawing.undo')}
              />
            }
          >
            <Undo2 className="size-3.5" />
            <ShortcutHint keys="⌘Z" />
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {t('chart.drawing.undo')} <Kbd className="ml-1">⌘Z</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-7"
                disabled={!canRedo}
                onClick={onRedo}
                aria-label={t('chart.drawing.redo')}
              />
            }
          >
            <Redo2 className="size-3.5" />
            <ShortcutHint keys="⌘⇧Z" />
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {t('chart.drawing.redo')} <Kbd className="ml-1">⌘⇧Z</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
