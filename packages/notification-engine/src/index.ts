// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type {
  NotificationRuleDSL,
  NotificationBinding,
  NotificationStepDSL,
  NotificationEdgeDSL,
  NotificationEventPayload,
  NotificationMessage,
  ConfigField,
  ConfigFieldType,
} from './types'

export {
  registerStepType,
  registerStepTypes,
  unregisterStepTypes,
  getStepType,
  getAllStepTypes,
  clearRegistry,
  type NotificationStepCategory,
  type NotificationStepTypeDefinition,
  type HandleDef,
} from './step-registry'

export { CORE_NOTIFICATION_STEPS } from './core-steps'

export {
  evaluateRule,
  dispatchNotification,
  type EvaluationResult,
} from './evaluator'

export {
  PERCENT_WINDOWS,
  PERCENT_WINDOW_MS,
  PERCENT_WINDOW_BASE_TIMEFRAME,
  DEFAULT_SIMPLE_ALERT_CHANNELS,
  PRICE_LEVEL_COOLDOWN_SECONDS,
  SIMPLE_ALERT_CHANNEL_TYPES,
  buildSimpleAlertGraph,
  isPercentWindow,
  isSimpleAlert,
  percentMoveCooldownSeconds,
  readSimpleAlert,
  simpleAlertCooldownSeconds,
  simpleAlertName,
  type PercentWindow,
  type SimpleAlertChannels,
  type SimpleAlertKind,
  type SimpleAlertSpec,
} from './simple-alerts'

export {
  validateRule,
  findCycleEdgeIds,
  type ValidationError,
  type ValidationResult,
} from './validator'
