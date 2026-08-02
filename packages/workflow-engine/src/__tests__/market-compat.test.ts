// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

import { checkWorkflowMarketCompat } from '../market-compat'
import { clearRegistry, registerStepTypes } from '../step-registry'
import { getCoreStepTypes } from '../core-steps'
import type { WorkflowDSL, WorkflowStepDSL } from '../types'

beforeEach(() => {
  clearRegistry()
  registerStepTypes(getCoreStepTypes())
})

function step(id: string, type: string): WorkflowStepDSL {
  return { id, type, position: { x: 0, y: 0 }, data: {} }
}

function makeWorkflow(steps: Array<WorkflowStepDSL>): WorkflowDSL {
  return {
    version: 1,
    id: 'wf-1',
    name: 'Test',
    steps,
    edges: [],
    createdAt: 0,
    updatedAt: 0,
  }
}

const FULL_EXIT_WORKFLOW = makeWorkflow([
  step('n1', 'trigger'),
  step('n2', 'market-order'),
  step('n3', 'limit-order'),
  step('n4', 'take-profit'),
  step('n5', 'stop-loss'),
  step('n6', 'wait'),
])

describe('checkWorkflowMarketCompat', () => {
  it('passes every core step on a CEX with native trigger orders', () => {
    const issues = checkWorkflowMarketCompat(FULL_EXIT_WORKFLOW, {
      marketId: 'okx',
      triggerOrders: true,
    })
    expect(issues).toEqual([])
  })

  it('flags only stop-loss on a CEX without trigger orders', () => {
    const issues = checkWorkflowMarketCompat(FULL_EXIT_WORKFLOW, {
      marketId: 'upbit',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      stepId: 'n5',
      stepType: 'stop-loss',
      stepLabel: 'Stop Loss',
    })
    expect(issues[0].reason).toContain('trigger orders')
  })

  it('flags stop-loss but not limit/take-profit on a DEX with resting limit orders', () => {
    const issues = checkWorkflowMarketCompat(FULL_EXIT_WORKFLOW, {
      marketId: 'jupiter',
      walletChain: 'solana',
      dexLimitOrders: true,
    })
    expect(issues.map((i) => i.stepType)).toEqual(['stop-loss'])
  })

  it('flags limit-order, take-profit, and stop-loss on a swap-only DEX', () => {
    const issues = checkWorkflowMarketCompat(FULL_EXIT_WORKFLOW, {
      marketId: 'ethereum',
      walletChain: 'ethereum',
    })
    expect(issues.map((i) => i.stepType).sort()).toEqual([
      'limit-order',
      'stop-loss',
      'take-profit',
    ])
  })

  it('skips steps whose type is not registered', () => {
    const issues = checkWorkflowMarketCompat(
      makeWorkflow([step('n1', 'unknown-plugin-step')]),
      { marketId: 'okx' },
    )
    expect(issues).toEqual([])
  })

  it('respects a plugin step scoped to a single market', () => {
    registerStepTypes([
      {
        type: 'okx-special',
        label: 'OKX Special',
        icon: 'Zap',
        category: 'custom',
        handles: { inputs: [{ id: 'in' }], outputs: [{ id: 'out' }] },
        configSchema: [],
        validate: () => [],
        defaultData: () => ({}),
        compat: {
          requires: 'OKX venue',
          check: (m) =>
            m.marketId === 'okx' ? null : 'this step only runs on OKX',
        },
      },
    ])
    const wf = makeWorkflow([step('n1', 'okx-special')])
    expect(checkWorkflowMarketCompat(wf, { marketId: 'okx' })).toEqual([])
    expect(checkWorkflowMarketCompat(wf, { marketId: 'binance' })).toHaveLength(
      1,
    )
  })
})
