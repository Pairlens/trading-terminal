// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Reading a run of Form 4 filings.
 *
 * Two things a pane needs and neither is on the wire. The dollar value of a
 * filing is shares times price, and both halves are legitimately absent: a
 * grant has no price, and a filing with no share count is not a size. So the
 * value is null unless BOTH are known, because a grant valued at $0 would sit
 * in a column of real dollars and read as a worthless transaction rather than
 * as one that was never a purchase.
 *
 * The summary counts buys against sells over the span actually loaded, not over
 * a window we asked for. The provider hands back a company's filing history and
 * the server keeps the newest 200, so for a heavily-traded name that span is a
 * few weeks and for a quiet one it is years. Stating the span alongside the
 * counts is what stops '2 buys, 40 sells' reading as a month of selling when it
 * is three years of it.
 */
import type { InsiderTransaction } from '@pairlens/shared/instrument-types'

/** Shares times price, or null when either half is unfiled. */
export function insiderValue(
  shares: number | null,
  sharePrice: number | null,
): number | null {
  if (shares === null || sharePrice === null) return null
  const value = shares * sharePrice
  return Number.isFinite(value) ? value : null
}

export type InsiderSummary = {
  buys: number
  sells: number
  /** Inclusive days between the oldest and newest filing; null when empty. */
  spanDays: number | null
}

export function summarizeInsiderActivity(
  transactions: Array<InsiderTransaction>,
): InsiderSummary {
  let buys = 0
  let sells = 0
  let oldest: string | null = null
  let newest: string | null = null

  for (const tx of transactions) {
    if (tx.type === 'acquisition') buys++
    else sells++
    if (oldest === null || tx.date < oldest) oldest = tx.date
    if (newest === null || tx.date > newest) newest = tx.date
  }

  return { buys, sells, spanDays: inclusiveDays(oldest, newest) }
}

/** Both dates included, so a single filing spans one day rather than zero. */
function inclusiveDays(from: string | null, to: string | null): number | null {
  if (from === null || to === null) return null
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.round((end - start) / 86_400_000) + 1
}
