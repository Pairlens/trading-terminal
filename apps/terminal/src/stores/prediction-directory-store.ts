// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a prediction pair key MEANS — the event directory.
 *
 * A prediction pair is an EVENT: one question, and every answer to it. That is
 * the whole shape of the asset class and it is why the directory is keyed on
 * events rather than on outcomes. "Will the Fed cut in March?" is the
 * instrument; Yes at 63¢ and No at 37¢ are two ways to take a side on it, the
 * way bid and ask are two ways to take a side on a pair. A terminal that made
 * you pick the side before it would show you the market had the model
 * backwards.
 *
 * None of that survives a route: `/prediction/$venue/$id` carries one string,
 * and every downstream surface (the watchlist, the recents marquee, the pair
 * switcher's title) resolves that string against the instrument catalog —
 * which has no prediction rows at all, so a watched event would vanish rather
 * than merely read as a bare ticker.
 *
 * The fix is the DEX token directory's, one layer up: pin what the user SAW
 * before navigating, and let every later resolution read the pin. Same rule
 * too — no re-resolution by title after display. A pair key identifies one
 * event on one venue; nothing may go looking for a second one that matches.
 *
 * Two maps, because two questions get asked:
 *
 *  - `events` answers "what question is this pair?" — the pair key's own
 *    meaning, plus the favourite, which is what a ticker slot shows beside the
 *    title ("Fed cuts in March · Yes 63¢").
 *  - `outcomes` answers "what is this leg?" for the places that legitimately
 *    hold one outcome and no event around it: a filled order in the
 *    notification feed, a position row, the risk guard sizing a stake.
 *
 * Two differences from `market-engine`'s token directory, both deliberate:
 *  - It is a zustand store, not a module-level Map, because the rows that read
 *    it (watchlist, marquee) render before the pin lands and must repaint when
 *    it does.
 *  - It persists to localStorage, because a watchlist survives a reload and a
 *    question that turned back into `KXBTCD-26AUG15` overnight is a bug the
 *    user cannot fix.
 *
 * Keyed by pair key ALONE, not venue+key: the key is what a route, a watchlist
 * row and a recents entry all carry, and the entry names its own venue in
 * `market`. Kalshi event tickers and Polymarket event ids do not collide in
 * practice, and a collision would only mislabel a row, never misroute an order
 * (the connector resolves the outcome key itself).
 */
import { create } from 'zustand'

import { normalizePairKey } from '@/lib/pairs'
import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'

/** The favourite: highest-priced answer at pin time. */
export type PredictionLeader = {
  /** The outcome key that answer trades under — what a ticker subscribes to. */
  pairKey: string
  /** The answer as the venue names it: 'Yes', 'Gavin Newsom', 'Above 13.5M'. */
  label: string
  /** Its probability in collateral units (0..1), when the pin carried one. */
  price?: number
}

/** What a prediction pair key names: one event on one venue. */
export type PredictionEventEntry = {
  /** Venue market id: 'kalshi' | 'polymarket' | a third-party connector's. */
  market: string
  /** Venue-native event id — the pair key's own content, unsanitized. */
  eventId: string
  /** The event heading. What a row shows instead of the pair key. */
  title: string
  category?: string
  imageUrl?: string
  /** Expected resolution/close timestamp in ms. */
  endMs?: number
  /**
   * How many answers the event has. Two is a side to take; twelve is a field
   * to read, and the surfaces that only have room for one line say so
   * differently.
   */
  outcomeCount: number
  /**
   * The favourite at pin time.
   *
   * A pinned price goes stale within seconds and is never shown as a live
   * one — what it buys is the FIRST paint of a marquee chip, before the
   * ticker stream for `leader.pairKey` has said anything. The label and the
   * key are the durable half.
   */
  leader?: PredictionLeader
}

/** One answer, for the surfaces that hold a leg and no event around it. */
export type PredictionOutcomeEntry = {
  /** Venue market id the outcome trades on. */
  market: string
  /** Venue-native market id (Kalshi ticker, Polymarket condition id). */
  predictionMarketId: string
  /** Outcome label as the venue names it: 'Yes', 'No', a candidate name. */
  outcome: string
  /** The market question — what a row shows instead of the outcome key. */
  name: string
  /**
   * The market's short label within its event ('Gavin Newsom', 'Above 13.5M').
   * This is what a ticker slot renders; the question is too long for one and
   * the outcome key is unreadable in one.
   */
  shortTitle?: string
  /** Event headline, when it differs from the question. */
  eventTitle?: string
  /** Venue event grouping this market belongs to — the owning PAIR's key. */
  eventId?: string
  /** Expected resolution/close timestamp in ms. */
  endMs?: number
}

const STORAGE_KEY = `${STORAGE_PREFIX}prediction-directory`

/**
 * Events are born and resolved daily, so an unbounded directory grows without
 * limit. The caps are generous next to any plausible watchlist and evict in
 * insertion order. Outcomes get the larger one: a single race event pins a
 * hundred and twenty-eight of them the moment its ladder renders.
 */
const MAX_EVENTS = 500
const MAX_OUTCOMES = 2_000

type StoredShape = {
  events?: Record<string, PredictionEventEntry>
  outcomes?: Record<string, PredictionOutcomeEntry>
}

function readStored(): Required<StoredShape> {
  const empty = { events: {}, outcomes: {} }
  if (typeof window === 'undefined') return empty
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return empty
    }
    const shape = parsed as StoredShape
    return {
      events: shape.events ?? {},
      outcomes: shape.outcomes ?? {},
    }
  } catch {
    return empty
  }
}

