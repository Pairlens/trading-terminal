// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
  Layers,
  LayoutGrid,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
} from 'lucide-react'
import { cn } from '@pairlens/ui/lib/utils'

import { LayoutPaneWrapper } from './layout-pane-wrapper'
import { LayoutTabGroup } from './layout-tab-group'
import type { LucideIcon } from 'lucide-react'
import type { DropZone, LayoutCell as LayoutCellType } from '@/lib/layout/types'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { useLayout } from '@/lib/layout/context'

type LayoutCellProps = {
  cell: LayoutCellType
  dropZone: DropZone | null
  fitContent?: boolean
}

const EDGE_THRESHOLD = 0.25

export function LayoutCell({ cell, dropZone, fitContent }: LayoutCellProps) {
  const { t } = useTranslation()
  const { setNodeRef } = useDroppable({
    id: `cell:${cell.id}`,
    data: { cellId: cell.id, type: 'cell' },
  })

  const { pendingAddPaneType, confirmAddPane } = useLayout()
  const registry = usePaneRegistry()

  const zone = dropZone?.cellId === cell.id ? dropZone.zone : null

  if (cell.panes.length === 0) {
    return (
      <div
        ref={setNodeRef}
        className="relative flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/40"
      >
        <LayoutGrid className="size-5" strokeWidth={1.5} />
        <span className="text-xs">{t('layout.dropZone.emptyHint')}</span>
        <DropIndicator zone={zone} />
        {pendingAddPaneType && (
          <PlacementOverlay cellId={cell.id} onPlace={confirmAddPane} />
        )}
      </div>
    )
  }

  if (cell.panes.length === 1) {
    const pane = cell.panes[0]!
    const isCompact = registry.getDefinition(pane.type)?.compact === true
    return (
      <div ref={setNodeRef} className={cn('relative', !fitContent && 'h-full')}>
        <LayoutPaneWrapper
          paneId={pane.id}
          paneType={pane.type}
          showHeader={!isCompact}
        />
        <DropIndicator zone={zone} />
        {pendingAddPaneType && (
          <PlacementOverlay cellId={cell.id} onPlace={confirmAddPane} />
        )}
      </div>
    )
  }

  return (
    <div ref={setNodeRef} className="relative h-full">
      <LayoutTabGroup cell={cell} />
      <DropIndicator zone={zone} />
      {pendingAddPaneType && (
        <PlacementOverlay cellId={cell.id} onPlace={confirmAddPane} />
      )}
    </div>
  )
}

type Zone = DropZone['zone']

const ZONE_ICON: Record<Zone, LucideIcon> = {
  center: Layers,
  top: PanelTop,
  bottom: PanelBottom,
  left: PanelLeft,
  right: PanelRight,
}

const ZONE_LABEL_KEY: Record<Zone, string> = {
  center: 'layout.dropZone.addAsTab',
  top: 'layout.dropZone.splitTop',
  bottom: 'layout.dropZone.splitBottom',
  left: 'layout.dropZone.newColumn',
  right: 'layout.dropZone.newColumn',
}

const ACTIVE_ZONE =
  'flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-primary/60 bg-primary/15 text-primary shadow-sm animate-in fade-in zoom-in-95 duration-150'
const GHOST_ZONE = 'rounded-md bg-muted/10 animate-in fade-in duration-150'

/** Shared visual for a highlighted drop/placement zone. Identical between
 * drag-to-move and click-to-place so the two flows feel like one. */
function ZoneVisual({ zone }: { zone: Zone }) {
  const { t } = useTranslation()
  const Icon = ZONE_ICON[zone]
  const content = (
    <>
      <Icon className="size-4 animate-in zoom-in duration-200" />
      <span className="text-[11px] font-medium">{t(ZONE_LABEL_KEY[zone])}</span>
    </>
  )

  if (zone === 'center') {
    return <div className={cn(ACTIVE_ZONE, 'h-full w-full')}>{content}</div>
  }

  const isHorizontalSplit = zone === 'left' || zone === 'right'
  const activeFirst = zone === 'top' || zone === 'left'
  const active = (
    <div key="active" className={cn(ACTIVE_ZONE, 'flex-1')}>
      {content}
    </div>
  )
  const ghost = <div key="ghost" className={cn(GHOST_ZONE, 'flex-1')} />

  return (
    <div
      className={cn(
        'flex h-full gap-1',
        isHorizontalSplit ? 'flex-row' : 'flex-col',
      )}
    >
      {activeFirst ? [active, ghost] : [ghost, active]}
    </div>
  )
}

function DropIndicator({ zone }: { zone: Zone | null }) {
  if (!zone) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20 animate-in fade-in duration-150 p-1">
      <ZoneVisual zone={zone} />
    </div>
  )
}

function PlacementOverlay({
  cellId,
  onPlace,
}: {
  cellId: string
  onPlace: (cellId: string, zone?: Zone) => void
}) {
  const [zone, setZone] = useState<Zone>('center')

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    const relY = (e.clientY - rect.top) / rect.height

    let z: Zone = 'center'
    if (relY < EDGE_THRESHOLD) z = 'top'
    else if (relY > 1 - EDGE_THRESHOLD) z = 'bottom'
    else if (relX < EDGE_THRESHOLD) z = 'left'
    else if (relX > 1 - EDGE_THRESHOLD) z = 'right'

    setZone(z)
  }

  return (
    <div
      data-slot="pane-placement-overlay"
      className="absolute inset-0 z-20 cursor-pointer p-1"
      onMouseMove={handleMouseMove}
      onClick={() => onPlace(cellId, zone)}
    >
      <ZoneVisual zone={zone} />
    </div>
  )
}
