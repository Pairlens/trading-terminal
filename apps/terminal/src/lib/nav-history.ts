// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { RouterHistory } from '@tanstack/react-router'

/**
 * Back / forward navigation state for the desktop shell — the titlebar arrows,
 * the macOS menubar entries and the Windows/Linux accelerator runner all read
 * from here.
 *
 * The router's history already knows whether it can go back (`canGoBack()` —
 * the current entry index is non-zero), but no browser exposes how many
 * *forward* entries survive. We derive it: every entry TanStack pushes carries
 * a monotonic `__TSR_index`, so remembering the highest index reached tells us
 * whether a forward entry still exists. A PUSH truncates everything ahead of
 * the current entry, which lowers that ceiling to the new index; BACK/FORWARD/
 * GO only move within it, and REPLACE swaps the current entry in place and
 * leaves the forward entries alone.
 *
 * A module singleton (one history per window) so the non-React callers — the
 * native menu descriptors in `settings/menu-model` — observe exactly the same
 * state the titlebar buttons render.
 */

let history: RouterHistory | null = null
let canGoBack = false
let canGoForward = false
let maxIndex = 0

const listeners = new Set<() => void>()

function entryIndex(): number {
  const index = history?.location.state.__TSR_index
  return typeof index === 'number' ? index : 0
}

function recompute(): void {
  const nextBack = history?.canGoBack() ?? false
  const nextForward = history !== null && entryIndex() < maxIndex
  if (nextBack === canGoBack && nextForward === canGoForward) return
  canGoBack = nextBack
  canGoForward = nextForward
  for (const listener of listeners) listener()
}

/**
 * Bind the tracker to the app router's history. Idempotent — it's mounted once
 * from the root document effect, so a StrictMode double-invoke or an HMR
 * remount can never stack a second subscription.
 */
export function attachNavHistory(routerHistory: RouterHistory): void {
  if (history) return
  history = routerHistory
  // Start conservative: a reload keeps the browser's forward entries alive but
  // we can't see them, so forward stays off until the user goes back.
  maxIndex = entryIndex()
  recompute()

  routerHistory.subscribe(({ action }) => {
    const index = entryIndex()
    maxIndex = action.type === 'PUSH' ? index : Math.max(maxIndex, index)
    recompute()
  })
}

export function goBack(): void {
  if (!canGoBack) return
  history?.back()
}

export function goForward(): void {
  if (!canGoForward) return
  history?.forward()
}

export const getCanGoBack = (): boolean => canGoBack

export const getCanGoForward = (): boolean => canGoForward

export function subscribeNavHistory(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}
