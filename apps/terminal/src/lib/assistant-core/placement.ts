// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Where the assistant lives on screen ──────────────────────────────
//
// Two placements, because the orb is answering two different needs.
// Floating bottom-right, it is an invitation: the suggestion is always
// readable, which is what makes the assistant discoverable. Docked in
// the nav rail it is a tool among tools, always in the same place, and
// the suggestion only appears when asked for or when there is something
// to report.
//
// The chat window follows the orb, and then the user can drag it
// anywhere they like from there.

import { usePersistedState } from '@/hooks/use-persisted-state'

export type AssistantPlacement = 'floating' | 'sidebar'

export const ASSISTANT_PLACEMENT_KEY = 'assistant.placement'

export const DEFAULT_ASSISTANT_PLACEMENT: AssistantPlacement = 'floating'

/**
 * Read live in several places at once (the shell's nav rail, the dock,
 * the settings section). `usePersistedState` mirrors writes across every
 * instance of a key, so switching it in settings moves the orb without
 * a reload.
 */
export function useAssistantPlacement(): [
  AssistantPlacement,
  (value: AssistantPlacement) => void,
] {
  const [placement, setPlacement] = usePersistedState<AssistantPlacement>(
    ASSISTANT_PLACEMENT_KEY,
    DEFAULT_ASSISTANT_PLACEMENT,
  )
  // A catalog that ever gains a third value must not strand a user on a
  // placement this build cannot render.
  const safe: AssistantPlacement =
    placement === 'sidebar' || placement === 'floating'
      ? placement
      : DEFAULT_ASSISTANT_PLACEMENT
  return [safe, setPlacement]
}
