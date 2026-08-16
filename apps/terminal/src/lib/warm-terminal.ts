// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Fetch the terminal's route chunks while the visitor is still reading the
// last onboarding step.
//
// Onboarding always ends at `/`, so those chunks are not a guess: they are the
// next thing this person will need. Pulling them during a step they are
// reading turns the hand-off at the end into a render instead of a download.
//
// `router.preloadRoute({ to: '/' })` cannot do this job. Route chunks load
// inside the loader phase, which runs AFTER `beforeLoad`, and `_terminal`'s
// `beforeLoad` redirects straight back to `/onboarding` until onboarding is
// marked complete. The preload would resolve the redirect and fetch nothing.
// `loadRouteChunk` is the loader-phase primitive on its own, with no
// `beforeLoad` in front of it.
import type { AnyRouter } from '@tanstack/react-router'

/**
 * The layout and its index route: everything `/` renders before it starts
 * asking plugins for data. Ids come from `routeTree.gen.ts`; an id that no
 * longer exists is skipped rather than thrown, because a warm that quietly
 * does nothing is a slower hand-off, not a broken one.
 */
const TERMINAL_ROUTE_IDS = ['/_terminal', '/_terminal/']

let warmed = false

export function warmTerminalRoutes(router: AnyRouter): void {
  if (warmed || typeof window === 'undefined') return
  warmed = true

  const run = () => {
    for (const id of TERMINAL_ROUTE_IDS) {
      const route = router.looseRoutesById[id]
      if (route) void router.loadRouteChunk(route)
    }
  }

  // Behind the onboarding step's own animations. The step the visitor is
  // looking at has to stay smooth; the download can have whatever is left.
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2000 })
  } else {
    setTimeout(run, 300)
  }
}

/** Test seam: the warm is once-per-load, so tests need to reset it. */
export function resetTerminalWarmForTests(): void {
  warmed = false
}
