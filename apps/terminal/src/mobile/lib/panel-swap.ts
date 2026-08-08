// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The rule that makes switching tabs read as ONE sheet changing its mind
 * rather than four sheets taking turns.
 *
 * Panels unmount when their tab is not active — that is the performance
 * budget, and the Trade draft survives it because it lives in a store. But an
 * unmount is instant and a sheet is not: swapping the content in the same
 * frame the sheet starts moving shows the incoming panel measured against the
 * outgoing panel's height, and closing empties the sheet while it is still on
 * screen sliding away. Both read as a page navigation.
 *
 * So the swap is sequenced. A fade-through (out, then in) rather than a
 * crossfade: two panels mounted at once would double their subscriptions for
 * the overlap, and the sheet's scroll region can only lay out one of them.
 *
 * Timings are deliberately shorter than the sheet's own travel — the content
 * has settled before the sheet finishes, so the eye reads "the sheet moved",
 * never "the content lagged".
 */

/** Fade the outgoing panel away before adopting the next one. */
export const PANEL_FADE_OUT_MS = 110
/** Fade the incoming panel in. Matches `.pl-panel-in` in mobile.css. */
export const PANEL_FADE_IN_MS = 170
/**
 * vaul's own exit animation (0.5s, `slideToBottom`). The outgoing panel stays
 * mounted for it so the sheet never slides away as an empty box.
 */
export const SHEET_EXIT_MS = 500

export type PanelSwapCommand<T extends string> =
  /** Already showing what was asked for. */
  | { kind: 'none' }
  /** Nothing is on screen: adopt immediately and fade in. */
  | { kind: 'show'; panel: T }
  /** Fade the current panel out, then adopt. */
  | { kind: 'fadeThenShow'; panel: T; delay: number }
  /** The sheet is closing: hold the current panel until it is gone. */
  | { kind: 'clearAfter'; delay: number }

/**
 * How to get from `shown` to `requested`. Pure, and deliberately unaware of
 * timers: the caller owns the clock, this owns the decision.
 */
export function planPanelSwap<T extends string>(
  shown: T | null,
  requested: T | null,
): PanelSwapCommand<T> {
  if (shown === requested) return { kind: 'none' }
  if (requested === null) return { kind: 'clearAfter', delay: SHEET_EXIT_MS }
  if (shown === null) return { kind: 'show', panel: requested }
  return { kind: 'fadeThenShow', panel: requested, delay: PANEL_FADE_OUT_MS }
}
