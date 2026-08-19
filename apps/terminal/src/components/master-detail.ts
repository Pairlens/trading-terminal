// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Master-detail shell metrics ──────────────────────────────────────
//
// Notifications, Workflows, Indicators and Bots are all the same shape: a
// list of things down the left, the selected thing filling the rest. They
// used to each pick their own width (w-56 / w-64 / w-60), so switching
// sections nudged the whole page sideways. One constant, one width.
//
// 15rem / 240px is the widest a name column can be before it starts eating
// the canvas, and the narrowest that still fits "BTC-USDT breakout" plus
// the hover actions without truncating.
//
// The surface is the board's: a `--card` column on ground, 14px radius, no
// border of its own (see `chrome/page-chrome.ts`). What used to separate the
// list from the detail was a `border-r`; what separates them now is 10px of
// ground showing through between two columns, exactly as on a workspace.

import { PAGE_COLUMN_FLUSH } from '@/components/chrome/page-chrome'

/** Left column of a master-detail section. Apply to the list container. */
export const MASTER_DETAIL_LIST_CLASS = `w-60 shrink-0 ${PAGE_COLUMN_FLUSH}`

/**
 * The list's title row.
 *
 * Flush left at 12px so the name sits over its rows, and no rule under it —
 * the seam is the padding, the way a pane's header seam is. The height still
 * matches the detail side's own title row so the two read as one line across
 * the gutter, but nothing is drawn to prove it.
 */
export const MASTER_DETAIL_LIST_HEADER_CLASS =
  'flex h-10 shrink-0 items-center justify-between gap-2 px-3'

/**
 * The list's name, in the pane title's voice — 12.5px, medium, sentence case.
 * It used to be small-caps semibold, which is the voice this codebase reserves
 * for a table's column headers; using it for the section title as well left
 * two different things shouting in the same register.
 */
export const MASTER_DETAIL_LIST_TITLE_CLASS =
  'truncate text-[12.5px] leading-none font-medium tracking-[-0.005em]'
