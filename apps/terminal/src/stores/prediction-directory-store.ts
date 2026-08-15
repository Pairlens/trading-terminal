// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a prediction pair key MEANS — the outcome directory.
 *
 * A prediction instrument's identity is `venue + marketId + outcome`, and its
 * display name is a question. None of that survives a route: `/pair/$pair`
 * carries one uppercase string, and every downstream surface (the watchlist,
 * the recents marquee, the pair switcher's title) resolves that string against
 * the instrument catalog — which has no prediction rows at all, so a watched
 * outcome would vanish rather than merely read as a bare ticker.
 *
 * The fix is the DEX token directory's, one layer up: pin what the user SAW
 * before navigating, and let every later resolution read the pin. Same rule
 * too — no re-resolution by symbol after display. A pair key identifies one
 * outcome on one venue; nothing may go looking for a second one that matches.
 *
 * Two differences from `market-engine`'s token directory, both deliberate:
 *  - It is a zustand store, not a module-level Map, because the rows that read
 *    it (watchlist, marquee) render before the pin lands and must repaint when
 *    it does.
 *  - It persists to localStorage, because a watchlist survives a reload and a
 *    question that turned back into `KXBTCD-26AUG15-T53` overnight is a bug
 *    the user cannot fix.
 *
 * Keyed by pair key ALONE, not venue+key: the key is what a route, a watchlist
 * row and a recents entry all carry, and the entry names its own venue in
 * `market`. Kalshi tickers and Polymarket handles do not collide in practice,
 * and a collision would only mislabel a row, never misroute an order (the
 * connector resolves the key itself).
 */
import { create } from 'zustand'

import { normalizePairKey } from '@/lib/pairs'
import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'

export type PredictionDirectoryEntry = {
  /** Venue market id: 'kalshi' | 'polymarket' | a third-party connector's. */
  market: string
  /** Venue-native market id (Kalshi ticker, Polymarket condition id). */
  predictionMarketId: string
  /** Outcome label as the venue names it: 'Yes', 'No', a candidate name. */
  outcome: string
  /** The market question — what the row shows instead of the pair key. */
  name: string
  /** Event headline, when it differs from the question. */
  eventTitle?: string
  /** Venue event grouping this market belongs to. */
  eventId?: string
  /** Expected resolution/close timestamp in ms. */
  endMs?: number
}

const STORAGE_KEY = `${STORAGE_PREFIX}prediction-directory`

/**
 * Outcomes are born and resolved daily, so an unbounded directory grows
 * without limit. The cap is generous next to any plausible watchlist and
 * evicts in insertion order.
 */
const MAX_ENTRIES = 500

function readStored(): Record<string, PredictionDirectoryEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return parsed as Record<string, PredictionDirectoryEntry>
  } catch {
    return {}
  }
}

function writeStored(entries: Record<string, PredictionDirectoryEntry>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // A full or unavailable store degrades to session-only memory, which is
    // still better than refusing the pin the navigation depends on.
  }
}

type PredictionDirectoryStore = {
  /** Normalized pair key → what it names. */
  entries: Record<string, PredictionDirectoryEntry>
  /** Pin an outcome. Called BEFORE navigation, never after. */
  register: (pairKey: string, entry: PredictionDirectoryEntry) => void
  clear: () => void
}

export const usePredictionDirectoryStore = create<PredictionDirectoryStore>(
  (set) => ({
    entries: readStored(),
    register: (pairKey, entry) =>
      set((s) => {
        const key = normalizePairKey(pairKey)
        if (!key) return s
        const existing = s.entries[key]
        // Identical re-pins are common (the same row selected twice); handing
        // back the same object keeps subscribed rows from re-rendering.
        if (existing && shallowEqual(existing, entry)) return s
        const next = { ...s.entries, [key]: entry }
        const keys = Object.keys(next)
        if (keys.length > MAX_ENTRIES) {
          for (const stale of keys.slice(0, keys.length - MAX_ENTRIES)) {
            delete next[stale]
          }
        }
        writeStored(next)
        return { entries: next }
      }),
    clear: () =>
      set(() => {
        writeStored({})
        return { entries: {} }
      }),
  }),
)

function shallowEqual(
  a: PredictionDirectoryEntry,
  b: PredictionDirectoryEntry,
): boolean {
  return (
    a.market === b.market &&
    a.predictionMarketId === b.predictionMarketId &&
    a.outcome === b.outcome &&
    a.name === b.name &&
    a.eventTitle === b.eventTitle &&
    a.eventId === b.eventId &&
    a.endMs === b.endMs
  )
}

/** Pin an outcome from outside React (selection handlers, connectors). */
export function registerPredictionOutcome(
  pairKey: string,
  entry: PredictionDirectoryEntry,
): void {
  usePredictionDirectoryStore.getState().register(pairKey, entry)
}

/** Non-reactive read — what this pair key names, or null. */
export function lookupPredictionOutcome(
  pairKey: string,
): PredictionDirectoryEntry | null {
  return (
    usePredictionDirectoryStore.getState().entries[normalizePairKey(pairKey)] ??
    null
  )
}

/** Reactive read for a row that must repaint when the pin lands. */
export function usePredictionOutcome(
  pairKey: string,
): PredictionDirectoryEntry | null {
  return usePredictionDirectoryStore(
    (s) => s.entries[normalizePairKey(pairKey)] ?? null,
  )
}
