// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How a reader arranges a memecoin column: what it is sorted by, and what it
 * refuses to show.
 *
 * The board arrives ranked the only way a feed can rank it — newest, closest
 * to graduating, most recently migrated, biggest. That ranking is right for
 * looking, and wrong for working: a trader who only takes launches above a
 * market cap, or only watches the last ten points of a curve, was reading past
 * two thirds of every column by eye. Sorting and filtering are the same job
 * done once.
 *
 * ## Why this is a pure module
 *
 * Everything here is data in, data out: no React, no storage, no clock of its
 * own (`now` is passed). The panes hold the state, `usePersistedState` carries
 * it to disk and the cloud, and the whole of the actual behaviour is testable
 * without rendering anything.
 *
 * ## Sorting is a layer over the feed's order, never a replacement
 *
 * `null` sort means the column's own ranking, which is a real answer rather
 * than an absence: "closest to graduating" is not reproducible from any single
 * field once the provider has mixed a published curve with a reconstructed
 * one. So a column starts there, a click sorts, and clicking back through the
 * cycle returns to it.
 */
import type {
  LaunchpadFlow,
  LaunchpadStage,
  LaunchpadToken,
} from '@pairlens/shared/instrument-types'

/**
 * The four sortable columns, named for what they ARE rather than for what
 * they contain, because the third and fourth hold something different per
 * stage: `metric` is age, curve progress, time since graduation or the 24h
 * move, and `flow` is buys against sells or traded volume.
 */
export type LaunchpadSortKey = 'token' | 'mcap' | 'metric' | 'flow'

export type SortDirection = 'asc' | 'desc'

/** `null` is the column's own ranking. See the module header. */
export type LaunchpadSort = { key: LaunchpadSortKey; dir: SortDirection } | null

/**
 * Every filter the board understands. All optional, all inclusive bounds.
 *
 * One flat shape for four columns rather than a shape each: the fields a stage
 * cannot use are simply never offered by its dialog, and a filter that
 * survives a token moving from Graduating to Graduated is a feature. Curve
 * progress is stored 0..1 like the field it tests, not as the percentage the
 * dialog shows, so nothing here has to know how it is rendered.
 */
export type LaunchpadFilters = {
  minMcap?: number
  maxMcap?: number
  minLiquidity?: number
  minHolders?: number
  minCurve?: number
  maxCurve?: number
  maxAgeMinutes?: number
  minVolume?: number
  minTrades?: number
}

export type LaunchpadStagePrefs = {
  sort?: LaunchpadSort
  filters?: LaunchpadFilters
}

/** What one board's worth of preferences looks like on disk. */
export type LaunchpadBoardPrefs = Partial<
  Record<LaunchpadStage, LaunchpadStagePrefs>
>

/**
 * The persisted key. Tier 1, `preferences` domain: it is a handful of numbers
 * per column, it belongs to the person rather than to the machine, and a
 * trader who set a floor on their laptop wants it on the desktop app too.
 */
export const MEMECOIN_BOARD_PREFS_KEY = 'memecoins.board'

/** Which filters a stage's dialog offers. Order is the order they render in. */
export const FILTERS_FOR_STAGE: Readonly<
  Record<LaunchpadStage, ReadonlyArray<keyof LaunchpadFilters>>
> = {
  new: ['minMcap', 'maxMcap', 'minHolders', 'maxAgeMinutes', 'minTrades'],
  graduating: [
    'minCurve',
    'maxCurve',
    'minMcap',
    'maxMcap',
    'minLiquidity',
    'minTrades',
  ],
  graduated: ['minMcap', 'maxMcap', 'minLiquidity', 'minHolders', 'minTrades'],
  // No holders, no liquidity and no curve: CoinGecko publishes a market-cap
  // ranking, and offering a filter that would silently empty the column is
  // worse than not offering it.
  legendary: ['minMcap', 'maxMcap', 'minVolume'],
}

/**
 * The flow window a row is read at, which the sort has to agree with.
 *
 * Five minutes on a launch, twenty-four hours on a coin that has been around
 * for years: both are "what just happened" at that column's scale. Exported
 * because the row renders one number from this and the comparator ranks by it,
 * and a column sorted on a window it is not showing is a column that looks
 * wrong.
 */
export function activeFlow(
  token: LaunchpadToken,
  stage: LaunchpadStage,
): LaunchpadFlow | undefined {
  if (stage === 'legendary') return token.flow.h24
  return token.flow.m5 ?? token.flow.h1 ?? token.flow.h24
}

/** Market cap as the row displays it: FDV stands in when there is no cap. */
function capOf(token: LaunchpadToken): number | null {
  return token.marketCapUsd ?? token.fdvUsd
}

function ageMinutes(iso: string | null, now: number): number | null {
  if (!iso) return null
  const ms = now - Date.parse(iso)
  return Number.isFinite(ms) && ms >= 0 ? ms / 60_000 : null
}

/**
 * An unknown never satisfies a bound.
 *
 * A row whose market cap the feed did not publish is not a row known to be
 * above ten thousand dollars, and a filter that let it through would be
 * answering a question it cannot answer. The same rule the safety pane
 * follows: unknown is not a pass.
 */
function atLeast(value: number | null | undefined, min: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min
}

function atMost(value: number | null | undefined, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value <= max
}

