// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

/**
 * The assistant dock's open/closed state, plus the one-shot bus any
 * surface uses to hand the assistant a prompt.
 *
 * The dock is mounted for the whole session and never unmounts, so
 * "closed" here means collapsed to the orb — a run in flight keeps
 * going, and reopening shows it mid-stream. That is the whole point of
 * living outside the content area.
 */
export type AssistantSeed = {
  prompt: string
  /**
   * Sends the prompt as soon as the dock opens. Defaults to true: the
   * callers are buttons that already say what they will ask for, and a
   * button that opens a chat and then waits reads as broken.
   */
  send?: boolean
}

type AssistantStore = {
  isOpen: boolean
  /** Consumed once by the dock, then cleared. */
  seed: AssistantSeed | null
  /** Bumped to pull focus into the composer. */
  focusSignal: number
  open: (seed?: AssistantSeed) => void
  close: () => void
  toggle: () => void
  consumeSeed: () => AssistantSeed | null
}

export const useAssistantStore = create<AssistantStore>((set, get) => ({
  isOpen: false,
  seed: null,
  focusSignal: 0,
  open: (seed) =>
    set((state) => ({
      isOpen: true,
      seed: seed ?? state.seed,
      focusSignal: state.focusSignal + 1,
    })),
  close: () => set({ isOpen: false }),
  toggle: () =>
    set((state) =>
      state.isOpen
        ? { isOpen: false }
        : { isOpen: true, focusSignal: state.focusSignal + 1 },
    ),
  consumeSeed: () => {
    const { seed } = get()
    if (seed) set({ seed: null })
    return seed
  },
}))

/**
 * Open the assistant from anywhere — an empty state, a menu item, a
 * pane header. Replaces the per-surface `requestAssistant` intents:
 * there is only one assistant now, so there is only one door.
 */
export function askAssistant(prompt: string, options?: { send?: boolean }) {
  useAssistantStore.getState().open({ prompt, send: options?.send ?? true })
}
