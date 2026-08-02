// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Workflow DAG Validator ────────────────────────────────────────────
//
// Validates a WorkflowDSL to ensure it forms a valid, executable DAG.
// Used before committing a workflow and before execution.

import { getStepType } from './step-registry'
import type { WorkflowDSL, WorkflowEdgeDSL, WorkflowStepDSL } from './types'

export type ValidationError = {
  stepId?: string
  message: string
}

export type ValidationResult = {
  valid: boolean
  errors: Array<ValidationError>
}

export function validateWorkflow(workflow: WorkflowDSL): ValidationResult {
  const errors: Array<ValidationError> = []

  // 1. Must have at least one step
  if (workflow.steps.length === 0) {
    errors.push({ message: 'Workflow must have at least one step' })
    return { valid: false, errors }
  }

  // 2. Exactly one trigger step
  const triggerSteps = workflow.steps.filter((s) => s.type === 'trigger')
  if (triggerSteps.length === 0) {
    errors.push({ message: 'Workflow must have a trigger step' })
  } else if (triggerSteps.length > 1) {
    for (const t of triggerSteps.slice(1)) {
      errors.push({
        stepId: t.id,
        message: 'Only one trigger step is allowed',
      })
    }
  }

  // 3. No duplicate step IDs
  const stepIds = new Set<string>()
  for (const step of workflow.steps) {
    if (stepIds.has(step.id)) {
      errors.push({ stepId: step.id, message: 'Duplicate step ID' })
    }
    stepIds.add(step.id)
  }

  // 4. All edge references point to existing steps
  for (const edge of workflow.edges) {
    if (!stepIds.has(edge.source)) {
      errors.push({
        message: `Edge "${edge.id}" references non-existent source "${edge.source}"`,
      })
    }
    if (!stepIds.has(edge.target)) {
      errors.push({
        message: `Edge "${edge.id}" references non-existent target "${edge.target}"`,
      })
    }
  }

  // 5. Cycle detection (DFS)
  const cycleErrors = detectCycles(workflow.steps, workflow.edges)
  errors.push(...cycleErrors)

  // 6. Trigger step must not have incoming edges
  if (triggerSteps.length === 1) {
    const triggerId = triggerSteps[0].id
    const incomingToTrigger = workflow.edges.filter(
      (e) => e.target === triggerId,
    )
    if (incomingToTrigger.length > 0) {
      errors.push({
        stepId: triggerId,
        message: 'Trigger step must not have incoming connections',
      })
    }
  }

  // 7. Unreachable steps (not reachable from trigger)
  if (triggerSteps.length === 1) {
    const reachable = findReachable(triggerSteps[0].id, workflow.edges)
    for (const step of workflow.steps) {
      if (step.type !== 'trigger' && !reachable.has(step.id)) {
        errors.push({
          stepId: step.id,
          message: `Step "${step.id}" is not reachable from the trigger`,
        })
      }
    }
  }

  // 8. Per-step validation via registry
  for (const step of workflow.steps) {
    const stepDef = getStepType(step.type)
    if (!stepDef) {
      errors.push({
        stepId: step.id,
        message: `Unknown step type "${step.type}"`,
      })
      continue
    }
    const stepErrors = stepDef.validate(step.data)
    for (const msg of stepErrors) {
      errors.push({ stepId: step.id, message: msg })
    }
  }

  // 9. Handle connection constraints
  const handleErrors = validateHandleConnections(workflow.steps, workflow.edges)
  errors.push(...handleErrors)

  return { valid: errors.length === 0, errors }
}

// ── Cycle Detection (Kahn's algorithm) ───────────────────────────────

function detectCycles(
  steps: Array<WorkflowStepDSL>,
  edges: Array<WorkflowEdgeDSL>,
): Array<ValidationError> {
  const cycleEdgeIds = findCycleEdgeIds(steps, edges)
  if (cycleEdgeIds.size > 0) {
    return [{ message: 'Workflow contains a cycle' }]
  }
  return []
}

