// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

import { executeWorkflow } from '../executor'
import { clearRegistry, registerStepTypes } from '../step-registry'
import { getCoreStepTypes } from '../core-steps'
import type {
  ConditionalOrderParams,
  OrderExecutor,
  OrderResult,
  WorkflowDSL,
} from '../types'

beforeEach(() => {
  clearRegistry()
  registerStepTypes(getCoreStepTypes())
})

// ── Mock OrderExecutor ───────────────────────────────────────────────

function createMockExecutor(
  overrides: Partial<OrderExecutor> = {},
): OrderExecutor & { calls: Array<{ method: string; params: unknown }> } {
  const calls: Array<{ method: string; params: unknown }> = []
  const successResult: OrderResult = {
    success: true,
    orderId: 'mock-order-id',
    fillPrice: 50000,
    fillSize: '0.1',
  }

  return {
    calls,
    placeMarketOrder: async (params) => {
      calls.push({ method: 'placeMarketOrder', params })
      return overrides.placeMarketOrder
        ? overrides.placeMarketOrder(params)
        : successResult
    },
    placeLimitOrder: async (params) => {
      calls.push({ method: 'placeLimitOrder', params })
      return overrides.placeLimitOrder
        ? overrides.placeLimitOrder(params)
        : successResult
    },
    placeConditionalOrder: async (params) => {
      calls.push({ method: 'placeConditionalOrder', params })
      return overrides.placeConditionalOrder
        ? overrides.placeConditionalOrder(params)
        : successResult
    },
    getCurrentPrice: async (market, pair) => {
      calls.push({ method: 'getCurrentPrice', params: { market, pair } })
      return overrides.getCurrentPrice
        ? overrides.getCurrentPrice(market, pair)
        : 50000
    },
  }
}

