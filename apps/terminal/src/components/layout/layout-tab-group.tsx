// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Columns3, GripVertical, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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

export function LayoutTabGroup({ cell }: LayoutTabGroupProps) {
  const { dispatch } = useLayout()
  const activePane = cell.panes[cell.activeTabIndex] ?? cell.panes[0]

  return (
    <Tabs
      value={activePane?.id}
      onValueChange={(value) => {
        const idx = cell.panes.findIndex((p) => p.id === value)
        if (idx !== -1) {
          dispatch({ type: 'SET_ACTIVE_TAB', cellId: cell.id, tabIndex: idx })
        }
      }}
      className="flex h-full flex-col gap-0"
    >
      <div className="flex items-center border-b px-1">
        <SortableContext
          items={cell.panes.map((p) => p.id)}
          strategy={horizontalListSortingStrategy}
        >
          <TabsList variant="line" className="h-7">
            {cell.panes.map((pane) => (
              <SortableTab key={pane.id} pane={pane} cellId={cell.id} />
            ))}
          </TabsList>
        </SortableContext>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {cell.panes.map((pane) => (
          <TabsContent key={pane.id} value={pane.id} className="h-full">
            <LayoutPaneWrapper
              paneId={pane.id}
              paneType={pane.type}
              showHeader={false}
            />
          </TabsContent>
        ))}
      </div>
    </Tabs>
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
            className="group/tab cursor-grab gap-1 text-xs select-none active:cursor-grabbing"
            style={style}
            {...attributes}
            {...listeners}
          />
        }
      >
        <GripVertical className="size-3 shrink-0 text-muted-foreground/0 transition-colors group-hover/tab:text-muted-foreground/50" />
        {def ? t(def.labelKey) : pane.type}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handlePopToColumn}>
          <Columns3 className="size-3.5" />
          Pop Out to Column
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={handleClose}>
          <X className="size-3.5" />
          Close Tab
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
