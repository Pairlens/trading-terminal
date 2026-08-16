// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import type { AssistantRunPhase } from '@/lib/assistant-core/run-status'
import type { AssistantOpenSource } from '@/lib/analytics-events'
import { track } from '@/lib/analytics-events'

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

/** Top-left corner of the chat window, in viewport pixels. */
export type AssistantWindowPosition = { x: number; y: number }

const POSITION_KEY = 'pairlens:assistant.windowPosition'

/**
 * A dragged window outlives the session: someone who moved it onto their
 * second monitor's half of the screen meant it. Read synchronously at
 * store creation so the first paint is already in the right place.
 */
function readStoredPosition(): AssistantWindowPosition | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AssistantWindowPosition>
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') {
      return null
    }
    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

type AssistantStore = {
  isOpen: boolean
  /** Consumed once by the dock, then cleared. */
  seed: AssistantSeed | null
  /** Bumped to pull focus into the composer. */
  focusSignal: number
  /**
   * Where the user dragged the window, or null to sit at whichever
   * anchor the current placement implies.
   */
  windowPosition: AssistantWindowPosition | null
  /**
   * What the run is doing, published by the conversation so the orb can
   * report it. It lives here rather than in a context because the orb
   * may be rendered in the nav rail, far from the chat, and a context
   * high enough to reach both would re-render the terminal on every
   * phase change.
   */
  runPhase: AssistantRunPhase
  runToolName: string | null
  open: (seed?: AssistantSeed) => void
  close: () => void
  toggle: () => void
  consumeSeed: () => AssistantSeed | null
  setWindowPosition: (position: AssistantWindowPosition | null) => void
  setRunStatus: (phase: AssistantRunPhase, toolName: string | null) => void
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
  windowPosition: readStoredPosition(),
  runPhase: 'idle',
  runToolName: null,
  setRunStatus: (runPhase, runToolName) => set({ runPhase, runToolName }),
  consumeSeed: () => {
    const { seed } = get()
    if (seed) set({ seed: null })
    return seed
  },
  setWindowPosition: (position) => {
    set({ windowPosition: position })
    try {
      if (position) {
        localStorage.setItem(POSITION_KEY, JSON.stringify(position))
      } else {
        localStorage.removeItem(POSITION_KEY)
      }
    } catch {
      // Private mode, quota, a locked-down profile: the window still
      // moves for this session, it just will not be there next time.
    }
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

/**
 * Toggle from one of the three affordances that exist only to reach the
 * assistant: the orb, the chord, the palette row. The counting lives here
 * rather than in each caller so the collapsed→open transition is recorded
 * once, in one place, and a toggle that only collapses the window is never
 * counted as an open.
 */
export function toggleAssistantFrom(via: AssistantOpenSource) {
  const { isOpen, toggle } = useAssistantStore.getState()
  if (!isOpen) track('assistant_opened', { via })
  toggle()
}

/** Same accounting, for the callers that only ever open. */
export function openAssistantFrom(via: AssistantOpenSource) {
  const { isOpen, open } = useAssistantStore.getState()
  if (!isOpen) track('assistant_opened', { via })
  open()
}
