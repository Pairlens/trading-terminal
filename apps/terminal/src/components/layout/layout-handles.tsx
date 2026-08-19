// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two seams of a workspace board, and the only chrome between panes.
 *
 * The board reads as sheets of tabular data on a ground, so it draws exactly
 * one line: a hairline between two panes stacked in the same column. Columns
 * are separated by ground showing through, never by a rule — a vertical line
 * beside a horizontal one is what made the old board read as a spreadsheet.
 *
 * Both are resize handles first and decoration second: the geometry here (24px
 * of gutter around a 1px rule, a 10px column gutter) is the grab target, which
 * is why the visible line is a pseudo-element and not the element itself.
 */
import { ResizableHandle } from '@pairlens/ui/components/ui/resizable'
import { cn } from '@pairlens/ui/lib/utils'

/**
 * Between two stacked panes: 12px of air, a hairline, 12px of air.
 *
 * The rule stays put while dragging; only its colour moves, so a resize never
 * shifts the panes' content relative to the line they are pulling.
 */
export function RowHandle() {
  return (
    <ResizableHandle
      className={cn(
        'shrink-0 bg-transparent hover:bg-transparent active:bg-transparent',
        // The separator inside a vertical group reports itself as horizontal.
        'aria-[orientation=horizontal]:h-6 aria-[orientation=horizontal]:w-full',
        'before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2',
        'before:bg-(--pane-rule) before:transition-colors',
        'hover:before:bg-primary/50 active:before:bg-primary',
      )}
    />
  )
}

/**
 * Between two columns: 10px of ground, no line at all until you reach for it.
 */
export function ColumnHandle() {
  return (
    <ResizableHandle
      className={cn(
        'w-2.5 shrink-0 bg-transparent hover:bg-transparent active:bg-transparent',
        'before:absolute before:inset-y-2 before:left-1/2 before:w-px before:-translate-x-1/2',
        'before:bg-transparent before:transition-colors',
        'hover:before:bg-primary/40 active:before:bg-primary/70',
      )}
    />
  )
}

/**
 * The same hairline where there is nothing to resize.
 *
 * A fit-content pane (the risk strip) has no size to drag, so the seam above
 * it is a plain 25px spacer that draws the identical rule. Sitting it beside
 * `RowHandle` rather than inside it keeps the resizable path free of a "can
 * this actually move" branch.
 */
export function PaneRule() {
  return (
    <div
      aria-hidden
      className="relative h-6 shrink-0 before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-(--pane-rule)"
    />
  )
}
