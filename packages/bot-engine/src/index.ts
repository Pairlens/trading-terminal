// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export { decideTransition } from './decide'
export { evaluateRisk, updateExtreme } from './risk'
export { resolveQuantity } from './sizing'
export type { SizingResult, VenueConstraints } from './sizing'
export { applyFill, checkGuards } from './guards'
export type { BotTradeOutcome, GuardContext } from './guards'
export type {
  BotBar,
  BotDecisionInput,
  BotDefinition,
  BotEvent,
  BotGuardConfig,
  BotGuardState,
  BotIntentReason,
  BotMode,
  BotOrderIntent,
  BotPosition,
  BotSide,
  BotSizing,
  BotStatus,
  CustomIndicatorRiskSpec,
  GuardVerdict,
  RiskExit,
} from './types'
