// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Core Step Type Definitions ───────────────────────────────────────
//
// These ship with pairlens-core. Third-party plugins can register
// additional step types via the 'workflow:step-types' capability.

import { resolvePrice, resolveSide, resolveSize } from './executor'
import type {
  StepMarketCompat,
  WorkflowMarketInfo,
  WorkflowStepTypeDefinition,
} from './step-registry'
import type {
  ConditionStepData,
  LimitOrderStepData,
  MarketOrderStepData,
  OrderSide,
  StopLossStepData,
  TakeProfitStepData,
  WaitStepData,
} from './types'

function requireNumber(
  data: Record<string, unknown>,
  key: string,
  label: string,
  opts?: { min?: number; max?: number; positive?: boolean },
): Array<string> {
  const v = data[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return [`${label} must be a number`]
  }
  if (opts?.positive && v <= 0) {
    return [`${label} must be greater than 0`]
  }
  if (opts?.min !== undefined && v < opts.min) {
    return [`${label} must be at least ${opts.min}`]
  }
  if (opts?.max !== undefined && v > opts.max) {
    return [`${label} must be at most ${opts.max}`]
  }
  return []
}

function requireOneOf(
  data: Record<string, unknown>,
  key: string,
  label: string,
  values: Array<string>,
): Array<string> {
  if (!values.includes(String(data[key]))) {
    return [`${label} must be one of: ${values.join(', ')}`]
  }
  return []
}

// ── Market compatibility gates ───────────────────────────────────────

/** DEX venues (identified by walletChain) rest orders on-chain or via a
 * limit-order protocol — only possible when the connector advertises
 * dexLimitOrders. CEX venues all support resting limit orders. */
function supportsRestingLimit(m: WorkflowMarketInfo): boolean {
  return m.walletChain == null || m.dexLimitOrders === true
}

const restingLimitCompat: StepMarketCompat = {
  requires: 'Resting limit orders',
  check: (m) =>
    supportsRestingLimit(m)
      ? null
      : 'this venue cannot rest limit orders (swap-only DEX)',
}

/** Stop-losses need an exchange-native trigger order — emulating one
 * with a resting limit fills immediately, the opposite of a stop. */
const triggerOrderCompat: StepMarketCompat = {
  requires: 'Native trigger orders',
  check: (m) =>
    m.triggerOrders === true
      ? null
      : 'this venue has no exchange-native trigger orders, so a stop-loss cannot rest on the exchange',
}

/** Take-profits fall back to a resting limit order at the trigger price
 * when the venue lacks native triggers, so either capability works. */
const takeProfitCompat: StepMarketCompat = {
  requires: 'Native trigger orders or resting limit orders',
  check: (m) =>
    m.triggerOrders === true || supportsRestingLimit(m)
      ? null
      : 'this venue supports neither trigger orders nor resting limit orders',
}

// ── Trigger ──────────────────────────────────────────────────────────

const triggerStep: WorkflowStepTypeDefinition = {
  type: 'trigger',
  label: 'Order Input',
  icon: 'Play',
  category: 'entry',
  handles: {
    inputs: [],
    outputs: [{ id: 'out' }],
  },
  configSchema: [],
  validate: () => [],
  defaultData: () => ({}),
  execute: async ({ step, ctx, currentPrice }) => ({
    stepId: step.id,
    stepType: step.type,
    stepLabel: 'Order Input',
    status: 'executed',
    fillPrice: currentPrice,
    fillSize: ctx.amount,
  }),
}

// ── Market Order ─────────────────────────────────────────────────────

