// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback } from 'react'

import { usePersistedState } from '@/hooks/use-persisted-state'
import { createSyncedSetting } from '@/lib/settings/synced-setting'

// Recently viewed pairs, most recent first. Shares the storage key with the
// pair pickers (markets pane, omni search) so every navigation source feeds
// the same history.
export const RECENT_PAIRS_KEY = 'pair-picker.recent'
export const RECENT_PAIRS_LIMIT = 10

// Visibility of the recent-tickers marquee on the /pair page. Toggled from
// the settings dialog and the desktop View menu.
export const RECENT_TICKERS_MARQUEE_KEY = 'terminal.recentTickersMarquee'
const MARQUEE_DEFAULT = true

// Last price per symbol, shared by the marquee and the pane so a re-mounted
// row paints instantly instead of blanking until the next tick.
export const recentTickerPriceCache = new Map<string, number>()

export function useRecentPairs(): [
  Array<string>,
  (symbol: string) => void,
  (symbol: string) => void,
] {
  const [recentPairs, setRecentPairs] = usePersistedState<Array<string>>(
    RECENT_PAIRS_KEY,
    [],
  )

  const trackRecent = useCallback(
    (symbol: string) => {
      setRecentPairs((prev) => {
        if (prev[0] === symbol) return prev
        const deduped = prev.filter((s) => s !== symbol)
        return [symbol, ...deduped].slice(0, RECENT_PAIRS_LIMIT)
      })
    },
    [setRecentPairs],
  )

  const removeRecent = useCallback(
    (symbol: string) => {
      setRecentPairs((prev) =>
        prev.includes(symbol) ? prev.filter((s) => s !== symbol) : prev,
      )
    },
    [setRecentPairs],
  )

  return [recentPairs, trackRecent, removeRecent]
}

export function useRecentTickersMarqueeEnabled(): [
  boolean,
  (value: boolean | ((prev: boolean) => boolean)) => void,
] {
  return usePersistedState<boolean>(RECENT_TICKERS_MARQUEE_KEY, MARQUEE_DEFAULT)
}

// ── Non-React accessor (desktop menu) ───────────────────────────────
// The Tauri app menu lives outside the React tree, so it reads/writes the
// setting through this framework-agnostic accessor — same localStorage key and
// sync-channel bus that usePersistedState instances listen on.

export const marqueeSetting = createSyncedSetting<boolean>(
  RECENT_TICKERS_MARQUEE_KEY,
  MARQUEE_DEFAULT,
)

export const getRecentTickersMarqueeEnabled = marqueeSetting.get
export const setRecentTickersMarqueeEnabled = marqueeSetting.set
