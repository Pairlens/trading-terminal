// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Step Type Registry ───────────────────────────────────────────────
//
// Defines the schema for workflow step types. Plugins contribute step
// type definitions via the 'workflow:step-types' capability. The builder
// collects all definitions at initialization.

import type {
  OrderExecutor,
  StepExecutionResult,
  WorkflowExecutionContext,
  WorkflowStepDSL,
} from './types'

export type HandleDef = {
  id: string
  label?: string
  maxConnections?: number
}

export type WorkflowStepConfigFieldType =
  | 'number'
  | 'select'
  | 'slider'
  | 'toggle'

export type WorkflowStepConfigField = {
  key: string
  type: WorkflowStepConfigFieldType
  label: string
  default: unknown
  options?: Array<{ value: string; label: string }>
  min?: number
  max?: number
  step?: number
  /** Only show this field when another field holds a specific value. */
  showWhen?: { key: string; equals: unknown }
}

export type StepCategory = 'entry' | 'order' | 'exit' | 'logic' | 'custom'

/**
 * Venue/market description a step is checked against. Structurally
 * compatible with the terminal's MarketAdapterInfo — connector feature
 * flags (triggerOrders, dexLimitOrders, walletChain, …) appear as extra
 * keys. The engine stays market-agnostic: steps read whatever flags
 * they care about.
 */
export type WorkflowMarketInfo = {
  marketId: string
  displayName?: string
} & Record<string, unknown>

/**
 * Market-compatibility gate for a step type. Omitted = the step runs on
 * every market. Connector plugins use this to scope their contributed
 * steps (e.g. `check: (m) => m.marketId === 'okx' ? null : '…'`), and
 * core steps use it to require venue features like native trigger orders.
 */
export type StepMarketCompat = {
  /** Short human-readable requirement, e.g. 'Native trigger orders'. */
  requires: string
  /** Return null when `market` can run this step, else a short reason. */
  check: (market: WorkflowMarketInfo) => string | null
}

/** Context passed to a step's execute handler during workflow execution. */
export type StepExecuteContext = {
  step: WorkflowStepDSL
  ctx: WorkflowExecutionContext
  executor: OrderExecutor
  currentPrice: number
  /** Amount available to this step (propagated from parent) */
  effectiveSize: string
  /** Which currency the effectiveSize is denominated in */
  tgtCcy: 'base_ccy' | 'quote_ccy'
  /** Entry price used for TP/SL % calculations */
  entryPrice: number
  /** Aborted when workflow execution is cancelled — long-running steps
   * (e.g. wait) must observe it and stop promptly. */
  signal?: AbortSignal
}

export type WorkflowStepTypeDefinition = {
  type: string
  label: string
  icon: string
  category: StepCategory
  handles: {
    inputs: Array<HandleDef>
    outputs: Array<HandleDef>
  }
  configSchema: Array<WorkflowStepConfigField>
  validate: (data: Record<string, unknown>) => Array<string>
  defaultData: () => Record<string, unknown>
  /** Execution handler called during workflow execution. Passthrough if omitted. */
  execute?: (execCtx: StepExecuteContext) => Promise<StepExecutionResult>
  /** True for steps that use pass/fail branching (e.g. condition steps) */
  branching?: boolean
  /**
   * Set to false for steps whose execute handler never reads currentPrice
   * (e.g. wait) — the executor skips the per-step price fetch.
   */
  needsPrice?: boolean
  /** Market-compatibility gate; omitted = compatible with all markets. */
  compat?: StepMarketCompat
}

// ── Registry ─────────────────────────────────────────────────────────

const registry = new Map<string, WorkflowStepTypeDefinition>()

export function registerStepType(def: WorkflowStepTypeDefinition): void {
  registry.set(def.type, def)
}

export function registerStepTypes(
  defs: Array<WorkflowStepTypeDefinition>,
): void {
  for (const def of defs) {
    registry.set(def.type, def)
  }
}

export function unregisterStepTypes(types: Array<string>): void {
  for (const t of types) {
    registry.delete(t)
  }
}

export function getStepType(
  type: string,
): WorkflowStepTypeDefinition | undefined {
  return registry.get(type)
}

export function getAllStepTypes(): Array<WorkflowStepTypeDefinition> {
  return [...registry.values()]
}

export function clearRegistry(): void {
  registry.clear()
}
