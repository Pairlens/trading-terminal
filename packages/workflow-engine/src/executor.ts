// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Workflow Executor ─────────────────────────────────────────────────
//
// Event-driven DAG executor with join semantics. A step fires as soon as
// ALL of its parent edges have resolved — it never waits for unrelated
// steps. This means a long `wait` step in one branch does not delay
// sibling branches (the old wave-based executor stalled the whole level
// on the slowest step).
//
// Cycles are prevented by the validator (Kahn's algorithm) before
// execution. The executor itself uses in-degree tracking to determine
// when a step is ready to fire.
//
// Execution logic for each step type lives on the step definition
// itself (WorkflowStepTypeDefinition.execute). The executor dispatches
// generically — it has no knowledge of specific step types.

import { getStepType } from './step-registry'
import type {
  OrderExecutor,
  OrderSide,
  StepExecutionResult,
  WorkflowDSL,
  WorkflowEdgeDSL,
  WorkflowExecutionContext,
  WorkflowExecutionResult,
} from './types'

// ── Internal Execution State ─────────────────────────────────────────

type StepState = {
  stepId: string
  stepType: string
  result: StepExecutionResult | null
  /** Amount available to this step (propagated from parent) */
  effectiveSize: string
  /** Which currency the effectiveSize is denominated in */
  tgtCcy: 'base_ccy' | 'quote_ccy'
  /** Entry price used for TP/SL % calculations */
  entryPrice: number
  /** Number of parent edges that haven't resolved yet (completed, failed, or skipped) */
  pendingParents: number
  /** Whether at least one parent completed on a live (non-skipped) path */
  hasLiveParent: boolean
  /** Whether this step was skipped (all parent paths skipped/failed) */
  skipped: boolean
}

// ── Exported Helpers ─────────────────────────────────────────────────
// Used by core step execute handlers and available to third-party plugins.

export function resolveSide(
  stepSide: 'buy' | 'sell' | 'inherit' | 'opposite',
  contextSide: OrderSide,
): OrderSide {
  if (stepSide === 'inherit') return contextSide
  if (stepSide === 'opposite') return contextSide === 'buy' ? 'sell' : 'buy'
  return stepSide
}

export function resolveSize(
  mode: 'absolute' | 'percent',
  value: number,
  parentSize: string,
): string {
  if (mode === 'absolute') return String(value)
  const base = parseFloat(parentSize)
  if (!Number.isFinite(base) || base <= 0) return '0'
  return String(base * (value / 100))
}

export function resolvePrice(
  mode: 'absolute' | 'offset-percent' | 'offset-absolute',
  value: number,
  currentPrice: number,
): number {
  switch (mode) {
    case 'absolute':
      return value
    case 'offset-percent':
      return currentPrice * (1 + value / 100)
    case 'offset-absolute':
      return currentPrice + value
  }
}

// ── Main Entry Point ─────────────────────────────────────────────────

export type WorkflowProgressCallback = (result: StepExecutionResult) => void

export type ExecuteWorkflowOptions = {
  /** Called after each step resolves (executed, skipped, or failed). */
  onStepComplete?: WorkflowProgressCallback
  /**
   * Aborting cancels pending waits and prevents new steps from starting.
   * Steps already awaiting an order placement finish naturally — an order
   * that has been sent to the exchange cannot be recalled.
   */
  signal?: AbortSignal
}

