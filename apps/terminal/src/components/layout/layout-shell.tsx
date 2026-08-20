// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  defaultAnnouncements,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import {
  ResizablePanel,
  ResizablePanelGroup,
} from '@pairlens/ui/components/ui/resizable'
import { LayoutColumn } from './layout-column'
import { ColumnHandle } from './layout-handles'
import { DesktopOnlyState } from './desktop-only-state'
import type {
  Announcements,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
} from '@dnd-kit/core'
import type { ReactNode } from 'react'

import type { DropZone } from '@/lib/layout/types'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import {
  useOptionalChartActions,
  useOptionalChartConfig,
} from '@/lib/chart-terminal-context'
import { useLayout } from '@/lib/layout/context'
import { getPaneIcon } from '@/lib/layout/pane-icons'
import { usePaneRegistry } from '@/lib/layout/pane-registry'

type DragData = { paneId: string; paneType: string }

/**
 * The ground the columns float on.
 *
 * Inset 10px from three edges and none from the top: the columns hang
 * straight off the bar above them, so the board reads as one continuation of
 * the chrome rather than a card sitting inside a frame. The ground itself is
 * `--background` — the same value as the app behind it, which is what makes
 * the gaps between columns read as air and not as gutters.
 */
const BOARD = 'relative flex min-h-0 flex-1 bg-background px-2.5 pb-2.5'

const EDGE_THRESHOLD = 0.25

/**
 * The workspace, or a wall in front of it.
 *
 * Every pane in a workspace streams from the selected venue, and four venues
 * are unreachable from a browser build. Only the chart ever said so; the
 * orderbook, tape, depth and trade panes just kept their last frame and looked
 * alive. Rather than teach each pane the same lesson, the venue is checked
 * once here and the whole workspace is replaced — the panes below are never
 * mounted, so nothing subscribes to a stream that cannot open.
 *
 * The check is the venue's DECLARED reach, known before anything subscribes,
 * so there is no flash of panes that then die. A connector that refuses
 * without declaring it (a third-party one) still surfaces in the chart's own
 * `desktopOnly` branch, which is the narrower backstop.
 *
 * `DesktopOnlyGate` wraps rather than inlines so this component keeps its
 * distance from ChartConfigContext: the gate re-renders when chart config
 * changes, but `children` is the same element it was handed, so React skips
 * the layout tree underneath it.
 */
export function LayoutShell() {
  return (
    <DesktopOnlyGate>
      <LayoutGrid />
    </DesktopOnlyGate>
  )
}

function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const { markets } = useAvailableMarkets()
  // Optional reads: ChartTerminalAutoProvider deliberately mounts no chart
  // terminal when there is no active pair (the discovery workspace), and
  // with no market selected there is nothing to gate.
  const config = useOptionalChartConfig()
  const actions = useOptionalChartActions()

  if (!config || !actions) return children

  if (markets.find((m) => m.value === config.market)?.desktopOnly) {
    return (
      <DesktopOnlyState
        market={config.market}
        onSelectMarket={actions.setMarket}
      />
    )
  }
  return children
}