const marketOrderStep: WorkflowStepTypeDefinition = {
  type: 'market-order',
  label: 'Market Order',
  icon: 'Zap',
  category: 'order',
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [{ id: 'out' }],
  },
  configSchema: [
    {
      key: 'side',
      type: 'select',
      label: 'Side',
      default: 'inherit',
      options: [
        { value: 'inherit', label: 'Same as trigger' },
        { value: 'opposite', label: 'Opposite of trigger' },
        { value: 'buy', label: 'Buy' },
        { value: 'sell', label: 'Sell' },
      ],
    },
    {
      key: 'sizeMode',
      type: 'select',
      label: 'Size Mode',
      default: 'percent',
      options: [
        { value: 'percent', label: '% of input' },
        { value: 'absolute', label: 'Fixed amount' },
      ],
    },
    {
      key: 'size',
      type: 'number',
      label: 'Size',
      default: 100,
      min: 0,
    },
  ],
  validate: (data) => [
    ...requireOneOf(data, 'side', 'Side', [
      'buy',
      'sell',
      'inherit',
      'opposite',
    ]),
    ...requireOneOf(data, 'sizeMode', 'Size mode', ['absolute', 'percent']),
    ...requireNumber(data, 'size', 'Size', { positive: true }),
  ],
  defaultData: () => ({ side: 'inherit', sizeMode: 'percent', size: 100 }),
  execute: async ({ step, ctx, executor, effectiveSize, tgtCcy }) => {
    const data = step.data as unknown as MarketOrderStepData
    const side = resolveSide(data.side, ctx.side)
    const size = resolveSize(data.sizeMode, data.size, effectiveSize)
    const finalTgtCcy = data.sizeMode === 'percent' ? tgtCcy : 'base_ccy'

    const result = await executor.placeMarketOrder({
      market: ctx.market,
      pair: ctx.pair,
      side,
      size,
      tgtCcy: finalTgtCcy,
    })

    return {
      stepId: step.id,
      stepType: step.type,
      stepLabel: 'Market Order',
      status: result.success ? 'executed' : 'failed',
      orderId: result.orderId,
      fillPrice: result.fillPrice,
      fillSize: result.fillSize,
      error: result.error,
    }
  },
}

// ── Limit Order ──────────────────────────────────────────────────────

const limitOrderStep: WorkflowStepTypeDefinition = {
  type: 'limit-order',
  label: 'Limit Order',
  icon: 'Clock',
  category: 'order',
  compat: restingLimitCompat,
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [{ id: 'out' }],
  },
  configSchema: [
    {
      key: 'side',
      type: 'select',
      label: 'Side',
      default: 'inherit',
      options: [
        { value: 'inherit', label: 'Same as trigger' },
        { value: 'opposite', label: 'Opposite of trigger' },
        { value: 'buy', label: 'Buy' },
        { value: 'sell', label: 'Sell' },
      ],
    },
    {
      key: 'sizeMode',
      type: 'select',
      label: 'Size Mode',
      default: 'percent',
      options: [
        { value: 'percent', label: '% of input' },
        { value: 'absolute', label: 'Fixed amount' },
      ],
    },
    {
      key: 'size',
      type: 'number',
      label: 'Size',
      default: 100,
      min: 0,
    },
    {
      key: 'priceMode',
      type: 'select',
      label: 'Price Mode',
      default: 'offset-percent',
      options: [
        { value: 'absolute', label: 'Fixed price' },
        { value: 'offset-percent', label: '% from current' },
        { value: 'offset-absolute', label: 'Offset from current' },
      ],
    },
    {
      key: 'priceValue',
      type: 'number',
      label: 'Price Value',
      default: 0,
    },
  ],
  validate: (data) => [
    ...requireOneOf(data, 'side', 'Side', [
      'buy',
      'sell',
      'inherit',
      'opposite',
    ]),
    ...requireOneOf(data, 'sizeMode', 'Size mode', ['absolute', 'percent']),
    ...requireNumber(data, 'size', 'Size', { positive: true }),
    ...requireOneOf(data, 'priceMode', 'Price mode', [
      'absolute',
      'offset-percent',
      'offset-absolute',
    ]),
    ...requireNumber(data, 'priceValue', 'Price value'),
    ...(data.priceMode === 'absolute'
      ? requireNumber(data, 'priceValue', 'Price value', { positive: true })
      : []),
  ],
  defaultData: () => ({
    side: 'inherit',
    sizeMode: 'percent',
    size: 100,
    priceMode: 'offset-percent',
    priceValue: 0,
  }),
  execute: async ({ step, ctx, executor, effectiveSize, currentPrice }) => {
    const data = step.data as unknown as LimitOrderStepData
    const side = resolveSide(data.side, ctx.side)
    const size = resolveSize(data.sizeMode, data.size, effectiveSize)
    const price = resolvePrice(data.priceMode, data.priceValue, currentPrice)

    const result = await executor.placeLimitOrder({
      market: ctx.market,
      pair: ctx.pair,
      side,
      size,
      price: String(price),
    })

    return {
      stepId: step.id,
      stepType: step.type,
      stepLabel: 'Limit Order',
      status: result.success ? 'executed' : 'failed',
      orderId: result.orderId,
      fillPrice: result.fillPrice,
      fillSize: result.fillSize,
      error: result.error,
    }
  },
}

