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
  setChain: (market: string) => void
  selectPool: (pool: SelectedPool | null) => void
}

export const useDexDiscoveryStore = create<DexDiscoveryStore>((set) => ({
  chain: null,
  selectedPool: null,
  // Changing chain clears the pool: a pool address is meaningless on another
  // chain, and leaving it would have the detail pane describe a pool the map
  // beside it is no longer listing.
  setChain: (market) => set({ chain: market, selectedPool: null }),
  selectPool: (pool) => set({ selectedPool: pool }),
}))