/**
 * Returns the IDs of edges that participate in cycles.
 * Uses Kahn's algorithm — after processing, steps with remaining
 * in-degree > 0 are in cycles. Edges between those steps are cycle edges.
 */
export function findCycleEdgeIds(
  steps: Array<WorkflowStepDSL>,
  edges: Array<WorkflowEdgeDSL>,
): Set<string> {
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, Array<string>>()

  for (const step of steps) {
    inDegree.set(step.id, 0)
    adjacency.set(step.id, [])
  }

  for (const edge of edges) {
    if (!inDegree.has(edge.source) || !inDegree.has(edge.target)) continue
    adjacency.get(edge.source)!.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue: Array<string> = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  // Steps still with in-degree > 0 are in cycles
  const cycleSteps = new Set<string>()
  for (const [id, deg] of inDegree) {
    if (deg > 0) cycleSteps.add(id)
  }

  // Edges where both source and target are in the cycle set
  const cycleEdgeIds = new Set<string>()
  for (const edge of edges) {
    if (cycleSteps.has(edge.source) && cycleSteps.has(edge.target)) {
      cycleEdgeIds.add(edge.id)
    }
  }

  return cycleEdgeIds
}

// ── Reachability (BFS from trigger) ──────────────────────────────────

function findReachable(
  startId: string,
  edges: Array<WorkflowEdgeDSL>,
): Set<string> {
  const adjacency = new Map<string, Array<string>>()
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, [])
    adjacency.get(edge.source)!.push(edge.target)
  }

  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor)
    }
  }
  return visited
}

// ── Handle Connection Constraints ────────────────────────────────────

function validateHandleConnections(
  steps: Array<WorkflowStepDSL>,
  edges: Array<WorkflowEdgeDSL>,
): Array<ValidationError> {
  const errors: Array<ValidationError> = []

  for (const step of steps) {
    const stepDef = getStepType(step.type)
    if (!stepDef) continue

    // Check input handle max connections
    for (const handle of stepDef.handles.inputs) {
      if (handle.maxConnections === undefined) continue
      const connections = edges.filter((e) => e.target === step.id).length
      if (connections > handle.maxConnections) {
        errors.push({
          stepId: step.id,
          message: `Input "${handle.id}" exceeds max connections (${handle.maxConnections})`,
        })
      }
    }

    // Check output handle max connections
    for (const handle of stepDef.handles.outputs) {
      if (handle.maxConnections === undefined) continue
      const connections = edges.filter(
        (e) =>
          e.source === step.id &&
          (e.sourceHandle === handle.id ||
            (!e.sourceHandle && handle.id === stepDef.handles.outputs[0]?.id)),
      ).length
      if (connections > handle.maxConnections) {
        errors.push({
          stepId: step.id,
          message: `Output "${handle.id}" exceeds max connections (${handle.maxConnections})`,
        })
      }
    }
  }

  return errors
}

// ── Topological Sort ─────────────────────────────────────────────────
//
// Returns steps in execution order. Used by the executor.

export function topologicalSort(
  steps: Array<WorkflowStepDSL>,
  edges: Array<WorkflowEdgeDSL>,
): Array<WorkflowStepDSL> {
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, Array<string>>()
  const stepMap = new Map<string, WorkflowStepDSL>()

  for (const step of steps) {
    inDegree.set(step.id, 0)
    adjacency.set(step.id, [])
    stepMap.set(step.id, step)
  }

  for (const edge of edges) {
    if (!adjacency.has(edge.source)) continue
    adjacency.get(edge.source)!.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue: Array<string> = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: Array<WorkflowStepDSL> = []
  while (queue.length > 0) {
    const current = queue.shift()!
    const step = stepMap.get(current)
    if (step) sorted.push(step)
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  return sorted
}
