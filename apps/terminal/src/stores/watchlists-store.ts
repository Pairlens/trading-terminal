// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import { DEFAULT_WATCHLIST_ID } from '@pairlens/persistence'
import {
  formatInstrumentRef,
  parseInstrumentRef,
} from '@pairlens/shared/market-ref'
import type { PersistenceAdapter, WatchlistsState } from '@pairlens/persistence'
import type { InstrumentRef } from '@pairlens/shared/market-ref'
import { legacySymbolToInstrumentRef } from '@/lib/market-ref/legacy'
import { track } from '@/lib/analytics-events'
import {
  TOP_CRYPTO_WATCHLIST_ID,
  createStarterLists,
  seedStarterAssetClasses,
} from '@/lib/starter-watchlists'

/**
 * What callers may hand the watchlist. A ref when the caller has a row (which
 * is the only way a token or an outcome can be identified correctly), a bare
 * symbol for the surfaces that genuinely only hold one.
 */
export type WatchlistTarget = InstrumentRef | string

function asInstrumentRef(target: WatchlistTarget): InstrumentRef {
  return typeof target === 'string'
    ? legacySymbolToInstrumentRef(target)
    : target
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * First-run state: an empty Favorites plus the starter lists, opened on Top
 * Crypto so the pane shows live markets instead of the empty state. The
 * starters are ordinary lists — deleting one persists and it stays gone.
 */
function createDefaultState(): WatchlistsState {
  return {
    activeListId: TOP_CRYPTO_WATCHLIST_ID,
    lists: [
      { id: DEFAULT_WATCHLIST_ID, name: 'Favorites', symbols: [] },
      ...createStarterLists(),
    ],
  }
}

/**
 * What a stored entry names. Entries are serialized `InstrumentRef`s
 * (`spot:BTC-USDT`, `dex:base:0x532f…-WETH`); bare symbols left by earlier
 * builds are upgraded on read, exactly as recents does, so no list is ever
 * dropped and the persisted shape (`Array<string>`) never changed.
 */
export function readWatchlistEntry(entry: string): InstrumentRef {
  return parseInstrumentRef(entry) ?? legacySymbolToInstrumentRef(entry)
}

/**
 * The canonical key for "is this watched".
 *
 * Refs, not symbols, because for the venue-bound arms the id is an address or
 * a venue-native key while the row still DISPLAYS a ticker. Comparing tickers
 * is what let one PEPE's star light up for a different PEPE.
 */
function buildWatchedRefs(state: WatchlistsState): Set<string> {
  return new Set(
    state.lists.flatMap((l) =>
      l.symbols.map((entry) => formatInstrumentRef(readWatchlistEntry(entry))),
    ),
  )
}

/**
 * Display-level symbols, kept for the surfaces that only have a ticker to
 * check against (a catalog row with no chain, a bare pair key from prose).
 * For spot, perp and stocks the id IS the symbol, so this stays exact; it is
 * the token and prediction rows that need `watchedRefs` instead.
 */
function buildAllSymbolsSet(state: WatchlistsState): Set<string> {
  return new Set(
    state.lists.flatMap((l) => l.symbols.map((e) => readWatchlistEntry(e).id)),
  )
}

/**
 * Migrates from the legacy `pair-picker.favorites` localStorage key
 * to the new multi-list format. Returns null if nothing to migrate.
 *
 * A legacy user has never seen a multi-list watchlist either, so they get the
 * starter lists alongside their own favorites — which stay the active list.
 */
function migrateFromLegacy(): WatchlistsState | null {
  try {
    const raw = localStorage.getItem('pairlens:pair-picker.favorites')
    if (raw) {
      const symbols = JSON.parse(raw) as Array<string>
      if (Array.isArray(symbols) && symbols.length > 0) {
        localStorage.removeItem('pairlens:pair-picker.favorites')
        return {
          activeListId: DEFAULT_WATCHLIST_ID,
          lists: [
            { id: DEFAULT_WATCHLIST_ID, name: 'Favorites', symbols },
            ...createStarterLists(),
          ],
        }
      }
    }
  } catch {
    // ignore
  }
  return null
}

type WatchlistsStore = {
  // State
  state: WatchlistsState
  loaded: boolean
  dialog: { open: boolean; target: InstrumentRef | null }

  // Derived (recomputed in actions, stored for O(1) lookups)
  allSymbolsSet: Set<string>
  watchedRefs: Set<string>

  // Internal refs (not reactive)
  _persistence: PersistenceAdapter | null
  _userId: string | null
  _unsub: (() => void) | null
  _selfUpdate: boolean

  // Actions
  init: (persistence: PersistenceAdapter, userId: string) => Promise<void>
  dispose: () => void
  addToWatchlist: (target: WatchlistTarget, listIds: Array<string>) => void
  removeFromWatchlist: (target: WatchlistTarget, listId: string) => void
  reorderSymbols: (fromIndex: number, toIndex: number) => void
  setActiveList: (listId: string) => void
  createList: (name: string) => string
  deleteList: (listId: string) => void
  renameList: (listId: string, name: string) => void
  openAddDialog: (target: WatchlistTarget) => void
  closeDialog: () => void
}

function persist(store: WatchlistsStore) {
  if (store._persistence && store._userId) {
    store._selfUpdate = true
    void store._persistence
      .setWatchlists(store._userId, store.state)
      .finally(() => {
        store._selfUpdate = false
      })
  }
}

export const useWatchlistsStore = create<WatchlistsStore>((set, get) => ({
  state: createDefaultState(),
  loaded: false,
  dialog: { open: false, target: null },
  allSymbolsSet: new Set(),
  watchedRefs: new Set(),
  _persistence: null,
  _userId: null,
  _unsub: null,
  _selfUpdate: false,

  async init(persistence, userId) {
    // Clean up previous subscription
    get()._unsub?.()

    let loaded = await persistence.getWatchlists(userId)

    // Promote anonymous watchlist on first sign-in: if nothing exists
    // for this userId but there IS data under 'local', adopt it.
    if (!loaded && userId !== 'local') {
      const localData = await persistence.getWatchlists('local')
      if (localData) {
        await persistence.setWatchlists(userId, localData)
        loaded = localData
      }
    }

    // Try legacy migration if nothing persisted
    if (!loaded) {
      const migrated = migrateFromLegacy()
      if (migrated) {
        seedStarterAssetClasses()
        await persistence.setWatchlists(userId, migrated)
        loaded = migrated
      }
    }

    // First run for this user: hand them the starter lists and persist right
    // away, so removing one is permanent instead of being re-seeded on reload.
    let state = loaded
    if (!state) {
      state = createDefaultState()
      seedStarterAssetClasses()
      await persistence.setWatchlists(userId, state)
    }

    // Subscribe to external updates (skip self-triggered events)
    const unsub = persistence.subscribeWatchlists(userId, (externalState) => {
      if (get()._selfUpdate) return
      set({
        state: externalState,
        allSymbolsSet: buildAllSymbolsSet(externalState),
        watchedRefs: buildWatchedRefs(externalState),
      })
    })

    set({
      state,
      loaded: true,
      allSymbolsSet: buildAllSymbolsSet(state),
      watchedRefs: buildWatchedRefs(state),
      _persistence: persistence,
      _userId: userId,
      _unsub: unsub,
    })
  },

  dispose() {
    get()._unsub?.()
    set({ _unsub: null, _persistence: null, _userId: null })
  },

  addToWatchlist(target, listIds) {
    const store = get()
    const ref = asInstrumentRef(target)
    const key = formatInstrumentRef(ref)
    const listIdSet = new Set(listIds)
    const nextLists = store.state.lists.map((l) => {
      // Compare by REF, not by stored string: a list still holding the legacy
      // bare symbol for this instrument already has it, and appending the
      // qualified form beside it would show the row twice.
      const already = l.symbols.some(
        (entry) => formatInstrumentRef(readWatchlistEntry(entry)) === key,
      )
      if (listIdSet.has(l.id) && !already) {
        return { ...l, symbols: [...l.symbols, key] }
      }
      return l
    })
    const nextState = { ...store.state, lists: nextLists }
    set({
      state: nextState,
      allSymbolsSet: buildAllSymbolsSet(nextState),
      watchedRefs: buildWatchedRefs(nextState),
    })
    persist(get())
    track('watchlist_changed', { action: 'added' })
  },

  removeFromWatchlist(target, listId) {
    const store = get()
    const key = formatInstrumentRef(asInstrumentRef(target))
    const nextLists = store.state.lists.map((l) =>
      l.id === listId
        ? {
            ...l,
            // By ref, so removing works whether the entry was stored
            // qualified or is still a legacy bare symbol.
            symbols: l.symbols.filter(
              (entry) => formatInstrumentRef(readWatchlistEntry(entry)) !== key,
            ),
          }
        : l,
    )
    const nextState = { ...store.state, lists: nextLists }
    set({
      state: nextState,
      allSymbolsSet: buildAllSymbolsSet(nextState),
      watchedRefs: buildWatchedRefs(nextState),
    })
    persist(get())
    track('watchlist_changed', { action: 'removed' })
  },

  reorderSymbols(fromIndex, toIndex) {
    const store = get()
    const nextLists = store.state.lists.map((l) => {
      if (l.id !== store.state.activeListId) return l
      const next = [...l.symbols]
      const [moved] = next.splice(fromIndex, 1)
      if (moved !== undefined) next.splice(toIndex, 0, moved)
      return { ...l, symbols: next }
    })
    const nextState = { ...store.state, lists: nextLists }
    set({ state: nextState })
    persist(get())
  },

  setActiveList(listId) {
    const store = get()
    set({ state: { ...store.state, activeListId: listId } })
    persist(get())
  },

  createList(name) {
    const id = generateId()
    const store = get()
    const nextState = {
      ...store.state,
      activeListId: id,
      lists: [...store.state.lists, { id, name, symbols: [] }],
    }
    set({ state: nextState })
    persist(get())
    return id
  },

  deleteList(listId) {
    if (listId === DEFAULT_WATCHLIST_ID) return
    const store = get()
    if (store.state.lists.length <= 1) return
    const nextLists = store.state.lists.filter((l) => l.id !== listId)
    const nextState = {
      ...store.state,
      activeListId:
        store.state.activeListId === listId
          ? nextLists[0].id
          : store.state.activeListId,
      lists: nextLists,
    }
    set({
      state: nextState,
      allSymbolsSet: buildAllSymbolsSet(nextState),
    })
    persist(get())
  },

  renameList(listId, name) {
    if (listId === DEFAULT_WATCHLIST_ID) return
    const store = get()
    const nextLists = store.state.lists.map((l) =>
      l.id === listId ? { ...l, name } : l,
    )
    set({ state: { ...store.state, lists: nextLists } })
    persist(get())
  },

  openAddDialog(target) {
    set({ dialog: { open: true, target: asInstrumentRef(target) } })
  },

  closeDialog() {
    set({ dialog: { open: false, target: null } })
  },
}))
