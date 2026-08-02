// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { isStandalone } from '@/lib/platform'

/**
 * Send an OS-level notification. Prefers the Tauri notification plugin on
 * desktop, falling back to the webview's own Notification API.
 *
 * NOTE: `@tauri-apps/plugin-notification` is NOT currently a dependency of this
 * app — there is no `tauri-plugin-notification` crate in src-tauri/Cargo.toml,
 * it is not registered in lib.rs, and `notification:default` is not granted in
 * capabilities/default.json. So on desktop the import below always fails today
 * and we land on the webview fallback. Wiring the plugin up (JS dep + crate +
 * capability) is what makes the native path live; until then the fall-through
 * is what actually delivers, which is why a failed attempt must NOT return.
 */
export async function sendOsNotification(
  title: string,
  body: string,
  _opts?: { sound?: boolean },
): Promise<void> {
  if (isStandalone) {
    try {
      // Dynamic import — only resolves when Tauri runtime is present.
      // The module name is constructed at runtime to prevent both Vite static
      // analysis and TypeScript module resolution from failing.
      const mod = '@tauri-apps/plugin-notification'

      const tauri = await import(/* @vite-ignore */ mod)
      let permitted = await tauri.isPermissionGranted()
      if (!permitted) {
        const result = await tauri.requestPermission()
        permitted = result === 'granted'
      }
      if (permitted) {
        tauri.sendNotification({ title, body })
        return
      }
    } catch (err) {
      console.warn('[notifications] Tauri notification failed:', err)
    }
    // Fall through to the webview Notification API — either the plugin is
    // absent/unpermitted, or it threw. Returning here would drop the
    // notification entirely.
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
