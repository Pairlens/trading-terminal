// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The assistant's pointing finger ──────────────────────────────────
//
// The assistant can say "I added the indicators to your chart", and the
// user still has to find the chart. This is the other half of that
// sentence: a glow the assistant puts on the thing it is talking about.
//
// Two halves, deliberately decoupled:
//
//   TARGETS are published by whatever is mounted. A pane registers on
//   mount and withdraws on unmount, exactly like an assistant surface,
//   so the model is only ever offered somewhere that exists on screen.
//
//   The REQUEST is one id and an expiry. It is stored, not dispatched,
//   and targets PULL from it. That is the whole design: `navigate_to`
//   lights a target that will not mount until the route has swapped,
//   and a pushed event would fire into an empty tree and be lost.
//
// One lit target at a time. A spotlight that can point at four things
// is a christmas tree, and the user learns to ignore it.

import { create } from 'zustand'

/** How long a glow stays up before it retires itself. */
export const SPOTLIGHT_DURATION_MS = 6000

/**
 * The shell frame. Always mounted, which is what makes it the safe
 * landing spot for a navigation: whatever else the assistant just did,
 * this target is there to catch the glow on the other side.
 */
export const SHELL_SPOTLIGHT_ID = 'shell'

/** The indicator workbench's code editor, tabs included. */
export const SCRIPT_EDITOR_SPOTLIGHT_ID = 'script-editor'

/** A place the assistant can point at, published by the thing itself. */
export type SpotlightTarget = {
  /**
   * Stable and model-facing: it becomes a value in the tool's enum, so
   * it reads as an identifier a human would recognise (`pane:chart`,
   * `script-editor`, `shell`).
   */
  id: string
  /** Translated, for anything the user reads. */
  label: string
  /** One line telling the model when pointing here is the right move. */
  description: string
}

type SpotlightRequest = {
  targetId: string
  /** Epoch ms. Past it, nothing is lit. */
  expiresAt: number
}

type AiSpotlightStore = {
  /**
   * Keyed by REGISTRATION, not by target id. Two chart panes publish the
   * same `pane:chart` id on purpose (it is what the model reads, and it
   * has to stay legible), so keying by id would have the second one's
   * unmount withdraw the first one's entry and leave a mounted pane
   * unlisted. The key is per-instance; `listSpotlightTargets` dedupes.
   */
  targets: Record<string, SpotlightTarget>
  request: SpotlightRequest | null
  /** `key` is unique per mounted instance; the target's own id is not. */
  registerTarget: (key: string, target: SpotlightTarget) => () => void
  /**
   * Light a target. Refuses an id nobody publishes unless `pending` is
   * set, which is the navigation case: the page whose targets we are
   * lighting has not rendered yet.
   */
  highlight: (
    targetId: string,
    options?: { durationMs?: number; pending?: boolean },
  ) => boolean
  clear: () => void
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null

export const useAiSpotlightStore = create<AiSpotlightStore>((set, get) => ({
  targets: {},
  request: null,

  registerTarget: (key, target) => {
    set((state) => ({ targets: { ...state.targets, [key]: target } }))

    return () => {
      set((state) => {
        // Only withdraw our own registration: a remount under the same
        // key may already have replaced it.
        if (state.targets[key] !== target) return state
        const { [key]: _gone, ...rest } = state.targets
        return { targets: rest }
      })
    }
  },

  highlight: (targetId, options) => {
    const durationMs = options?.durationMs ?? SPOTLIGHT_DURATION_MS

    // A request for something nobody publishes is refused rather than
    // stored. The model gets told, and it can navigate and try again
    // instead of narrating a glow the user never saw. The one caller
    // that legitimately points into the future opts in with `pending`.
    const mounted = Object.values(get().targets).some(
      (target) => target.id === targetId,
    )
    if (!options?.pending && !mounted) return false

    if (expiryTimer) clearTimeout(expiryTimer)
    set({ request: { targetId, expiresAt: Date.now() + durationMs } })

    expiryTimer = setTimeout(() => {
      expiryTimer = null
      // Guard against retiring a newer request: `highlight` called again
      // inside the window replaces the timer, but a slow timer that
      // already fired must not clear what came after it.
      const current = get().request
      if (current && current.expiresAt <= Date.now()) set({ request: null })
    }, durationMs)

    return true
  },

  clear: () => {
    if (expiryTimer) clearTimeout(expiryTimer)
    expiryTimer = null
    set({ request: null })
  },
}))

// ── Imperative reads, for the tool layer ─────────────────────────────

/**
 * Light a target that has not mounted yet, for the navigation path: the
 * page being opened has not rendered its targets at the moment the tool
 * runs, so the request has to wait for them.
 *
 * The expiry is what keeps this honest. If the target never arrives the
 * request lapses, rather than lying in wait to light something minutes
 * later on a page the user has since walked to themselves.
 */
export function requestPendingSpotlight(
  targetId: string,
  durationMs?: number,
): void {
  useAiSpotlightStore
    .getState()
    .highlight(targetId, { durationMs, pending: true })
}

/**
 * Dev-only handle for tuning the glow without a signed-in model behind
 * it: `__pairlensSpotlight.highlight('pane:chart')` from the console.
 *
 * It has to be a global rather than an import, because importing this
 * module fresh from the console forks Vite's module graph and hands you
 * a SECOND store that nothing on screen is subscribed to.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.assign(window, {
    __pairlensSpotlight: {
      highlight: (id: string) => useAiSpotlightStore.getState().highlight(id),
      list: () => listSpotlightTargets(),
      clear: () => useAiSpotlightStore.getState().clear(),
    },
  })
}

/**
 * Every distinct target on screen right now, for building the tool's
 * enum. Deduped by id: two chart panes are one thing to point at, and
 * offering the model the same value twice reads as a bug.
 */
export function listSpotlightTargets(): Array<SpotlightTarget> {
  const byId = new Map<string, SpotlightTarget>()
  for (const target of Object.values(useAiSpotlightStore.getState().targets)) {
    if (!byId.has(target.id)) byId.set(target.id, target)
  }
  return [...byId.values()]
}
