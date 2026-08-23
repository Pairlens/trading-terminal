// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How hard a coin traded today, measured against the rest of its own column.
 *
 * This is the Movers pane's number, in the one place on the memecoin board
 * where it applies. Legendary ranks established coins by market cap, and a
 * market cap barely moves — so the column was four figures deep and only one
 * of them said anything about today. Volume alone does not close that: $310M
 * is enormous for a $500M coin and quiet for a $14B one, which is exactly why
 * the movers pane never shows raw volume without this beside it.
 *
 * Turnover is 24h volume over capitalisation: the share of itself a coin
 * traded today. The multiple is that against the MEDIAN of the same column, so
 * a row reads "1.4× the usual for a coin like this" rather than a ratio nobody
 * has a feel for. Median rather than mean, for the reason `spot-movers.ts`
 * gives at length: one coin turning over eighty times its float drags a mean
 * far enough that nothing else ever looks unusual again.
 *
 * The threshold for colouring is imported rather than re-picked, because a
 * user who learns what a marked multiple means on the Discovery board has to
 * find it meaning the same thing here.
 */
import type { LaunchpadToken } from '@pairlens/shared/instrument-types'

export { UNUSUAL_TURNOVER } from '@/lib/spot-movers'

/** Chain plus address, the same identity the rows are keyed on. */
export function turnoverKey(token: LaunchpadToken): string {
  return `${token.chain}:${token.address}`
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * A token's 24h turnover, or null when either half is missing.
 *
 * FDV stands in for a missing market cap, the same substitution the rows make
 * for the market-cap cell: for a token whose whole supply is circulating they
 * are the same number, and a dash beside an answer is worse than the answer.
 */
export function turnoverOf(token: LaunchpadToken): number | null {
  const cap = token.marketCapUsd ?? token.fdvUsd
  const volume = token.flow.h24?.volumeUsd ?? null
  if (!isPositive(cap) || !isPositive(volume)) return null
  return volume / cap
}

export function medianOf(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  return median > 0 ? median : null
}

/**
 * Every row's turnover multiple, keyed by chain and address.
 *
 * An empty map is the honest answer when fewer than three rows carry a
 * turnover: a median of one or two samples is not a baseline, and a multiple
 * measured against it would be noise wearing a decimal point.
 */
export function turnoverMultiples(
  tokens: ReadonlyArray<LaunchpadToken>,
): Map<string, number> {
  const measured = new Map<string, number>()
  for (const token of tokens) {
    const turnover = turnoverOf(token)
    if (turnover !== null) measured.set(turnoverKey(token), turnover)
  }
  const out = new Map<string, number>()
  if (measured.size < 3) return out
  const median = medianOf([...measured.values()])
  if (median === null) return out
  for (const [key, turnover] of measured) out.set(key, turnover / median)
  return out
}

/**
 * A multiple in at most four characters, so the cell it sits in cannot grow.
 *
 * TRUMP printed `22.1×` on a live board and a launch during its first hour can
 * print far worse, which pushed the volume cell wide enough to squeeze the
 * ticker beside it. The precision that gets dropped above 10× is precision
 * that was never real: the number is a ratio against a median of thirty rows,
 * and past a certain point the only thing it says is "far more than usual".
 * Everything above 99 says exactly that and says it in the same width.
 */
export function formatTurnoverMultiple(multiple: number): string {
  if (!Number.isFinite(multiple) || multiple < 0) return '·'
  if (multiple >= 100) return '99+×'
  if (multiple >= 10) return `${Math.round(multiple)}×`
  return `${multiple.toFixed(1)}×`
}
