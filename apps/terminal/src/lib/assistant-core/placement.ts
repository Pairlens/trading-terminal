// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Where the assistant lives on screen ──────────────────────────────
//
// Three placements, ordered here from the most conservative to the most
// insistent, because that is also the order the settings card offers
// them in.
//
// Sidebar, the default, docks the orb in the nav rail: a tool among
// tools, always in the same place, and the suggestion only appears when
// asked for or when there is something to report. It ships as the
// default because it is the only one that cannot land on top of
// something a trader was reading.
//
// Bottom puts the orb back in the bottom-right corner, but in a strip
// the shell reserves below the panes. Same corner as floating, none of
// the overlap: it is chrome under the content the way the rail is
// chrome beside it.
//
// Floating is the invitation. The orb and its suggestion sit over the
// bottom-right of the workspace, always readable, easiest to notice,
// and the only placement that covers part of the layout.
//
// The chat window follows the orb, and then the user can drag it
// anywhere they like from there.

import { usePersistedState } from '@/hooks/use-persisted-state'

/**
 * Every placement this build can render, in the order the settings card
 * lists them. Deriving the union from the array rather than the other
 * way round is what makes the settings UI exhaustive: a new placement
 * shows up there without anyone remembering to add it.
 */
export const ASSISTANT_PLACEMENT_VALUES = [
  'sidebar',
  'bottom',
  'floating',
] as const

export type AssistantPlacement = (typeof ASSISTANT_PLACEMENT_VALUES)[number]

export const ASSISTANT_PLACEMENT_KEY = 'assistant.placement'

export const DEFAULT_ASSISTANT_PLACEMENT: AssistantPlacement = 'sidebar'

/**
 * The bottom strip's geometry, both halves in one place. The bar is
 * `fixed`, so it only stays out of the panes because the shell pads
 * itself by exactly the same amount (see routes/_terminal.tsx): let
 * these two drift apart and the orb starts covering the status bar
 * again, which is the whole thing this placement exists to avoid.
 *
 * Literal Tailwind classes, so the JIT can see them.
 */
export const ASSISTANT_BAR = {
  /** The strip itself. 2.75rem: a 2.25rem orb button plus its padding. */
  height: 'h-11',
  /** What the shell reserves for it. Must match `height`. */
  reserve: 'pb-11',
} as const

/**
 * Where the chat window sits before anyone drags it, per placement.
 * Keyed by the union, so a new placement cannot ship without one.
 */
export const ASSISTANT_WINDOW_ANCHOR: Record<AssistantPlacement, string> = {
  // The orb is near the top of the rail, so the window hangs just
  // outside it, top-aligned.
  sidebar: 'left-[4.25rem] top-4',
  // Clear of the strip: 2.75rem of bar plus the same 0.5rem breathing
  // room the other two leave.
  bottom: 'right-4 bottom-[3.25rem]',
  // Grows straight out of the orb it sits above.
  floating: 'right-4 bottom-[3.75rem]',
}

/**
 * A stored value this build does not know about must not strand the
 * user on a placement nothing renders. Pure, so the fallback is
 * testable without a component tree.
 */
export function normalizeAssistantPlacement(
  value: unknown,
): AssistantPlacement {
  return ASSISTANT_PLACEMENT_VALUES.includes(value as AssistantPlacement)
    ? (value as AssistantPlacement)
    : DEFAULT_ASSISTANT_PLACEMENT
}

/**
 * Read live in several places at once (the shell's nav rail and its
 * bottom padding, the dock, the settings section). `usePersistedState`
 * mirrors writes across every instance of a key, so switching it in
 * settings moves the orb without a reload.
 */
export function useAssistantPlacement(): [
  AssistantPlacement,
  (value: AssistantPlacement) => void,
] {
  const [placement, setPlacement] = usePersistedState<AssistantPlacement>(
    ASSISTANT_PLACEMENT_KEY,
    DEFAULT_ASSISTANT_PLACEMENT,
  )
  return [normalizeAssistantPlacement(placement), setPlacement]
}
