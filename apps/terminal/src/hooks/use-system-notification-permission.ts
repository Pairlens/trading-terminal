// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useState } from 'react'

import type { SystemNotificationPermission } from '@/lib/notifications/platform-notify'
import {
  getSystemNotificationPermission,
  requestSystemNotificationPermission,
} from '@/lib/notifications/platform-notify'

/**
 * Live permission state for system notifications.
 *
 * `null` while the first read is in flight — the check is async (desktop asks
 * the Tauri plugin), and painting "Blocked" for a frame at a granted permission
 * would be a lie in the direction that makes people go turn on a setting they
 * already have.
 *
 * A browser that supports the Permissions API also gets external changes: the
 * user can allow notifications from the padlock menu without touching this
 * dialog, and the card should stop asking them to.
 */
export function useSystemNotificationPermission(): {
  permission: SystemNotificationPermission | null
  request: () => Promise<SystemNotificationPermission>
  refresh: () => void
} {
  const [permission, setPermission] =
    useState<SystemNotificationPermission | null>(null)

  const refresh = useCallback(() => {
    void getSystemNotificationPermission().then(setPermission)
  }, [])

  useEffect(() => {
    let cancelled = false
    void getSystemNotificationPermission().then((next) => {
      if (!cancelled) setPermission(next)
    })

    let status: PermissionStatus | null = null
    const onChange = () => {
      void getSystemNotificationPermission().then((next) => {
        if (!cancelled) setPermission(next)
      })
    }
    // Not everywhere, and `name: 'notifications'` throws on browsers that know
    // the API but not that descriptor. The listener is a bonus, never a
    // precondition.
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'notifications' as PermissionName })
        .then((result) => {
          if (cancelled) return
          status = result
          result.addEventListener('change', onChange)
        })
        .catch(() => undefined)
    }

    return () => {
      cancelled = true
      status?.removeEventListener('change', onChange)
    }
  }, [])

  const request = useCallback(async () => {
    const next = await requestSystemNotificationPermission()
    setPermission(next)
    return next
  }, [])

  return { permission, request, refresh }
}
