// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the memecoin panes draw while their feed is answering.
 *
 * They drew nothing. `SkeletonStatus` is a screen-reader line and nothing
 * else, and all seven panes rendered it alone: an empty rectangle for as long
 * as the read took, then a full board appearing at once. An empty pane is the
 * shape this board uses for "nothing is minting right now", so a board that
 * was working looked like a board that had failed, and then rebuilt itself
 * under the reader a second later.
 *
 * The rule is the one `pane-skeletons` states and the perps, prediction and
 * NFT boards already follow: a loading pane keeps its own shape. Every ghost
 * here sits inside the REAL element it stands in for — the real `<table>`, the
 * real `<Th>` row, the real `StatLine` — so the geometry cannot drift from the
 * pane it is impersonating. That is also why the cells claim measured widths
 * (`CURVE_CELL_WIDTH`, `FLOW_CELL`) rather than plausible ones: an auto-layout
 * table takes its column widths from its content, so a ghost that guesses
 * narrow makes the column jump the moment the first real row lands.
 *
 * **What is already known stays real.** Column headers are furniture, not
 * data, and so are the four flow windows and every stat label. Ghosting them
 * would be inventing a wait for something that is already on screen. Only the
 * figures the feed owns are blocks.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'
import type { LaunchpadStage } from '@pairlens/shared/instrument-types'

import { Shimmer } from '@/components/panes/pane-skeletons'
import {
  CURVE_CELL_WIDTH,
  FLOW_CELL,
  StatLine,
} from '@/components/memecoins/memecoin-pane-primitives'

/**
 * Ghost rows a column draws before it knows how many there will be.
 *
 * A column returns up to 30 and is usually the full height of the board, so a
 * short stack would leave the pane looking half-answered, which is the reading
 * the skeleton is there to prevent. Past the fold they stop sweeping and cost
 * nothing but markup.
 */
const GHOST_ROWS = 24

/** Past roughly a pane's worth, placeholders stop sweeping. See `Shimmer`. */
const SWEPT_ROWS = 12

/**
 * Widths that keep a column of ghosts from reading as a bar chart.
 *
 * Tickers are ragged (`gg`, `MEMECULTURE`, `币安人生`), so a stack of identical
 * blocks is the one thing the real column never looks like. Fixed cycle rather
 * than random: a skeleton that reshuffles on every render is a second
 * animation competing with the sweep.
 */
const NAME_WIDTHS = ['46%', '68%', '32%', '58%', '74%', '40%', '62%', '52%']

/** Same idea for market caps, which run from `$100` to `$14.19B`. */
const MCAP_WIDTHS = ['w-10', 'w-12', 'w-8', 'w-14', 'w-11', 'w-12', 'w-9']

/** The third cell, which is the one thing the four columns disagree about. */
function GhostMetric({
  stage,
  row,
  still,
}: {
  stage: LaunchpadStage
  row: number
  still: boolean
}) {
  if (stage === 'graduating') {
    // The real CurveBar: a 32px track, 6px of gap, a 36px percentage.
    return (
      <span
        className="inline-flex items-center justify-end gap-1.5"
        style={{ width: CURVE_CELL_WIDTH }}
      >
        <Shimmer
          className="h-1 w-8 shrink-0 rounded-full"
          delayIndex={row}
          still={still}
        />
        <Shimmer className="h-2.5 w-9" delayIndex={row} still={still} />
      </span>
    )
  }
  return (
    <Shimmer
      className={cn('ml-auto h-2.5', stage === 'legendary' ? 'w-10' : 'w-6')}
      delayIndex={row}
      still={still}
    />
  )
}

/**
 * The rows of a launchpad column, waiting.
 *
 * Returns bare `<tr>`s on purpose: the pane keeps its own `<table>` and its
 * own header row, and only the body swaps. Nothing about the table's geometry
 * is restated here, so nothing about it can drift.
 */
