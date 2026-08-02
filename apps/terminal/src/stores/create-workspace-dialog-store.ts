// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

/**
 * Global open-state for the create-workspace dialog (rendered by the
 * workspace tree sidebar) so surfaces like the omni search palette can
 * trigger it from anywhere.
 */
type CreateWorkspaceDialogStore = {
  isOpen: boolean
  open: () => void
  setOpen: (open: boolean) => void
}

export const useCreateWorkspaceDialogStore = create<CreateWorkspaceDialogStore>(
  (set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    setOpen: (open) => set({ isOpen: open }),
  }),
)
