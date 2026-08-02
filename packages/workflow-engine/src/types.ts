// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Workflow DSL ──────────────────────────────────────────────────────

export type WorkflowDSL = {
  version: 1
  id: string
  name: string
  description?: string
  steps: Array<WorkflowStepDSL>
  edges: Array<WorkflowEdgeDSL>
  createdAt: number
  updatedAt: number
}

export type WorkflowStepDSL = {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export type WorkflowEdgeDSL = {
  id: string
  source: string
  sourceHandle?: string
  target: string
}

// ── Step Data Shapes ─────────────────────────────────────────────────

export type TriggerStepData = {
  // Receives side, amount, pair, market from trade panel submission.
  // No user-configurable fields — it's the entry point.
}

export type MarketOrderStepData = {
  side: 'buy' | 'sell' | 'inherit' | 'opposite'
  sizeMode: 'absolute' | 'percent'
  size: number
}

export type LimitOrderStepData = {
  side: 'buy' | 'sell' | 'inherit' | 'opposite'
  sizeMode: 'absolute' | 'percent'
  size: number
  priceMode: 'absolute' | 'offset-percent' | 'offset-absolute'
  priceValue: number
}

export type TakeProfitStepData = {
  triggerMode: 'percent' | 'absolute'
  triggerValue: number
  sizePercent: number
  orderType: 'market' | 'limit'
  limitPrice?: number
}

export type StopLossStepData = {
  triggerMode: 'percent' | 'absolute'
  triggerValue: number
  sizePercent: number
  orderType: 'market' | 'limit'
  limitPrice?: number
}

export type WaitStepData = {
  duration: number
  unit: 'seconds' | 'minutes' | 'hours'
}

export type ConditionStepData = {
  conditionType: 'price-above' | 'price-below' | 'percent-change'
  /**
   * price-above / price-below: the price level to compare against.
   * percent-change: signed % move from the entry price (trigger or parent
   * fill) — +5 passes when price is up ≥5%, -3 passes when down ≥3%.
   */
  value: number
}

export type SplitStepData = {
  branches: number
}

// ── Execution Types ──────────────────────────────────────────────────

export type OrderSide = 'buy' | 'sell'

export type ConditionalOrderParams = {
  market: string
  pair: string
  side: OrderSide
  size: string
  triggerPrice: string
  triggerType: 'tp' | 'sl'
  orderType: 'market' | 'limit'
  limitPrice?: string
}

export type OrderResult = {
  success: boolean
  orderId?: string
  fillPrice?: number
  fillSize?: string
  error?: string
}

export type OrderExecutor = {
  placeMarketOrder: (params: {
    market: string
    pair: string
    side: OrderSide
    size: string
    tgtCcy?: 'base_ccy' | 'quote_ccy'
  }) => Promise<OrderResult>
  placeLimitOrder: (params: {
    market: string
    pair: string
    side: OrderSide
    size: string
    price: string
  }) => Promise<OrderResult>
  placeConditionalOrder: (
    params: ConditionalOrderParams,
  ) => Promise<OrderResult>
  getCurrentPrice: (market: string, pair: string) => Promise<number>
}

export type WorkflowExecutionContext = {
  workflowId: string
  market: string
  pair: string
  side: OrderSide
  amount: string
  tgtCcy: 'base_ccy' | 'quote_ccy'
  mode: 'paper' | 'live'
}

export type StepExecutionResult = {
  stepId: string
  stepType: string
  stepLabel: string
  status: 'executed' | 'skipped' | 'failed'
  orderId?: string
  fillPrice?: number
  fillSize?: string
  error?: string
}

export type WorkflowExecutionResult = {
  workflowId: string
  workflowName: string
  status: 'completed' | 'partial' | 'failed' | 'cancelled'
  results: Array<StepExecutionResult>
}
