// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a collection board looks like before the provider answers.
 *
 * Loading is its own state on this board, not a synonym for empty. Every NFT
 * hook reports `isLoading`, `error`, `throttled` and `unsupported` separately,
 * and a pane that renders "No offers" while the first read is still in flight
 * is stating a fact about the market it does not yet have. So a pending pane
 * draws its own shape with the numbers taken out.
 *
 * The rule the shared skeleton primitives already encode: the ghost is the real
 * layout at the real row height and the real column widths, so when the answer
 * lands nothing moves. That is why the geometry is passed in per pane rather
 * than guessed here: a listings row and a trait row are different shapes, and
 * one generic placeholder would reflow both.
 */
import { Shimmer, SkeletonStatus } from '@/components/panes/pane-skeletons'
import { cn } from '@pairlens/ui'

/** Rows a ghost draws before it knows how many there will be. */
const GHOST_ROWS = 8

/** Past roughly a pane's worth, placeholders stop sweeping. See `Shimmer`. */
const SWEPT_ROWS = 12

export function NftLoadingRows({
  label,
  template,
  cells,
  rows = GHOST_ROWS,
  thumbnail = false,
}: {
  /** What a screen reader is told the pane is waiting for. */
  label: string
  /** The pane's own grid-template class, so the ghost matches its columns. */
  template: string
  /** One width class per column, in order. */
  cells: Array<string>
  rows?: number
  /** Draw a square in the first cell, for the panes whose rows carry artwork. */
  thumbnail?: boolean
}) {
  return (
    <div aria-busy className="flex h-full min-h-0 flex-col gap-[5px] pt-1">
      <SkeletonStatus label={label} />
      {Array.from({ length: rows }, (_, row) => (
        <div className={cn('grid items-center gap-x-2', template)} key={row}>
          {cells.map((width, column) => (
            <div
              className={cn(
                'flex items-center gap-1.5',
                column > 0 && 'justify-end',
              )}
              key={column}
            >
              {thumbnail && column === 0 && (
                <Shimmer
                  className="size-5 shrink-0 rounded-[4px]"
                  delayIndex={row}
                  still={row >= SWEPT_ROWS}
                />
              )}
              <Shimmer
                className={cn('h-2.5', width)}
                delayIndex={row}
                still={row >= SWEPT_ROWS}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** The items grid, waiting: the same tiles at the same aspect ratio. */
export function NftLoadingGrid({
  label,
  tiles = 12,
}: {
  label: string
  tiles?: number
}) {
  return (
    <div aria-busy className="flex h-full min-h-0 flex-col pt-1">
      <SkeletonStatus label={label} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">
        {Array.from({ length: tiles }, (_, index) => (
          <div key={index}>
            <Shimmer
              className="aspect-square w-full rounded-lg"
              delayIndex={index}
              still={index >= SWEPT_ROWS}
            />
            <Shimmer
              className="mt-1 h-2.5 w-12"
              delayIndex={index}
              still={index >= SWEPT_ROWS}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The identity line, waiting.
 *
 * Only ever reached on a cold link with no directory pin: anywhere the reader
 * came from a row, the name and the artwork are already known and the header
 * draws them with the numbers still out.
 */
export function NftLoadingHeader({ label }: { label: string }) {
  return (
    <div
      aria-busy
      className="flex h-full min-h-0 flex-col justify-between gap-2 py-0.5"
    >
      <SkeletonStatus label={label} />
      <div className="flex items-start gap-3">
        <Shimmer className="size-10 rounded-lg" />
        <div className="min-w-0 flex-1">
          <Shimmer className="h-3.5 w-40" delayIndex={1} />
          <Shimmer className="mt-2 h-2.5 w-28" delayIndex={2} />
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <Shimmer className="h-2.5 w-10" delayIndex={1} />
          <Shimmer className="mt-1.5 h-4 w-24" delayIndex={2} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index}>
            <Shimmer className="h-2 w-14" delayIndex={index} />
            <Shimmer className="mt-1 h-2.5 w-12" delayIndex={index} />
          </div>
        ))}
      </div>
    </div>
  )
}
