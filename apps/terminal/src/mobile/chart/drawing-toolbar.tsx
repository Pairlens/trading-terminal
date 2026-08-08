// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The drawing toolbar docked above the tab bar — design screen 1.
 *
 * Nine children: five LRU tool slots, the grid button that opens the full
 * sheet, a hairline divider, magnet, trash. The slots are earned, not
 * configured (see `use-drawing-slots`), which is what lets a phone offer forty
 * tools without a settings screen.
 *
 * Every selection goes through `chartActions.applyTool` — the one funnel the
 * desktop rail, the keyboard chords and the copilot all use — so recents and
 * the `drawing_tool_selected` event are recorded once, in one place, and the
 * chart is armed by the same command path in every surface.
 *
 * `memo`, and it reads only ChartConfig/ChartActions: a streaming ticker must
 * leave it at zero re-renders.
 */
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Grid2x2, Magnet, MousePointer2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from '@pairlens/ui'
import { Glyph } from '../primitives/glyphs'
import { SELECT_SLOT, SLOT_GLYPHS, useDrawingSlots } from './use-drawing-slots'
import type { ReactNode } from 'react'
import { findDrawingTool } from '@/components/terminal/drawing-tool-catalog'
import { drawingToolKey } from '@/lib/chart-drawing-tools'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'
import { lazyChunk } from '@/lib/lazy-chunk'

const DrawingToolsSheet = lazyChunk(() => import('./drawing-tools-sheet'))

/**
 * Bar height, in px — 8px padding, a 34px chip row, 8px padding.
 *
 * Exported because the chart band currently runs underneath it: the plot's
 * time axis is the bottom 50px the toolbar covers. Reserving that space is a
 * one-line change in `mobile-chart-surface.tsx` (WS-A's file), which is why
 * the number lives here rather than being written twice.
 */
export const MOBILE_DRAWING_TOOLBAR_HEIGHT = 50

/**
 * The sanctioned sub-44px control: a 34px chip in a 50px bar. The expansion is
 * vertical only — the chips are already ~45px wide at 402px, and `.pl-hit-44`'s
 * symmetric 8px inset would overlap each neighbour by 7px in a 2px gap, handing
 * the boundary to whichever sibling paints last.
 */
const CHIP =
  'relative flex h-[34px] flex-1 items-center justify-center rounded-[10px] after:absolute after:inset-x-0 after:-inset-y-2 after:content-[""]'

export default memo(function MobileDrawingToolbar({
  docked = false,
}: {
  /** True while a shell panel is docked over the chart. */
  docked?: boolean
}) {
  const { t } = useTranslation()
  const { activeTool, activeToolMeta, crosshairMode } = useChartConfig()
  const { applyTool, setCrosshairMode, clearAllDrawings } = useChartActions()
  const { slots, promote } = useDrawingSlots()
  const [sheetOpen, setSheetOpen] = useState(false)
  // Once opened, the sheet stays MOUNTED and closes by `open` flipping false.
  // Unmounting it while open both rips away its close animation and strands
  // the `--pl-sheet-dock` channel it wrote at 1 — the effect that animates the
  // vars back only runs on a rendered open→false transition.
  const [everOpened, setEverOpened] = useState(false)

  // A tab tap can dock a panel over an open tools sheet (the tab bar rides
  // above every sheet). Two open tracked sheets would then contend for the
  // shared position channel, so the tools sheet — the one whose context just
  // left the screen — yields.
  useEffect(() => {
    if (docked) setSheetOpen(false)
  }, [docked])

  const activeKey = activeTool
    ? drawingToolKey(activeTool, activeToolMeta)
    : SELECT_SLOT

  const resolved = useMemo(
    () =>
      slots.map((key) => ({
        key,
        option: key === SELECT_SLOT ? null : findDrawingTool(key),
      })),
    [slots],
  )

  const pickSlot = useCallback(
    (key: string) => {
      if (key === SELECT_SLOT) {
        applyTool(null)
        return
      }
      const option = findDrawingTool(key)
      if (!option) return
      // Tapping the armed tool disarms it. Sticky mode keeps a tool armed
      // after every drawing, and the cursor slot is evictable, so without this
      // a trader can lose the only way back to pan-and-select.
      if (key === activeKey) {
        applyTool(null)
        return
      }
      applyTool(option.tool, option.meta)
    },
    [activeKey, applyTool],
  )

  const confirmClear = useCallback(() => {
    toast.warning(t('mobile.chart.clearConfirm'), {
      action: {
        label: t('chart.drawing.clearDrawings'),
        onClick: () => clearAllDrawings(),
      },
    })
  }, [clearAllDrawings, t])

  const magnetOn = crosshairMode === 'magnet'

  return (
    <>
      <div
        className="pl-toolbar flex items-center gap-0.5 px-3 py-2"
        style={{ height: MOBILE_DRAWING_TOOLBAR_HEIGHT }}
      >
        {resolved.map(({ key, option }) => {
          const glyph = SLOT_GLYPHS[key]
          const Icon = option?.icon
          const label =
            key === SELECT_SLOT
              ? t('chart.drawing.selectPan')
              : option
                ? t(option.labelKey)
                : key
          return (
            <ToolbarButton
              active={key === activeKey}
              key={key}
              label={label}
              onPress={() => pickSlot(key)}
            >
              {key === SELECT_SLOT ? (
                <MousePointer2 className="size-[18px]" strokeWidth={1.7} />
              ) : glyph ? (
                <Glyph name={glyph} size={18} />
              ) : Icon ? (
                <Icon className="size-[18px]" />
              ) : null}
            </ToolbarButton>
          )
        })}

        <ToolbarButton
          active={sheetOpen}
          label={t('mobile.chart.drawingTools')}
          onPress={() => {
            setEverOpened(true)
            setSheetOpen(true)
          }}
        >
          <Grid2x2 className="size-[18px]" strokeWidth={1.7} />
        </ToolbarButton>

        <span
          aria-hidden
          className="mx-[7px] h-5 w-px shrink-0 bg-[color:var(--pl-edge-strong)]"
        />

        <ToolbarButton
          active={magnetOn}
          dim
          label={t('chart.crosshairModes.magnet')}
          onPress={() => setCrosshairMode(magnetOn ? 'normal' : 'magnet')}
        >
          <Magnet className="size-[18px]" strokeWidth={1.7} />
        </ToolbarButton>

        <ToolbarButton
          dim
          label={t('chart.drawing.clearDrawings')}
          onPress={confirmClear}
        >
          <Trash2 className="size-[18px]" strokeWidth={1.7} />
        </ToolbarButton>
      </div>

      {everOpened ? (
        <Suspense fallback={null}>
          <DrawingToolsSheet
            onOpenChange={setSheetOpen}
            onPick={promote}
            open={sheetOpen}
          />
        </Suspense>
      ) : null}
    </>
  )
})

const ToolbarButton = memo(function ToolbarButton({
  active = false,
  dim = false,
  label,
  onPress,
  children,
}: {
  active?: boolean
  /** Magnet and trash sit back from the tools — they act on them, not with them. */
  dim?: boolean
  label: string
  onPress: () => void
  children: ReactNode
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        CHIP,
        active
          ? 'pl-chip-active text-foreground'
          : dim
            ? 'text-[color-mix(in_oklch,var(--muted-foreground)_72%,transparent)]'
            : 'text-muted-foreground',
      )}
      onClick={onPress}
      type="button"
    >
      {children}
    </button>
  )
})
