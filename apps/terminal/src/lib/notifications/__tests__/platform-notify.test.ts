// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, test } from 'bun:test'

import {
  getSystemNotificationPermission,
  requestSystemNotificationPermission,
  sendOsNotification,
} from '../platform-notify'

/**
 * Browser system notifications, and the one property that matters most:
 * a notification nobody saw must not report success.
 *
 * The runtime records per-channel outcomes so a denied permission shows up in
 * the notification log. That only works if this module throws — a silent
 * `return` on a blocked permission would log "delivered" for an alert that was
 * never shown, which reads exactly like a market that never moved.
 *
 * These run under Bun, so `window`/`Notification` are hand-installed. That also
 * pins the no-Notification-at-all path (WKWebView, insecure context), which is
 * a real platform, not a hypothetical.
 */

type ShownNotification = { title: string; options?: NotificationOptions }

const shown: Array<ShownNotification> = []
let requested = 0

function installNotification(
  permission: NotificationPermission | null,
  requestResult: NotificationPermission | Error = 'granted',
) {
  if (permission === null) {
    // @ts-expect-error — deleting a global the runtime does not have anyway
    delete globalThis.Notification
    return
  }
  class FakeNotification {
    static permission: NotificationPermission = permission
    static requestPermission(): Promise<NotificationPermission> {
      requested++
      if (requestResult instanceof Error) return Promise.reject(requestResult)
      FakeNotification.permission = requestResult
      return Promise.resolve(requestResult)
    }
    onclick: (() => void) | null = null
    constructor(title: string, options?: NotificationOptions) {
      shown.push({ title, options })
    }
    close() {}
  }
  // @ts-expect-error — minimal stand-in for the DOM constructor
  globalThis.Notification = FakeNotification
  // @ts-expect-error — `show()` focuses the window after constructing
  globalThis.window ??= { focus: () => {} }
}

afterEach(() => {
  shown.length = 0
  requested = 0
})

describe('sendOsNotification (browser)', () => {
  test('shows a notification when permission is granted', async () => {
    installNotification('granted')
    await sendOsNotification('Price Alert', 'BTC-USDT above 64000')
    expect(shown).toHaveLength(1)
    expect(shown[0].title).toBe('Price Alert')
    expect(shown[0].options?.body).toBe('BTC-USDT above 64000')
  })

  test('maps the step’s sound toggle onto `silent`', async () => {
    installNotification('granted')
    await sendOsNotification('a', 'b', { sound: false })
    await sendOsNotification('c', 'd', { sound: true })
    expect(shown[0].options?.silent).toBe(true)
    expect(shown[1].options?.silent).toBe(false)
  })

  test('throws when permission is denied — never a silent success', async () => {
    installNotification('denied')
    await expect(sendOsNotification('a', 'b')).rejects.toThrow(/blocked/i)
    expect(shown).toHaveLength(0)
  })

  test('throws when the platform has no Notification at all', async () => {
    installNotification(null)
    await expect(sendOsNotification('a', 'b')).rejects.toThrow(/cannot show/i)
  })

  test('asks once when unasked, and delivers if granted', async () => {
    installNotification('default', 'granted')
    await sendOsNotification('a', 'b')
    expect(requested).toBe(1)
    expect(shown).toHaveLength(1)
  })

  test('throws when the prompt is dismissed', async () => {
    installNotification('default', 'default')
    await expect(sendOsNotification('a', 'b')).rejects.toThrow(/not enabled/i)
    expect(shown).toHaveLength(0)
  })

  test('throws when requesting itself is refused (Safari, no gesture)', async () => {
    installNotification('default', new Error('NotAllowedError'))
    await expect(sendOsNotification('a', 'b')).rejects.toThrow(/not enabled/i)
    expect(shown).toHaveLength(0)
  })
})

describe('permission state', () => {
  test('reports each browser state', async () => {
    installNotification('granted')
    expect(await getSystemNotificationPermission()).toBe('granted')
    installNotification('denied')
    expect(await getSystemNotificationPermission()).toBe('denied')
    installNotification('default')
    expect(await getSystemNotificationPermission()).toBe('prompt')
    installNotification(null)
    expect(await getSystemNotificationPermission()).toBe('unsupported')
  })

  test('reading it never prompts', async () => {
    installNotification('default')
    await getSystemNotificationPermission()
    expect(requested).toBe(0)
  })

  test('a refused request leaves the state askable rather than denied', async () => {
    // Safari rejects outside a user gesture. Nothing was asked, so recording
    // `denied` would hide the Enable button over a prompt that never appeared.
    installNotification('default', new Error('NotAllowedError'))
    expect(await requestSystemNotificationPermission()).toBe('prompt')
  })

  test('requesting on an unsupported platform is a no-op answer', async () => {
    installNotification(null)
    expect(await requestSystemNotificationPermission()).toBe('unsupported')
  })
})
