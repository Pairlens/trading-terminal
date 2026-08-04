// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Is this window on screen, or hidden in the background?
 *
 * In background mode a closed window is hidden, not destroyed: the webview
 * keeps running with nobody looking at it. Two things in the app assume a
 * visible window and quietly break otherwise:
 *
 *   - the idle guard pauses every market stream after an hour with no
 *     mousemove — and a hidden window has, by construction, no mousemove ever
 *   - the updater toasts "Restart & update" into a window nobody can see
 *
 * Rust emits `pairlens://window-hidden` on hide and on show, which is the only
 * signal that works here: WebKit does not reliably flip `document.visibility`
 * when a native window is ordered out.
 *
 * Browser builds: always visible, and nothing is ever imported from Tauri.
 */
import { isStandalone } from '@/lib/platform'

const WINDOW_HIDDEN_EVENT = 'pairlens://window-hidden'

let hidden = false
let started = false
const listeners = new Set<(hidden: boolean) => void>()

/** Begin listening. Idempotent; safe to call from anywhere, no-op in browsers. */
export function initWindowVisibility(): void {
  if (!isStandalone || started) return
  started = true
  void (async () => {
    try {
      // Bound to THIS window, not the global bus. Rust addresses the event to
      // one webview, but a listener registered through the module-level
      // `listen()` declares `target: Any` and receives every emit regardless —
      // so a sibling being hidden would mark this visible window hidden too.
      const { getCurrentWebviewWindow } =
        await import('@tauri-apps/api/webviewWindow')
      await getCurrentWebviewWindow().listen<boolean>(
        WINDOW_HIDDEN_EVENT,
        (event) => {
          setHidden(event.payload === true)
        },
      )
    } catch (err) {
      // Without the signal the app behaves exactly as it did before this
      // feature — visible-window assumptions, which is the safe direction.
      console.error('[window-visibility] listener failed:', err)
    }
  })()
}

function setHidden(next: boolean): void {
  if (next === hidden) return
  hidden = next
  for (const listener of listeners) listener(next)
}

export function isWindowHidden(): boolean {
  return hidden
}

/** Observe hide/show. Returns unsubscribe. */
export function subscribeWindowHidden(
  listener: (hidden: boolean) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Run `fn` now if the window is on screen, otherwise once it comes back.
 * Used for anything that talks to the user — a prompt fired into a hidden
 * window is a prompt that never happened.
 */
export function whenWindowVisible(fn: () => void): void {
  if (!hidden) {
    fn()
    return
  }
  const stop = subscribeWindowHidden((isHidden) => {
    if (isHidden) return
    stop()
    fn()
  })
}
