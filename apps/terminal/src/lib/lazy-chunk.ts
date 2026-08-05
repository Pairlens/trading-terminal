// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Lazy chunks that survive a deploy.
 *
 * Every deploy to terminal.pairlens.finance rewrites the bundle's content
 * hashes. A tab that loaded the previous build still holds the old module
 * graph, so the first lazy chunk it reaches for — a settings section, a pane,
 * a route — names a file the new deployment no longer has. Vercel answers the
 * miss with the SPA shell (200, `text/html`), the import rejects with "Failed
 * to fetch dynamically imported module", and React hands the whole screen to
 * the route error boundary. The tab is merely out of date; the user sees a
 * crash.
 *
 * So a failed chunk import is retried once — a flaky connection is the other
 * way this fails, and a retry costs one request — and if it still won't load
 * the page reloads itself: fresh HTML means fresh hashes, and the section
 * opens. The retry re-imports the *same* specifier; a cache-busting `?v=`
 * would fork the module graph and hand back a second copy of every module the
 * chunk touches, which breaks context identity far more thoroughly than the
 * error it was trying to paper over.
 *
 * The reload is guarded by a timestamp in sessionStorage, so a chunk that is
 * genuinely broken — a bad deploy, not a stale one — surfaces as an error
 * instead of looping. If that marker can't be written, nothing reloads at all:
 * a reload we can't remember having done is how a page refreshes forever.
 *
 * While the reload is in flight the import promise never settles, which keeps
 * Suspense on its spinner. Resolving or rejecting would flash a section — or
 * an error panel — onto a page that is already going away.
 *
 * Desktop is excluded. Tauri serves the bundle from the installed app, where
 * the HTML and its chunks can never disagree (the updater relaunches the whole
 * app), so a chunk failure there is a real fault and reloading would cost the
 * user their session to hide it.
 */

import * as React from 'react'

import { isHosted } from '@/lib/platform'

/** How long after a recovery reload we refuse to reload again. */
const RELOAD_COOLDOWN_MS = 30_000
const RETRY_DELAY_MS = 300
const RELOAD_KEY = 'pairlens:chunk-reload-at'

/**
 * No engine agrees on the wording, and the same miss reads differently
 * depending on whether the server 404s or — as ours does — answers with the
 * SPA shell under a `text/html` content type.
 */
const CHUNK_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module', // Chrome, Edge
  'error loading dynamically imported module', // Firefox
  'importing a module script failed', // Safari
  'failed to load module script', // Chrome, wrong MIME type
  'expected a javascript module script', // Chrome, the shell HTML
  'unable to preload css', // Vite, a stale style chunk
]

/** True for the "this chunk isn't there any more" family of load failures. */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  if (!message) return false
  const lower = message.toLowerCase()
  return CHUNK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern))
}

function reloadedRecently(): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY)
    if (raw === null) return false
    const at = Number(raw)
    return Number.isFinite(at) && Date.now() - at < RELOAD_COOLDOWN_MS
  } catch {
    // Storage is denied (private mode, blocked cookies). Report "yes, already
    // reloaded" so the caller gives up rather than looping without a memory.
    return true
  }
}

/** Returns false when the marker can't be stored — see the module doc. */
function markReloadAttempt(): boolean {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}

/**
 * Reload onto the current deployment. Returns whether a reload was started —
 * callers that get `false` have to surface the original error, because
 * nothing else is going to fix it.
 */
export function recoverFromStaleChunk(): boolean {
  if (typeof window === 'undefined' || !isHosted) return false
  if (reloadedRecently()) return false
  if (!markReloadAttempt()) return false
  window.location.reload()
  return true
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Run a dynamic import, recovering from a chunk that the live deployment no
 * longer serves. Non-chunk failures (a module that throws while evaluating)
 * pass straight through — those are real bugs and a reload would only hide
 * them behind a loop.
 */
export async function importChunk<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory()
  } catch (error) {
    if (!isChunkLoadError(error)) throw error

    try {
      await delay(RETRY_DELAY_MS)
      return await factory()
    } catch (retryError) {
      if (!isChunkLoadError(retryError)) throw retryError
      if (!recoverFromStaleChunk()) throw retryError
      // Reloading: never settle, so Suspense holds its fallback.
      return new Promise<never>(() => {})
    }
  }
}

/**
 * `React.lazy`, with the recovery above wrapped around the import. The
 * constraint mirrors React's own signature verbatim — narrowing the props
 * type here would make the result stop matching every `LazyExoticComponent`
 * the pane and panel registries hold.
 */
export function lazyChunk<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(() => importChunk(factory))
}

let initialized = false

/**
 * Catch the other half of the problem: Vite preloads a chunk's dependencies
 * before importing it, and a stale dependency fails there rather than inside
 * any `importChunk` call. Vite rethrows unless the event is cancelled, so
 * cancelling once a reload is underway keeps the error off the boundary.
 */
export function initChunkRecovery(): void {
  if (typeof window === 'undefined' || initialized) return
  initialized = true

  window.addEventListener('vite:preloadError', (event) => {
    if (recoverFromStaleChunk()) event.preventDefault()
  })
}
