// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { isStandalone } from '@/lib/platform'

/**
 * System notifications, on both surfaces.
 *
 * Desktop prefers the Tauri notification plugin (crate + `notification:default`
 * capability wired in apps/desktop/src-tauri). It is the only path that works
 * on macOS — WKWebView does not implement the Notification API — and the only
 * one a hidden window has in background mode, where alert delivery is the whole
 * point of keeping the process alive. The fall-through to the webview API on
 * failure must stay: returning early on an unpermitted/broken plugin would drop
 * the notification entirely in browser dev builds.
 *
 * In the browser this is the Web Notification API, which is a real system
 * notification — the OS notification centre, not an in-page toast.
 *
 * ## Failure is loud
 *
 * Every path that shows nothing throws. This matters more than it looks: the
 * runtime records per-channel outcomes precisely so a denied permission is
 * visible in the notification log instead of vanishing, and a `return` here
 * would report "delivered" for a notification the user never saw. That is the
 * worst possible answer from an alerting system — it is indistinguishable from
 * "the market never moved".
 */

/** Shown beside the body, so the notification is recognisably Pairlens. */
const NOTIFICATION_ICON = '/logo192.png'

/**
 * `prompt` means the user has not been asked yet; `unsupported` means asking is
 * pointless (WKWebView, an insecure context, an old browser).
 */
export type SystemNotificationPermission =
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'unsupported'

function fromBrowserPermission(
  permission: NotificationPermission,
): SystemNotificationPermission {
  return permission === 'default' ? 'prompt' : permission
}

/**
 * Where permission stands. Never prompts, so it is safe on mount.
 *
 * Desktop answers from the Tauri plugin, which is the grant that actually
 * governs delivery there. It exposes only a boolean, and "not granted" from a
 * plugin that has never asked is `prompt` — the state whose whole point is that
 * asking is still worth doing.
 */
export async function getSystemNotificationPermission(): Promise<SystemNotificationPermission> {
  if (isStandalone) {
    try {
      const tauri = await import('@tauri-apps/plugin-notification')
      if (await tauri.isPermissionGranted()) return 'granted'
      return 'prompt'
    } catch {
      // Plugin missing or broken — fall through to whatever the webview has.
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported'
  return fromBrowserPermission(Notification.permission)
}

/**
 * Ask for permission.
 *
 * Call this from a click. Safari rejects `requestPermission()` outside a user
 * gesture, and Chrome shows a prompt that an out-of-context ask gets dismissed
 * — and a dismissal is sticky, so the cost of asking at the wrong moment is
 * permanent. That is why Settings owns this and delivery only falls back to it.
 */
export async function requestSystemNotificationPermission(): Promise<SystemNotificationPermission> {
  if (isStandalone) {
    try {
      const tauri = await import('@tauri-apps/plugin-notification')
      if (await tauri.isPermissionGranted()) return 'granted'
      const result = await tauri.requestPermission()
      if (result === 'granted') return 'granted'
      if (result === 'denied') return 'denied'
    } catch {
      // Fall through to the webview API.
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') {
    return fromBrowserPermission(Notification.permission)
  }
  try {
    return fromBrowserPermission(await Notification.requestPermission())
  } catch {
    // Safari outside a user gesture. Nothing was asked and nothing changed.
    return 'prompt'
  }
}

/**
 * Show one system notification. Throws when the platform showed nothing.
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
      // Either the plugin is unpermitted or it threw. Both fall through to the
      // webview API rather than giving up — see the module comment.
      console.warn('[notifications] Tauri notification failed:', err)
    }
  }

  await showWebNotification(title, body, opts)
}

function showWebNotification(
  title: string,
  body: string,
  opts?: { sound?: boolean },
): Promise<void> {
  if (typeof Notification === 'undefined') {
    throw new Error('This platform cannot show system notifications')
  }

  if (Notification.permission === 'denied') {
    throw new Error(
      'System notifications are blocked — allow them for this site, then try again',
    )
  }

  if (Notification.permission === 'default') {
    // Asking here is a last resort: an alert firing is not a user gesture, so
    // Safari refuses outright and Chrome shows a prompt with no context around
    // it. Settings is where this is supposed to be granted.
    return Notification.requestPermission().then(
      (permission) => {
        if (permission !== 'granted') {
          throw new Error(
            'System notifications are not enabled — turn them on in Settings',
          )
        }
        show(title, body, opts)
      },
      () => {
        throw new Error(
          'System notifications are not enabled — turn them on in Settings',
        )
      },
    )
  }

  show(title, body, opts)
  return Promise.resolve()
}

function show(title: string, body: string, opts?: { sound?: boolean }): void {
  const notification = new Notification(title, {
    body,
    icon: NOTIFICATION_ICON,
    // The channel step's Play Sound toggle used to be desktop-only. The Web
    // Notification API has the inverse flag, so the toggle now means the same
    // thing on both surfaces.
    silent: opts?.sound === false,
  })
  // An alert you click should put the chart in front of you.
  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}
