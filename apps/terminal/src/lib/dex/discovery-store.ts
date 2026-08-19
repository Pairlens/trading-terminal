// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the DEX discovery board has selected: a chain, then a pool.
 *
 * Four panes on that board disagree about nothing except which of them is
 * showing it — the rail picks the chain, the map ranks that chain's pools, the
 * flow strip derives from the selected pool's swaps, and the detail pane
 * summarizes it. Threading a selection through four sibling panes that the
 * layout engine mounts independently is not possible, so it lives here, the
 * same call the workspace-variable store makes.
 *
 * Deliberately NOT persisted. A chain and a pool are a browsing position, and
 * restoring one from last week points the board at a pool that may no longer
 * be the deepest for that pair.
 */
import { create } from 'zustand'

import type { PoolTradeCounts } from '@pairlens/shared/instrument-types'

import { registerDisplayToken } from '@/stores/token-directory-store'

/**
 * What the map row already published about the pool it selected.
 *
 * The selection carries it because the alternative is a detail pane that sits
 * blank next to a tile showing the very numbers it is waiting for. The listing
 * behind that tile publishes price, 24h change, volume, value locked and trade
 * counts for every pool on the page; dropping them on selection and then
 * spending two provider requests to fetch them again is a round trip the
 * reader watches, on the tightest request budget in the app, and one the
 * provider refuses outright when it is rate limiting.
 *
 * It is a snapshot, not live state: the detail pane draws it immediately and
 * replaces it wholesale the moment the pool read lands. Fields are never mixed
 * across the two, so nothing on screen is ever half one measurement and half
 * another.
 */
export type SelectedPoolSnapshot = {
  priceUsd: number | null
  change24hPct: number | null
  volume24hUsd: number | null
  reserveUsd: number | null
  trades24h: PoolTradeCounts | null
  fdvUsd: number | null
}

export type SelectedPool = {
  /** Pairlens market id of the chain the pool is on. */
  market: string
  address: string
  name: string
  dexName: string
  /** Base token address, so opening the pair pins identity rather than a ticker. */
  baseAddress: string | null
  baseSymbol: string | null
  quoteSymbol: string | null
  /** The listing row's own figures. See SelectedPoolSnapshot. */
  listed: SelectedPoolSnapshot
}

type DexDiscoveryStore = {
  /** Pairlens market id, or null until the rail resolves its first chain. */
  chain: string | null
  selectedPool: SelectedPool | null
  /**
   * Whether the selection came from a click rather than from the map seeding
   * itself. The one bit that keeps auto-selection from fighting the user: once
   * this is set, nothing but another click or a chain switch moves the pool.
   */
  userPicked: boolean
  setChain: (market: string) => void
  selectPool: (pool: SelectedPool | null) => void
  autoSelectPool: (pool: SelectedPool) => void
}

export const useDexDiscoveryStore = create<DexDiscoveryStore>((set) => ({
  chain: null,
  selectedPool: null,
  userPicked: false,
  // Changing chain clears the pool: a pool address is meaningless on another
  // chain, and leaving it would have the detail pane describe a pool the map
  // beside it is no longer listing. The map then seeds the new chain's top
  // pool, so the board never sits on two empty panes waiting for a click.
  setChain: (market) =>
    set({ chain: market, selectedPool: null, userPicked: false }),
  selectPool: (pool) => {
    pinPoolToken(pool)
    set({ selectedPool: pool, userPicked: pool !== null })
  },
  /**
   * The map's own default, applied when the listing lands.
   *
   * Guarded here rather than only at the call site because two panes can be
   * mounted against this store and a discovery board is worth exactly one
   * default. A user selection is never overwritten: the guard is the whole
   * contract.
   */
  autoSelectPool: (pool) => {
    pinPoolToken(pool)
    set((state) => (state.userPicked ? state : { selectedPool: pool }))
  },
}))

/**
 * Teach the token directory what this pool's base token is called.
 *
 * The board is where a long-tail token is usually met, and the chart it opens
 * routes on `address-QUOTE`: without this the pool row reads `PEPE / WETH` and
 * the chart it opens is titled `0x6982…1933-WETH`. The pool listing already
 * carries both halves; nothing but this was writing them down.
 *
 * Display-only, which is why the auto-selected pool pins too. The connector's
 * own `symbol → address` directory is identity — it decides which PEPE a swap
 * buys — and stays written by an explicit user selection alone.
 */
function pinPoolToken(pool: SelectedPool | null): void {
  if (!pool?.baseAddress || !pool.baseSymbol) return
  registerDisplayToken({
    chain: pool.market,
    address: pool.baseAddress,
    symbol: pool.baseSymbol,
  })
}
