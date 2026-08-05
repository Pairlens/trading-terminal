// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pan-left history paging.
 *
 * The chart backfills older history by passing `endTs` — the oldest bar it
 * already holds — and expects a page STRICTLY older than it. Two things make
 * that harder than it sounds, and both are encoded here rather than in eleven
 * connectors:
 *
 * 1. Venues disagree about whether their cursor is inclusive. Measured against
 *    the live APIs in 2026-08: Bitget (`endTime`), Coinbase (`end`), Gate
 *    (`to`) and Bitfinex (`end`) all return a bar sitting exactly on the
 *    cursor; KuCoin, Crypto.com and Upbit do not. Binance and ByBit were
 *    already compensating for this by hand.
 * 2. A duplicated boundary bar is not cosmetic. `use-chart-terminal-state`
 *    keeps only bars strictly older than what it holds, so a page containing
 *    nothing but the boundary bar filters to empty, which it reads as "this
 *    connector has no more history" and latches `exhausted` permanently. One
 *    off-by-one bar therefore ends scroll-back for the rest of the session.
 *
 * So: nudge the cursor AND filter the result, rather than trusting either.
 */

import type { Candle } from './types'

/** Exclusive upper bound in epoch ms, for venues whose cursor is inclusive. */
export function pageEndMs(endTs: number): number {
  return Math.floor(endTs) - 1
}

/** Exclusive upper bound in epoch SECONDS, for venues that page in seconds. */
export function pageEndSec(endTs: number): number {
  return Math.floor(endTs / 1000) - 1
}

/**
 * Drop anything at or newer than the cursor. Safe to call with no cursor (the
 * first, unpaged load), where it passes the batch through untouched.
 */
export function olderThan(
  candles: Array<Candle>,
  endTs?: number,
): Array<Candle> {
  if (endTs === undefined) return candles
  return candles.filter((c) => c.ts < endTs)
}
