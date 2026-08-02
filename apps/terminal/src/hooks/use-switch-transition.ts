// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef, useState } from 'react'

/**
 * Drives the dim-stale→crossfade connector-switch transition for market-data
 * panes (see `PaneTransition`).
 *
 * The market-data stream hooks null out their payload the instant the active
 * connector (`market`) changes, so the new connector's first snapshot can't be
 * confused with the previous one. Rendered naively, that makes a pane flash to
 * an empty loading spinner on every switch. This hook instead RETAINS the last
 * non-null payload and reports a `phase`:
 *
 *  - `'switching'` — the connector changed and a fresh payload for it hasn't
 *    arrived yet. Render `display` (the previous connector's data) dimmed.
 *  - `'live'` — a fresh payload has arrived (or we never had one). Render
 *    normally and crossfade back to full opacity.
 *
 * On a cold start (no prior payload) `phase` stays `'live'` so the pane shows
 * its own loading state instead of dimming an empty box.
 *
 * Correctness note: on a switch React briefly re-renders the pane with the NEW
 * `market` but the OLD (not-yet-nulled) payload still referentially identical to
 * what we already adopted. We detect the switch synchronously during render and
 * only adopt a payload whose identity actually changed, so that stale frame
 * can't prematurely clear the `'switching'` state.
 */
export function useSwitchTransition<T>(
  market: string,
  data: T | null,
): { phase: 'switching' | 'live'; display: T | null } {
  const [display, setDisplay] = useState<T | null>(data)
  const prevMarketRef = useRef(market)
  const lastAdoptedRef = useRef<T | null>(data)
  // Ref (not state) so we can flip it during render on a detected switch and
  // still derive `phase` synchronously this same render.
  const switchingRef = useRef(false)

  // Detect a connector switch during render (the "previous prop" pattern).
  if (prevMarketRef.current !== market) {
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

  return { phase: switchingRef.current ? 'switching' : 'live', display }
}