export function LaunchpadGhostRows({
  stage,
  rows = GHOST_ROWS,
}: {
  stage: LaunchpadStage
  rows?: number
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => {
        const still = row >= SWEPT_ROWS
        return (
          <tr className="border-none" key={row}>
            <td className="w-full max-w-0 py-1 pr-3">
              <span className="flex items-center gap-1.5">
                <Shimmer
                  className="size-4 shrink-0 rounded-full"
                  delayIndex={row}
                  still={still}
                />
                <span className="min-w-0 flex-1">
                  <Shimmer
                    className="h-2.5"
                    delayIndex={row}
                    still={still}
                    style={{ width: NAME_WIDTHS[row % NAME_WIDTHS.length] }}
                  />
                </span>
              </span>
            </td>
            <td className="w-px whitespace-nowrap py-1 pr-3 text-right">
              <Shimmer
                className={cn(
                  'ml-auto h-2.5',
                  MCAP_WIDTHS[row % MCAP_WIDTHS.length],
                )}
                delayIndex={row}
                still={still}
              />
            </td>
            <td className="w-px whitespace-nowrap py-1 pr-3 text-right">
              <GhostMetric stage={stage} row={row} still={still} />
            </td>
            <td className="w-px whitespace-nowrap py-1 text-right">
              {stage === 'legendary' ? (
                <Shimmer
                  className="ml-auto h-2.5 w-14"
                  delayIndex={row}
                  still={still}
                />
              ) : (
                // The pill's own width, in both of its states, so the column
                // is already the width the first real row needs.
                <Shimmer
                  className={cn(FLOW_CELL, 'rounded-[3px]')}
                  delayIndex={row}
                  still={still}
                />
              )}
            </td>
          </tr>
        )
      })}
    </>
  )
}

/**
 * A list of figures, waiting: the real labels with the values taken out.
 *
 * The labels are ours, not the feed's, so they are drawn rather than ghosted.
 * Half of what a reader wants from Token Stats is which figures it carries,
 * and that half is answerable immediately.
 */
export function StatLinesSkeleton({
  labels,
  valueWidths,
}: {
  labels: ReadonlyArray<string>
  /** One width class per line. A liquidity figure is not a holder count. */
  valueWidths: ReadonlyArray<string>
}) {
  return (
    <div className="min-h-0 flex-1">
      {labels.map((label, row) => (
        <StatLine key={label} label={label}>
          <Shimmer
            className={cn('h-2.5', valueWidths[row % valueWidths.length])}
            delayIndex={row}
          />
        </StatLine>
      ))}
    </div>
  )
}

/**
 * The flow table, waiting.
 *
 * All four windows are drawn with their real labels, because 5m/1h/6h/24h is
 * the pane's structure rather than its data. A token with no trades in a
 * window drops that row when the answer lands, which is a row leaving rather
 * than the table rebuilding.
 */
export function FlowTableSkeleton({
  windowLabels,
}: {
  windowLabels: ReadonlyArray<string>
}) {
  return (
    <>
      {windowLabels.map((label, row) => (
        <tr className="border-none" key={label}>
          <td className="py-1 pr-3">{label}</td>
          <td className="py-1 pr-3 text-right">
            <Shimmer className="ml-auto h-2.5 w-9" delayIndex={row} />
          </td>
          <td className="py-1 pr-3 text-right">
            <Shimmer className="ml-auto h-2.5 w-12" delayIndex={row} />
          </td>
          <td className="py-1 text-right">
            <Shimmer
              className={cn(FLOW_CELL, 'rounded-[3px]')}
              delayIndex={row}
            />
          </td>
        </tr>
      ))}
    </>
  )
}

/**
 * The line under a skeleton that says why it is still a skeleton, once the
 * wait has earned it.
 *
 * Same component and same argument as the DEX board's `PacedNote`, which this
 * deliberately mirrors rather than imports: everything behind these panes is a
 * keyless public API on a paced queue (CoinGecko's free tier is six requests a
 * minute, and the Legendary column is funded entirely out of it), so a cold
 * board is genuinely a few seconds of work rather than a stall. A reader who
 * is not told that reloads, which throws the paced queue away and starts it
 * again from cold.
 *
 * Reserved height, so the pane does not jump when the line appears four
 * seconds in.
 */
export function MemecoinPacedNote({ show }: { show: boolean }) {
  const { t } = useTranslation()
  return (
    <p
      className={cn(
        'shrink-0 pt-1.5 text-center text-[10px] leading-relaxed text-muted-foreground transition-opacity duration-500',
        show ? 'opacity-100' : 'opacity-0',
      )}
    >
      {t('memecoins.pacedNote')}
    </p>
  )
}