/** How many bounds are set. Drives the badge on the filter button. */
export function activeFilterCount(
  filters: LaunchpadFilters | undefined,
): number {
  if (!filters) return 0
  return Object.values(filters).filter(
    (value) => typeof value === 'number' && Number.isFinite(value),
  ).length
}

export function hasActiveFilters(
  filters: LaunchpadFilters | undefined,
): boolean {
  return activeFilterCount(filters) > 0
}

/** Drop the keys a dialog cleared, so an empty filter set serializes as `{}`. */
export function pruneFilters(filters: LaunchpadFilters): LaunchpadFilters {
  const out: LaunchpadFilters = {}
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key as keyof LaunchpadFilters] = value
    }
  }
  return out
}

export function passesFilters(
  token: LaunchpadToken,
  stage: LaunchpadStage,
  filters: LaunchpadFilters | undefined,
  now: number,
): boolean {
  if (!filters) return true
  const cap = capOf(token)
  if (filters.minMcap !== undefined && !atLeast(cap, filters.minMcap)) {
    return false
  }
  if (filters.maxMcap !== undefined && !atMost(cap, filters.maxMcap)) {
    return false
  }
  if (
    filters.minLiquidity !== undefined &&
    !atLeast(token.liquidityUsd, filters.minLiquidity)
  ) {
    return false
  }
  if (
    filters.minHolders !== undefined &&
    !atLeast(token.holders, filters.minHolders)
  ) {
    return false
  }
  if (
    filters.minCurve !== undefined &&
    !atLeast(token.curveProgress, filters.minCurve)
  ) {
    return false
  }
  if (
    filters.maxCurve !== undefined &&
    !atMost(token.curveProgress, filters.maxCurve)
  ) {
    return false
  }
  if (filters.maxAgeMinutes !== undefined) {
    // Age is measured from the mint for a launch and from the migration for a
    // graduated row, which is the number that column already shows.
    const iso = stage === 'graduated' ? token.graduatedAt : token.createdAt
    if (!atMost(ageMinutes(iso, now), filters.maxAgeMinutes)) return false
  }
  const flow = activeFlow(token, stage)
  if (
    filters.minVolume !== undefined &&
    !atLeast(flow?.volumeUsd ?? null, filters.minVolume)
  ) {
    return false
  }
  if (filters.minTrades !== undefined) {
    const trades = flow ? flow.buys + flow.sells : null
    if (!atLeast(trades, filters.minTrades)) return false
  }
  return true
}

/**
 * What a sort key ranks by, per stage.
 *
 * `flow` on a launchpad column is NET trades rather than total, and that is
 * the one choice here worth arguing. The column shows two numbers and a sort
 * has to pick one meaning; total activity ranks a row with five hundred sells
 * above one with three hundred buys, which is the opposite of what somebody
 * sorting that column is looking for. Net answers "what is being bought",
 * descending, and "what is being dumped", ascending.
 */
function valueFor(
  token: LaunchpadToken,
  stage: LaunchpadStage,
  key: LaunchpadSortKey,
): number | null {
  if (key === 'mcap') return capOf(token)
  if (key === 'metric') {
    if (stage === 'graduating') return token.curveProgress
    if (stage === 'legendary') {
      return token.flow.h24?.priceChangePercent ?? null
    }
    const iso = stage === 'graduated' ? token.graduatedAt : token.createdAt
    const parsed = iso ? Date.parse(iso) : NaN
    return Number.isFinite(parsed) ? parsed : null
  }
  // flow
  const flow = activeFlow(token, stage)
  if (!flow) return null
  return stage === 'legendary' ? flow.volumeUsd : flow.buys - flow.sells
}

/**
 * The column, arranged.
 *
 * Returns a new array and never mutates the query's own, which matters more
 * than it looks: the rows come straight out of the React Query cache, and
 * sorting them in place would reorder the cached answer every other component
 * reads.
 *
 * Rows the sort cannot measure sink to the bottom in BOTH directions. An
 * unknown is not the smallest value, it is an absence, and floating it to the
 * top of an ascending sort would answer a question with a gap.
 */
export function arrangeTokens(
  tokens: ReadonlyArray<LaunchpadToken>,
  stage: LaunchpadStage,
  prefs: LaunchpadStagePrefs | undefined,
  now: number,
): Array<LaunchpadToken> {
  const filtered = tokens.filter((token) =>
    passesFilters(token, stage, prefs?.filters, now),
  )
  const sort = prefs?.sort
  if (!sort) return filtered

  const direction = sort.dir === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => {
    if (sort.key === 'token') {
      return direction * a.symbol.localeCompare(b.symbol)
    }
    const left = valueFor(a, stage, sort.key)
    const right = valueFor(b, stage, sort.key)
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    return direction * (left - right)
  })
}

/**
 * The next state of a header that was clicked.
 *
 * Three states, not two: descending, ascending, then back to the column's own
 * ranking. A two-state toggle strands a reader who only wanted a look, because
 * nothing on the header can say "put it back".
 */
export function nextSort(
  current: LaunchpadSort,
  key: LaunchpadSortKey,
): LaunchpadSort {
  if (current?.key !== key) return { key, dir: 'desc' }
  if (current.dir === 'desc') return { key, dir: 'asc' }
  return null
}
