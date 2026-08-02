// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type {
  WorkflowDSL,
  WorkflowStepDSL,
  WorkflowEdgeDSL,
  TriggerStepData,
  MarketOrderStepData,
  LimitOrderStepData,
  TakeProfitStepData,
  StopLossStepData,
  ConditionStepData,
  SplitStepData,
  WaitStepData,
  OrderSide,
  ConditionalOrderParams,
  OrderResult,
  OrderExecutor,
  WorkflowExecutionContext,
  StepExecutionResult,
  WorkflowExecutionResult,
} from './types'

export type {
  HandleDef,
  WorkflowStepConfigField,
  WorkflowStepConfigFieldType,
  StepCategory,
  StepExecuteContext,
  StepMarketCompat,
  WorkflowMarketInfo,
  WorkflowStepTypeDefinition,
} from './step-registry'

export {
  registerStepType,
  registerStepTypes,
  unregisterStepTypes,
  getStepType,
  getAllStepTypes,
  clearRegistry,
} from './step-registry'

export { getCoreStepTypes } from './core-steps'

export type { MarketCompatIssue } from './market-compat'
export { checkWorkflowMarketCompat } from './market-compat'

export type { ValidationError, ValidationResult } from './validator'
export {
  validateWorkflow,
  topologicalSort,
  findCycleEdgeIds,
} from './validator'

export type { WorkflowProgressCallback } from './executor'
export {
  executeWorkflow,
  resolveSide,
  resolveSize,
  resolvePrice,
} from './executor'
