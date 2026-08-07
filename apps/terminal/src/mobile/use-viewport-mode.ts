// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The viewport gate for the mobile shell branch.
 *
 * `useIsMobile()` from @pairlens/ui returns `false` on its first render and
 * corrects in an effect — fine for a component that changes a class, fatal for
 * a branch that swaps the whole application shell, because every phone would
 * paint one full desktop frame before the swap.
 *
 * So the source of truth is `html[data-viewport]`, stamped by a classic inline
 * script in `__root.tsx` before any module script runs (same shape and
 * placement as LOCK_SHIELD_SCRIPT, which proves the pattern safe here).
 * `useSyncExternalStore` reads that attribute, so the very first React render
 * is already correct, and the same `matchMedia` drives live resizes in both
 * directions.
 *
 * `packages/ui/src/hooks/use-mobile.ts` is deliberately untouched: desktop
 * components depend on its current semantics. This hook is mobile-owned and is
 * the only gate for the shell branch.
 */
import { useSyncExternalStore } from 'react'

export type ViewportMode = 'mobile' | 'desktop'

/** Matches MOBILE_BREAKPOINT (768) in @pairlens/ui. */
const MOBILE_QUERY = '(max-width: 767px)'

function query(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return window.matchMedia(MOBILE_QUERY)
}

/** Write the attribute the CSS backstop and `getSnapshot` both read. */
function stamp(): ViewportMode {
  const mq = query()
  const mode: ViewportMode = mq?.matches ? 'mobile' : 'desktop'
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.viewport = mode
  }
  return mode
}

function getSnapshot(): ViewportMode {
  if (typeof document !== 'undefined') {
    const stamped = document.documentElement.dataset.viewport
    if (stamped === 'mobile' || stamped === 'desktop') return stamped
  }
  return query()?.matches ? 'mobile' : 'desktop'
}

/** `__root` is `ssr: false`, so this is moot — it exists to satisfy the API. */
function getServerSnapshot(): ViewportMode {
  return 'desktop'
}

function subscribe(onStoreChange: () => void): () => void {
  const mq = query()
  const handler = () => {
    // Re-stamp before notifying: the inline script has its own listener and
    // normally wins the ordering, but a build where it never ran (a test, a
    // stripped head) must still keep the attribute honest.
    stamp()
    onStoreChange()
  }
  mq?.addEventListener('change', handler)
  // `resize` as well as the media query. The MediaQueryList event is the
  // precise signal and fires once per crossing; `resize` is the belt — a
  // viewport driven by devtools emulation or an embedded webview does not
  // always deliver the media-query event, and a shell that stays desktop on a
  // 402px viewport is the one failure this hook exists to prevent. Re-running
  // getSnapshot costs one dataset read, and React bails out when the value is
  // unchanged, so the extra listener is free in the common case.
  window.addEventListener('resize', handler)
  return () => {
    mq?.removeEventListener('change', handler)
    window.removeEventListener('resize', handler)
  }
}

/**
 * The mode the document was in when this module first ran — which is how the
 * shell tells a phone load apart from a desktop window dragged narrow.
 */
let initialMode: ViewportMode | null = null

/** `'direct'` on a cold mobile load, `'desktop'` when the user resized into it. */
export function getInitialViewportMode(): ViewportMode {
  initialMode ??= getSnapshot()
  return initialMode
}

export function useViewportMode(): ViewportMode {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  initialMode ??= mode
  return mode
}
