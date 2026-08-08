// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The full drawing-tools sheet — design screen 3.
 *
 * The five sections are the design's groupings, not the catalog's nine
 * categories: a phone shows twenty tools, so they are grouped the way a hand
 * reaches for them (Lines · Channels & Fibonacci · Shapes · Annotate ·
 * Measure) rather than the way the desktop rail's flyouts enumerate them. Every
 * entry is still a `toolKey` looked up in `TOOL_CATEGORIES` — label, icon,
 * engine tool and path preset all come from the one catalog, so a tool that
 * changes there changes here.
 *
 * Picking closes the sheet and pushes the tool into the toolbar's LRU slots.
 */
import { memo, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Glyph } from '../primitives/glyphs'
import { MobileSheet } from '../primitives/mobile-sheet'
import { SHEET_BAND, sheetTop } from '../lib/mobile-geometry'
import { MOBILE_DRAWING_SECTIONS } from './drawing-sections'
import { SLOT_GLYPHS } from './use-drawing-slots'
import type { DrawingToolOption } from '@/components/terminal/drawing-tool-catalog'
import { findDrawingTool } from '@/components/terminal/drawing-tool-catalog'
import { drawingToolKey } from '@/lib/chart-drawing-tools'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'

export type DrawingToolsSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pushes the picked tool into the toolbar's LRU slots. */
  onPick: (key: string) => void
}

export default memo(function DrawingToolsSheet({
  open,
  onOpenChange,
  onPick,
}: DrawingToolsSheetProps) {
  const { t } = useTranslation()
  const { activeTool, activeToolMeta } = useChartConfig()
  const { applyTool } = useChartActions()

  const activeKey = activeTool
    ? drawingToolKey(activeTool, activeToolMeta)
    : null

  // Resolved once: a key the catalog no longer ships is dropped rather than
  // rendered as a blank tile (the same contract `findDrawingTool` documents).
  const sections = useMemo(
    () =>
      MOBILE_DRAWING_SECTIONS.map((section) => ({
        labelKey: section.labelKey,
        tools: section.keys.flatMap((key) => {
          const option = findDrawingTool(key)
          return option ? [{ key, option }] : []
        }),
      })).filter((section) => section.tools.length > 0),
    [],
  )

  const pick = useCallback(
    (key: string, option: DrawingToolOption) => {
      // `applyTool` is the one funnel every tool selection passes through —
      // it records the recent tool (trackDrawingToolUse) and fires
      // `drawing_tool_selected` itself, so neither is repeated here.
      applyTool(option.tool, option.meta)
      onPick(key)
      onOpenChange(false)
    },
    [applyTool, onOpenChange, onPick],
  )

  return (
    <>
      <ChartDim open={open} />
      <MobileSheet
        band={SHEET_BAND.drawingTools}
        header={
          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <p className="text-[17px] font-semibold text-foreground">
              {t('mobile.chart.drawingTools')}
            </p>
            <button
              aria-label={t('mobile.shell.dismiss')}
              className="pl-hit-44 -mr-1 flex size-9 items-center justify-center rounded-full text-muted-foreground"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              <X className="size-[18px]" />
            </button>
          </div>
        }
        label={t('mobile.chart.drawingTools')}
        onOpenChange={onOpenChange}
        open={open}
      >
        <div className="px-4 pt-1">
          {sections.map((section) => (
            <section className="mb-2.5" key={section.labelKey}>
              <p className="px-0.5 pb-2 text-[9.5px] font-semibold uppercase tracking-[.09em] text-muted-foreground">
                {t(section.labelKey)}
              </p>
              <div className="grid grid-cols-4 gap-[7px]">
                {section.tools.map(({ key, option }) => (
                  <ToolTile
                    key={key}
                    onPick={pick}
                    option={option}
                    selected={key === activeKey}
                    toolKeyValue={key}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </MobileSheet>
    </>
  )
})

const ToolTile = memo(function ToolTile({
  toolKeyValue,
  option,
  selected,
  onPick,
}: {
  toolKeyValue: string
  option: DrawingToolOption
  selected: boolean
  onPick: (key: string, option: DrawingToolOption) => void
}) {
  const { t } = useTranslation()
  const glyph = SLOT_GLYPHS[toolKeyValue]
  const Icon = option.icon

  return (
    <button
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl px-1 py-[9px]',
        selected
          ? 'bg-[color-mix(in_oklch,var(--primary)_20%,transparent)] text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_46%,transparent)]'
          : 'bg-[color:var(--pl-wash)] text-muted-foreground shadow-[inset_0_0_0_1px_var(--pl-edge)]',
      )}
      onClick={() => onPick(toolKeyValue, option)}
      type="button"
    >
      {glyph ? <Glyph name={glyph} size={20} /> : <Icon className="size-5" />}
      <span
        className={cn(
          'text-center text-[10px] font-medium leading-tight',
          selected ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {t(option.labelKey)}
      </span>
    </button>
  )
})

/**
 * The chart dims to .7 behind this sheet (design screen 3) — the same
 * treatment the Watchlist and Discover panels get from the shell's panel
 * table, which the tools sheet is not part of.
 *
 * Portaled to the body because the toolbar renders inside the chart band's
 * `z-30` footer, and a stacking context cannot lift a child above its own
 * z-index. Bounded to the chart band so the context bar above it stays sharp,
 * and `pointer-events-none` so it never eats a gesture.
 */
function ChartDim({ open }: { open: boolean }) {
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 z-[39] bg-background/30"
      style={{
        top: 'var(--pl-chart-top)',
        height: `calc(${sheetTop(SHEET_BAND.drawingTools)} - var(--pl-chart-top))`,
      }}
    />,
    document.body,
  )
}
