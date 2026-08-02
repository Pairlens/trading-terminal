// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

import { topologicalSort, validateWorkflow } from '../validator'
import { clearRegistry, registerStepTypes } from '../step-registry'
import { getCoreStepTypes } from '../core-steps'
import type { WorkflowDSL } from '../types'

beforeEach(() => {
  clearRegistry()
  registerStepTypes(getCoreStepTypes())
})

function makeWorkflow(overrides: Partial<WorkflowDSL> = {}): WorkflowDSL {
  return {
    version: 1,
    id: 'wf-1',
    name: 'Test',
    steps: [],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('validateWorkflow', () => {
  it('rejects empty workflow', () => {
    const result = validateWorkflow(makeWorkflow())
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('at least one step')
  })

  it('rejects workflow without trigger', () => {
    const result = validateWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'n1',
            type: 'market-order',
            position: { x: 0, y: 0 },
            data: { side: 'buy', sizeMode: 'percent', size: 100 },
          },
        ],
      }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('trigger step'))).toBe(
      true,
    )
  })

  it('rejects multiple triggers', () => {
    const result = validateWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 't1',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 't2',
            type: 'trigger',
            position: { x: 100, y: 0 },
            data: {},
          },
        ],
      }),
    )
    expect(result.valid).toBe(false)
    expect(
      result.errors.some((e) => e.message.includes('Only one trigger')),
    ).toBe(true)
  })

  it('accepts valid simple workflow', () => {
    const result = validateWorkflow(
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
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('detects cycles', () => {
    const result = validateWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'a',
            type: 'market-order',
            position: { x: 0, y: 100 },
            data: { side: 'buy', sizeMode: 'percent', size: 100 },
          },
          {
            id: 'b',
            type: 'market-order',
            position: { x: 0, y: 200 },
            data: { side: 'sell', sizeMode: 'percent', size: 100 },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'a' },
          { id: 'e2', source: 'a', target: 'b' },
          { id: 'e3', source: 'b', target: 'a' }, // cycle
        ],
      }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('cycle'))).toBe(true)
  })

  it('detects unreachable steps', () => {
    const result = validateWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'connected',
            type: 'market-order',
            position: { x: 0, y: 100 },
            data: { side: 'buy', sizeMode: 'percent', size: 100 },
          },
          {
            id: 'orphan',
            type: 'market-order',
            position: { x: 200, y: 100 },
            data: { side: 'sell', sizeMode: 'percent', size: 50 },
          },
        ],
        edges: [{ id: 'e1', source: 'trigger', target: 'connected' }],
      }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('not reachable'))).toBe(
      true,
    )
  })

  it('rejects incoming edges to trigger', () => {
    const result = validateWorkflow(
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
            data: { side: 'buy', sizeMode: 'percent', size: 100 },
          },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'buy' },
          { id: 'e2', source: 'buy', target: 'trigger' },
        ],
      }),
    )
    expect(result.valid).toBe(false)
  })

  it('validates step data via registry', () => {
    const result = validateWorkflow(
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
            position: { x: 0, y: 100 },
            data: {
              triggerMode: 'percent',
              triggerValue: -5, // invalid: min 0
              sizePercent: 150, // invalid: max 100
              orderType: 'market',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'trigger', target: 'tp' }],
      }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })

  it('rejects edges referencing non-existent steps', () => {
    const result = validateWorkflow(
      makeWorkflow({
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [{ id: 'e1', source: 'trigger', target: 'ghost' }],
      }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('non-existent'))).toBe(
      true,
    )
  })

  it('accepts workflow with TP and SL in parallel', () => {
    const result = validateWorkflow(
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
    )
    expect(result.valid).toBe(true)
  })
})

describe('topologicalSort', () => {
  it('returns steps in dependency order', () => {
    const steps = [
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
        data: {},
      },
      {
        id: 'tp',
        type: 'take-profit',
        position: { x: 0, y: 200 },
        data: {},
      },
    ]
    const edges = [
      { id: 'e1', source: 'trigger', target: 'buy' },
      { id: 'e2', source: 'buy', target: 'tp' },
    ]

    const sorted = topologicalSort(steps, edges)
    const ids = sorted.map((s) => s.id)
    expect(ids.indexOf('trigger')).toBeLessThan(ids.indexOf('buy'))
    expect(ids.indexOf('buy')).toBeLessThan(ids.indexOf('tp'))
  })

  it('handles parallel branches', () => {
    const steps = [
      {
        id: 'trigger',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: 'a',
        type: 'market-order',
        position: { x: -100, y: 100 },
        data: {},
      },
      {
        id: 'b',
        type: 'market-order',
        position: { x: 100, y: 100 },
        data: {},
      },
    ]
    const edges = [
      { id: 'e1', source: 'trigger', target: 'a' },
      { id: 'e2', source: 'trigger', target: 'b' },
    ]

    const sorted = topologicalSort(steps, edges)
    expect(sorted).toHaveLength(3)
    expect(sorted[0].id).toBe('trigger')
  })
})
