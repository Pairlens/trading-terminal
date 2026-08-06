// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Notification Rule Evaluator ──────────────────────────────────────
//
// Traverses a notification rule DAG from event steps (entry points)
// through conditions to channel steps. Pair/market matching is done
// via the binding, not on the rule itself.

import { getStepType } from './step-registry'
import type { NotificationStepTypeDefinition } from './step-registry'
import type {
  NotificationBinding,
  NotificationEdgeDSL,
  NotificationEventPayload,
  NotificationMessage,
  NotificationRuleDSL,
  NotificationStepDSL,
} from './types'

export type EvaluationResult = {
  shouldFire: boolean
  message: NotificationMessage | null
  channelSteps: Array<{
    step: NotificationStepDSL
    def: NotificationStepTypeDefinition
  }>
}

/**
 * Evaluate a notification rule against an incoming event payload.
 *
 * @param rule    The pair-agnostic notification flow
 * @param binding The binding that links this rule to a specific pair+market
 * @param payload The event payload to evaluate against
 *
 * 1. Check binding is enabled and pair/market matches
 * 2. Find event steps matching this payload's eventType
 * 3. Build notification message from the matching event step
 * 4. BFS from matching event steps through conditions → channels
 */
export function evaluateRule(
  rule: NotificationRuleDSL,
  binding: NotificationBinding,
  payload: NotificationEventPayload,
): EvaluationResult {
  const noFire: EvaluationResult = {
    shouldFire: false,
    message: null,
    channelSteps: [],
  }

  if (rule.enabled === false) return noFire
  if (!binding.enabled) return noFire

  // Binding-level pair/market matching
  if (binding.pair !== (payload.pair ?? '')) return noFire
  if (binding.market && binding.market !== (payload.market ?? '')) return noFire

  // Find event steps that match this payload
  const matchingEventSteps: Array<NotificationStepDSL> = []
  for (const step of rule.steps) {
    const def = getStepType(step.type)
    if (def?.category !== 'event') continue
    if (step.type !== payload.eventType) continue
    if (!matchesEventFilter(step, payload)) continue
    matchingEventSteps.push(step)
  }

  // Build adjacency list
  const adj = new Map<string, Array<NotificationEdgeDSL>>()
  for (const edge of rule.edges) {
    const list = adj.get(edge.source) ?? []
    list.push(edge)
    adj.set(edge.source, list)
  }

  if (matchingEventSteps.length === 0) return noFire

  // Use the first matching event step to build the notification message.
  // A malformed formatMessage must not kill the evaluation — fall back to
  // the generic message.
  const primaryEvent = matchingEventSteps[0]
  const primaryDef = getStepType(primaryEvent.type)
  let msgParts: { title: string; body: string; severity: string } | undefined
  try {
    msgParts = primaryDef?.formatMessage?.(primaryEvent.data, payload)
  } catch (err) {
    console.warn(
      `[notifications] formatMessage failed for ${primaryEvent.type}:`,
      err,
    )
  }
  msgParts ??= {
    title: 'Notification',
    body: `Event: ${payload.eventType}`,
    severity: 'info',
  }

  const message: NotificationMessage = {
    ruleId: rule.id,
    ruleName: rule.name,
    title: msgParts.title,
    body: msgParts.body,
    severity: msgParts.severity as NotificationMessage['severity'],
    timestamp: Date.now(),
    payload,
  }

  // BFS from all matching event steps through conditions to channels
  const channelSteps: EvaluationResult['channelSteps'] = []
  const visited = new Set<string>()
  const queue = matchingEventSteps.map((s) => s.id)

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const outEdges = adj.get(currentId) ?? []
    const currentStep = rule.steps.find((s) => s.id === currentId)
    if (!currentStep) continue

    const currentDef = getStepType(currentStep.type)
    if (!currentDef) continue

    // Collect channel steps
    if (currentDef.category === 'channel') {
      channelSteps.push({ step: currentStep, def: currentDef })
      continue
    }

    // Condition branching. A throwing evaluate() routes to the fail
    // branch instead of aborting the whole evaluation.
    if (currentDef.category === 'condition' && currentDef.branching) {
      let passes: boolean
      try {
        passes = currentDef.evaluate?.(currentStep.data, payload) ?? true
      } catch (err) {
        console.warn(
          `[notifications] Condition ${currentStep.type} threw during evaluate:`,
          err,
        )
        passes = false
      }
      const handleId = passes ? 'pass' : 'fail'
      for (const edge of outEdges) {
        if (edge.sourceHandle === handleId) {
          queue.push(edge.target)
        }
      }
      continue
    }

    // Default: follow all outgoing edges
    for (const edge of outEdges) {
      queue.push(edge.target)
    }
  }

  return {
    shouldFire: channelSteps.length > 0,
    message: channelSteps.length > 0 ? message : null,
    channelSteps,
  }
}

