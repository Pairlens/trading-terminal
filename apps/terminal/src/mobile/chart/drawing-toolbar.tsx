// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The chart toolbar docked above the tab bar.
 *
 * Eight chips in three groups, left to right: what you draw WITH (the pinned
 * cursor and two earned tool slots), what you draw FROM (the indicators sheet
 * and the drawing-tools sheet), and what you do TO the drawings (crosshair
 * mode, undo, clear). The two hairlines are the group boundaries, and the
 * order is the user's: reach for a tool on the left, open a panel in the
 * middle, correct on the right.
 *
 * Every tool selection goes through `chartActions.applyTool` — the one funnel
 * the desktop rail, the keyboard chords and the copilot all use — so recents
 * and the `drawing_tool_selected` event are recorded once, in one place, and
 * the chart is armed by the same command path in every surface. Undo is the
 * engine's own 200-deep stack through `runCommand`, not a second history.
 *
 * The two panels share ONE sheet. They are both snap-mode sheets, and a snap
 * sheet owns the `--pl-sheet-dock` channel while it is on screen — two of them
 * mounted through a swap would have the outgoing one's exit rAF walking the
 * channel back to 0 underneath the incoming one. One sheet that changes its
 * mind is also what the shell's four panels do.
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
import {
  ChartSpline,
  Crosshair,
  EyeOff,
  Grid2x2,
  Magnet,
  MousePointer2,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from '@pairlens/ui'
import { Glyph } from '../primitives/glyphs'
import { PRESS } from '../primitives/press'
import { SELECT_SLOT, SLOT_GLYPHS, useDrawingSlots } from './use-drawing-slots'
import type { ChartToolSheetView } from './chart-tool-sheet'
import type { CrosshairMode } from '@pairlens/fast-financial-charts/types'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { findDrawingTool } from '@/components/terminal/drawing-tool-catalog'
import { drawingToolKey } from '@/lib/chart-drawing-tools'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'
import { lazyChunk } from '@/lib/lazy-chunk'

const ChartToolSheet = lazyChunk(() => import('./chart-tool-sheet'))

/**
 * Bar height, in px — 8px padding, a 34px chip row, 8px padding.
 *
 * Exported because the chart band currently runs underneath it: the plot's
 * time axis is the bottom 50px the toolbar covers. It is unchanged by the
 * restructure on purpose — the chart's box must be identical in all five
 * views, so a wider bar buys its chips from the gaps, never from the plot.
 */
export const MOBILE_DRAWING_TOOLBAR_HEIGHT = 50

/**
 * The sanctioned sub-44px control: a 34px chip in a 50px bar. The expansion is
 * vertical only — the chips are ~41px wide at 402px with eight of them, and
 * `.pl-hit-44`'s symmetric 8px inset would overlap each neighbour by 7px in a
 * 2px gap, handing the boundary to whichever sibling paints last.
 */
const CHIP =
  'pl-press relative flex h-[34px] flex-1 items-center justify-center rounded-[10px] after:absolute after:inset-x-0 after:-inset-y-2 after:content-[""]'

/**
 * One chip, three modes, cycled on tap.
 *
 * Total rather than an array index: `crosshairMode` is a union the charts
 * package owns, and a lookup that cannot return undefined is one fewer thing
 * to guard at the call site. Magnet is the default and the head of the cycle.
 *
 * `magnet` also drives `interaction.drawingSnap` (see `mobile-chart.tsx`) —
 * the crosshair and the snap are deliberately one control on a phone. `hidden`
 * only hides the ENGINE's crosshair: placement draws its own reticle in
 * `crosshair-placement.tsx`, so drawing with a finger is unaffected by it.
 */
const NEXT_CROSSHAIR_MODE: Record<CrosshairMode, CrosshairMode> = {
  magnet: 'normal',
  normal: 'hidden',
  hidden: 'magnet',
}

const CROSSHAIR_ICON: Record<CrosshairMode, LucideIcon> = {
  magnet: Magnet,
  normal: Crosshair,
  hidden: EyeOff,
}

export default memo(function MobileDrawingToolbar({
  docked = false,
}: {
  /** True while a shell panel is docked over the chart. */
  docked?: boolean
}) {
  const { t } = useTranslation()
  const { activeTool, activeToolMeta, crosshairMode, drawingHistory } =
    useChartConfig()
  const { applyTool, setCrosshairMode, clearAllDrawings, runCommand } =
    useChartActions()
  const { slots, promote } = useDrawingSlots()
  const [openSheet, setOpenSheet] = useState<ChartToolSheetView | null>(null)
  // Once opened, the sheet stays MOUNTED through an ordinary close and leaves
  // by its view going null. Unmounting it while open both rips away its close
  // animation and strands the `--pl-sheet-dock` channel it wrote at 1 — the
  // effect that animates the vars back only runs on a rendered open→false
  // transition. A shell panel docking is the one case where unmounting is the
  // RIGHT answer; see below.
  const [everOpened, setEverOpened] = useState(false)

  // A tab tap can dock a shell panel over an open sheet (the tab bar rides
  // above every sheet), and this one — whose context just left the screen —
  // yields. It yields by UNMOUNTING in the same commit the panel opens in,
  // which is the part that is not obvious:
  //
  // Closing it normally would leave it rendered and tracking its own exit for
  // 820ms, writing `--pl-sheet-dock` down to 0 from a rAF — over the top of the
  // 1 the arriving panel just wrote. Measured: the Watchlist panel docked with
  // the price readout still at its hero scale. React flushes every cleanup in a
  // commit before any effect, so unmounting instead means this sheet's own
  // "gone" write lands FIRST and the panel's write is the last word.
  //
  // `everOpened` is cleared with it so nothing remounts when the panel leaves:
  // a closed sheet mounting mid-exit would write 0 into a channel the outgoing
  // panel is still animating through, one frame of the toolbar snapping home.
  useEffect(() => {
    if (!docked) return
    setOpenSheet(null)
    setEverOpened(false)
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
      // after every drawing, so without this a trader would have to reach for
      // the cursor to stop drawing — which is exactly why the cursor is
      // pinned, but one tap beats two.
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

  const openView = useCallback((view: ChartToolSheetView) => {
    setEverOpened(true)
    // Opening one closes the other by construction: one piece of state, so
    // there is no frame in which both are open.
    setOpenSheet((current) => (current === view ? null : view))
  }, [])

  const closeSheet = useCallback((open: boolean) => {
    if (!open) setOpenSheet(null)
  }, [])

  const canUndo = drawingHistory.canUndo
  const undo = useCallback(() => {
    runCommand({ type: 'undo', payload: {} })
  }, [runCommand])

  const CrosshairIcon = CROSSHAIR_ICON[crosshairMode]

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

        <Divider />

        <ToolbarButton
          active={openSheet === 'indicators'}
          label={t('chart.toolbar.indicators')}
          onPress={() => openView('indicators')}
        >
          <ChartSpline className="size-[18px]" strokeWidth={1.7} />
        </ToolbarButton>

        <ToolbarButton
          active={openSheet === 'tools'}
          label={t('mobile.chart.drawingTools')}
          onPress={() => openView('tools')}
        >
          <Grid2x2 className="size-[18px]" strokeWidth={1.7} />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          active={crosshairMode === 'magnet'}
          dim
          label={t('mobile.chart.crosshairMode', {
            mode: t(`chart.crosshairModes.${crosshairMode}`),
          })}
          onPress={() => setCrosshairMode(NEXT_CROSSHAIR_MODE[crosshairMode])}
        >
          <CrosshairIcon className="size-[18px]" strokeWidth={1.7} />
        </ToolbarButton>

        <ToolbarButton
          dim
          disabled={!canUndo}
          label={t('chart.drawing.undo')}
          onPress={undo}
        >
          <Undo2 className="size-[18px]" strokeWidth={1.7} />
        </ToolbarButton>

        <ToolbarButton
          dim
          label={t('chart.drawing.clearDrawings')}
          onPress={confirmClear}
        >
          <Trash2 className="size-[18px]" strokeWidth={1.7} />
        </ToolbarButton>
      </div>

      {everOpened && !docked ? (
        <Suspense fallback={null}>
          <ChartToolSheet
            onOpenChange={closeSheet}
            onPickTool={promote}
            view={openSheet}
          />
        </Suspense>
      ) : null}
    </>
  )
})

/** The group hairline. `shrink-0` so the flex row never squeezes it away. */
function Divider() {
  return (
    <span
      aria-hidden
      className="mx-[5px] h-5 w-px shrink-0 bg-[color:var(--pl-edge-strong)]"
    />
  )
}

const ToolbarButton = memo(function ToolbarButton({
  active = false,
  dim = false,
  disabled = false,
  label,
  onPress,
  children,
}: {
  active?: boolean
  /** Crosshair, undo and trash sit back from the tools — they act on them. */
  dim?: boolean
  disabled?: boolean
  label: string
  onPress: () => void
  children: ReactNode
}) {
  return (
    <button
      aria-disabled={disabled || undefined}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        CHIP,
        disabled && 'opacity-35',
        active
          ? 'pl-chip-active text-foreground'
          : dim
            ? 'text-[color-mix(in_oklch,var(--muted-foreground)_72%,transparent)]'
            : 'text-muted-foreground',
      )}
      disabled={disabled}
      onClick={onPress}
      type="button"
      {...PRESS}
    >
      {children}
    </button>
  )
})
