// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the NFT Discovery board is currently looking at.
 *
 * Five panes on that board answer the same question from different angles: the
 * chain rail, the rankings table, the floor movers, the mint watch and the
 * whale tape. Picking Base in the rail has to narrow all five. They are
 * siblings in a layout tree with no common ancestor of their own (the layout
 * reducer owns everything above them), so a React context would have to be
 * mounted around the whole workspace for one board's benefit.
 *
 * A module-level store instead, and deliberately NOT persisted: it is a view
 * over a five-minute cache, and a chain chosen last week restoring itself over
 * an empty board is a bug report rather than a convenience.
 *
 * Same shape and same reasoning as the prediction board's filter store.
 */
import { create } from 'zustand'

import type { NftChain, NftCollectionSort } from '@pairlens/shared/nft-types'

type NftFilterStore = {
  /** Chain to scope every pane to. Never null: NFT data is chain-scoped at the provider, so "all chains" would be a fan-out the panes cannot page. */
  chain: NftChain
  /** Ranking axis the collections table is sorted by. */
  sort: NftCollectionSort
  /** Free-text search the rankings table's input owns. */
  query: string
  setChain: (chain: NftChain) => void
  setSort: (sort: NftCollectionSort) => void
  setQuery: (query: string) => void
}

export const useNftFilterStore = create<NftFilterStore>((set) => ({
  chain: 'ethereum',
  sort: 'volume24h',
  query: '',
  setChain: (chain) => set({ chain }),
  setSort: (sort) => set({ sort }),
  setQuery: (query) => set({ query }),
}))

/** Reactive read of the chain alone: the rail and every pane that follows it. */
export function useNftChainFilter(): NftChain {
  return useNftFilterStore((s) => s.chain)
}