function makeWorkflow(overrides: Partial<WorkflowDSL> = {}): WorkflowDSL {
  return {
    version: 1,
    id: 'wf-1',
    name: 'Test Workflow',
    steps: [],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

const defaultCtx = {
  workflowId: 'wf-1',
  market: 'okx',
  pair: 'BTC-USDT',
  side: 'buy' as const,
  amount: '0.1',
  tgtCcy: 'base_ccy' as const,
  mode: 'paper' as const,
}

describe('executeWorkflow', () => {
  it('executes trigger-only workflow', async () => {
    const executor = createMockExecutor()
    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
      }),
      defaultCtx,
      executor,
    )

    expect(result.status).toBe('completed')
    expect(result.results).toHaveLength(1)
    expect(result.results[0].status).toBe('executed')
    expect(result.results[0].stepType).toBe('trigger')
  })

  it('executes trigger -> market order', async () => {
    const executor = createMockExecutor()
    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'buy',
            type: 'market-order',
            position: { x: 0, y: 100 },
            data: { side: 'inherit', sizeMode: 'percent', size: 100 },
          },
        ],
        edges: [{ id: 'e1', source: 'trigger', target: 'buy' }],
      }),
      defaultCtx,
      executor,
    )

    expect(result.status).toBe('completed')
    expect(result.results).toHaveLength(2)

    const buyResult = result.results.find((r) => r.stepType === 'market-order')
    expect(buyResult?.status).toBe('executed')
    expect(buyResult?.orderId).toBe('mock-order-id')

    const marketCall = executor.calls.find(
      (c) => c.method === 'placeMarketOrder',
    )
    expect(marketCall).toBeDefined()
    expect((marketCall!.params as { side: string }).side).toBe('buy')
    expect((marketCall!.params as { size: string }).size).toBe('0.1')
  })

  it('executes parallel TP and SL after buy', async () => {
    const executor = createMockExecutor()
    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'buy',
            type: 'market-order',
            position: { x: 0, y: 100 },
            data: { side: 'inherit', sizeMode: 'percent', size: 100 },
          },
          {
            id: 'tp',
            type: 'take-profit',
            position: { x: -100, y: 200 },
            data: {
              triggerMode: 'percent',
              triggerValue: 5,
              sizePercent: 50,
              orderType: 'market',
            },
          },
          {
            id: 'sl',
            type: 'stop-loss',
            position: { x: 100, y: 200 },
            data: {
              triggerMode: 'percent',
              triggerValue: 3,
              sizePercent: 100,
              orderType: 'market',
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'buy' },
          { id: 'e2', source: 'buy', target: 'tp' },
          { id: 'e3', source: 'buy', target: 'sl' },
        ],
      }),
      defaultCtx,
      executor,
    )

    expect(result.status).toBe('completed')
    expect(result.results).toHaveLength(4)

    // Both TP and SL should place conditional orders
    const conditionalCalls = executor.calls.filter(
      (c) => c.method === 'placeConditionalOrder',
    )
    expect(conditionalCalls).toHaveLength(2)

    // Verify TP trigger price is +5% from fill price
    const tpCall = conditionalCalls.find(
      (c) => (c.params as ConditionalOrderParams).triggerType === 'tp',
    )
    expect(tpCall).toBeDefined()
    const tpTriggerPrice = parseFloat(
      (tpCall!.params as ConditionalOrderParams).triggerPrice,
    )
    expect(tpTriggerPrice).toBe(50000 * 1.05)

    // Verify SL trigger price is -3% from fill price
    const slCall = conditionalCalls.find(
      (c) => (c.params as ConditionalOrderParams).triggerType === 'sl',
    )
    expect(slCall).toBeDefined()
    const slTriggerPrice = parseFloat(
      (slCall!.params as ConditionalOrderParams).triggerPrice,
    )
    expect(slTriggerPrice).toBe(50000 * 0.97)

    // TP/SL should sell (opposite of buy)
    expect((tpCall!.params as ConditionalOrderParams).side).toBe('sell')
    expect((slCall!.params as ConditionalOrderParams).side).toBe('sell')
  })

  it('handles order failure gracefully', async () => {
    const executor = createMockExecutor({
      placeMarketOrder: async () => ({
        success: false,
        error: 'Insufficient balance',
      }),
    })

    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'buy',
            type: 'market-order',
            position: { x: 0, y: 100 },
            data: { side: 'inherit', sizeMode: 'percent', size: 100 },
          },
          {
            id: 'tp',
            type: 'take-profit',
            position: { x: 0, y: 200 },
            data: {
              triggerMode: 'percent',
              triggerValue: 5,
              sizePercent: 100,
              orderType: 'market',
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'buy' },
          { id: 'e2', source: 'buy', target: 'tp' },
        ],
      }),
      defaultCtx,
      executor,
    )

    expect(result.status).toBe('failed')
    const buyResult = result.results.find((r) => r.stepType === 'market-order')
    expect(buyResult?.status).toBe('failed')
    expect(buyResult?.error).toBe('Insufficient balance')

    // TP should be skipped since buy failed
    const tpResult = result.results.find((r) => r.stepType === 'take-profit')
    expect(tpResult?.status).toBe('skipped')
  })

  it('evaluates condition step as gate', async () => {
    const executor = createMockExecutor({
      getCurrentPrice: async () => 60000,
    })

    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'cond',
            type: 'condition',
            position: { x: 0, y: 100 },
            data: {
              conditionType: 'price-above',
              value: 55000,
              referencePrice: 'last',
            },
          },
          {
            id: 'buy',
            type: 'market-order',
            position: { x: -100, y: 200 },
            data: { side: 'buy', sizeMode: 'percent', size: 100 },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'cond' },
          { id: 'e2', source: 'cond', target: 'buy', sourceHandle: 'pass' },
        ],
      }),
      defaultCtx,
      executor,
    )

    expect(result.status).toBe('completed')
    // Price is 60000 > 55000, condition passes
    const condResult = result.results.find((r) => r.stepType === 'condition')
    expect(condResult?.status).toBe('executed')
    const buyResult = result.results.find((r) => r.stepType === 'market-order')
    expect(buyResult?.status).toBe('executed')
  })

  it('skips branch when condition fails', async () => {
    const executor = createMockExecutor({
      getCurrentPrice: async () => 40000,
    })

    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'cond',
            type: 'condition',
            position: { x: 0, y: 100 },
            data: {
              conditionType: 'price-above',
              value: 55000,
              referencePrice: 'last',
            },
          },
          {
            id: 'buy',
            type: 'market-order',
            position: { x: -100, y: 200 },
            data: { side: 'buy', sizeMode: 'percent', size: 100 },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'cond' },
          { id: 'e2', source: 'cond', target: 'buy', sourceHandle: 'pass' },
        ],
      }),
      defaultCtx,
      executor,
    )

    // Price is 40000 < 55000, condition fails
    const condResult = result.results.find((r) => r.stepType === 'condition')
    expect(condResult?.status).toBe('skipped')
    const buyResult = result.results.find((r) => r.stepType === 'market-order')
    expect(buyResult?.status).toBe('skipped')
  })

  it('resolves percent-based size correctly', async () => {
    const executor = createMockExecutor()

    await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'buy',
            type: 'market-order',
            position: { x: 0, y: 100 },
            data: { side: 'inherit', sizeMode: 'percent', size: 50 },
          },
        ],
        edges: [{ id: 'e1', source: 'trigger', target: 'buy' }],
      }),
      { ...defaultCtx, amount: '1.0' },
      executor,
    )

    const marketCall = executor.calls.find(
      (c) => c.method === 'placeMarketOrder',
    )
    expect((marketCall!.params as { size: string }).size).toBe('0.5')
  })

  it('executes split step with parallel children', async () => {
    const executor = createMockExecutor()

    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'split',
            type: 'split',
            position: { x: 0, y: 100 },
            data: { branches: 2 },
          },
          {
            id: 'branch-a',
            type: 'market-order',
            position: { x: -100, y: 200 },
            data: { side: 'buy', sizeMode: 'percent', size: 50 },
          },
          {
            id: 'branch-b',
            type: 'market-order',
            position: { x: 100, y: 200 },
            data: { side: 'sell', sizeMode: 'percent', size: 50 },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'split' },
          {
            id: 'e2',
            source: 'split',
            target: 'branch-a',
            sourceHandle: 'branch-0',
          },
          {
            id: 'e3',
            source: 'split',
            target: 'branch-b',
            sourceHandle: 'branch-1',
          },
        ],
      }),
      defaultCtx,
      executor,
    )

    expect(result.status).toBe('completed')
    expect(result.results).toHaveLength(4) // trigger + split + 2 branches

    const marketCalls = executor.calls.filter(
      (c) => c.method === 'placeMarketOrder',
    )
    expect(marketCalls).toHaveLength(2)
  })

  it('fails when no trigger step exists', async () => {
    const executor = createMockExecutor()
    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'buy',
            type: 'market-order',
            position: { x: 0, y: 0 },
            data: { side: 'buy', sizeMode: 'percent', size: 100 },
          },
        ],
      }),
      defaultCtx,
      executor,
    )

    expect(result.status).toBe('failed')
    expect(result.results[0].error).toContain('No trigger step')
  })

  it('inherits side from context when set to inherit', async () => {
    const executor = createMockExecutor()

    await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'order',
            type: 'market-order',
            position: { x: 0, y: 100 },
            data: { side: 'inherit', sizeMode: 'percent', size: 100 },
          },
        ],
        edges: [{ id: 'e1', source: 'trigger', target: 'order' }],
      }),
      { ...defaultCtx, side: 'sell' },
      executor,
    )

    const marketCall = executor.calls.find(
      (c) => c.method === 'placeMarketOrder',
    )
    expect((marketCall!.params as { side: string }).side).toBe('sell')
  })

  it('re-fetches price per step so conditions after a wait see fresh data', async () => {
    // Price sequence per getCurrentPrice call, in step execution order:
    // trigger, condition, limit order (wait skips the price fetch). The
    // price moves above the condition threshold only AFTER the workflow
    // starts — a stale start-of-workflow snapshot (40000) would fail the
    // condition.
    const prices = [40000, 60000, 61000]
    let call = 0
    const executor = createMockExecutor({
      getCurrentPrice: async () => {
        const price = prices[Math.min(call, prices.length - 1)]
        call++
        return price
      },
    })

    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'wait',
            type: 'wait',
            position: { x: 0, y: 100 },
            data: { duration: 0.01, unit: 'seconds' },
          },
          {
            id: 'cond',
            type: 'condition',
            position: { x: 0, y: 200 },
            data: {
              conditionType: 'price-above',
              value: 55000,
              referencePrice: 'last',
            },
          },
          {
            id: 'sell',
            type: 'limit-order',
            position: { x: 0, y: 300 },
            data: {
              side: 'sell',
              sizeMode: 'percent',
              size: 100,
              priceMode: 'offset-percent',
              priceValue: 0,
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'wait' },
          { id: 'e2', source: 'wait', target: 'cond' },
          { id: 'e3', source: 'cond', target: 'sell', sourceHandle: 'pass' },
        ],
      }),
      defaultCtx,
      executor,
    )

    expect(result.status).toBe('completed')

    // Condition must evaluate against the refreshed price (60000 > 55000)
    const condResult = result.results.find((r) => r.stepType === 'condition')
    expect(condResult?.status).toBe('executed')

    // Limit order offset pricing must use the price fetched at ITS step
    const orderResult = result.results.find((r) => r.stepType === 'limit-order')
    expect(orderResult?.status).toBe('executed')
    const limitCall = executor.calls.find((c) => c.method === 'placeLimitOrder')
    expect((limitCall!.params as { price: string }).price).toBe('61000')

    // Price was fetched once per price-consuming step, not once per
    // workflow — and not at all for the wait step
    const priceCalls = executor.calls.filter(
      (c) => c.method === 'getCurrentPrice',
    )
    expect(priceCalls.length).toBe(3)
  })

  it('executes diamond join when one parent branch is skipped but another completes', async () => {
    // trigger feeds both a failing condition (pass branch skipped) and a
    // live market order; both feed the stop-loss. The live parent must
    // still fire the stop-loss.
    const executor = createMockExecutor({
      getCurrentPrice: async () => 40000,
    })

    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'cond',
            type: 'condition',
            position: { x: -100, y: 100 },
            data: {
              conditionType: 'price-above',
              value: 55000,
              referencePrice: 'last',
            },
          },
          {
            id: 'buy',
            type: 'market-order',
            position: { x: 100, y: 100 },
            data: { side: 'inherit', sizeMode: 'percent', size: 100 },
          },
          {
            id: 'sl',
            type: 'stop-loss',
            position: { x: 0, y: 200 },
            data: {
              triggerMode: 'percent',
              triggerValue: 3,
              sizePercent: 100,
              orderType: 'market',
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'cond' },
          { id: 'e2', source: 'trigger', target: 'buy' },
          { id: 'e3', source: 'cond', target: 'sl', sourceHandle: 'pass' },
          { id: 'e4', source: 'buy', target: 'sl' },
        ],
      }),
      defaultCtx,
      executor,
    )

    // Condition fails (40000 < 55000) — its pass branch is skipped
    const condResult = result.results.find((r) => r.stepType === 'condition')
    expect(condResult?.status).toBe('skipped')

    // But the stop-loss has a live parent (buy) and MUST still execute
    const buyResult = result.results.find((r) => r.stepType === 'market-order')
    expect(buyResult?.status).toBe('executed')
    const slResult = result.results.find((r) => r.stepType === 'stop-loss')
    expect(slResult?.status).toBe('executed')

    const slCall = executor.calls.find(
      (c) => c.method === 'placeConditionalOrder',
    )
    expect(slCall).toBeDefined()
    expect((slCall!.params as ConditionalOrderParams).triggerType).toBe('sl')
  })

  it('skips join only when ALL parent branches are skipped', async () => {
    // Two failing conditions both feed the join — with no live parent
    // the join must skip, and the skip must cascade to its descendant.
    const executor = createMockExecutor({
      getCurrentPrice: async () => 40000,
    })

    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'cond-a',
            type: 'condition',
            position: { x: -100, y: 100 },
            data: {
              conditionType: 'price-above',
              value: 55000,
              referencePrice: 'last',
            },
          },
          {
            id: 'cond-b',
            type: 'condition',
            position: { x: 100, y: 100 },
            data: {
              conditionType: 'price-above',
              value: 65000,
              referencePrice: 'last',
            },
          },
          {
            id: 'join',
            type: 'market-order',
            position: { x: 0, y: 200 },
            data: { side: 'inherit', sizeMode: 'percent', size: 100 },
          },
          {
            id: 'sl',
            type: 'stop-loss',
            position: { x: 0, y: 300 },
            data: {
              triggerMode: 'percent',
              triggerValue: 3,
              sizePercent: 100,
              orderType: 'market',
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'cond-a' },
          { id: 'e2', source: 'trigger', target: 'cond-b' },
          { id: 'e3', source: 'cond-a', target: 'join', sourceHandle: 'pass' },
          { id: 'e4', source: 'cond-b', target: 'join', sourceHandle: 'pass' },
          { id: 'e5', source: 'join', target: 'sl' },
        ],
      }),
      defaultCtx,
      executor,
    )

    const joinResult = result.results.find((r) => r.stepType === 'market-order')
    expect(joinResult?.status).toBe('skipped')
    const slResult = result.results.find((r) => r.stepType === 'stop-loss')
    expect(slResult?.status).toBe('skipped')

    // No orders were placed on any path
    const orderCalls = executor.calls.filter(
      (c) => c.method !== 'getCurrentPrice',
    )
    expect(orderCalls).toHaveLength(0)
  })

  it('does not block sibling branches on a slow wait step', async () => {
    // Branch A: wait 150ms → order. Branch B: immediate order.
    // Branch B's order must complete BEFORE the wait finishes — the old
    // wave-based executor stalled the whole level on the slowest step.
    const executor = createMockExecutor()
    const completionOrder: Array<string> = []

    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'wait',
            type: 'wait',
            position: { x: -100, y: 100 },
            data: { duration: 0.15, unit: 'seconds' },
          },
          {
            id: 'slow-order',
            type: 'market-order',
            position: { x: -100, y: 200 },
            data: { side: 'inherit', sizeMode: 'percent', size: 50 },
          },
          {
            id: 'fast-order',
            type: 'market-order',
            position: { x: 100, y: 100 },
            data: { side: 'inherit', sizeMode: 'percent', size: 50 },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'wait' },
          { id: 'e2', source: 'wait', target: 'slow-order' },
          { id: 'e3', source: 'trigger', target: 'fast-order' },
        ],
      }),
      defaultCtx,
      executor,
      { onStepComplete: (r) => completionOrder.push(r.stepId) },
    )

    expect(result.status).toBe('completed')
    // fast-order resolved while the sibling branch was still waiting
    expect(completionOrder.indexOf('fast-order')).toBeLessThan(
      completionOrder.indexOf('wait'),
    )
    expect(completionOrder.indexOf('wait')).toBeLessThan(
      completionOrder.indexOf('slow-order'),
    )
  })

  it('cancels pending waits and skips remaining steps on abort', async () => {
    const executor = createMockExecutor()
    const controller = new AbortController()

    const started = Date.now()
    const resultPromise = executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'wait',
            type: 'wait',
            position: { x: 0, y: 100 },
            data: { duration: 60, unit: 'seconds' },
          },
          {
            id: 'buy',
            type: 'market-order',
            position: { x: 0, y: 200 },
            data: { side: 'inherit', sizeMode: 'percent', size: 100 },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'wait' },
          { id: 'e2', source: 'wait', target: 'buy' },
        ],
      }),
      defaultCtx,
      executor,
      { signal: controller.signal },
    )

    setTimeout(() => controller.abort(), 30)
    const result = await resultPromise

    // The 60s wait must not run to completion
    expect(Date.now() - started).toBeLessThan(5000)
    expect(result.status).toBe('cancelled')

    const waitResult = result.results.find((r) => r.stepType === 'wait')
    expect(waitResult?.status).toBe('skipped')
    expect(waitResult?.error).toBe('Cancelled')

    // The downstream order never fired
    const buyResult = result.results.find((r) => r.stepType === 'market-order')
    expect(buyResult?.status).toBe('skipped')
    const orderCalls = executor.calls.filter(
      (c) => c.method === 'placeMarketOrder',
    )
    expect(orderCalls).toHaveLength(0)
  })

  it('evaluates percent-change condition against the entry price', async () => {
    // Trigger records entry at 50000; by the time the condition runs the
    // price is 53000 → +6% from entry, so a +5 threshold passes.
    const prices = [50000, 53000]
    let call = 0
    const executor = createMockExecutor({
      getCurrentPrice: async () => prices[Math.min(call++, prices.length - 1)],
    })

    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'cond',
            type: 'condition',
            position: { x: 0, y: 100 },
            data: { conditionType: 'percent-change', value: 5 },
          },
          {
            id: 'sell',
            type: 'market-order',
            position: { x: 0, y: 200 },
            data: { side: 'opposite', sizeMode: 'percent', size: 100 },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'cond' },
          { id: 'e2', source: 'cond', target: 'sell', sourceHandle: 'pass' },
        ],
      }),
      defaultCtx,
      executor,
    )

    const condResult = result.results.find((r) => r.stepType === 'condition')
    expect(condResult?.status).toBe('executed')
    const sellResult = result.results.find((r) => r.stepType === 'market-order')
    expect(sellResult?.status).toBe('executed')
  })

  it('percent-change with negative threshold passes only on a drop', async () => {
    // Entry 50000 → current 48000 is -4%: a -3 threshold passes, a +3
    // threshold does not.
    const runWith = async (value: number) => {
      const prices = [50000, 48000]
      let call = 0
      const executor = createMockExecutor({
        getCurrentPrice: async () =>
          prices[Math.min(call++, prices.length - 1)],
      })
      const result = await executeWorkflow(
        makeWorkflow({
          steps: [
            {
              id: 'trigger',
              type: 'trigger',
              position: { x: 0, y: 0 },
              data: {},
            },
            {
              id: 'cond',
              type: 'condition',
              position: { x: 0, y: 100 },
              data: { conditionType: 'percent-change', value },
            },
          ],
          edges: [{ id: 'e1', source: 'trigger', target: 'cond' }],
        }),
        defaultCtx,
        executor,
      )
      return result.results.find((r) => r.stepType === 'condition')?.status
    }

    expect(await runWith(-3)).toBe('executed')
    expect(await runWith(3)).toBe('skipped')
  })

  it('passes limit price through TP and SL conditional orders', async () => {
    const executor = createMockExecutor()

    await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'tp',
            type: 'take-profit',
            position: { x: -100, y: 100 },
            data: {
              triggerMode: 'absolute',
              triggerValue: 55000,
              sizePercent: 100,
              orderType: 'limit',
              limitPrice: 54900,
            },
          },
          {
            id: 'sl',
            type: 'stop-loss',
            position: { x: 100, y: 100 },
            data: {
              triggerMode: 'absolute',
              triggerValue: 47000,
              sizePercent: 100,
              orderType: 'limit',
              limitPrice: 46900,
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'tp' },
          { id: 'e2', source: 'trigger', target: 'sl' },
        ],
      }),
      defaultCtx,
      executor,
    )

    const conditionalCalls = executor.calls.filter(
      (c) => c.method === 'placeConditionalOrder',
    )
    expect(conditionalCalls).toHaveLength(2)

    const tpCall = conditionalCalls.find(
      (c) => (c.params as ConditionalOrderParams).triggerType === 'tp',
    )
    expect((tpCall!.params as ConditionalOrderParams).limitPrice).toBe('54900')

    const slCall = conditionalCalls.find(
      (c) => (c.params as ConditionalOrderParams).triggerType === 'sl',
    )
    expect((slCall!.params as ConditionalOrderParams).limitPrice).toBe('46900')
  })

  it('fails the step and skips descendants when the price fetch throws', async () => {
    let calls = 0
    const executor = createMockExecutor({
      getCurrentPrice: async () => {
        calls++
        if (calls > 1) throw new Error('Ticker stream disconnected')
        return 50000
      },
    })

    const result = await executeWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'cond',
            type: 'condition',
            position: { x: 0, y: 100 },
            data: { conditionType: 'price-above', value: 40000 },
          },
          {
            id: 'buy',
            type: 'market-order',
            position: { x: 0, y: 200 },
            data: { side: 'inherit', sizeMode: 'percent', size: 100 },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'cond' },
          { id: 'e2', source: 'cond', target: 'buy', sourceHandle: 'pass' },
        ],
      }),
      defaultCtx,
      executor,
    )

    expect(result.status).toBe('failed')
    const condResult = result.results.find((r) => r.stepType === 'condition')
    expect(condResult?.status).toBe('failed')
    expect(condResult?.error).toContain('Ticker stream disconnected')
    const buyResult = result.results.find((r) => r.stepType === 'market-order')
    expect(buyResult?.status).toBe('skipped')
  })
})
