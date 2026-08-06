// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { PriceAlertStep } from './price-alert-step'
import { OrderExecutedStep } from './order-executed-step'
import { SignalGeneratedStep } from './signal-generated-step'
import { IndicatorAlertStep } from './indicator-alert-step'
import { CandleCloseStep } from './candle-close-step'
import { PriceConditionStep } from './price-condition-step'
import { PercentChangeStep } from './percent-change-step'
import { TimeWindowStep } from './time-window-step'
import { LocalToastStep } from './local-toast-step'
import { OsNotificationStep } from './os-notification-step'
import { WebhookStep } from './webhook-step'
import type { NodeProps } from '@xyflow/react'
import type { ComponentType } from 'react'

export {
  PriceAlertStep,
  OrderExecutedStep,
  SignalGeneratedStep,
  IndicatorAlertStep,
  CandleCloseStep,
  PriceConditionStep,
  PercentChangeStep,
  TimeWindowStep,
  LocalToastStep,
  OsNotificationStep,
  WebhookStep,
}

/** Map from step type string to ReactFlow node component. */
export const notificationStepComponents: Record<
  string,
  ComponentType<NodeProps>
> = {
  'price-alert': PriceAlertStep,
  'order-executed': OrderExecutedStep,
  'signal-generated': SignalGeneratedStep,
  'indicator-alert': IndicatorAlertStep,
  'candle-close': CandleCloseStep,
  'price-condition': PriceConditionStep,
  'percent-change': PercentChangeStep,
  'time-window': TimeWindowStep,
  'local-toast': LocalToastStep,
  'os-notification': OsNotificationStep,
  webhook: WebhookStep,
}
