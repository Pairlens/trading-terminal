// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useMemo } from 'react'

import {
  formatMarketRef,
  parseInstrumentRef,
  parseMarketRef,
} from '@pairlens/shared/market-ref'
import type { InstrumentRef, MarketRef } from '@pairlens/shared/market-ref'

import type { LegacyAssetClassMap } from '@/lib/market-ref/legacy'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { legacySymbolToInstrumentRef } from '@/lib/market-ref/legacy'
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

/**
 * Last price per MARKET ref, shared by the marquee and the pane so a
 * re-mounted row paints instantly instead of blanking until the next tick.
 *
 * Keyed by the full ref, not the symbol: two venues quoting the same symbol
 * used to overwrite each other here, so a row could paint the other venue's
 * last price for a frame before its own stream caught up.
 */
export const recentTickerPriceCache = new Map<string, number>()

/**
 * Recently viewed markets, most recent first.
 *
 * Entries are serialized refs (`spot:okx:BTC-USDT`). This is navigation
 * history, so it carries the venue: "take me back" means back to the tape you
 * were on, not to whatever venue you happen to prefer now.
 *
 * Legacy bare symbols left by earlier builds are upgraded lazily rather than
 * in a migration pass: an entry that does not parse as a ref is read as a
 * symbol, and the next visit rewrites it qualified. No list is ever dropped
 * and no resolver is needed at the storage layer.
 */
export function useRecentPairs(): [
  Array<InstrumentRef>,
  (ref: MarketRef) => void,
  (ref: InstrumentRef) => void,
] {
  const [stored, setStored] = usePersistedState<Array<string>>(
    RECENT_PAIRS_KEY,
    [],
  )
  // The class side table every pair picker wrote, which is what makes the
  // upgrade of a legacy entry nearly lossless. Reading it here is not
  // optional: without it 'AAPL-USD' falls through to the symbol-shape rule,
  // which sees a dash, calls it crypto, and the strip asks OKX for Apple on
  // every tick.
  const [assetClassMap] = usePersistedState<LegacyAssetClassMap>(
    'pair-picker.assetClassMap',
    {},
  )

  const readEntry = useCallback(
    (entry: string): InstrumentRef =>
      parseMarketRef(entry) ??
      parseInstrumentRef(entry) ??
      legacySymbolToInstrumentRef(entry, assetClassMap),
    [assetClassMap],
  )

  const recentPairs = useMemo(
    () => stored.map(readEntry).filter((ref) => Boolean(ref.id)),
    [stored, readEntry],
  )

  const sameInstrument = useCallback(
    (entry: string, ref: InstrumentRef): boolean => {
      const parsed = readEntry(entry)
      return parsed.cls === ref.cls && parsed.id === ref.id
    },
    [readEntry],
  )

  const trackRecent = useCallback(
    (ref: MarketRef) => {
      const key = formatMarketRef(ref)
      setStored((prev) => {
        if (prev[0] === key) return prev
        // Drop any earlier entry for the same INSTRUMENT, whatever venue it
        // named, so revisiting a pair on a second venue moves the row rather
        // than adding a duplicate beside it.
        const deduped = prev.filter((entry) => !sameInstrument(entry, ref))
        return [key, ...deduped].slice(0, RECENT_PAIRS_LIMIT)
      })
    },
    [setStored, sameInstrument],
  )

  const removeRecent = useCallback(
    (ref: InstrumentRef) => {
      setStored((prev) => prev.filter((entry) => !sameInstrument(entry, ref)))
    },
    [setStored, sameInstrument],
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
