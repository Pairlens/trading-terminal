// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Press feedback, driven by pointer events onto a DOM attribute.
 *
 * `:active` alone is not enough. iOS Safari only asserts it on elements the
 * page has touch-listened, and even on Chromium it waits for the gesture
 * recognizer's show-press delay — a fast tap can paint nothing at all. What
 * the paint reads instead is `[data-pressed]`, set on pointerdown and cleared
 * on the up/cancel that always follows (a touch pointer is implicitly
 * captured, so the release lands on this element wherever the finger ends).
 *
 * These are module-level handlers writing straight to the node: no state, no
 * re-render, and a `memo`'d bar stays clean while a market streams. The CSS
 * keeps `:active` alongside for keyboard activation. Spread onto the element
 * (`{...PRESS}`) together with a paint class — `.pl-press` for chip
 * silhouettes, or a shape-specific variant in mobile.css.
 */
import type { PointerEvent } from 'react'

export const PRESS = {
  onPointerDown: (e: PointerEvent<HTMLElement>) =>
    e.currentTarget.setAttribute('data-pressed', 'true'),
  onPointerUp: (e: PointerEvent<HTMLElement>) =>
    e.currentTarget.removeAttribute('data-pressed'),
  onPointerCancel: (e: PointerEvent<HTMLElement>) =>
    e.currentTarget.removeAttribute('data-pressed'),
  onPointerLeave: (e: PointerEvent<HTMLElement>) =>
    e.currentTarget.removeAttribute('data-pressed'),
} as const
