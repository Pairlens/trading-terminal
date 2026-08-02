// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

/**
 * Bridge between the omni search palette (mounted outside any layout) and
 * the route-scoped LayoutProvider. Selecting a pane in the palette records
 * a request here; the active LayoutProvider consumes it and enters the
 * add-pane placement mode.
 */
type PaneAddRequestStore = {
  requestedPaneType: string | null
  requestPane: (type: string) => void
  clear: () => void
}

export const usePaneAddRequestStore = create<PaneAddRequestStore>((set) => ({
  requestedPaneType: null,
  requestPane: (type) => set({ requestedPaneType: type }),
  clear: () => set({ requestedPaneType: null }),
}))
