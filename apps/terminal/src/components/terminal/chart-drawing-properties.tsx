// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import { Lock, Trash2, Unlock } from 'lucide-react'
import type {
  ChartCommand,
  DrawingObject,
  DrawingToolType,
  FastFinancialChartRef,
  LineStyleType,
} from '@pairlens/fast-financial-charts/types'

const COLORS = [
  '#ffb020',
  '#ef4444',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#8b8b8b',
  '#ffffff',
]

const LINE_WIDTHS = [0.5, 1, 1.5, 2, 3, 4]

const LINE_STYLES: Array<{
  value: LineStyleType
  label: string
  dash: string
}> = [
  { value: 'solid', label: 'Solid', dash: '' },
  { value: 'dashed', label: 'Dashed', dash: '6 3' },
  { value: 'dotted', label: 'Dotted', dash: '2 2' },
]

type ChartDrawingPropertiesProps = {
  chartRef: React.RefObject<FastFinancialChartRef | null>
  runCommand: (command: ChartCommand) => unknown
  /** Style edits become the default for future drawings of the same tool. */
  onStyleChange?: (
    type: DrawingToolType,
    style: { color?: string; lineWidth?: number; lineStyle?: LineStyleType },
  ) => void
}

export function ChartDrawingProperties({
  chartRef,
  runCommand,
  onStyleChange,
}: ChartDrawingPropertiesProps) {
  const { t } = useTranslation()
  const [selectedDrawing, setSelectedDrawing] = useState<DrawingObject | null>(
    null,
  )

  // Subscribe to selection changes via the chart engine's event system
  useEffect(() => {
    const ref = chartRef.current
    if (!ref) return

    return ref.subscribe((event) => {
      if (event.type === 'selectionChange') {
        setSelectedDrawing(event.payload.drawing)
      } else if (event.type === 'drawingsChange' && selectedDrawing) {
        // Update the local copy when the selected drawing is patched
        const updated = event.payload.drawings.find(
          (d) => d.id === selectedDrawing.id,
        )
        if (updated) setSelectedDrawing(updated)
        else setSelectedDrawing(null)
      }
    })
  }, [chartRef, selectedDrawing?.id])

  const patchDrawing = useCallback(
    (patch: Partial<DrawingObject>) => {
      if (!selectedDrawing) return
      runCommand({
        type: 'updateDrawing',
        payload: { id: selectedDrawing.id, patch },
      })
      // Style edits carry forward: remember them per tool so the next
      // drawing of this type starts with the user's last-used style.
      const { color, lineWidth, lineStyle } = patch
      if (color !== undefined || lineWidth !== undefined || lineStyle) {
        onStyleChange?.(selectedDrawing.type, {
          ...(color !== undefined ? { color } : {}),
          ...(lineWidth !== undefined ? { lineWidth } : {}),
          ...(lineStyle ? { lineStyle } : {}),
        })
      }
    },
    [selectedDrawing, runCommand, onStyleChange],
  )

  const deleteDrawing = useCallback(() => {
    if (!selectedDrawing) return
    runCommand({
      type: 'removeDrawing',
      payload: { id: selectedDrawing.id },
    })
  }, [selectedDrawing, runCommand])

  if (!selectedDrawing) return null

  const currentColor = selectedDrawing.color
  const currentWidth = selectedDrawing.lineWidth
  const currentStyle = selectedDrawing.lineStyle ?? 'solid'
  const isLocked = selectedDrawing.locked ?? false

  return (
    <div
      className="absolute bottom-10 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-md border bg-background/95 p-0.5 shadow-sm backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Color picker */}
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-7"
                    aria-label={t('chart.drawing.properties.color', 'Color')}
                  />
                }
              />
            }
          >
            <div
              className="size-3.5 rounded-sm border border-white/20"
              style={{ backgroundColor: currentColor }}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('chart.drawing.properties.color', 'Color')}
          </TooltipContent>
        </Tooltip>
        <PopoverContent className="w-auto p-2" side="bottom" align="start">
          <div className="grid grid-cols-5 gap-1">
            {COLORS.map((color) => (
              <button
                key={color}
                className="size-6 rounded-sm border border-white/10 transition-transform hover:scale-110"
                style={{ backgroundColor: color }}
                onClick={() => patchDrawing({ color })}
                aria-label={color}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Line width */}
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-7"
                    aria-label={t(
                      'chart.drawing.properties.lineWidth',
                      'Line Width',
                    )}
                  />
                }
              />
            }
          >
            <div className="flex items-center justify-center">
              <div
                className="w-3.5 rounded-full"
                style={{
                  height: Math.max(1, currentWidth),
                  backgroundColor: currentColor,
                }}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('chart.drawing.properties.lineWidth', 'Line Width')}
          </TooltipContent>
        </Tooltip>
        <PopoverContent className="w-auto p-1" side="bottom" align="start">
          <div className="flex flex-col gap-0.5">
            {LINE_WIDTHS.map((w) => (
              <Button
                key={w}
                size="sm"
                variant={w === currentWidth ? 'default' : 'ghost'}
                className="justify-start gap-2 px-2 text-xs"
                onClick={() => patchDrawing({ lineWidth: w })}
              >
                <div
                  className="w-6 rounded-full"
                  style={{
                    height: Math.max(1, w),
                    backgroundColor:
                      w === currentWidth ? 'currentColor' : currentColor,
                  }}
                />
                {w}px
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Line style */}
      <div className="flex items-center gap-0">
        {LINE_STYLES.map((style) => (
          <Tooltip key={style.value}>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant={style.value === currentStyle ? 'default' : 'ghost'}
                  className="size-7"
                  onClick={() => patchDrawing({ lineStyle: style.value })}
                  aria-label={style.label}
                />
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                className="text-current"
              >
                <line
                  x1="1"
                  y1="7"
                  x2="13"
                  y2="7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray={style.dash}
                />
              </svg>
            </TooltipTrigger>
            <TooltipContent side="bottom">{style.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="mx-0.5 h-4 w-px bg-border" />

      {/* Lock toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant={isLocked ? 'default' : 'ghost'}
              className="size-7"
              onClick={() => patchDrawing({ locked: !isLocked })}
              aria-label={
                isLocked
                  ? t('chart.drawing.properties.unlock', 'Unlock')
                  : t('chart.drawing.properties.lock', 'Lock')
              }
            />
          }
        >
          {isLocked ? (
            <Lock className="size-3.5" />
          ) : (
            <Unlock className="size-3.5" />
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isLocked
            ? t('chart.drawing.properties.unlock', 'Unlock')
            : t('chart.drawing.properties.lock', 'Lock')}
        </TooltipContent>
      </Tooltip>

      {/* Delete */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-7 text-destructive hover:text-destructive"
              onClick={deleteDrawing}
              aria-label={t('chart.drawing.properties.delete', 'Delete')}
            />
          }
        >
          <Trash2 className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t('chart.drawing.properties.delete', 'Delete')}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
