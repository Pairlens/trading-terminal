// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pacing for the master-detail pages that arrive as their own chunk.
 *
 * Workflows, Bots, Indicators and Notifications are all `lazyChunk`ed, so the
 * first visit of a session paints the Suspense fallback while the chunk lands.
 * Left alone that reads as a glitch rather than as loading: the chart unmounts
 * instantly, a line of centred grey text appears on an empty page, and the
 * builder pops in over it. Three hard cuts, none of which say "loading".
 *
 * The fix is the pair of thresholds a router would give you (`pendingMs` /
 * `pendingMinMs`), implemented against Suspense instead:
 *
 *   - Nothing paints for the first {@link PENDING_SHOW_AFTER_MS}. A chunk that
 *     lands inside that window swaps with no fallback at all, which covers
 *     every warm navigation and most cold ones on a fast disk.
 *   - Once the fallback IS on screen it stays for {@link PENDING_MIN_VISIBLE_MS},
 *     so the skeleton can never flash up for 20ms and vanish. That is the same
 *     glitch in a nicer colour.
 *
 * The floor lives here, on the import, rather than in the fallback: a Suspense
 * fallback is unmounted by React the instant its child is ready and has no way
 * to hold itself open. Delaying the resolve is the only version that does not
 * mean keeping two page trees mounted at once.
 *
 * It costs latency in exactly one band — a chunk that lands just after the
 * show threshold — and only while the user is already looking at a skeleton.
 * Everything faster is untouched, everything slower is untouched.
 *
 * Deliberately NOT applied to the chart, the pane grid or a workspace. Those
 * mount a WebGL canvas whose first paint is the expensive frame in the app;
 * holding it back to respect a loading state would trade the thing people came
 * for against a nicety.
 */

import * as React from 'react'

import { importChunk } from '@/lib/lazy-chunk'

/**
 * How long a page may take to arrive before we admit to loading at all.
 * Under ~150ms a spinner reads as a flicker, not as feedback.
 */
export const PENDING_SHOW_AFTER_MS = 160

/** Once the skeleton is up, the shortest it may stay. */
export const PENDING_MIN_VISIBLE_MS = 240

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * How much longer to sit on a resolved chunk, given how long it took to load.
 *
 * Zero on both sides of the band: under the show threshold no fallback was
 * ever painted, so there is nothing to hold open, and past the floor the
 * skeleton has already had its minimum.
 */
export function pendingFloorDelay(elapsedMs: number): number {
  const floor = PENDING_SHOW_AFTER_MS + PENDING_MIN_VISIBLE_MS
  if (elapsedMs <= PENDING_SHOW_AFTER_MS || elapsedMs >= floor) return 0
  return floor - elapsedMs
}

/**
 * `lazyChunk` for a routed page: same stale-deploy recovery, plus the minimum
 * visible window above. Pair it with `<PendingAfter>` in the Suspense fallback,
 * which reads the same threshold from the other side.
 *
 * The constraint mirrors React's own signature for the same reason `lazyChunk`
 * does: narrowing it here stops the result matching `LazyExoticComponent`.
 */
export function lazyPageChunk<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const started = performance.now()
    const mod = await importChunk(factory)
    const hold = pendingFloorDelay(performance.now() - started)
    if (hold > 0) await delay(hold)
    return mod
  })
}