export async function executeWorkflow(
  workflow: WorkflowDSL,
  ctx: WorkflowExecutionContext,
  executor: OrderExecutor,
  options: ExecuteWorkflowOptions = {},
): Promise<WorkflowExecutionResult> {
  const { onStepComplete, signal } = options
  const results: Array<StepExecutionResult> = []

  // Build adjacency maps
  const outEdges = new Map<string, Array<WorkflowEdgeDSL>>()
  const inEdges = new Map<string, Array<WorkflowEdgeDSL>>()
  for (const edge of workflow.edges) {
    if (!outEdges.has(edge.source)) outEdges.set(edge.source, [])
    outEdges.get(edge.source)!.push(edge)
    if (!inEdges.has(edge.target)) inEdges.set(edge.target, [])
    inEdges.get(edge.target)!.push(edge)
  }

  // Initialize step states with in-degree counts
  const stepStates = new Map<string, StepState>()
  for (const step of workflow.steps) {
    const parentCount = (inEdges.get(step.id) ?? []).length
    stepStates.set(step.id, {
      stepId: step.id,
      stepType: step.type,
      result: null,
      effectiveSize: ctx.amount,
      tgtCcy: ctx.tgtCcy,
      entryPrice: 0,
      pendingParents: parentCount,
      hasLiveParent: false,
      skipped: false,
    })
  }

  // Find trigger step
  const triggerStep = workflow.steps.find((s) => s.type === 'trigger')
  if (!triggerStep) {
    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'failed',
      results: [
        {
          stepId: '',
          stepType: 'trigger',
          stepLabel: 'Trigger',
          status: 'failed',
          error: 'No trigger step found',
        },
      ],
    }
  }

  // ── Event-driven execution ──────────────────────────────────────────
  // Each parent edge resolves exactly once, as either "live" (parent
  // completed on a non-skipped path) or "skipped" (branch not taken,
  // parent failed, or parent skipped). A join child fires as soon as all
  // its parent edges have resolved and at least one is live; it is only
  // skipped once ALL of its parent edges have resolved as skipped. This
  // preserves diamond patterns where a live path and a skipped path feed
  // the same step — and lets independent branches progress at their own
  // pace.

  let active = 0
  let settle!: () => void
  const allSettled = new Promise<void>((resolve) => {
    settle = resolve
  })

  const fire = (stepId: string): void => {
    active++
    void runStep(stepId).finally(() => {
      active--
      if (active === 0) settle()
    })
  }

  const resolveLiveEdge = (parent: StepState, childId: string): void => {
    const childState = stepStates.get(childId)
    if (!childState || childState.result || childState.skipped) return
    propagateState(parent, childState)
    childState.hasLiveParent = true
    childState.pendingParents--
    if (childState.pendingParents <= 0) {
      fire(childId)
    }
  }

  const resolveSkippedEdge = (childId: string, reason: string): void => {
    const childState = stepStates.get(childId)
    if (!childState || childState.result || childState.skipped) return
    childState.pendingParents--
    if (childState.pendingParents > 0) return
    if (childState.hasLiveParent) {
      // Another parent already completed on a live path — fire normally
      fire(childId)
      return
    }
    // Every parent path resolved as skipped/failed — skip and cascade
    markStepSkipped(childState, results, reason, onStepComplete)
    for (const edge of outEdges.get(childId) ?? []) {
      resolveSkippedEdge(edge.target, reason)
    }
  }

  const resolveChildren = (stepId: string): void => {
    const state = stepStates.get(stepId)!
    if (!state.result) return

    const step = workflow.steps.find((s) => s.id === stepId)!
    const stepDef = getStepType(step.type)
    const children = outEdges.get(stepId) ?? []

    // Handle branching steps (condition-like: pass/fail routing)
    if (stepDef?.branching) {
      const passed = state.result.status === 'executed'
      for (const edge of children) {
        const isPassBranch =
          edge.sourceHandle === 'pass' || edge.sourceHandle === undefined
        const isFailBranch = edge.sourceHandle === 'fail'

        if ((passed && isFailBranch) || (!passed && isPassBranch)) {
          resolveSkippedEdge(
            edge.target,
            passed ? 'Condition passed (fail branch)' : 'Condition not met',
          )
        } else {
          resolveLiveEdge(state, edge.target)
        }
      }
    } else if (state.result.status === 'failed') {
      for (const edge of children) {
        resolveSkippedEdge(edge.target, 'Parent failed')
      }
    } else if (state.result.status === 'skipped') {
      for (const edge of children) {
        resolveSkippedEdge(edge.target, 'Parent skipped')
      }
    } else {
      for (const edge of children) {
        resolveLiveEdge(state, edge.target)
      }
    }
  }

  const runStep = async (stepId: string): Promise<void> => {
    const state = stepStates.get(stepId)!
    if (state.result || state.skipped) return

    const step = workflow.steps.find((s) => s.id === stepId)!
    const stepDef = getStepType(step.type)
    const label = stepDef?.label ?? step.type

    let result: StepExecutionResult
    if (signal?.aborted) {
      result = {
        stepId: step.id,
        stepType: step.type,
        stepLabel: label,
        status: 'skipped',
        error: 'Cancelled',
      }
    } else {
      try {
        if (stepDef?.execute) {
          // Fetch a fresh price per step so conditions, orders, and
          // TP/SL placed after a wait never evaluate against stale data.
          // Steps that don't consume price (needsPrice: false) skip the
          // fetch entirely.
          const currentPrice =
            stepDef.needsPrice === false
              ? 0
              : await executor.getCurrentPrice(ctx.market, ctx.pair)
          result = await stepDef.execute({
            step,
            ctx,
            executor,
            currentPrice,
            effectiveSize: state.effectiveSize,
            tgtCcy: state.tgtCcy,
            entryPrice: state.entryPrice,
            signal,
          })
        } else {
          // Passthrough for steps without execute (e.g. split)
          result = {
            stepId: step.id,
            stepType: step.type,
            stepLabel: label,
            status: 'executed',
          }
        }
      } catch (err) {
        const cancelled = signal?.aborted === true
        result = {
          stepId: step.id,
          stepType: step.type,
          stepLabel: label,
          status: cancelled ? 'skipped' : 'failed',
          error: cancelled
            ? 'Cancelled'
            : err instanceof Error
              ? err.message
              : String(err),
        }
      }
    }

    state.result = result
    results.push(result)
    onStepComplete?.(result)
    resolveChildren(stepId)
  }

  fire(triggerStep.id)
  await allSettled

  // Determine overall status
  const hasFailures = results.some((r) => r.status === 'failed')
  const hasRealExecutions = results.some(
    (r) => r.status === 'executed' && r.stepType !== 'trigger',
  )
  let status: WorkflowExecutionResult['status'] = 'completed'
  if (signal?.aborted) {
    status = 'cancelled'
  } else if (hasFailures && hasRealExecutions) {
    status = 'partial'
  } else if (hasFailures) {
    status = 'failed'
  }

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    status,
    results,
  }
}

// ── State Propagation ────────────────────────────────────────────────

function propagateState(parent: StepState, child: StepState): void {
  const parentResult = parent.result
  if (!parentResult) return
  child.effectiveSize = parentResult.fillSize ?? parent.effectiveSize
  child.tgtCcy = parent.tgtCcy
  child.entryPrice = parentResult.fillPrice ?? parent.entryPrice
}

// ── Skip Step ────────────────────────────────────────────────────────

function markStepSkipped(
  state: StepState,
  results: Array<StepExecutionResult>,
  reason: string,
  onStepComplete?: WorkflowProgressCallback,
): void {
  state.skipped = true
  const stepDef = getStepType(state.stepType)
  const result: StepExecutionResult = {
    stepId: state.stepId,
    stepType: state.stepType,
    stepLabel: stepDef?.label ?? state.stepType,
    status: 'skipped',
    error: reason,
  }
  state.result = result
  results.push(result)
  onStepComplete?.(result)
}
