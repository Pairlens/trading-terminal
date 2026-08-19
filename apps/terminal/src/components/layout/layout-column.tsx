// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Fragment, memo } from 'react'

import {
  ResizablePanel,
  ResizablePanelGroup,
} from '@pairlens/ui/components/ui/resizable'

import { LayoutCell } from './layout-cell'
import { PaneRule, RowHandle } from './layout-handles'
import { fitCellMaxHeight } from './layout-column-geometry'
import type {
  DropZone,
  LayoutCell as LayoutCellType,
  LayoutColumn as LayoutColumnType,
  PaneDefinition,
} from '@/lib/layout/types'
import { useLayout } from '@/lib/layout/context'
import { usePaneRegistry } from '@/lib/layout/pane-registry'

type LayoutColumnProps = {
  column: LayoutColumnType
  dropZone: DropZone | null
}

/** A cell has fitContent when it holds a single pane with fitContent: true. */
function isFitCell(
  cell: LayoutCellType,
  defs: Record<string, PaneDefinition>,
): boolean {
  return (
    cell.panes.length === 1 && defs[cell.panes[0]!.type]?.fitContent === true
  )
}

type CellGroup =
  | { type: 'fit'; cell: LayoutCellType }
  | { type: 'flex'; cells: Array<LayoutCellType> }

/** Group consecutive non-fit cells together so they can share a ResizablePanelGroup. */
function groupCells(
  cells: Array<LayoutCellType>,
  defs: Record<string, PaneDefinition>,
): Array<CellGroup> {
  const groups: Array<CellGroup> = []
  let flexBuf: Array<LayoutCellType> = []

  for (const cell of cells) {
    if (isFitCell(cell, defs)) {
      if (flexBuf.length > 0) {
        groups.push({ type: 'flex', cells: flexBuf })
        flexBuf = []
      }
      groups.push({ type: 'fit', cell })
    } else {
      flexBuf.push(cell)
    }
  }
  if (flexBuf.length > 0) {
    groups.push({ type: 'flex', cells: flexBuf })
  }
  return groups
}

/**
 * The card.
 *
 * One column is one surface: `--card` on the board's ground, 14px radius,
 * 12px of padding closing all four ends. Panes inside it draw no card of
 * their own, which is what leaves the hairline between two stacked panes as
 * the only line on the board. `min-w-0` is load-bearing — every child holds
 * tabular content that would otherwise refuse to shrink.
 */
const COLUMN_SURFACE =
  'flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] bg-card p-3'

export const LayoutColumn = memo(function LayoutColumn({
  column,
  dropZone,
}: LayoutColumnProps) {
  const { dispatch } = useLayout()
  const registry = usePaneRegistry()
  const defs = registry.getDefinitions()

  if (column.cells.length === 1) {
    const cell = column.cells[0]!
    return (
      <div className={COLUMN_SURFACE}>
        <div className="min-h-0 flex-1">
          <LayoutCell cell={cell} dropZone={dropZone} />
        </div>
      </div>
    )
  }

  const hasFitCells = column.cells.some((c) => isFitCell(c, defs))

  // Standard resizable layout — no fitContent cells
  if (!hasFitCells) {
    return (
      <div className={COLUMN_SURFACE}>
        <ResizablePanelGroup
          className="min-h-0 flex-1"
          orientation="vertical"
          onLayoutChanged={(sizes) => {
            const heights = column.cells.map(
              (cell) => sizes[cell.id] ?? cell.heightPercent,
            )
            const changed = heights.some(
              (h, i) => Math.abs(h - column.cells[i]!.heightPercent) > 0.01,
            )
            if (changed) {
              dispatch({
                type: 'RESIZE_CELLS',
                columnId: column.id,
                heights,
              })
            }
          }}
        >
          {column.cells.map((cell, i) => (
            <Fragment key={cell.id}>
              {i > 0 && <RowHandle />}
              <ResizablePanel
                id={cell.id}
                defaultSize={cell.heightPercent}
                minSize={5}
              >
                <LayoutCell cell={cell} dropZone={dropZone} />
              </ResizablePanel>
            </Fragment>
          ))}
        </ResizablePanelGroup>
      </div>
    )
  }

  // Hybrid layout: fitContent cells size to content, others fill remaining space
  const groups = groupCells(column.cells, defs)
  const fitMaxHeight = fitCellMaxHeight({
    fitCells: groups.filter((g) => g.type === 'fit').length,
    flexCells: groups.flatMap((g) => (g.type === 'flex' ? g.cells : [])),
    separators: column.cells.length - 1,
    defs,
  })

  return (
    <div className={COLUMN_SURFACE}>
      {groups.map((group, gi) => {
        if (group.type === 'fit') {
          return (
            <Fragment key={group.cell.id}>
              {gi > 0 && <PaneRule />}
              <div
                className="shrink-0 overflow-y-auto"
                style={{ maxHeight: fitMaxHeight }}
              >
                <LayoutCell cell={group.cell} dropZone={dropZone} fitContent />
              </div>
            </Fragment>
          )
        }

        // Single flex cell — no need for ResizablePanelGroup
        if (group.cells.length === 1) {
          const cell = group.cells[0]!
          return (
            <Fragment key={cell.id}>
              {gi > 0 && <PaneRule />}
              <div className="min-h-0 flex-1">
                <LayoutCell cell={cell} dropZone={dropZone} />
              </div>
            </Fragment>
          )
        }

        // Multiple flex cells — resizable
        return (
          <Fragment key={group.cells[0]!.id}>
            {gi > 0 && <PaneRule />}
            <ResizablePanelGroup
              className="min-h-0 flex-1"
              orientation="vertical"
              onLayoutChanged={(sizes) => {
                const heights = column.cells.map((cell) =>
                  isFitCell(cell, defs)
                    ? cell.heightPercent
                    : (sizes[cell.id] ?? cell.heightPercent),
                )
                const changed = heights.some(
                  (h, i) => Math.abs(h - column.cells[i]!.heightPercent) > 0.01,
                )
                if (changed) {
                  dispatch({
                    type: 'RESIZE_CELLS',
                    columnId: column.id,
                    heights,
                  })
                }
              }}
            >
              {group.cells.map((cell, i) => (
                <Fragment key={cell.id}>
                  {i > 0 && <RowHandle />}
                  <ResizablePanel
                    id={cell.id}
                    defaultSize={cell.heightPercent}
                    minSize={5}
                  >
                    <LayoutCell cell={cell} dropZone={dropZone} />
                  </ResizablePanel>
                </Fragment>
              ))}
            </ResizablePanelGroup>
          </Fragment>
        )
      })}
    </div>
  )
})
