// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The autofocus rule behind "I tap the sign-in field on my iPhone and the
 * keyboard never opens", pulled out of the components so it can be reasoned
 * about — and tested — without a DOM. (The other half of that bug, the vaul
 * sheet's stray Radix focus trap, is released by the shared `DialogContent` —
 * see packages/ui/src/lib/use-release-sheet-focus-traps.ts.)
 */

/** Touch and stylus digitisers report `coarse`; mice and trackpads report `fine`. */
const COARSE_POINTER = '(pointer: coarse)'

/**
 * Whether a sign-in field may be focused *for* the user when its step mounts.
 *
 * iOS Safari raises the software keyboard only for a focus that a user gesture
 * caused. A field focused on mount therefore ends up focused with no keyboard,
 * and the tap that should fix it lands on an element that is already
 * `document.activeElement` — no focus event fires, and still no keyboard. On a
 * coarse pointer the honest answer is to leave the field alone and let the
 * user's own tap do the focusing.
 *
 * Takes `matchMedia` rather than reading `window` so a server render (or a
 * test) can answer without one; absent it, assume a pointer device and keep
 * the desktop courtesy.
 */
export function shouldAutoFocusFields(
  matchMedia: ((query: string) => { matches: boolean }) | null | undefined,
): boolean {
  if (typeof matchMedia !== 'function') return true
  return !matchMedia(COARSE_POINTER).matches
}
