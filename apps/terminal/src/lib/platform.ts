// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export const isStandalone =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

export const isHosted = !isStandalone

/** True in the Tauri desktop app on macOS (the only platform with a menubar). */
export const isMacDesktop =
  isStandalone &&
  typeof navigator !== 'undefined' &&
  /Mac/i.test(navigator.userAgent)

/**
 * True in the Tauri desktop app on Linux. Used where the honest answer differs
 * there and nowhere else — a system tray is not something a Linux desktop is
 * guaranteed to have (GNOME ships none without the AppIndicator extension), so
 * UI that depends on one has to say so.
 */
export const isLinuxDesktop =
  isStandalone &&
  typeof navigator !== 'undefined' &&
  /Linux/i.test(navigator.userAgent) &&
  !/Android/i.test(navigator.userAgent)

/**
 * Open an additional terminal window at the given app path (e.g.
 * `/workspace/abc` or `/pair/BTC-USDT`). On desktop this spawns a new
 * Tauri window; in the browser it opens a new tab. Every window runs the
 * full terminal — shared state stays consistent via the sync-channel
 * cross-window bridge, and side effects (notifications) run only in the
 * leader window.
 *
 * Window creation lives in Rust (`open_terminal_window`) rather than JS
 * `WebviewWindow` so every window is built by the same code path as the main
 * one — same CSP injection hook, same platform branches. Failures are reported
 * rather than swallowed: callers fire this and forget, so a silent rejection
 * looks exactly like a dead button.
 */
export async function openTerminalWindow(path: string): Promise<void> {
  if (!isStandalone) {
    window.open(path, '_blank', 'noopener')
    return
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_terminal_window', { path })
  } catch (err) {
    console.error('[platform] failed to open a new window:', err)
    await reportWindowFailure(err)
  }
}

/**
 * Toast a window-creation failure. Everything is imported lazily — platform.ts
 * sits near the bottom of the import graph and must not drag the toast stack or
 * i18n into modules that only wanted `isStandalone`.
 */
async function reportWindowFailure(err: unknown): Promise<void> {
  try {
    const [{ toast }, { default: i18n }] = await Promise.all([
      import('sonner'),
      import('@/lib/i18n'),
    ])
    toast.error(i18n.t('common.error'), {
      description: err instanceof Error ? err.message : String(err),
    })
  } catch {
    // Best-effort only — the console error above is the durable signal.
  }
}

/**
 * Open a URL in the user's default system browser. Used for flows that must
 * NOT run inside the app webview — Stripe checkout / billing portal pages
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
