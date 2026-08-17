// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the prediction discovery board is currently looking at.
 *
 * Four panes on that board answer the same question from different angles —
 * the category rail, the event board, the movers list and the resolution
 * clock — and picking "Crypto" in the rail has to narrow all four. They are
 * siblings in a layout tree with no common ancestor of their own (the layout
 * reducer owns everything above them), so a React context would have to be
 * mounted around the whole workspace for one board's benefit.
 *
 * A module-level store instead, deliberately NOT persisted: it is a view over
 * a 60-second cache, and a category chosen last week restoring itself over an
 * empty board is a bug report, not a convenience.
 *
 * `query` lives here rather than in the board because the rail shows counts
 * for what the board is showing; the board owns the input, everything else
 * reads the value.
 */
import { create } from 'zustand'

type DiscoveryFilterStore = {
  /** Venue category id, or null for every category. */
  category: string | null
  /** Free-text search the board's input owns. */
  query: string
  setCategory: (category: string | null) => void
  setQuery: (query: string) => void
}

export const useDiscoveryFilterStore = create<DiscoveryFilterStore>((set) => ({
  category: null,
  query: '',
  setCategory: (category) => set({ category }),
  setQuery: (query) => set({ query }),
}))

/** Reactive read of the category alone — the rail and the right-hand panes. */
export function useDiscoveryCategory(): string | null {
  return useDiscoveryFilterStore((s) => s.category)
}
