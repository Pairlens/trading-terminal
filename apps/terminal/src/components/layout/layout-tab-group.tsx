// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Columns3, GripVertical, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pairlens/ui/components/ui/tabs'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@pairlens/ui/components/ui/context-menu'

import { LayoutPaneWrapper } from './layout-pane-wrapper'
import type { LayoutCell, PaneInstance } from '@/lib/layout/types'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { useLayout } from '@/lib/layout/context'

type LayoutTabGroupProps = {
  cell: LayoutCell
}

/**
 * Several panes sharing one slot, and one header row for all of them.
 *
 * The tabs ARE the title: the active one wears the pane-title style and its
 * siblings sit a step quieter beside it, so a stacked cell and a lone pane
 * read as the same 20px row. No underline, no pill, no rule beneath — the
 * board's only line is the one between two stacked cells.
 */
export function LayoutTabGroup({ cell }: LayoutTabGroupProps) {
  const { dispatch } = useLayout()
  const activePane = cell.panes[cell.activeTabIndex] ?? cell.panes[0]
  // One slot for the whole cell, lent to whichever pane is on top. Without it
  // a pane's trailing metric would simply vanish the moment someone stacked it
  // as a tab, which is a strange thing for a layout decision to do.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)

  return (
    <Tabs
      value={activePane?.id}
      onValueChange={(value) => {
        const idx = cell.panes.findIndex((p) => p.id === value)
        if (idx !== -1) {
          dispatch({ type: 'SET_ACTIVE_TAB', cellId: cell.id, tabIndex: idx })
        }
      }}
      className="group/pane flex h-full flex-col gap-0"
    >
      <div className="flex h-5 shrink-0 items-center gap-3">
        <SortableContext
          items={cell.panes.map((p) => p.id)}
          strategy={horizontalListSortingStrategy}
        >
          <TabsList
            variant="line"
            className="h-5 min-w-0 gap-3 rounded-none p-0"
          >
            {cell.panes.map((pane) => (
              <SortableTab key={pane.id} pane={pane} cellId={cell.id} />
            ))}
          </TabsList>
        </SortableContext>
        <span className="flex-1" />
        <span
          ref={setHeaderSlot}
          className="flex min-w-0 shrink-[99] items-center gap-2 overflow-hidden"
        />
        {activePane && <TabGroupControls pane={activePane} />}
      </div>
      <div className="mt-1.5 min-h-0 flex-1 overflow-hidden">
        {cell.panes.map((pane) => (
          <TabsContent key={pane.id} value={pane.id} className="h-full">
            <LayoutPaneWrapper
              paneId={pane.id}
              paneType={pane.type}
              showHeader={false}
              headerSlot={pane.id === activePane?.id ? headerSlot : null}
            />
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}

/**
 * The grip and the close, for whichever pane is on top.
 *
 * The grip registers its OWN draggable rather than reusing the active tab's
 * sortable: two `useDraggable` calls under one id overwrite each other in
 * dnd-kit's registry, and the tab is already claiming `pane.id`. Only the
 * `data` matters downstream — every handler in `layout-shell` reads
 * `active.data.current.paneId`, never the draggable's own id.
 */
function TabGroupControls({ pane }: { pane: PaneInstance }) {
  const { t } = useTranslation()
  const { dispatch } = useLayout()
  const registry = usePaneRegistry()
  const def = registry.getDefinition(pane.type)
  const label = def ? t(def.labelKey) : pane.type

  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `${pane.id}:grip`,
    data: { paneId: pane.id, paneType: pane.type },
  })

  return (
    <>
      <button
        type="button"
        onClick={() => dispatch({ type: 'REMOVE_PANE', paneId: pane.id })}
        aria-label={t('layout.pane.close', { pane: label })}
        className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity duration-[130ms] ease-out group-hover/pane:opacity-100 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden"
      >
        <X className="size-3" strokeWidth={2.5} />
      </button>
      <span
        ref={setNodeRef}
        aria-label={t('layout.pane.move', { pane: label })}
        className="-mr-1 flex size-[18px] shrink-0 cursor-grab items-center justify-center rounded-[5px] text-muted-foreground opacity-[0.28] transition-opacity duration-[130ms] ease-out group-hover/pane:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="size-3" strokeWidth={2.5} />
      </span>
    </>
  )
}

function SortableTab({ pane, cellId }: { pane: PaneInstance; cellId: string }) {
  const { t } = useTranslation()
  const { layout, dispatch } = useLayout()
  const registry = usePaneRegistry()
  const def = registry.getDefinition(pane.type)
  const {
    setNodeRef,
    listeners,
    attributes,
    isDragging,
    transform,
    transition,
  } = useSortable({
    id: pane.id,
    data: { paneId: pane.id, paneType: pane.type, type: 'tab', cellId },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const handleClose = () => dispatch({ type: 'REMOVE_PANE', paneId: pane.id })

  const handlePopToColumn = () => {
    const colIndex = layout.columns.findIndex((col) =>
      col.cells.some((cell) => cell.panes.some((p) => p.id === pane.id)),
    )
    dispatch({
      type: 'MOVE_PANE_NEW_COLUMN',
      paneId: pane.id,
      columnIndex: colIndex + 1,
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <TabsTrigger
            ref={setNodeRef}
            value={pane.id}
            className={cn(
              'h-5 min-w-0 flex-none cursor-grab rounded-none border-0 px-0 py-0 select-none active:cursor-grabbing',
              'text-[11.5px] leading-none font-normal text-muted-foreground',
              'data-active:bg-transparent data-active:text-[12.5px] data-active:font-medium data-active:tracking-[-0.005em] data-active:text-foreground',
              'dark:data-active:border-transparent dark:data-active:bg-transparent',
              // The line variant's underline: the tabs already say which one
              // is active by weight and colour, and a rule under the row is
              // exactly what this board is removing.
              'after:hidden',
            )}
            style={style}
            {...attributes}
            {...listeners}
          />
        }
      >
        {def ? t(def.labelKey) : pane.type}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handlePopToColumn}>
          <Columns3 className="size-3.5" />
          {t('layout.pane.popOutToColumn')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={handleClose}>
          <X className="size-3.5" />
          {t('layout.pane.closeTab')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
