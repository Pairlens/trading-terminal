// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Open state for the "get the desktop app" dialog.
 *
 * The dialog itself is mounted once, by the terminal layout, and used to be
 * driven by local state there — fine while the nav-rail button was the only
 * thing that opened it. The Notifications and Bots nudge is a second opener
 * living several levels down the tree, so the state moved out here rather than
 * being threaded through as a prop, the same call `settings-dialog-store`
 * makes for the settings dialog.
 */
import { create } from 'zustand'

type DesktopCtaStore = {
  isOpen: boolean
  setOpen: (open: boolean) => void
  open: () => void
  close: () => void
}

export const useDesktopCtaStore = create<DesktopCtaStore>((set) => ({
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
