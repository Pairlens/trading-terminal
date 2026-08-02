// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Notification Rule Validator ──────────────────────────────────────

import { getStepType } from './step-registry'
import type { NotificationEdgeDSL, NotificationRuleDSL } from './types'

export type ValidationError = {
  message: string
  stepId?: string
}

export type ValidationResult = {
  valid: boolean
  errors: Array<ValidationError>
}

/**
 * Validate a notification rule for structural and semantic correctness.
 */
export function validateRule(rule: NotificationRuleDSL): ValidationResult {
  const errors: Array<ValidationError> = []

  // 1. Must have at least one step
  if (rule.steps.length === 0) {
    errors.push({ message: 'Rule must have at least one step' })
    return { valid: false, errors }
  }

  // 2. At least one event step
  const eventSteps = rule.steps.filter((s) => {
    const def = getStepType(s.type)
    return def?.category === 'event'
  })
  if (eventSteps.length === 0) {
    errors.push({ message: 'Rule must have at least one event step' })
  }

  // 5. No duplicate step IDs
  const stepIds = new Set<string>()
  for (const step of rule.steps) {
    if (stepIds.has(step.id)) {
      errors.push({
        message: `Duplicate step ID: ${step.id}`,
        stepId: step.id,
      })
    }
    stepIds.add(step.id)
  }

  // 6. All edges reference existing steps
  for (const edge of rule.edges) {
    if (!stepIds.has(edge.source)) {
      errors.push({ message: `Edge source "${edge.source}" not found` })
    }
    if (!stepIds.has(edge.target)) {
      errors.push({ message: `Edge target "${edge.target}" not found` })
    }
  }

  // 7. No cycles (Kahn's algorithm)
  const cycleEdges = findCycleEdgeIds(
    rule.steps.map((s) => s.id),
    rule.edges,
  )
  if (cycleEdges.length > 0) {
    errors.push({ message: 'Rule contains cycles' })
  }

  // 8. All non-event steps reachable from at least one event step (BFS)
  if (eventSteps.length > 0 && rule.steps.length > eventSteps.length) {
    const adj = new Map<string, Array<string>>()
    for (const edge of rule.edges) {
      const list = adj.get(edge.source) ?? []
      list.push(edge.target)
      adj.set(edge.source, list)
    }

    const reachable = new Set<string>()
    const queue = eventSteps.map((s) => s.id)
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (reachable.has(cur)) continue
      reachable.add(cur)
      for (const next of adj.get(cur) ?? []) {
        if (!reachable.has(next)) queue.push(next)
      }
    }

    for (const step of rule.steps) {
      const def = getStepType(step.type)
      if (def?.category === 'event') continue // event steps are roots
      if (!reachable.has(step.id)) {
        errors.push({
          message: `Step "${step.id}" is not reachable from any event step`,
          stepId: step.id,
        })
      }
    }
  }

  // 9. Event steps are entry points — they must not have incoming edges
  const eventStepIds = new Set(eventSteps.map((s) => s.id))
  for (const edge of rule.edges) {
    if (eventStepIds.has(edge.target)) {
      errors.push({
        message: 'Event steps cannot have incoming connections',
        stepId: edge.target,
      })
    }
  }

  // 10. At least one channel step
  const channelSteps = rule.steps.filter((s) => {
    const def = getStepType(s.type)
    return def?.category === 'channel'
  })
  if (channelSteps.length === 0) {
    errors.push({ message: 'Rule must have at least one channel step' })
  }

  // 11. Per-step validation
  for (const step of rule.steps) {
    const def = getStepType(step.type)
    if (!def) {
      errors.push({
        message: `Unknown step type: ${step.type}`,
        stepId: step.id,
      })
      continue
    }
    const stepErrors = def.validate(step.data)
    for (const err of stepErrors) {
      errors.push({ message: `${def.label}: ${err}`, stepId: step.id })
    }
  }

  // 12. Cooldown must be non-negative if set
  if (rule.cooldown !== undefined && rule.cooldown < 0) {
    errors.push({ message: 'Cooldown must be non-negative' })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Find edge IDs that participate in cycles (Kahn's algorithm).
 */
export function findCycleEdgeIds(
  nodeIds: Array<string>,
  edges: Array<NotificationEdgeDSL>,
): Array<string> {
  const inDegree = new Map<string, number>()
  for (const id of nodeIds) inDegree.set(id, 0)
  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue: Array<string> = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const removed = new Set<string>()
  while (queue.length > 0) {
    const cur = queue.shift()!
    removed.add(cur)
    for (const edge of edges) {
      if (edge.source === cur) {
        const newDeg = (inDegree.get(edge.target) ?? 1) - 1
        inDegree.set(edge.target, newDeg)
        if (newDeg === 0) queue.push(edge.target)
      }
    }
  }

  return edges
    .filter((e) => !removed.has(e.source) || !removed.has(e.target))
    .map((e) => e.id)
}
