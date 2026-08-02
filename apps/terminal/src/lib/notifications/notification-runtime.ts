// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  dispatchNotification,
  evaluateRule,
} from '@pairlens/notification-engine/evaluator'
import type { ChannelDeliveryResult } from '@pairlens/notification-engine/evaluator'
import type {
  NotificationBinding,
  NotificationEventPayload,
  NotificationRuleDSL,
} from '@pairlens/notification-engine/types'
import { track } from '@/lib/analytics-events'

/**
 * Singleton runtime that receives events from adapters, evaluates rules,
 * and dispatches to channels.
 */
export class NotificationRuntime {
  private cooldowns = new Map<string, number>() // bindingId -> last fire timestamp
  private getRules: (() => Array<NotificationRuleDSL>) | null = null
  private getBindings: (() => Array<NotificationBinding>) | null = null
  private logEntry: ((entry: NotificationLogEntry) => void) | null = null

  start(
    getRules: () => Array<NotificationRuleDSL>,
    getBindings: () => Array<NotificationBinding>,
    logEntry?: (entry: NotificationLogEntry) => void,
  ): void {
    this.getRules = getRules
    this.getBindings = getBindings
    this.logEntry = logEntry ?? null
  }

  stop(): void {
    this.getRules = null
    this.getBindings = null
    this.logEntry = null
    this.cooldowns.clear()
  }

  /**
   * Called by event source adapters when an event occurs.
   */
  async handleEvent(payload: NotificationEventPayload): Promise<void> {
    if (!this.getRules || !this.getBindings) return

    const rules = this.getRules()
    const bindings = this.getBindings()
    const ruleMap = new Map(rules.map((r) => [r.id, r]))

    for (const binding of bindings) {
      if (!binding.enabled) continue
      if (binding.pair !== (payload.pair ?? '')) continue
      if (binding.market && binding.market !== (payload.market ?? '')) continue

      const rule = ruleMap.get(binding.ruleId)
      if (!rule || rule.enabled === false) continue

      // Check cooldown per binding (not per rule)
      if (rule.cooldown && rule.cooldown > 0) {
        const lastFire = this.cooldowns.get(binding.id)
        if (lastFire && Date.now() - lastFire < rule.cooldown * 1000) continue
      }

      const result = evaluateRule(rule, binding, payload)

      if (result.shouldFire && result.message) {
        // Record cooldown per binding
        this.cooldowns.set(binding.id, Date.now())
        track('alert_triggered', { kind: payload.eventType })

        // Dispatch to all channels, then log with per-channel outcomes so
        // failed deliveries (dead webhook, denied OS permission) are
        // visible in the notification log instead of vanishing.
        const deliveries = await dispatchNotification(
          result.message,
          result.channelSteps,
        )
        for (const delivery of deliveries) {
          track('alert_delivery', {
            channel: delivery.channel,
            ok: delivery.ok,
          })
        }

        this.logEntry?.({
          id: crypto.randomUUID(),
          ruleId: rule.id,
          ruleName: rule.name,
          title: result.message.title,
          body: result.message.body,
          severity: result.message.severity,
          timestamp: Date.now(),
          channels: result.channelSteps.map((c) => c.def.type),
          deliveries,
        })
      }
    }
  }
}

export type NotificationLogEntry = {
  id: string
  ruleId: string
  ruleName: string
  title: string
  body: string
  severity: 'info' | 'success' | 'warning' | 'error'
  timestamp: number
  channels: Array<string>
  deliveries?: Array<ChannelDeliveryResult>
}

/** Singleton instance */
export const notificationRuntime = new NotificationRuntime()
