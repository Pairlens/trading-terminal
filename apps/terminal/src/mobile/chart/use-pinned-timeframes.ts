// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The four intervals the timeframe popover keeps one tap away.
 *
 * Two orders live here and they are deliberately different:
 *
 *   - **Storage order is recency.** Most-recently-selected first, which is the
 *     only thing that makes "evict the least-recently-selected" a one-line
 *     rule instead of a second persisted structure.
 *   - **Display order is canonical** (`TIMEFRAME_OPTIONS` order), so the pinned
 *     row reads `1m · 1h · 1D · 1W` today and tomorrow. A row that reshuffled
 *     itself under the thumb after every selection would be unusable.
 *
 * The reducers are pure and exported for the tests: this is persisted user
 * state, and a promotion that quietly drops the interval the chart is showing
 * is the kind of bug a type check cannot see.
 */
import { useCallback } from 'react'

import { usePersistedState } from '@/hooks/use-persisted-state'

/** Storage key, `pairlens:`-prefixed by usePersistedState. */
export const PINNED_TIMEFRAMES_KEY = 'mobile.pinnedTimeframes'

/** The design's pinned row: `1m · 1h · 1D · 1W`, as stored values. */
export const DEFAULT_PINNED_TIMEFRAMES = ['1m', '1h', '1d', '1w']

/** Four cells, one grid row. The design draws exactly this many. */
export const PINNED_LIMIT = 4

/** Move a selected interval to the front, so recency is the stored order. */
export function touchPinned(
  pinned: Array<string>,
  value: string,
): Array<string> {
  if (!pinned.includes(value) || pinned[0] === value) return pinned
  return [value, ...pinned.filter((entry) => entry !== value)]
}

/**
 * Promote a "more" interval into the pinned row.
 *
 * The evicted entry is the last one in recency order that is **not** the
 * interval currently on the chart — dropping what the user is looking at would
 * make the row disagree with the chart the instant they promoted anything.
 */
export function promotePinned(
  pinned: Array<string>,
  value: string,
  current: string,
  limit: number = PINNED_LIMIT,
): Array<string> {
  if (pinned.includes(value)) return touchPinned(pinned, value)
  const next = [value, ...pinned]
  if (next.length <= limit) return next

  // Walk from the least recent end for something droppable. If every entry is
  // the current timeframe (it cannot be more than once, but the loop stays
  // total), fall back to the plain tail so the row never grows past its limit.
  for (let i = next.length - 1; i > 0; i -= 1) {
    if (next[i] !== current) {
      return [...next.slice(0, i), ...next.slice(i + 1)]
    }
  }
  return next.slice(0, limit)
}

export type PinnedTimeframes = {
  /** Recency order — most recently selected first. */
  pinned: Array<string>
  /** Record a selection so the next promotion evicts the right entry. */
  touch: (value: string) => void
  /** Long-press promotion from the "more" grid. */
  promote: (value: string, current: string) => void
}

export function usePinnedTimeframes(): PinnedTimeframes {
  const [stored, setPinned] = usePersistedState<Array<string>>(
    PINNED_TIMEFRAMES_KEY,
    DEFAULT_PINNED_TIMEFRAMES,
  )
  // Cloud-hydrated values arrive as `unknown` — never hand a non-array on.
  const pinned = Array.isArray(stored) ? stored : DEFAULT_PINNED_TIMEFRAMES

  const touch = useCallback(
    (value: string) => {
      setPinned((prev) =>
        touchPinned(
          Array.isArray(prev) ? prev : DEFAULT_PINNED_TIMEFRAMES,
          value,
        ),
      )
    },
    [setPinned],
  )

  const promote = useCallback(
    (value: string, current: string) => {
      setPinned((prev) =>
        promotePinned(
          Array.isArray(prev) ? prev : DEFAULT_PINNED_TIMEFRAMES,
          value,
          current,
        ),
      )
    },
    [setPinned],
  )

  return { pinned, touch, promote }
}
