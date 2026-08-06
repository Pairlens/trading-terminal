// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { toast } from 'sonner'
import {
  getStepType,
  registerStepType,
} from '@pairlens/notification-engine/step-registry'
import { sendOsNotification } from './platform-notify'
import type { NotificationMessage } from '@pairlens/notification-engine/types'
import { isStandalone } from '@/lib/platform'

/**
 * Register concrete delivery implementations for built-in channels.
 * Must be called after core steps are registered.
 */
export function registerChannelDeliveries(): void {
  // Local toast — uses Sonner
  const toastDef = getStepType('local-toast')
  if (toastDef) {
    registerStepType({
      ...toastDef,
      deliver: async (
        _data: Record<string, unknown>,
        msg: NotificationMessage,
      ) => {
        const method =
          msg.severity === 'error'
            ? 'error'
            : msg.severity === 'success'
              ? 'success'
              : msg.severity === 'warning'
                ? 'warning'
                : 'info'
        toast[method](msg.title, { description: msg.body })
      },
    })
  }

  // OS Notification — uses platform API
  const osDef = getStepType('os-notification')
  if (osDef) {
    registerStepType({
      ...osDef,
      deliver: async (
        data: Record<string, unknown>,
        msg: NotificationMessage,
      ) => {
        await sendOsNotification(msg.title, msg.body, {
          sound: data.sound !== false,
        })
      },
    })
  }

  // Webhook — uses fetch
  const webhookDef = getStepType('webhook')
  if (webhookDef) {
    registerStepType({
      ...webhookDef,
      deliver: async (
        data: Record<string, unknown>,
        msg: NotificationMessage,
      ) => {
        const url = String(data.url)
        if (!url) return

        const method = String(data.method ?? 'POST')
        const includePayload = data.includePayload !== false

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }

        const fetchOpts: RequestInit = {
          method,
          headers,
          // A dead endpoint must not hang the dispatch pipeline
          signal: AbortSignal.timeout(10_000),
        }
        if (method === 'POST' && includePayload) {
          fetchOpts.body = JSON.stringify({
            rule: msg.ruleName,
            title: msg.title,
            body: msg.body,
            severity: msg.severity,
            timestamp: msg.timestamp,
            payload: msg.payload,
          })
        }

        let res: Response
        try {
          res = await fetch(url, fetchOpts)
        } catch (err) {
          // A CSP-blocked request fails as an opaque "Failed to fetch", which
          // in the activity log is indistinguishable from a dead endpoint.
          // Name the real cause so the fix (commit the rule again to grant the
          // host, then reload) is discoverable.
          if (isStandalone && err instanceof TypeError) {
            throw new Error(
              `Blocked by the desktop network policy — commit the rule again to allow ${new URL(url).hostname}, then reload`,
            )
          }
          throw err
        }
        if (!res.ok) {
          throw new Error(`Webhook responded ${res.status}`)
        }
      },
    })
  }
}
