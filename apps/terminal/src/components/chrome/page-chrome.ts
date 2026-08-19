// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a page is made of, once the inset card went away.
 *
 * A workspace board is ground with card columns floating on it and exactly one
 * line anywhere: the hairline between two panes stacked in the same column
 * (see `components/layout/`). Every other page used to be built the opposite
 * way round — a full-bleed sheet carved into regions by rules, `border-r` down
 * the master list, `border-b` under every header — so moving from a board to
 * Bots read as moving between two products.
 *
 * These are the board's own metrics, named for pages: the same 10px inset, the
 * same 14px column, the same 12px padding, the same hairline. A page that
 * builds itself out of them lands its columns at the pixel a board lands its
 * own, and the top bar above stays the only thing that has to know which is
 * which.
 *
 * The rules, which are the board's rules:
 *
 *   - Columns are separated by ground showing through. Never a vertical rule.
 *   - A column draws no border, ever. The fill is the edge.
 *   - The only line is `PAGE_RULE`, horizontal, between two regions stacked
 *     inside one column.
 *   - A title row carries no rule under it. Six pixels of air is the seam.
 *   - The third surface step is a well (`bg-muted/40`, no border), and it is
 *     for inputs, tickets and quoted blocks — not for turning a list back
 *     into a stack of cards.
 */

/**
 * The page under its top bar: the column that holds the bar and the ground.
 *
 * A `<main>` in practice — the routed pages were `SidebarInset`s, which still
 * carried the shell's old inset geometry (`m-2`, `rounded-xl`, `shadow-sm`)
 * even though nothing was left to inset them from.
 */
export const PAGE_FRAME = 'flex min-h-0 flex-1 flex-col overflow-hidden'

/**
 * The ground the columns float on. Inset 10px from three edges and none from
 * the top, so the columns hang off the bar above them exactly as a board's do.
 */
export const PAGE_GROUND =
  'flex min-h-0 flex-1 gap-2.5 overflow-hidden bg-background px-2.5 pb-2.5'

/**
 * One column. `min-w-0` is load-bearing: these hold names, tables and code,
 * all of which would otherwise refuse to shrink and push the column wider
 * than its share.
 */
export const PAGE_COLUMN =
  'flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] bg-card p-3'

/**
 * The same column for content that has to reach its own edges — a scrolling
 * list whose rows highlight full-bleed, a canvas, an editor. It drops the
 * padding and hands it to whatever inside wants it.
 */
export const PAGE_COLUMN_FLUSH =
  'flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] bg-card'

/**
 * A column's name. The pane header's own metrics minus the drag chrome, so a
 * section title and a pane title are the same size on the same baseline.
 *
 * `min-h-5` rather than `h-5`: most title rows are text and a trailing icon
 * button and sit at exactly 20px, but a detail header that carries a real
 * toolbar is allowed to grow rather than shrink its controls to fit.
 */
export const PAGE_COLUMN_TITLE =
  'flex min-h-5 shrink-0 items-center gap-2 text-[12.5px] leading-none font-medium tracking-[-0.005em]'

/** Six pixels between a column's name and its content. The board's gap. */
export const PAGE_COLUMN_BODY =
  'mt-1.5 flex min-h-0 flex-1 flex-col overflow-hidden'

/**
 * The one line inside a column, between two stacked regions. Same token as
 * the board's `RowHandle` draws, because it is the same line.
 */
export const PAGE_RULE = 'h-px shrink-0 bg-(--pane-rule)'

/**
 * An icon control on a title row: sized to the 20px row rather than to the
 * button library's own idea of small.
 */
export const PAGE_TITLE_ACTION =
  'size-5 shrink-0 rounded-[5px] text-muted-foreground hover:text-foreground'
