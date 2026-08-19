// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one piece of column arithmetic that is not a percentage.
 *
 * A leaf module on purpose: no React, no registry, so the reserve can be
 * asserted without a DOM. `layout-column.tsx` owns everything else about a
 * column; this owns only how much room a `fitContent` cell may take before its
 * neighbours start paying for it.
 */
import type { LayoutCell, PaneDefinition } from '@/lib/layout/types'

/** `PaneRule` and `RowHandle` are both `h-6`, and neither of them is free. */
export const PANE_RULE_HEIGHT = 24

/** What a cell reserves when its pane declares no `minHeight` of its own. */
export const DEFAULT_MIN_HEIGHT = 100

/** The tallest `minHeight` among a cell's panes: a tab strip is one cell. */
export function cellMinHeight(
  cell: LayoutCell,
  defs: Record<string, PaneDefinition>,
): number {
  return cell.panes.reduce(
    (px, pane) =>
      Math.max(px, defs[pane.type]?.minHeight ?? DEFAULT_MIN_HEIGHT),
    0,
  )
}

/**
 * How tall a fitContent cell may grow before its neighbours start paying.
 *
 * A fitContent cell is `shrink-0`, so its natural height wins the whole column
 * before anything else in it gets a pixel: on a 720px-tall window a prediction
 * ticket 606px tall left the order book above it at literally zero. The cap
 * hands every flex cell the `minHeight` its pane already declared (that field
 * existed and nothing read it), pays for the rules between the cells, and
 * lets the fit cells split what is left.
 *
 * It binds only when a neighbour would otherwise be squeezed below reading, so
 * a short ticket still draws at exactly its own height and every board that
 * already fit is untouched. Past the cap the fit cell scrolls rather than
 * clipping its own submit button.
 */
export function fitCellMaxHeight(input: {
  /** How many cells in this column size to their content. Never zero. */
  fitCells: number
  /** Every other cell in the column, in order. */
  flexCells: Array<LayoutCell>
  /** Rules and handles drawn between the column's cells. */
  separators: number
  defs: Record<string, PaneDefinition>
}): string {
  const { fitCells, flexCells, separators, defs } = input
  const reserved =
    separators * PANE_RULE_HEIGHT +
    flexCells.reduce((px, cell) => px + cellMinHeight(cell, defs), 0)
  return `calc((100% - ${reserved}px) / ${fitCells})`
}
