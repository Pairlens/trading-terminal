// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef, useState } from 'react'

/**
 * How long a pane may keep showing the previous stream's payload while the new
 * one loads. Generous enough to cover a slow connector's first snapshot, short
 * enough that a venue which never answers stops passing another venue's book
 * off as its own.
 */
const DEFAULT_RETAIN_MS = 6_000

/**
 * Drives the dim-stale→crossfade switch transition for market-data panes (see
 * `PaneTransition`).
 *
 * The market-data stream hooks null out their payload the instant the active
 * stream (venue or pair) changes, so the new stream's first snapshot can't be
 * confused with the previous one. Rendered naively, that makes a pane flash to
 * an empty loading spinner on every switch. This hook instead RETAINS the last
 * non-null payload and reports a `phase`:
 *
 *  - `'switching'` — the stream changed and a fresh payload for it hasn't
 *    arrived yet. Render `display` (the previous stream's data) dimmed.
 *  - `'live'` — a fresh payload has arrived (or we never had one). Render
 *    normally and crossfade back to full opacity.
 *
 * On a cold start (no prior payload) `phase` stays `'live'` so the pane shows
 * its own loading state instead of dimming an empty box.
 *
 * Retention is bounded. A venue that never answers — the pair isn't listed
 * there, the socket is refused — used to leave the order book rendering the
 * PREVIOUS venue's prices indefinitely, dimmed but otherwise indistinguishable
 * from live depth on the venue named in the top bar. After `retainMs` the
 * retained payload is dropped and the pane falls through to its own empty
 * state, which can tell the truth.
 *
 * The switch is keyed on venue AND pair for the same reason: changing pair
 * within one venue swaps the stream just as completely, and keying on the venue
 * alone left the previous pair's book on screen under the new pair's name.
 *
 * Correctness note: on a switch React briefly re-renders the pane with the NEW
 * key but the OLD (not-yet-nulled) payload still referentially identical to
 * what we already adopted. We detect the switch synchronously during render and
 * only adopt a payload whose identity actually changed, so that stale frame
 * can't prematurely clear the `'switching'` state.
 */
export function useSwitchTransition<T>(
  market: string,
  pairKey: string,
  data: T | null,
  options?: { retainMs?: number },
): {
  phase: 'switching' | 'live'
  display: T | null
  /** The venue changed (not just the pair) — drives the badge's wording. */
  marketChanged: boolean
} {
  const retainMs = options?.retainMs ?? DEFAULT_RETAIN_MS
  const streamKey = `${market}:${pairKey}`

  const [display, setDisplay] = useState<T | null>(data)
  const prevStreamKeyRef = useRef(streamKey)
  const prevMarketRef = useRef(market)
  const lastAdoptedRef = useRef<T | null>(data)
  // Refs (not state) so we can flip them during render on a detected switch and
  // still derive `phase` synchronously this same render.
  const switchingRef = useRef(false)
  const marketChangedRef = useRef(false)

  // Detect a stream switch during render (the "previous prop" pattern).
  if (prevStreamKeyRef.current !== streamKey) {
    prevStreamKeyRef.current = streamKey
    marketChangedRef.current = prevMarketRef.current !== market
    prevMarketRef.current = market
    // Only worth dimming if we actually have a previous payload to show.
    switchingRef.current = display != null
  }

  // Adopt a genuinely-fresh payload, then crossfade back to live.
  useEffect(() => {
    if (data != null && data !== lastAdoptedRef.current) {
      lastAdoptedRef.current = data
      switchingRef.current = false
      setDisplay(data)
    }
  }, [data])

  // Give up on a stream that never answers. Runs after the render that detected
  // the switch, so `switchingRef` is already set; the effect above clears it the
  // moment fresh data lands, which makes the expiry a no-op.
  useEffect(() => {
    if (!switchingRef.current) return
    const timer = setTimeout(() => {
      if (!switchingRef.current) return
      switchingRef.current = false
      lastAdoptedRef.current = null
      setDisplay(null)
    }, retainMs)
    return () => clearTimeout(timer)
  }, [streamKey, retainMs])

  return {
    phase: switchingRef.current ? 'switching' : 'live',
    display,
    marketChanged: marketChangedRef.current,
  }
}
