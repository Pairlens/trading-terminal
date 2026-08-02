// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, test } from 'bun:test'

import { clearRegistry, registerStepTypes } from '../step-registry'
import { CORE_NOTIFICATION_STEPS } from '../core-steps'
import { findCycleEdgeIds, validateRule } from '../validator'
import type { NotificationRuleDSL } from '../types'

beforeEach(() => {
  clearRegistry()
  registerStepTypes(CORE_NOTIFICATION_STEPS)
})

function makeRule(
  overrides: Partial<NotificationRuleDSL> = {},
): NotificationRuleDSL {
  return {
    version: 1,
    id: 'rule-1',
    name: 'Test Rule',
    steps: [],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('validateRule', () => {
  test('empty rule is invalid', () => {
    const result = validateRule(makeRule())
    expect(result.valid).toBe(false)
  })

  test('valid rule with event + channel passes', () => {
    const result = validateRule(
      makeRule({
        steps: [
          {
            id: 'event',
            type: 'order-executed',
            position: { x: 0, y: 0 },
            data: { side: 'any', status: 'filled' },
          },
          {
            id: 'channel',
            type: 'local-toast',
            position: { x: 0, y: 100 },
            data: {},
          },
        ],
        edges: [{ id: 'e1', source: 'event', target: 'channel' }],
      }),
    )
    expect(result.valid).toBe(true)
  })

  test('rejects rule without event step', () => {
    const result = validateRule(
      makeRule({
        steps: [
          {
            id: 'channel',
            type: 'local-toast',
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        edges: [],
      }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('event step'))).toBe(
      true,
    )
  })

  test('rejects rule without channel step', () => {
    const result = validateRule(
      makeRule({
        steps: [
          {
            id: 'event',
            type: 'price-alert',
            position: { x: 0, y: 0 },
            data: { direction: 'above', price: 100 },
          },
        ],
        edges: [],
      }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('channel step'))).toBe(
      true,
    )
  })

  test('allows multiple event steps (pair-agnostic flow)', () => {
    const result = validateRule(
      makeRule({
        steps: [
          {
            id: 'e1',
            type: 'price-alert',
            position: { x: -100, y: 0 },
            data: { direction: 'above', price: 100 },
          },
          {
            id: 'e2',
            type: 'order-executed',
            position: { x: 100, y: 0 },
            data: { side: 'any', status: 'filled' },
          },
          {
            id: 'channel',
            type: 'local-toast',
            position: { x: 0, y: 100 },
            data: {},
          },
        ],
        edges: [
          { id: 'edge1', source: 'e1', target: 'channel' },
          { id: 'edge2', source: 'e2', target: 'channel' },
        ],
      }),
    )
    expect(result.valid).toBe(true)
  })
})

describe('validateRule event entry points', () => {
  test('rejects edges pointing INTO an event step', () => {
    const result = validateRule(
      makeRule({
        steps: [
          {
            id: 'event-a',
            type: 'order-executed',
            position: { x: 0, y: 0 },
            data: { side: 'any', status: 'filled' },
          },
          {
            id: 'event-b',
            type: 'candle-close',
            position: { x: 0, y: 100 },
            data: { timeframe: '1h' },
          },
          {
            id: 'channel',
            type: 'local-toast',
            position: { x: 0, y: 200 },
            data: {},
          },
        ],
        edges: [
          { id: 'e1', source: 'event-a', target: 'event-b' },
          { id: 'e2', source: 'event-b', target: 'channel' },
        ],
      }),
    )
    expect(result.valid).toBe(false)
    expect(
      result.errors.some((e) =>
        e.message.includes('Event steps cannot have incoming'),
      ),
    ).toBe(true)
  })
})

describe('findCycleEdgeIds', () => {
  test('no cycles returns empty', () => {
    const result = findCycleEdgeIds(
      ['a', 'b', 'c'],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
    )
    expect(result).toHaveLength(0)
  })

  test('detects simple cycle', () => {
    const result = findCycleEdgeIds(
      ['a', 'b'],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
    )
    expect(result.length).toBeGreaterThan(0)
  })
})
