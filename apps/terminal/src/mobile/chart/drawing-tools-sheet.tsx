// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The full drawing-tools panel — design screen 3.
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
 *
 * The `MobileSheet` frame lives in `chart-tool-sheet.tsx`, shared with the
 * indicators panel — see the single-writer argument there.
 */
import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Glyph } from '../primitives/glyphs'
import { PRESS } from '../primitives/press'
import { MOBILE_DRAWING_SECTIONS } from './drawing-sections'
import { SLOT_GLYPHS } from './use-drawing-slots'
import type { DrawingToolOption } from '@/components/terminal/drawing-tool-catalog'
import { findDrawingTool } from '@/components/terminal/drawing-tool-catalog'
import { drawingToolKey } from '@/lib/chart-drawing-tools'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'

export type DrawingToolsPanelProps = {
  /** Dismisses the shared sheet once a tool is armed. */
  onClose: () => void
  /** Pushes the picked tool into the toolbar's LRU slots. */
  onPick: (key: string) => void
}

export default memo(function DrawingToolsPanel({
  onClose,
  onPick,
}: DrawingToolsPanelProps) {
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
      onClose()
    },
    [applyTool, onClose, onPick],
  )

  return (
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
        'pl-press flex flex-col items-center gap-1.5 rounded-xl px-1 py-[9px]',
        selected
          ? 'pl-ring-primary bg-[color-mix(in_oklch,var(--primary)_20%,transparent)] text-foreground'
          : 'pl-ring bg-[color:var(--pl-wash)] text-muted-foreground',
      )}
      onClick={() => onPick(toolKeyValue, option)}
      type="button"
      {...PRESS}
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