// ── Take Profit ──────────────────────────────────────────────────────

const takeProfitStep: WorkflowStepTypeDefinition = {
  type: 'take-profit',
  label: 'Take Profit',
  icon: 'TrendingUp',
  category: 'exit',
  compat: takeProfitCompat,
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [{ id: 'out' }],
  },
  configSchema: [
    {
      key: 'triggerMode',
      type: 'select',
      label: 'Trigger Mode',
      default: 'percent',
      options: [
        { value: 'percent', label: '% gain' },
        { value: 'absolute', label: 'Price level' },
      ],
    },
    {
      key: 'triggerValue',
      type: 'number',
      label: 'Trigger Value',
      default: 5,
      min: 0.001,
    },
    {
      key: 'sizePercent',
      type: 'slider',
      label: 'Close %',
      default: 100,
      min: 1,
      max: 100,
      step: 1,
    },
    {
      key: 'orderType',
      type: 'select',
      label: 'Order Type',
      default: 'market',
      options: [
        { value: 'market', label: 'Market' },
        { value: 'limit', label: 'Limit' },
      ],
    },
    {
      key: 'limitPrice',
      type: 'number',
      label: 'Limit Price',
      default: 0,
      min: 0,
      showWhen: { key: 'orderType', equals: 'limit' },
    },
  ],
  validate: (data) => [
    ...requireOneOf(data, 'triggerMode', 'Trigger mode', [
      'percent',
      'absolute',
    ]),
    ...requireNumber(data, 'triggerValue', 'Trigger value', { min: 0.001 }),
    ...requireNumber(data, 'sizePercent', 'Close %', { min: 1, max: 100 }),
    ...requireOneOf(data, 'orderType', 'Order type', ['market', 'limit']),
    ...(data.orderType === 'limit'
      ? requireNumber(data, 'limitPrice', 'Limit price', { positive: true })
      : []),
  ],
  defaultData: () => ({
    triggerMode: 'percent',
    triggerValue: 5,
    sizePercent: 100,
    orderType: 'market',
    limitPrice: 0,
  }),
  execute: async ({
    step,
    ctx,
    executor,
    effectiveSize,
    entryPrice,
    currentPrice,
  }) => {
    const data = step.data as unknown as TakeProfitStepData
    const exitSide: OrderSide = ctx.side === 'buy' ? 'sell' : 'buy'
    const size = resolveSize('percent', data.sizePercent, effectiveSize)

    const referencePrice = entryPrice || currentPrice
    const triggerPrice =
      data.triggerMode === 'percent'
        ? referencePrice * (1 + data.triggerValue / 100)
        : data.triggerValue

    const result = await executor.placeConditionalOrder({
      market: ctx.market,
      pair: ctx.pair,
      side: exitSide,
      size,
      triggerPrice: String(triggerPrice),
      triggerType: 'tp',
      orderType: data.orderType,
      limitPrice:
        data.orderType === 'limit' && data.limitPrice
          ? String(data.limitPrice)
          : undefined,
    })

    return {
      stepId: step.id,
      stepType: step.type,
      stepLabel: 'Take Profit',
      status: result.success ? 'executed' : 'failed',
      orderId: result.orderId,
      error: result.error,
    }
  },
}

