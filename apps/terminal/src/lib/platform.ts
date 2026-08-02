// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export const isStandalone =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

export const isHosted = !isStandalone

/**
 * Open an additional terminal window at the given app path (e.g.
 * `/workspace/abc` or `/pair/BTC-USDT`). On desktop this spawns a new
 * Tauri window; in the browser it opens a new tab. Every window runs the
 * full terminal — shared state stays consistent via the sync-channel
 * cross-window bridge, and side effects (notifications) run only in the
 * leader window.
 */
export async function openTerminalWindow(path: string): Promise<void> {
  if (isStandalone) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_terminal_window', { path })
    return
  }
  window.open(path, '_blank', 'noopener')
}

/**
 * Open a URL in the user's default system browser. Used for flows that must
 * NOT run inside the app webview — Polar checkout / customer portal pages
 * (payment forms belong in a real browser session). In the browser build
 * this is a plain new tab.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isStandalone) {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
    return
  }
  window.open(url, '_blank', 'noopener')
}

/** Close the Tauri splash screen and show the main window. No-op in browser. */
export function closeSplashScreen(): void {
  if (!isStandalone) return
  const internals = (window as unknown as Record<string, unknown>)
    .__TAURI_INTERNALS__
  if (
    internals &&
    typeof (internals as Record<string, unknown>).invoke === 'function'
  ) {
    // Invoke immediately — do NOT defer behind requestAnimationFrame. This
    // window is still hidden, and WebKit never fires rAF in a hidden webview,
    // so waiting for a painted frame before showing deadlocks the boot (the
    // splash stays up until the native show-watchdog kicks in). Any paint gap
    // after show() is masked by the window's background_color, which matches
    // the app's dark surface.
    void (internals as { invoke: (cmd: string) => Promise<void> }).invoke(
      'close_splashscreen',
    )
  }
}
