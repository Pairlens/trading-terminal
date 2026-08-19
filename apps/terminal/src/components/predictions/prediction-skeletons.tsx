// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the prediction Discovery board draws while the venues are answering.
 *
 * The board used to answer with prose. Three of its four panes centred an icon
 * over "Reading the board" until the first venue replied, which is the same
 * shape a pane uses to say "there is nothing here" — so a board that was
 * working looked like a board that had failed, and then rebuilt itself under
 * the reader the moment the events landed. The rail was worse: it drew a real
 * "Trending 0" row, which is not a placeholder but a wrong number.
 *
 * These follow the perps boards' rule (`futures/funding-skeletons`): a loading
 * pane keeps its own shape. Every skeleton here is the real layout with the
 * unknowns taken out, at the real row height and the real column widths, so
 * the swap is data appearing rather than a pane redrawing.
 *
 * What is already known stays real, and that is most of the effect. The venue
 * block on the rail comes from the installed connectors, the search box and
 * the sort chips are furniture, and a venue that cannot answer at all says so
 * above the ghosts rather than behind them.
 */
import { Shimmer } from '@/components/panes/pane-skeletons'

/** Category rows the rail ghosts before it knows how many there will be. */
const GHOST_CATEGORIES = 8

/** Cards the board ghosts: four rows of the two-up grid, eight of the stack. */
const GHOST_CARDS = 8

/** Rows the two reading rails ghost. Roughly a tall pane's worth. */
const GHOST_RAIL_ROWS = 7

/**
 * Widths that keep a column of ghosts from reading as a bar chart.
 *
 * Category names and event questions are ragged, so a stack of identical
 * blocks is the one thing the real pane never looks like. The cycle is fixed
 * rather than random: a skeleton that reshuffles on every render is a second
 * animation competing with the sweep.
 */
const LABEL_WIDTHS = ['72%', '54%', '84%', '61%', '76%', '48%', '68%', '58%']

/**
 * The category rail, mid-flight.
 *
 * The rows are the real 22px rail rows with the name and the count taken out.
 * The Trending row above them is drawn by the pane itself and stays real: it
 * is the selected filter, it is clickable now, and only its count is unknown.
 */
export function CategoryRailSkeleton({
  rows = GHOST_CATEGORIES,
}: {
  rows?: number
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: rows }, (_, index) => (
        <div className="flex items-center gap-2 px-1.5 py-1" key={index}>
          <Shimmer className="size-3.5 shrink-0" delayIndex={index} />
          <Shimmer
            className="h-3"
            delayIndex={index}
            style={{ width: LABEL_WIDTHS[index % LABEL_WIDTHS.length] }}
          />
          <Shimmer className="ml-auto h-2.5 w-4 shrink-0" delayIndex={index} />
        </div>
      ))}
    </div>
  )
}

/**
 * The event board, mid-flight.
 *
 * A ghost of the BINARY card, always. A race card is a full-width block with a
 * ranked field, so ghosting one would promise a shape most boards do not open
 * with and rearrange the grid when the real mix arrives. The binary card is
 * the smaller of the two and the common case, which makes it the honest guess.
 *
 * The grid is the board's own — the same container query, the same two columns
 * above 34rem — so the cards do not jump columns when they fill in.
 */
export function EventBoardSkeleton({
  cards = GHOST_CARDS,
}: {
  cards?: number
}) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 content-start gap-x-5 gap-y-4 @[34rem]:grid-cols-2">
        {Array.from({ length: cards }, (_, index) => (
          <article className="flex flex-col gap-2.5" key={index}>
            <header className="flex items-start gap-2.5">
              {/* The venue's artwork slot, at the size and radius the real
                  thumbnail draws — this one is a hole either way, since a
                  missing image falls back to the class glyph. */}
              <Shimmer
                className="size-[38px] shrink-0 rounded-md"
                delayIndex={index}
              />
              <div className="min-w-0 flex-1 space-y-[5px] pt-px">
                <Shimmer className="h-3.5 w-full" delayIndex={index} />
                <Shimmer
                  className="h-3.5"
                  delayIndex={index}
                  style={{ width: LABEL_WIDTHS[index % LABEL_WIDTHS.length] }}
                />
                <Shimmer className="h-2.5 w-2/5" delayIndex={index} />
              </div>
            </header>

            <div className="flex items-end gap-3">
              <div className="shrink-0 space-y-1.5">
                {/* The 32px headline probability and the line under it. */}
                <Shimmer className="h-8 w-[62px]" delayIndex={index} />
                <Shimmer className="h-2.5 w-14" delayIndex={index} />
              </div>
              <Shimmer className="h-11 min-w-0 flex-1" delayIndex={index} />
            </div>

            {/* The two tradeable chips, at their real height and radius. */}
            <div className="flex gap-1.5">
              <Shimmer
                className="h-[30px] flex-1 rounded-lg"
                delayIndex={index}
              />
              <Shimmer
                className="h-[30px] flex-1 rounded-lg"
                delayIndex={index}
              />
            </div>

            <div className="flex justify-between gap-2">
              <Shimmer className="h-2.5 w-16" delayIndex={index} />
              <Shimmer className="h-2.5 w-14" delayIndex={index} />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

/**
 * Odds Movers, mid-flight.
 *
 * The probability bar's TRACK is real and its fill shimmers: the track is
 * furniture, and drawing it now is what stops the row assembling itself in
 * front of the reader. The fill steps down the list because the rail is
 * ranked — a column of equal bars would promise a flat rail and then reorder.
 * The delta keeps no colour, because which way a question moved is the one
 * thing this pane exists to say and a skeleton that guessed would flip half
 * its rows.
 */
export function OddsMoversSkeleton({
  rows = GHOST_RAIL_ROWS,
}: {
  rows?: number
}) {
  return (
    <div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="flex flex-col gap-1.5 border-b border-border/40 px-1.5 py-1.5 last:border-0"
          key={index}
        >
          <div className="space-y-1">
            <Shimmer className="h-3 w-full" delayIndex={index} />
            <Shimmer
              className="h-3"
              delayIndex={index}
              style={{ width: LABEL_WIDTHS[index % LABEL_WIDTHS.length] }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <Shimmer
                className="h-full rounded-full"
                delayIndex={index}
                style={{ width: `${88 - index * 9}%` }}
              />
            </span>
            <Shimmer className="h-3 w-11 shrink-0" delayIndex={index} />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Resolving Soon, mid-flight.
 *
 * Icon, two lines, a probability on the right: the real row exactly. The clock
 * glyph shimmers rather than being drawn for real, because the rail paints it
 * amber inside the last day and grey outside it, and a skeleton cannot know
 * which of those it is about to be.
 */
export function ResolvingSoonSkeleton({
  rows = GHOST_RAIL_ROWS,
}: {
  rows?: number
}) {
  return (
    <div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="flex items-center gap-2.5 border-b border-border/40 px-1.5 py-1.5 last:border-0"
          key={index}
        >
          <Shimmer
            className="size-3.5 shrink-0 rounded-full"
            delayIndex={index}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <Shimmer className="h-3 w-full" delayIndex={index} />
            <Shimmer
              className="h-2.5"
              delayIndex={index}
              style={{ width: LABEL_WIDTHS[index % LABEL_WIDTHS.length] }}
            />
          </div>
          <Shimmer className="h-3.5 w-8 shrink-0" delayIndex={index} />
        </div>
      ))}
    </div>
  )
}