// ── Stop Loss ────────────────────────────────────────────────────────

const stopLossStep: WorkflowStepTypeDefinition = {
  type: 'stop-loss',
  label: 'Stop Loss',
  icon: 'ShieldAlert',
  category: 'exit',
  compat: triggerOrderCompat,
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [{ id: 'out' }],
  },
  configSchema: [
    {
      key: 'triggerMode',
      type: 'select',
      label: 'Trigger Mode',
      default: 'percent',
      options: [
        { value: 'percent', label: '% loss' },
        { value: 'absolute', label: 'Price level' },
      ],
    },
    {
      key: 'triggerValue',
      type: 'number',
      label: 'Trigger Value',
      default: 3,
      min: 0.001,
    },
    {
      key: 'sizePercent',
      type: 'slider',
      label: 'Close %',
      default: 100,
      min: 1,
      max: 100,
      step: 1,
    },
    {
      key: 'orderType',
      type: 'select',
      label: 'Order Type',
      default: 'market',
      options: [
        { value: 'market', label: 'Market' },
        { value: 'limit', label: 'Limit' },
      ],
    },
    {
      key: 'limitPrice',
      type: 'number',
      label: 'Limit Price',
      default: 0,
      min: 0,
      showWhen: { key: 'orderType', equals: 'limit' },
    },
  ],
  validate: (data) => [
    ...requireOneOf(data, 'triggerMode', 'Trigger mode', [
      'percent',
      'absolute',
    ]),
    ...requireNumber(data, 'triggerValue', 'Trigger value', { min: 0.001 }),
    ...requireNumber(data, 'sizePercent', 'Close %', { min: 1, max: 100 }),
    ...requireOneOf(data, 'orderType', 'Order type', ['market', 'limit']),
    ...(data.orderType === 'limit'
      ? requireNumber(data, 'limitPrice', 'Limit price', { positive: true })
      : []),
  ],
  defaultData: () => ({
    triggerMode: 'percent',
    triggerValue: 3,
    sizePercent: 100,
    orderType: 'market',
    limitPrice: 0,
  }),
  execute: async ({
    step,
    ctx,
    executor,
    effectiveSize,
    entryPrice,
    currentPrice,
  }) => {
    const data = step.data as unknown as StopLossStepData
    const exitSide: OrderSide = ctx.side === 'buy' ? 'sell' : 'buy'
    const size = resolveSize('percent', data.sizePercent, effectiveSize)

    const referencePrice = entryPrice || currentPrice
    const triggerPrice =
      data.triggerMode === 'percent'
        ? referencePrice * (1 - data.triggerValue / 100)
        : data.triggerValue

    const result = await executor.placeConditionalOrder({
      market: ctx.market,
      pair: ctx.pair,
      side: exitSide,
      size,
      triggerPrice: String(triggerPrice),
      triggerType: 'sl',
      orderType: data.orderType,
      limitPrice:
        data.orderType === 'limit' && data.limitPrice
          ? String(data.limitPrice)
          : undefined,
    })

    return {
      stepId: step.id,
      stepType: step.type,
      stepLabel: 'Stop Loss',
      status: result.success ? 'executed' : 'failed',
      orderId: result.orderId,
      error: result.error,
    }
  },
}

// ── Condition ────────────────────────────────────────────────────────

