// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two pieces every loading pane is built from.
 *
 * The rule they serve: a loading pane keeps its own shape. A skeleton is the
 * real layout with the numbers taken out, at the real row height and the real
 * column widths, so the moment data lands nothing moves. A line of prose
 * saying "reading the board" does the opposite — it tells the reader to wait,
 * tells them nothing about what for, and then reflows the pane out from under
 * them when the answer arrives.
 *
 * These started in the perps boards and now serve the prediction boards too,
 * which is why they live beside `pane-primitives` rather than inside one asset
 * class. `futures/funding-skeletons` re-exports them, so nothing there had to
 * move.
 */
import { cn } from '@pairlens/ui/lib/utils'

/**
 * One shimmering block.
 *
 * `delayIndex` staggers the sweep down a list — 60ms per row, which is slow
 * enough to read as a wave and fast enough that the bottom of a twelve-row
 * pane is not visibly behind the top.
 */
export function Shimmer({
  className,
  delayIndex = 0,
  still = false,
  style,
}: {
  className?: string
  delayIndex?: number
  /**
   * Draw the block without the travelling highlight.
   *
   * For placeholders below the fold. The sweep is a compositor layer per
   * element, and a board can hold several hundred cells in a scroll container
   * while one venue is still out; animating the ones nobody can see spends GPU
   * memory on nothing. The block itself is identical, so a still row and a
   * swept one look the same once scrolled to.
   */
  still?: boolean
  style?: React.CSSProperties
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'block rounded-sm',
        still ? 'bg-muted' : 'shimmer',
        className,
      )}
      style={
        {
          ...style,
          ...(still ? {} : { '--shimmer-delay': `${delayIndex * 60}ms` }),
        } as React.CSSProperties
      }
    />
  )
}

/**
 * What a screen reader gets while a pane is a skeleton.
 *
 * The blocks themselves are `aria-hidden` — a reader announcing forty empty
 * boxes is worse than silence. `aria-busy` on the container tells an assistive
 * technology the region is mid-update, and this line is the sentence that says
 * what it is waiting for. `role="status"` announces it once, politely, and
 * never interrupts.
 */
export function SkeletonStatus({ label }: { label: string }) {
  return (
    <span className="sr-only" role="status">
      {label}
    </span>
  )
}
