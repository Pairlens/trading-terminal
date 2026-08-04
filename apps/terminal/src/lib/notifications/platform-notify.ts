// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { isStandalone } from '@/lib/platform'

/**
 * Send an OS-level notification. Prefers the Tauri notification plugin on
 * desktop (crate + `notification:default` capability wired in
 * apps/desktop/src-tauri), falling back to the webview's own Notification API.
 *
 * The native path is the only one that works on macOS — WKWebView does not
 * implement the Notification API — and the only one a hidden window has in
 * background mode, where alert delivery is the whole point of keeping the
 * process alive. The fall-through on failure must stay: returning early on an
 * unpermitted/broken plugin would drop the notification entirely in browser
 * dev builds.
 */
export async function sendOsNotification(
  title: string,
  body: string,
  opts?: { sound?: boolean },
): Promise<void> {
  if (isStandalone) {
    try {
      const tauri = await import('@tauri-apps/plugin-notification')
      let permitted = await tauri.isPermissionGranted()
      if (!permitted) {
        const result = await tauri.requestPermission()
        permitted = result === 'granted'
      }
      if (permitted) {
        tauri.sendNotification({
          title,
          body,
          ...(opts?.sound === false ? {} : { sound: 'default' }),
        })
        return
      }
    } catch (err) {
      console.warn('[notifications] Tauri notification failed:', err)
    }
    // Fall through to the webview Notification API — either the plugin is
    // unpermitted or it threw. Returning here would drop the notification.
  }

  // Browser / webview fallback
  if (typeof Notification === 'undefined') return

  if (Notification.permission === 'granted') {
    new Notification(title, { body })
  } else if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      new Notification(title, { body })
    }
  }
}
