// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

/**
 * Browser-window fullscreen via the DOM Fullscreen API — web builds only.
 *
 * Desktop deliberately has no path through here: the native window controls
 * (and the macOS green button) already own fullscreen there, and Tauri toggles
 * it through the window API rather than the DOM. Callers gate on
 * `!isStandalone`; the module itself only guards against SSR.
 *
 * The browser requires `requestFullscreen()` to run inside a user-gesture
 * handler, which both the header button and a keydown satisfy. Esc-to-exit is
 * the browser's own behaviour and needs no code here.
 */

const listeners = new Set<() => void>()
let bound = false

function bind(): void {
  if (bound || typeof document === 'undefined') return
  bound = true
  document.addEventListener('fullscreenchange', () => {
    for (const listener of listeners) listener()
  })
}

export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement !== null
}

export function subscribeFullscreen(listener: () => void): () => void {
  bind()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    // Denied (embedded without allowfullscreen, or the gesture requirement
    // was not met). Nothing sensible to do beyond staying windowed.
  }
}
