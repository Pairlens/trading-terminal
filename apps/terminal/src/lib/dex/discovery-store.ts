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

import { registerDisplayToken } from '@/stores/token-directory-store'

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