function writeStored(state: Required<StoredShape>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // A full or unavailable store degrades to session-only memory, which is
    // still better than refusing the pin the navigation depends on.
  }
}

function evict<T>(entries: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(entries)
  if (keys.length <= max) return entries
  for (const stale of keys.slice(0, keys.length - max)) delete entries[stale]
  return entries
}

type PredictionDirectoryStore = {
  /** Normalized pair key → the event it names. */
  events: Record<string, PredictionEventEntry>
  /** Normalized outcome key → the answer it names. */
  outcomes: Record<string, PredictionOutcomeEntry>
  /** Pin an event. Called BEFORE navigation, never after. */
  registerEvent: (pairKey: string, entry: PredictionEventEntry) => void
  /** Pin one answer. Called wherever an outcome key is about to travel alone. */
  registerOutcome: (outcomeKey: string, entry: PredictionOutcomeEntry) => void
  clear: () => void
}

export const usePredictionDirectoryStore = create<PredictionDirectoryStore>(
  (set) => ({
    ...readStored(),
    registerEvent: (pairKey, entry) =>
      set((s) => {
        const key = normalizePairKey(pairKey)
        if (!key) return s
        // Identical re-pins are common (the same row selected twice); handing
        // back the same object keeps subscribed rows from re-rendering.
        if (eventsEqual(s.events[key], entry)) return s
        const events = evict({ ...s.events, [key]: entry }, MAX_EVENTS)
        writeStored({ events, outcomes: s.outcomes })
        return { events }
      }),
    registerOutcome: (outcomeKey, entry) =>
      set((s) => {
        const key = normalizePairKey(outcomeKey)
        if (!key) return s
        if (outcomesEqual(s.outcomes[key], entry)) return s
        const outcomes = evict({ ...s.outcomes, [key]: entry }, MAX_OUTCOMES)
        writeStored({ events: s.events, outcomes })
        return { outcomes }
      }),
    clear: () =>
      set(() => {
        const empty = { events: {}, outcomes: {} }
        writeStored(empty)
        return empty
      }),
  }),
)

function eventsEqual(
  a: PredictionEventEntry | undefined,
  b: PredictionEventEntry,
): boolean {
  if (!a) return false
  return (
    a.market === b.market &&
    a.eventId === b.eventId &&
    a.title === b.title &&
    a.category === b.category &&
    a.imageUrl === b.imageUrl &&
    a.endMs === b.endMs &&
    a.outcomeCount === b.outcomeCount &&
    a.leader?.pairKey === b.leader?.pairKey &&
    a.leader?.label === b.leader?.label &&
    a.leader?.price === b.leader?.price
  )
}

function outcomesEqual(
  a: PredictionOutcomeEntry | undefined,
  b: PredictionOutcomeEntry,
): boolean {
  if (!a) return false
  return (
    a.market === b.market &&
    a.predictionMarketId === b.predictionMarketId &&
    a.outcome === b.outcome &&
    a.name === b.name &&
    a.shortTitle === b.shortTitle &&
    a.eventTitle === b.eventTitle &&
    a.eventId === b.eventId &&
    a.endMs === b.endMs
  )
}

// ── Reads ────────────────────────────────────────────────────────────────

/** Pin an event from outside React (selection handlers, route effects). */
export function registerPredictionEvent(
  pairKey: string,
  entry: PredictionEventEntry,
): void {
  usePredictionDirectoryStore.getState().registerEvent(pairKey, entry)
}

/** Pin one answer from outside React. */
export function registerPredictionOutcome(
  outcomeKey: string,
  entry: PredictionOutcomeEntry,
): void {
  usePredictionDirectoryStore.getState().registerOutcome(outcomeKey, entry)
}

/** Non-reactive read — the event this pair key names, or null. */
export function lookupPredictionEvent(
  pairKey: string,
): PredictionEventEntry | null {
  return (
    usePredictionDirectoryStore.getState().events[normalizePairKey(pairKey)] ??
    null
  )
}

/** Non-reactive read — the answer this outcome key names, or null. */
export function lookupPredictionOutcome(
  outcomeKey: string,
): PredictionOutcomeEntry | null {
  return (
    usePredictionDirectoryStore.getState().outcomes[
      normalizePairKey(outcomeKey)
    ] ?? null
  )
}

/** Reactive read for a row that must repaint when the pin lands. */
export function usePredictionEventEntry(
  pairKey: string,
): PredictionEventEntry | null {
  return usePredictionDirectoryStore(
    (s) => s.events[normalizePairKey(pairKey)] ?? null,
  )
}

/** Reactive read of one answer. */
export function usePredictionOutcome(
  outcomeKey: string,
): PredictionOutcomeEntry | null {
  return usePredictionDirectoryStore(
    (s) => s.outcomes[normalizePairKey(outcomeKey)] ?? null,
  )
}

/**
 * Which map an entry came from.
 *
 * `outcomeCount` rather than `eventId`: an outcome entry names the event it
 * belongs to, so `eventId` is present on both and narrows nothing.
 */
export function isPredictionEventEntry(
  entry: PredictionEventEntry | PredictionOutcomeEntry,
): entry is PredictionEventEntry {
  return 'outcomeCount' in entry
}

/**
 * Whether this pair key is a prediction at all, by either reading.
 *
 * The event map answers for a pair; the outcome map covers a leg that a
 * position row or a notification is still holding on its own.
 */
export function usePredictionPin(
  pairKey: string,
): PredictionEventEntry | PredictionOutcomeEntry | null {
  return usePredictionDirectoryStore((s) => {
    const key = normalizePairKey(pairKey)
    return s.events[key] ?? s.outcomes[key] ?? null
  })
}
