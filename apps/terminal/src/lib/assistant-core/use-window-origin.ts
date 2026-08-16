// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Growing the window out of the orb that opened it ─────────────────
//
// The panel used to scale up from its own bottom-right corner in every
// placement, which only reads right when the orb happens to be down
// there. Docked in the nav rail it looked like the chat came from a
// corner nobody had clicked.
//
// So measure instead of assume. On every open take the orb's centre and
// the window's own box, and express the first in the second's
// coordinates as a `transform-origin`: scale toward that point and the
// panel collapses into the thing that opened it, wherever that is. The
// short translate on top is the travel — pure scaling reads as a zoom,
// scaling plus a nudge along the line to the orb reads as movement.
//
// The origin is allowed to sit outside the window, because the orb
// always does, but only by REACH. Drag the window to the far corner and
// it should still lean toward the orb rather than swoop the width of the
// screen.
//
// Measured from the wrapper around the window, never the window itself:
// the window carries the very transform being computed here, and
// `getBoundingClientRect` reports the transformed box. The wrapper is a
// plain block, so its rect is the window's untransformed geometry.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import type { AssistantPlacement } from './placement'

/** Enough of a DOMRect to do the maths, so the geometry tests need no DOM. */
export type OriginBox = {
  left: number
  top: number
  width: number
  height: number
}

export type AssistantWindowOrigin = {
  /** CSS `transform-origin`, in the window's own coordinates. */
  transformOrigin: string
  /** Where the collapsed window sits relative to the open one, in px. */
  offset: { x: number; y: number }
}

/** How far outside the window its origin may sit. */
const REACH = 72
/** How far the collapsed window travels toward the orb. */
const TRAVEL = 16

/**
 * Used until the orb has been measured, and whenever it cannot be: a
 * headless render, a placement whose orb is not mounted yet, the first
 * paint. Each placement points roughly where its orb lives, so even the
 * unmeasured animation goes the right way.
 */
export const ASSISTANT_ORIGIN_FALLBACK: Record<
  AssistantPlacement,
  AssistantWindowOrigin
> = {
  // Rail on the left, window hanging off it top-aligned.
  sidebar: { transformOrigin: 'left top', offset: { x: -12, y: -4 } },
  // Strip below, orb in its right-hand end.
  bottom: { transformOrigin: 'bottom right', offset: { x: 6, y: 12 } },
  // Orb directly under the window's bottom-right corner.
  floating: { transformOrigin: 'bottom right', offset: { x: 6, y: 12 } },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * The orb's centre, as a transform origin for a window at `frame` plus
 * the short hop toward it. Null when either box has no area, which is
 * what a not-yet-laid-out element reports.
 */
export function assistantWindowOrigin(
  frame: OriginBox,
  orb: OriginBox,
): AssistantWindowOrigin | null {
  if (frame.width <= 0 || frame.height <= 0) return null
  if (orb.width <= 0 || orb.height <= 0) return null

  const orbX = orb.left + orb.width / 2
  const orbY = orb.top + orb.height / 2

  const dx = orbX - (frame.left + frame.width / 2)
  const dy = orbY - (frame.top + frame.height / 2)
  const distance = Math.hypot(dx, dy)

  return {
    transformOrigin: `${Math.round(
      clamp(orbX - frame.left, -REACH, frame.width + REACH),
    )}px ${Math.round(
      clamp(orbY - frame.top, -REACH, frame.height + REACH),
    )}px`,
    offset:
      distance > 0
        ? {
            x: Math.round((dx / distance) * TRAVEL),
            y: Math.round((dy / distance) * TRAVEL),
          }
        : { x: 0, y: 0 },
  }
}

function same(a: AssistantWindowOrigin, b: AssistantWindowOrigin) {
  return (
    a.transformOrigin === b.transformOrigin &&
    a.offset.x === b.offset.x &&
    a.offset.y === b.offset.y
  )
}

/**
 * Attach `frameRef` to the wrapper around the chat window and hand
 * `origin` to it. Remeasured before paint on every open and close, so
 * the transition about to run uses the geometry it will run against: the
 * rail can collapse, the placement can change and the window can be
 * dragged between one open and the next.
 */
export function useAssistantWindowOrigin(
  placement: AssistantPlacement,
  open: boolean,
) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState<AssistantWindowOrigin | null>(null)

  const remeasure = useCallback(() => {
    const frame = frameRef.current
    // Whichever placement is live has exactly one orb on screen. The
    // core marker is the orb glyph inside the pill, not the whole pill:
    // the floating placement's pill is mostly suggestion text, and
    // growing out of the middle of a sentence is not the effect.
    const orb =
      document.querySelector('[data-assistant-orb-core]') ??
      document.querySelector('[data-assistant-orb]')
    if (!frame || !(orb instanceof HTMLElement)) {
      setMeasured(null)
      return
    }
    const next = assistantWindowOrigin(
      frame.getBoundingClientRect(),
      orb.getBoundingClientRect(),
    )
    setMeasured((previous) =>
      next && previous && same(previous, next) ? previous : next,
    )
  }, [])

  useLayoutEffect(() => {
    remeasure()
  }, [remeasure, placement, open])

  useEffect(() => {
    window.addEventListener('resize', remeasure)
    return () => window.removeEventListener('resize', remeasure)
  }, [remeasure])

  return {
    frameRef,
    origin: measured ?? ASSISTANT_ORIGIN_FALLBACK[placement],
  }
}
