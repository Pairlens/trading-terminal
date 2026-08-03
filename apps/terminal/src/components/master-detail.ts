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

/** Left column of a master-detail section. Apply to the list container. */
export const MASTER_DETAIL_LIST_CLASS =
  'flex w-60 shrink-0 flex-col border-r border-border bg-background'

/**
 * The list's title row. A fixed height rather than padding, so the rule under
 * it lands at the same y as the detail header's on the other side of the
 * divider — whatever either side happens to contain.
 */
export const MASTER_DETAIL_LIST_HEADER_CLASS =
  'flex h-10 shrink-0 items-center justify-between border-b border-border px-3'
