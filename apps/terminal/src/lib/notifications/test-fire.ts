// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  dispatchNotification,
  evaluateRule,
} from '@pairlens/notification-engine/evaluator'
import { getStepType } from '@pairlens/notification-engine/step-registry'
import type {
  NotificationEventPayload,
  NotificationRuleDSL,
  NotificationStepDSL,
} from '@pairlens/notification-engine/types'
import { useNotificationLogStore } from '@/stores/notification-log-store'

export type TestFireOutcome = {
  ok: boolean
  /** Human-readable summary for a toast. */
  detail: string
}

/**
 * Fire a rule once with a synthetic event that satisfies its first event
 * step, delivering to the real channels. Bypasses cooldown and the
 * rule-level enable switch so a rule can be verified before arming it.
 */
export async function sendTestNotification(
  rule: NotificationRuleDSL,
  pair: string,
  market: string,
): Promise<TestFireOutcome> {
  const eventStep = rule.steps.find(
    (s) => getStepType(s.type)?.category === 'event',
  )
  if (!eventStep) {
    return { ok: false, detail: 'Rule has no event step to simulate' }
  }

  const payload = buildTestPayload(eventStep, pair, market)
  const result = evaluateRule(
    { ...rule, enabled: true },
    {
      id: 'test-binding',
      ruleId: rule.id,
      pair,
      market,
      enabled: true,
      createdAt: Date.now(),
    },
    payload,
  )

  if (!result.shouldFire || !result.message) {
    return {
      ok: false,
      detail:
        'No channel was reached — a condition step is blocking the flow with this simulated event',
    }
  }

  const message = {
    ...result.message,
    title: `[Test] ${result.message.title}`,
  }
  const deliveries = await dispatchNotification(message, result.channelSteps)

  useNotificationLogStore.getState().append({
    id: crypto.randomUUID(),
    ruleId: rule.id,
    ruleName: rule.name,
    title: message.title,
    body: message.body,
    severity: message.severity,
    timestamp: Date.now(),
    channels: result.channelSteps.map((c) => c.def.type),
    deliveries,
  })

  const failed = deliveries.filter((d) => !d.ok)
  if (failed.length > 0) {
    return {
      ok: false,
      detail: failed
        .map((f) => `${f.channel}: ${f.error ?? 'delivery failed'}`)
        .join(' · '),
    }
  }
  return {
    ok: true,
    detail: `Delivered to ${deliveries.map((d) => d.channel).join(', ')}`,
  }
}

/**
 * Build an event payload that passes the event step's own filters, so the
 * test exercises conditions and channels rather than dying at the filter.
 */
function buildTestPayload(
  eventStep: NotificationStepDSL,
  pair: string,
  market: string,
): NotificationEventPayload {
  const base = {
    eventType: eventStep.type,
    timestamp: Date.now(),
    pair,
    market,
  }
  const data = eventStep.data

  switch (eventStep.type) {
    case 'price-alert': {
      const target = Number(data.price) > 0 ? Number(data.price) : 100
      const above = data.direction !== 'below'
      const beyond = Number((target * (above ? 1.001 : 0.999)).toPrecision(8))
      const before = Number((target * (above ? 0.999 : 1.001)).toPrecision(8))
      return {
        ...base,
        // Simulate a clean threshold crossing in the configured direction
        price: beyond,
        prevPrice: before,
        data: { percentChange: above ? 1 : -1 },
      }
    }
    case 'order-executed':
      return {
        ...base,
        price: 100,
        data: {
          side: data.side && data.side !== 'any' ? data.side : 'buy',
          status: data.status && data.status !== 'any' ? data.status : 'filled',
        },
      }
    case 'signal-generated':
      return {
        ...base,
        price: 100,
        data: {
          signalType: String(data.signalType || 'test-signal'),
          percentChange: 1,
        },
      }
    case 'candle-close':
      return {
        ...base,
        price: 100,
        data: {
          timeframe: String(data.timeframe ?? '1h'),
          percentChange: 1,
        },
      }
    default:
      // Plugin-contributed event: echo its config as the event data
      return { ...base, price: 100, data: { ...data } }
  }
}
