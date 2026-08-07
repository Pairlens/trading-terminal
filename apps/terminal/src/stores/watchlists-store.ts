// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import { DEFAULT_WATCHLIST_ID } from '@pairlens/persistence'
import type { PersistenceAdapter, WatchlistsState } from '@pairlens/persistence'
import { track } from '@/lib/analytics-events'
import {
  TOP_CRYPTO_WATCHLIST_ID,
  createStarterLists,
  seedStarterAssetClasses,
} from '@/lib/starter-watchlists'

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

function buildAllSymbolsSet(state: WatchlistsState): Set<string> {
  return new Set(state.lists.flatMap((l) => l.symbols))
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
  dialog: { open: boolean; symbol: string | null }

  // Derived (recomputed in actions, stored for O(1) lookups)
  allSymbolsSet: Set<string>

  // Internal refs (not reactive)
  _persistence: PersistenceAdapter | null
  _userId: string | null
  _unsub: (() => void) | null
  _selfUpdate: boolean

  // Actions
  init: (persistence: PersistenceAdapter, userId: string) => Promise<void>
  dispose: () => void
  addToWatchlist: (symbol: string, listIds: Array<string>) => void
  removeFromWatchlist: (symbol: string, listId: string) => void
  reorderSymbols: (fromIndex: number, toIndex: number) => void
  setActiveList: (listId: string) => void
  createList: (name: string) => string
  deleteList: (listId: string) => void
  renameList: (listId: string, name: string) => void
  openAddDialog: (symbol: string) => void
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
  dialog: { open: false, symbol: null },
  allSymbolsSet: new Set(),
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
      })
    })

    set({
      state,
      loaded: true,
      allSymbolsSet: buildAllSymbolsSet(state),
      _persistence: persistence,
      _userId: userId,
      _unsub: unsub,
    })
  },

  dispose() {
    get()._unsub?.()
    set({ _unsub: null, _persistence: null, _userId: null })
  },

  addToWatchlist(symbol, listIds) {
    const store = get()
    const listIdSet = new Set(listIds)
    const nextLists = store.state.lists.map((l) => {
      if (listIdSet.has(l.id) && !l.symbols.includes(symbol)) {
        return { ...l, symbols: [...l.symbols, symbol] }
      }
      return l
    })
    const nextState = { ...store.state, lists: nextLists }
    set({
      state: nextState,
      allSymbolsSet: buildAllSymbolsSet(nextState),
    })
    persist(get())
    track('watchlist_changed', { action: 'added' })
  },

  removeFromWatchlist(symbol, listId) {
    const store = get()
    const nextLists = store.state.lists.map((l) =>
      l.id === listId
        ? { ...l, symbols: l.symbols.filter((s) => s !== symbol) }
        : l,
    )
    const nextState = { ...store.state, lists: nextLists }
    set({
      state: nextState,
      allSymbolsSet: buildAllSymbolsSet(nextState),
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

  openAddDialog(symbol) {
    set({ dialog: { open: true, symbol } })
  },

  closeDialog() {
    set({ dialog: { open: false, symbol: null } })
  },
}))
