// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

/**
 * Open state for the bring-your-own-key AI setup wizard.
 *
 * It lives in a store rather than inside the button that opens it because the
 * wizard outlives its own trigger: connecting a model provider grants
 * `ai:inference`, the AI gate re-resolves to 'granted', and the gate — button
 * and all — unmounts. Held locally, that took the still-open dialog with it
 * and the optional web-search step could never be reached. Mounted once in
 * `_terminal.tsx` above the shell branch, it survives the swap.
 */
type AiSetupStore = {
  isOpen: boolean
  open: () => void
  setOpen: (isOpen: boolean) => void
}

export const useAiSetupStore = create<AiSetupStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  setOpen: (isOpen) => set({ isOpen }),
}))