export type ChannelDeliveryResult = {
  channel: string
  ok: boolean
  error?: string
}

/**
 * Dispatch a notification message to all resolved channels. One channel
 * failing never blocks the others; per-channel outcomes are returned so
 * callers can log them.
 */
export async function dispatchNotification(
  message: NotificationMessage,
  channelSteps: EvaluationResult['channelSteps'],
): Promise<Array<ChannelDeliveryResult>> {
  const deliveries = channelSteps.map(
    async ({ step, def }): Promise<ChannelDeliveryResult> => {
      if (!def.deliver) {
        return {
          channel: def.type,
          ok: false,
          error: 'No delivery implementation registered',
        }
      }
      try {
        await def.deliver(step.data, message)
        return { channel: def.type, ok: true }
      } catch (err) {
        console.warn(
          `[notifications] Channel ${def.type} delivery failed:`,
          err,
        )
        return {
          channel: def.type,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )
  return Promise.all(deliveries)
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Event-specific matching (side/status filters — NOT pair/market). */
function matchesEventFilter(
  eventStep: NotificationStepDSL,
  payload: NotificationEventPayload,
): boolean {
  const data = eventStep.data

  // Filter by side if specified (order-executed)
  if (
    data.side &&
    data.side !== 'any' &&
    payload.data.side &&
    String(data.side) !== String(payload.data.side)
  ) {
    return false
  }

  // Filter by status if specified (order-executed)
  if (
    data.status &&
    data.status !== 'any' &&
    payload.data.status &&
    String(data.status) !== String(payload.data.status)
  ) {
    return false
  }

  // Filter by signal type if specified (signal-generated). A rule that names
  // a strategy must NOT match a payload that carries no signal type at all —
  // guarding on `payload.data.signalType` made every unlabelled event match
  // every rule, which is how "breakout only" alerts fired on plain closes.
  if (data.signalType && String(data.signalType).trim() !== '') {
    if (String(data.signalType) !== String(payload.data.signalType ?? '')) {
      return false
    }
  }

  // Filter by timeframe (candle-close, signal-generated, indicator-alert).
  // One candle subscription is shared by every rule on the same pair, so
  // without this a rule configured for 1d fires on the 1h stream another rule
  // opened — and then formats the message with its OWN timeframe, claiming a
  // daily close that never happened. Indicator alerts additionally arrive from
  // two sources (the open chart and the headless runner), so a rule watching
  // 4h must ignore the ones the 1h chart produces.
  if (
    eventStep.type === 'candle-close' ||
    eventStep.type === 'signal-generated' ||
    eventStep.type === 'indicator-alert'
  ) {
    const want = data.timeframe
    if (
      want &&
      String(want).trim() !== '' &&
      String(want) !== String(payload.data.timeframe ?? '')
    ) {
      return false
    }
  }

  // Filter by indicator + condition (indicator-alert). A blank field means
  // "any", so a rule can watch one condition of one script or all of them.
  if (eventStep.type === 'indicator-alert') {
    if (
      data.indicator &&
      String(data.indicator) !== String(payload.data.indicator ?? '') &&
      String(data.indicator) !== String(payload.data.indicatorTitle ?? '')
    ) {
      return false
    }
    if (
      data.condition &&
      String(data.condition) !== String(payload.data.condition ?? '')
    ) {
      return false
    }
  }

  // Filter by price threshold (price-alert). When the payload carries the
  // previously observed price, only fire on threshold CROSSING — not on
  // every tick while the price sits past the level. On the first tick
  // (no prevPrice) fire if the level is already breached, so a freshly
  // armed alert whose condition is already true still notifies once.
  if (eventStep.type === 'price-alert') {
    const target = Number(data.price ?? 0)
    const current = payload.price ?? 0
    const prev = payload.prevPrice
    if (target > 0) {
      if (data.direction === 'above') {
        if (current < target) return false
        if (typeof prev === 'number' && prev >= target) return false
      }
      if (data.direction === 'below') {
        if (current > target) return false
        if (typeof prev === 'number' && prev <= target) return false
      }
    }
  }

  return true
}
