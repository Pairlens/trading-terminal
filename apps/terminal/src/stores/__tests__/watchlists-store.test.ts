// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

import { DEFAULT_WATCHLIST_ID } from '@pairlens/persistence'

import { readWatchlistEntry, useWatchlistsStore } from '../watchlists-store'
import type { PersistenceAdapter, WatchlistsState } from '@pairlens/persistence'
import {
  TOP_CRYPTO_WATCHLIST_ID,
  TOP_EQUITIES_WATCHLIST_ID,
} from '@/lib/starter-watchlists'

// Minimal localStorage backing — the store reads the legacy favorites key and
// the starter seeding writes the asset-class map.
const backing = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, String(v))
    },
    removeItem: (k: string) => {
      backing.delete(k)
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size
    },
  } as Storage
}

function createFakePersistence(seed?: Record<string, WatchlistsState>) {
  const store = new Map<string, WatchlistsState>(Object.entries(seed ?? {}))
  const adapter = {
    getWatchlists: async (userId: string) => store.get(userId) ?? null,
    setWatchlists: async (userId: string, state: WatchlistsState) => {
      store.set(userId, state)
    },
    subscribeWatchlists: () => () => {},
  }
  return { adapter: adapter as unknown as PersistenceAdapter, store }
}

const listIds = (state: WatchlistsState) => state.lists.map((l) => l.id)

beforeEach(() => {
  localStorage.clear()
  useWatchlistsStore.getState().dispose()
})

describe('watchlists store — starter lists', () => {
  it('seeds Favorites plus both starter lists on first run', async () => {
    const { adapter, store } = createFakePersistence()

    await useWatchlistsStore.getState().init(adapter, 'local')

    const state = useWatchlistsStore.getState().state
    expect(listIds(state)).toEqual([
      DEFAULT_WATCHLIST_ID,
      TOP_CRYPTO_WATCHLIST_ID,
      TOP_EQUITIES_WATCHLIST_ID,
    ])
    // Opens on a list that actually has markets in it.
    expect(state.activeListId).toBe(TOP_CRYPTO_WATCHLIST_ID)
    // Seeded as qualified refs, so a first-run list is already in the format
    // every reader expects and no entry needs upgrading on first paint.
    expect(state.lists[1].symbols).toContain('spot:BTC-USDT')
    expect(state.lists[2].symbols).toContain('stocks:AAPL')
    expect(readWatchlistEntry(state.lists[1].symbols[0])).toEqual({
      cls: 'spot',
      id: 'BTC-USDT',
    })
    // Persisted immediately, so a later delete has something to overwrite.
    expect(store.get('local')).toEqual(state)
  })

  it('records the asset class of every starter symbol', async () => {
    const { adapter } = createFakePersistence()

    await useWatchlistsStore.getState().init(adapter, 'local')

    const raw = localStorage.getItem('pairlens:pair-picker.assetClassMap')
    const map = JSON.parse(raw ?? '{}') as Record<string, string>
    expect(map['AAPL']).toBe('stocks')
    expect(map['SPY']).toBe('stocks')
    expect(map['BTC-USDT']).toBe('crypto')
  })

  it('keeps a deleted starter list deleted across reloads', async () => {
    const { adapter, store } = createFakePersistence()
    await useWatchlistsStore.getState().init(adapter, 'local')

    useWatchlistsStore.getState().deleteList(TOP_EQUITIES_WATCHLIST_ID)
    expect(listIds(store.get('local')!)).not.toContain(
      TOP_EQUITIES_WATCHLIST_ID,
    )

    useWatchlistsStore.getState().dispose()
    await useWatchlistsStore.getState().init(adapter, 'local')

    expect(listIds(useWatchlistsStore.getState().state)).toEqual([
      DEFAULT_WATCHLIST_ID,
      TOP_CRYPTO_WATCHLIST_ID,
    ])
  })

  it('leaves an existing watchlists state untouched', async () => {
    const existing: WatchlistsState = {
      activeListId: DEFAULT_WATCHLIST_ID,
      lists: [
        { id: DEFAULT_WATCHLIST_ID, name: 'Favorites', symbols: ['ETH-USDT'] },
      ],
    }
    const { adapter } = createFakePersistence({ local: existing })

    await useWatchlistsStore.getState().init(adapter, 'local')

    expect(useWatchlistsStore.getState().state).toEqual(existing)
  })

  it('adds the starters alongside migrated legacy favorites', async () => {
    localStorage.setItem(
      'pairlens:pair-picker.favorites',
      JSON.stringify(['SOL-USDT']),
    )
    const { adapter, store } = createFakePersistence()

    await useWatchlistsStore.getState().init(adapter, 'local')

    const state = useWatchlistsStore.getState().state
    expect(state.activeListId).toBe(DEFAULT_WATCHLIST_ID)
    expect(state.lists[0].symbols).toEqual(['SOL-USDT'])
    expect(listIds(state)).toEqual([
      DEFAULT_WATCHLIST_ID,
      TOP_CRYPTO_WATCHLIST_ID,
      TOP_EQUITIES_WATCHLIST_ID,
    ])
    expect(store.get('local')).toEqual(state)
    expect(localStorage.getItem('pairlens:pair-picker.favorites')).toBeNull()
  })

  it('adopts the anonymous state on sign-in instead of re-seeding', async () => {
    const { adapter, store } = createFakePersistence()
    await useWatchlistsStore.getState().init(adapter, 'local')
    useWatchlistsStore.getState().deleteList(TOP_CRYPTO_WATCHLIST_ID)
    const anonymous = store.get('local')!

    useWatchlistsStore.getState().dispose()
    await useWatchlistsStore.getState().init(adapter, 'user-1')

    expect(useWatchlistsStore.getState().state).toEqual(anonymous)
  })
})
