// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Watchlist entries are qualified refs, not tickers.
 *
 * The hazard this closes: dozens of tokens answer to PEPE, so a watchlist that
 * stored the ticker was really storing "whichever PEPE the catalog resolves
 * today". `TokenInstrument`'s contract forbids exactly that, and everything
 * else in the app moved to refs; this was the last symbol-keyed store.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import { formatInstrumentRef } from '@pairlens/shared/market-ref'
import { DEFAULT_WATCHLIST_ID } from '@pairlens/persistence'

import { readWatchlistEntry, useWatchlistsStore } from '../watchlists-store'
import { entryToInstrumentRef } from '@/lib/market-ref/entry'

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

const PEPE_BASE = '0x532f27101965dd16442e59d40670faf5ebb142e4'
const PEPE_ETH = '0x6982508145454ce325ddbe47a25d4ec3d2311933'

function tokenRow(chain: string, address: string) {
  return {
    symbol: 'PEPE-WETH',
    assetClass: 'dex',
    quote: 'WETH',
    chain,
    address,
  }
}

async function freshStore() {
  const data = new Map<string, unknown>()
  const adapter = {
    getWatchlists: async (id: string) => (data.get(id) ?? null) as never,
    setWatchlists: async (id: string, state: unknown) => {
      data.set(id, state)
    },
    subscribeWatchlists: () => () => {},
  }
  localStorage.clear()
  await useWatchlistsStore.getState().init(adapter as never, 'local')
  return useWatchlistsStore.getState()
}

describe('two tokens with one ticker are two entries', () => {
  beforeEach(async () => {
    await freshStore()
  })

  it('watching PEPE on Base does not watch PEPE on Ethereum', async () => {
    const base = entryToInstrumentRef(tokenRow('base', PEPE_BASE))
    const eth = entryToInstrumentRef(tokenRow('ethereum', PEPE_ETH))

    useWatchlistsStore.getState().addToWatchlist(base, [DEFAULT_WATCHLIST_ID])

    const { watchedRefs } = useWatchlistsStore.getState()
    expect(watchedRefs.has(formatInstrumentRef(base))).toBe(true)
    // The star that used to light up for the wrong token.
    expect(watchedRefs.has(formatInstrumentRef(eth))).toBe(false)
  })

  it('both can be watched at once and removed independently', () => {
    const base = entryToInstrumentRef(tokenRow('base', PEPE_BASE))
    const eth = entryToInstrumentRef(tokenRow('ethereum', PEPE_ETH))
    const store = useWatchlistsStore.getState()

    store.addToWatchlist(base, [DEFAULT_WATCHLIST_ID])
    store.addToWatchlist(eth, [DEFAULT_WATCHLIST_ID])
    expect(useWatchlistsStore.getState().state.lists[0].symbols).toHaveLength(2)

    useWatchlistsStore
      .getState()
      .removeFromWatchlist(base, DEFAULT_WATCHLIST_ID)
    const left = useWatchlistsStore.getState().state.lists[0].symbols
    expect(left).toEqual([formatInstrumentRef(eth)])
  })

  it('the address is what is stored, never the ticker', () => {
    const base = entryToInstrumentRef(tokenRow('base', PEPE_BASE))
    useWatchlistsStore.getState().addToWatchlist(base, [DEFAULT_WATCHLIST_ID])
    const stored = useWatchlistsStore.getState().state.lists[0].symbols[0]
    expect(stored).toContain(PEPE_BASE)
    expect(stored.startsWith('dex:base:')).toBe(true)
  })
})

describe('legacy bare symbols keep working', () => {
  beforeEach(async () => {
    await freshStore()
  })

  it('an entry left by an earlier build reads as a ref', () => {
    expect(readWatchlistEntry('BTC-USDT')).toEqual({
      cls: 'spot',
      id: 'BTC-USDT',
    })
    expect(readWatchlistEntry('AAPL')).toEqual({ cls: 'stocks', id: 'AAPL' })
  })

  /**
   * Adding an instrument a list already holds in its LEGACY form must move
   * nothing: appending the qualified spelling beside the bare one would show
   * the same row twice, and removing either would leave the other behind.
   */
  it('adding an already-watched legacy entry does not duplicate it', () => {
    const store = useWatchlistsStore.getState()
    // Simulate the pre-migration shape.
    store.addToWatchlist('BTC-USDT', [DEFAULT_WATCHLIST_ID])
    store.addToWatchlist({ cls: 'spot', id: 'BTC-USDT' }, [
      DEFAULT_WATCHLIST_ID,
    ])
    expect(useWatchlistsStore.getState().state.lists[0].symbols).toHaveLength(1)
  })

  it('removing works whichever spelling is stored', () => {
    const store = useWatchlistsStore.getState()
    store.addToWatchlist('ETH-USDT', [DEFAULT_WATCHLIST_ID])
    useWatchlistsStore
      .getState()
      .removeFromWatchlist(
        { cls: 'spot', id: 'ETH-USDT' },
        DEFAULT_WATCHLIST_ID,
      )
    expect(useWatchlistsStore.getState().state.lists[0].symbols).toEqual([])
  })
})