const conditionStep: WorkflowStepTypeDefinition = {
  type: 'condition',
  label: 'Condition',
  icon: 'GitBranch',
  category: 'logic',
  branching: true,
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [{ id: 'pass' }, { id: 'fail' }],
  },
  configSchema: [
    {
      key: 'conditionType',
      type: 'select',
      label: 'Condition',
      default: 'price-above',
      options: [
        { value: 'price-above', label: 'Price above' },
        { value: 'price-below', label: 'Price below' },
        { value: 'percent-change', label: '% change from entry' },
      ],
    },
    {
      key: 'value',
      type: 'number',
      label: 'Value',
      default: 0,
    },
  ],
  validate: (data) => [
    ...requireOneOf(data, 'conditionType', 'Condition', [
      'price-above',
      'price-below',
      'percent-change',
    ]),
    ...requireNumber(data, 'value', 'Value'),
    ...(data.conditionType !== 'percent-change'
      ? requireNumber(data, 'value', 'Value', { positive: true })
      : typeof data.value === 'number' && data.value === 0
        ? ['Value must be non-zero for % change (use +N for up, -N for down)']
        : []),
  ],
  defaultData: () => ({
    conditionType: 'price-above',
    value: 0,
  }),
  execute: async ({ step, currentPrice, entryPrice }) => {
    const data = step.data as unknown as ConditionStepData

    let passed = false
    switch (data.conditionType) {
      case 'price-above':
        passed = currentPrice > data.value
        break
      case 'price-below':
        passed = currentPrice < data.value
        break
      case 'percent-change': {
        // Signed % move from the entry price (trigger fill or parent order
        // fill): +5 passes when up ≥5%, -3 passes when down ≥3%.
        const refPrice = entryPrice > 0 ? entryPrice : currentPrice
        const pctChange = ((currentPrice - refPrice) / refPrice) * 100
        passed =
          data.value >= 0 ? pctChange >= data.value : pctChange <= data.value
        break
      }
    }

    return {
      stepId: step.id,
      stepType: step.type,
      stepLabel: 'Condition',
      status: passed ? 'executed' : 'skipped',
    }
  },
}

// ── Split ────────────────────────────────────────────────────────────

const splitStep: WorkflowStepTypeDefinition = {
  type: 'split',
  label: 'Parallel Split',
  icon: 'GitFork',
  category: 'logic',
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [{ id: 'branch-0' }, { id: 'branch-1' }],
  },
  configSchema: [
    {
      key: 'branches',
      type: 'number',
      label: 'Branches',
      default: 2,
      min: 2,
      max: 8,
      step: 1,
    },
  ],
  validate: (data) =>
    requireNumber(data, 'branches', 'Branches', { min: 2, max: 8 }),
  defaultData: () => ({ branches: 2 }),
}

// ── Wait ─────────────────────────────────────────────────────────────

const waitStep: WorkflowStepTypeDefinition = {
  type: 'wait',
  label: 'Wait',
  icon: 'Timer',
  category: 'logic',
  handles: {
    inputs: [{ id: 'in' }],
    outputs: [{ id: 'out' }],
  },
  configSchema: [
    {
      key: 'duration',
      type: 'number',
      label: 'Duration',
      default: 5,
      min: 1,
      max: 86400,
    },
    {
      key: 'unit',
      type: 'select',
      label: 'Unit',
      default: 'seconds',
      options: [
        { value: 'seconds', label: 'Seconds' },
        { value: 'minutes', label: 'Minutes' },
        { value: 'hours', label: 'Hours' },
      ],
    },
  ],
  validate: (data) => requireNumber(data, 'duration', 'Duration', { min: 1 }),
  defaultData: () => ({ duration: 5, unit: 'seconds' }),
  needsPrice: false,
  execute: async ({ step, signal }) => {
    const data = step.data as unknown as WaitStepData
    const duration = data.duration ?? 5
    const unit = data.unit ?? 'seconds'

    const ms =
      unit === 'hours'
        ? duration * 3600000
        : unit === 'minutes'
          ? duration * 60000
          : duration * 1000

    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Cancelled'))
        return
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      const onAbort = () => {
        clearTimeout(timer)
        reject(new Error('Cancelled'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })

    return {
      stepId: step.id,
      stepType: step.type,
      stepLabel: 'Wait',
      status: 'executed',
    }
  },
}

// ── Export ────────────────────────────────────────────────────────────

export function getCoreStepTypes(): Array<WorkflowStepTypeDefinition> {
  return [
    triggerStep,
    marketOrderStep,
    limitOrderStep,
    takeProfitStep,
    stopLossStep,
    conditionStep,
    splitStep,
    waitStep,
  ]
}
