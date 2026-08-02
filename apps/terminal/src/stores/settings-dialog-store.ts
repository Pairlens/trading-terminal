// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

type SettingsDialogStore = {
  isOpen: boolean
  /** Section to navigate to when the dialog opens (e.g. 'region'). */
  section: string | null
  open: (section?: string) => void
  close: () => void
}

export const useSettingsDialogStore = create<SettingsDialogStore>((set) => ({
  isOpen: false,
  section: null,
  open: (section) => set({ isOpen: true, section: section ?? null }),
  close: () => set({ isOpen: false, section: null }),
}))