function LayoutGrid() {
  const { t } = useTranslation()
  const { layout, dispatch, pendingAddPaneType, cancelAddPane } = useLayout()
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const dropZoneRef = useRef<DropZone | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  // Cancel placement mode on Escape
  useEffect(() => {
    if (!pendingAddPaneType) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelAddPane()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingAddPaneType, cancelAddPane])

  // Show a "grabbing" cursor everywhere while a pane is being dragged, and
  // suppress text selection so dragging across panes feels clean.
  useEffect(() => {
    if (!activeDrag) return
    document.body.classList.add('is-dragging-pane')
    return () => document.body.classList.remove('is-dragging-pane')
  }, [activeDrag])

  // Screen-reader announcements describing the drag in terms users understand.
  const announcements = useMemo<Announcements>(
    () => ({
      ...defaultAnnouncements,
      onDragStart({ active }) {
        const type = (active.data.current as DragData | undefined)?.paneType
        return t('layout.dnd.pickedUp', {
          pane: type ?? t('layout.dnd.genericPane'),
        })
      },
      onDragOver({ over }) {
        const z = dropZoneRef.current?.zone
        if (!over) return t('layout.dnd.noDropTarget')
        if (!z || z === 'center') return t('layout.dnd.dropStackTab')
        if (z === 'top') return t('layout.dnd.dropSplitAbove')
        if (z === 'bottom') return t('layout.dnd.dropSplitBelow')
        return t('layout.dnd.dropNewColumn')
      },
      onDragEnd({ over }) {
        return over ? t('layout.dnd.paneMoved') : t('layout.dnd.dragCancelled')
      },
      onDragCancel() {
        return t('layout.dnd.dragCancelledFull')
      },
    }),
    [t],
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as DragData | undefined
      if (data) setActiveDrag(data)
      // Cancel placement mode if user starts dragging
      if (pendingAddPaneType) cancelAddPane()
    },
    [pendingAddPaneType, cancelAddPane],
  )

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const { over, active, activatorEvent, delta } = event
    if (!over) {
      dropZoneRef.current = null
      setDropZone(null)
      return
    }

    const activeData = active.data.current as
      | { type?: string; cellId?: string }
      | undefined
    const overData = over.data.current as
      | { cellId?: string; type?: string }
      | undefined

    // If hovering over a sortable tab, suppress cell drop indicators
    // (sortable handles its own visual shift feedback)
    if (overData?.type === 'tab') {
      dropZoneRef.current = null
      setDropZone(null)
      return
    }

    // Suppress indicators when a tab is dragged over its own cell
    // (tab reordering is handled by SortableContext, not cell drop zones)
    if (
      activeData?.type === 'tab' &&
      overData?.type === 'cell' &&
      activeData.cellId === overData.cellId
    ) {
      dropZoneRef.current = null
      setDropZone(null)
      return
    }

    if (overData?.type !== 'cell' || !overData.cellId) {
      dropZoneRef.current = null
      setDropZone(null)
      return
    }

    const pe = activatorEvent as PointerEvent
    const px = pe.clientX + delta.x
    const py = pe.clientY + delta.y
    const rect = over.rect
    const relX = (px - rect.left) / rect.width
    const relY = (py - rect.top) / rect.height

    let zone: DropZone['zone'] = 'center'
    if (relY < EDGE_THRESHOLD) zone = 'top'
    else if (relY > 1 - EDGE_THRESHOLD) zone = 'bottom'
    else if (relX < EDGE_THRESHOLD) zone = 'left'
    else if (relX > 1 - EDGE_THRESHOLD) zone = 'right'

    const newZone: DropZone = { cellId: overData.cellId, zone }
    dropZoneRef.current = newZone
    setDropZone((prev) => {
      if (prev?.cellId === newZone.cellId && prev?.zone === newZone.zone)
        return prev
      return newZone
    })
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const zone = dropZoneRef.current
      setActiveDrag(null)
      setDropZone(null)
      dropZoneRef.current = null

      const { active, over } = event
      if (!over) return

      const activeData = active.data.current as
        | (DragData & { type?: string; cellId?: string })
        | undefined
      const paneId = activeData?.paneId
      if (!paneId) return

      const overData = over.data.current as
        | { cellId?: string; type?: string; paneId?: string }
        | undefined

      // Tab reorder within the same cell
      if (
        activeData?.type === 'tab' &&
        overData?.type === 'tab' &&
        activeData.cellId === overData.cellId &&
        overData.paneId
      ) {
        const tabCellId = activeData.cellId!
        for (const col of layout.columns) {
          const cell = col.cells.find((c) => c.id === tabCellId)
          if (cell) {
            const oldIndex = cell.panes.findIndex((p) => p.id === paneId)
            const newIndex = cell.panes.findIndex(
              (p) => p.id === overData.paneId,
            )
            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
              dispatch({
                type: 'REORDER_TABS',
                cellId: tabCellId,
                oldIndex,
                newIndex,
              })
            }
            break
          }
        }
        return
      }

      // Drop on a tab in a different cell — move pane to that cell
      if (overData?.type === 'tab' && overData.cellId) {
        dispatch({
          type: 'MOVE_PANE',
          paneId,
          targetCellId: overData.cellId,
        })
        return
      }

      if (overData?.type !== 'cell' || !overData.cellId) return

      const cellId = overData.cellId

      // If pane is already in this cell and no edge zone, skip (no-op)
      const sourceCell = layout.columns
        .flatMap((col) => col.cells)
        .find((c) => c.panes.some((p) => p.id === paneId))
      if (
        sourceCell?.id === cellId &&
        (!zone || zone.cellId !== cellId || zone.zone === 'center')
      ) {
        return
      }

      if (!zone || zone.cellId !== cellId || zone.zone === 'center') {
        dispatch({ type: 'MOVE_PANE', paneId, targetCellId: cellId })
        return
      }

      switch (zone.zone) {
        case 'top':
        case 'bottom': {
          for (const col of layout.columns) {
            const cellIdx = col.cells.findIndex((c) => c.id === cellId)
            if (cellIdx !== -1) {
              dispatch({
                type: 'MOVE_PANE_NEW_CELL',
                paneId,
                targetColumnId: col.id,
                cellIndex: zone.zone === 'top' ? cellIdx : cellIdx + 1,
              })
              break
            }
          }
          break
        }
        case 'left':
        case 'right': {
          const colIdx = layout.columns.findIndex((col) =>
            col.cells.some((c) => c.id === cellId),
          )
          if (colIdx !== -1) {
            dispatch({
              type: 'MOVE_PANE_NEW_COLUMN',
              paneId,
              columnIndex: zone.zone === 'left' ? colIdx : colIdx + 1,
            })
          }
          break
        }
      }
    },
    [dispatch, layout.columns],
  )

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null)
    setDropZone(null)
    dropZoneRef.current = null
  }, [])

  // No mobile branch: at phone width `_terminal.tsx` swaps the entire shell
  // for the Focus surface, so this pane grid never mounts there at all.
  const activeDropZone = activeDrag ? dropZone : null

  if (layout.columns.length === 1) {
    const col = layout.columns[0]!
    return (
      <DndContext
        sensors={sensors}
        accessibility={{ announcements }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={BOARD}>
          {/* The column fills the board itself here. With more than one
              column a `ResizablePanel` is what gives each of them a box;
              alone, the column would be a bare flex child and shrink to the
              width of its own content, leaving the rest of the board empty
              ground. `min-w-0` for the same reason it is on the surface: the
              tables inside refuse to shrink without it. */}
          <div className="min-w-0 flex-1">
            <LayoutColumn column={col} dropZone={activeDropZone} />
          </div>
          {activeDrag && (
            <div
              data-slot="drag-overlay"
              className="pointer-events-none fixed inset-0 z-10 bg-black/5 animate-in fade-in duration-200"
            />
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDrag && <DragOverlayContent paneType={activeDrag.paneType} />}
        </DragOverlay>
      </DndContext>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={BOARD}>
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full"
          onLayoutChanged={(sizes) => {
            const widths = layout.columns.map(
              (col) => sizes[col.id] ?? col.widthPercent,
            )
            // Skip dispatch if sizes haven't changed
            const changed = widths.some(
              (w, i) => Math.abs(w - layout.columns[i]!.widthPercent) > 0.01,
            )
            if (changed) dispatch({ type: 'RESIZE_COLUMNS', widths })
          }}
        >
          {layout.columns.map((col, i) => (
            <Fragment key={col.id}>
              {i > 0 && <ColumnHandle />}
              <ResizablePanel
                id={col.id}
                defaultSize={col.widthPercent}
                minSize={15}
              >
                <LayoutColumn column={col} dropZone={activeDropZone} />
              </ResizablePanel>
            </Fragment>
          ))}
        </ResizablePanelGroup>
        {activeDrag && (
          <div
            data-slot="drag-overlay"
            className="pointer-events-none fixed inset-0 z-10 bg-black/5 animate-in fade-in duration-200"
          />
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDrag && <DragOverlayContent paneType={activeDrag.paneType} />}
      </DragOverlay>
    </DndContext>
  )
}

function DragOverlayContent({ paneType }: { paneType: string }) {
  const { t } = useTranslation()
  const registry = usePaneRegistry()
  const def = registry.getDefinition(paneType)
  const Icon = getPaneIcon(def?.icon ?? 'LayoutGrid')
  return (
    <div className="flex h-9 rotate-2 cursor-grabbing items-center gap-2 rounded-lg border border-primary/40 bg-background/95 px-3 shadow-2xl ring-1 ring-primary/25 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150">
      <Icon className="size-4 text-primary" />
      <span className="text-sm font-medium">
        {def ? t(def.labelKey) : paneType}
      </span>
    </div>
  )
}
