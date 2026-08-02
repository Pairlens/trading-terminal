// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Paged history fetch for the indicator preview.
 *
 * Venues cap a single REST candles call well below what a long moving average
 * or a believable backtest needs — OKX returns at most 300. Asking for 2000
 * and quietly getting 300 is the kind of thing that makes a backtest lie, so
 * we page backwards from the oldest bar we hold until we reach the target or
 * the venue stops giving us history.
 */
import type { ChartBar } from 'fast-financial-charts/types'

/** One page of candles, ending strictly before `endTs` when given. */
export type HistoryPageFetcher = (
  limit: number,
  endTs?: number,
) => Promise<Array<ChartBar> | null | undefined>

/** Most venues cap a candles request around here. */
export const DEFAULT_PAGE_SIZE = 300

/** Hard stop so a venue that keeps returning the same page can't spin. */
const MAX_PAGES = 12

/**
 * Accumulate at least `target` bars, oldest-first and de-duplicated.
 *
 * Stops early when a page comes back empty, or brings nothing older than what
 * we already have — either means the venue has no more history, and looping
 * further would just burn rate limit.
 */
export async function fetchHistoryDepth(
  fetchPage: HistoryPageFetcher,
  target: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<Array<ChartBar>> {
  if (target <= 0) return []
  const byTs = new Map<number, ChartBar>()
  let oldest: number | undefined

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const remaining = target - byTs.size
    if (remaining <= 0) break

    const bars = await fetchPage(Math.min(pageSize, remaining), oldest)
    if (!bars || bars.length === 0) break

    const before = byTs.size
    for (const bar of bars) {
      if (Number.isFinite(bar.ts)) byTs.set(bar.ts, bar)
    }
    // No new bars: the venue is replaying the same window.
    if (byTs.size === before) break

    let pageOldest = Number.POSITIVE_INFINITY
    for (const bar of bars) {
      if (bar.ts < pageOldest) pageOldest = bar.ts
    }
    if (!Number.isFinite(pageOldest)) break
    if (oldest !== undefined && pageOldest >= oldest) break
    oldest = pageOldest

    // A short page means we reached the start of available history.
    if (bars.length < Math.min(pageSize, remaining)) break
  }

  return Array.from(byTs.values()).sort((a, b) => a.ts - b.ts)
}
