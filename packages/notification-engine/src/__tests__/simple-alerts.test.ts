// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Simple alerts have no storage of their own: a rule IS one when its graph
// matches the canonical shape. So the recogniser is the contract — if it
// drifts from the builder, an alert the user made in the form opens on the
// canvas (or worse, opens in the form and loses what the canvas added).
import { beforeEach, describe, expect, test } from 'bun:test'

import { CORE_NOTIFICATION_STEPS } from '../core-steps'
import { clearRegistry, registerStepTypes } from '../step-registry'
import { evaluateRule } from '../evaluator'
import { validateRule } from '../validator'
import {
  buildSimpleAlertGraph,
  isSimpleAlert,
  readSimpleAlert,
  simpleAlertCooldownSeconds,
  simpleAlertName,
} from '../simple-alerts'
import type { SimpleAlertSpec } from '../simple-alerts'
import type {
  NotificationBinding,
  NotificationEventPayload,
  NotificationRuleDSL,
} from '../types'

beforeEach(() => {
  clearRegistry()
  registerStepTypes(CORE_NOTIFICATION_STEPS)
})

const LEVEL: SimpleAlertSpec = {
  kind: 'price-level',
  direction: 'above',
  price: 100000,
  channels: { toast: true, os: true, telegram: false },
}

const MOVE: SimpleAlertSpec = {
  kind: 'percent-move',
  direction: 'down',
  percent: 5,
  window: '1h',
  channels: { toast: false, os: true, telegram: true },
}

function ruleFor(spec: SimpleAlertSpec): NotificationRuleDSL {
  const { steps, edges } = buildSimpleAlertGraph(spec)
  return {
    version: 1,
    id: 'rule-1',
    name: simpleAlertName(spec, 'BTC-USDT'),
    steps,
    edges,
    cooldown: simpleAlertCooldownSeconds(spec),
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('simple alert round trip', () => {
  test.each([
    ['price level', LEVEL],
    ['percent move', MOVE],
  ])('%s survives build → read', (_name, spec) => {
    expect(readSimpleAlert(ruleFor(spec))).toEqual(spec)
  })

  test('every channel combination round trips', () => {
    for (const toast of [true, false]) {
      for (const os of [true, false]) {
        for (const telegram of [true, false]) {
          if (!toast && !os && !telegram) continue // no channel = not a rule
          const spec: SimpleAlertSpec = {
            ...LEVEL,
            channels: { toast, os, telegram },
          }
          expect(readSimpleAlert(ruleFor(spec))?.channels).toEqual({
            toast,
            os,
            telegram,
          })
        }
      }
    }
  })

  test('the built graph is one the validator accepts', () => {
    for (const spec of [LEVEL, MOVE]) {
      expect(validateRule(ruleFor(spec)).errors).toEqual([])
    }
  })

  test('names are notation, so they read the same in every locale', () => {
    expect(simpleAlertName(LEVEL, 'BTC-USDT')).toBe('BTC-USDT ≥ 100,000')
    expect(simpleAlertName(MOVE, 'ETH-USDT')).toBe('ETH-USDT -5% / 1h')
  })

  test('a move alert waits out its own window before firing again', () => {
    expect(simpleAlertCooldownSeconds(MOVE)).toBe(3600)
  })
})

describe('what stops being simple', () => {
  test('a condition step in the middle', () => {
    const rule = ruleFor(LEVEL)
    const event = rule.steps[0]
    const channel = rule.steps[1]
    rule.steps.push({
      id: 'cond',
      type: 'time-window',
      position: { x: 0, y: 0 },
      data: { startHour: 9, endHour: 17 },
    })
    rule.edges = [
      { id: 'e1', source: event.id, sourceHandle: 'out', target: 'cond' },
      { id: 'e2', source: 'cond', sourceHandle: 'pass', target: channel.id },
    ]
    expect(isSimpleAlert(rule)).toBe(false)
  })

  test('a webhook channel — it needs a URL the form cannot ask for', () => {
    const rule = ruleFor(LEVEL)
    rule.steps.push({
      id: 'hook',
      type: 'webhook',
      position: { x: 0, y: 0 },
      data: { url: 'https://example.com', method: 'POST' },
    })
    rule.edges.push({ id: 'e9', source: rule.steps[0].id, target: 'hook' })
    expect(isSimpleAlert(rule)).toBe(false)
  })

  test('a second event step', () => {
    const rule = ruleFor(LEVEL)
    rule.steps.push({
      id: 'event-2',
      type: 'percent-move',
      position: { x: 0, y: 0 },
      data: { percent: 3, direction: 'either', window: '15m' },
    })
    expect(isSimpleAlert(rule)).toBe(false)
  })

  test('a channel nothing is wired to — it would never deliver', () => {
    const rule = ruleFor(LEVEL)
    rule.edges = rule.edges.slice(0, 1)
    expect(isSimpleAlert(rule)).toBe(false)
  })

  test('a level of zero — an unfinished rule, not an alert', () => {
    const rule = ruleFor(LEVEL)
    rule.steps[0].data.price = 0
    expect(isSimpleAlert(rule)).toBe(false)
  })

  test('an unknown window', () => {
    const rule = ruleFor(MOVE)
    rule.steps[0].data.window = '3h'
    expect(isSimpleAlert(rule)).toBe(false)
  })
})

// ── percent-move filtering ───────────────────────────────────────────

function movePayload(
  percentChange: number,
  prevPercentChange?: number,
  window = '1h',
): NotificationEventPayload {
  return {
    eventType: 'percent-move',
    timestamp: 0,
    pair: 'BTC-USDT',
    market: 'okx',
    price: 60000,
    data: { window, percentChange, prevPercentChange },
  }
}

const binding: NotificationBinding = {
  id: 'binding-1',
  ruleId: 'rule-1',
  pair: 'BTC-USDT',
  market: 'okx',
  enabled: true,
  createdAt: 0,
}

function fires(spec: SimpleAlertSpec, payload: NotificationEventPayload) {
  return evaluateRule(ruleFor(spec), binding, payload).shouldFire
}

describe('percent-move', () => {
  const either: SimpleAlertSpec = { ...MOVE, direction: 'either' }
  const up: SimpleAlertSpec = { ...MOVE, direction: 'up' }

  test('fires when the move enters the threshold', () => {
    expect(fires(either, movePayload(-5.4, -3.1))).toBe(true)
    expect(fires(either, movePayload(6.2, 4.9))).toBe(true)
  })

  test('stays quiet while the move sits past the threshold', () => {
    // The same 6% hour, one tick later. It is one piece of news.
    expect(fires(either, movePayload(6.3, 6.2))).toBe(false)
  })

  test('stays quiet below the threshold', () => {
    expect(fires(either, movePayload(3.9, 1.0))).toBe(false)
  })

  test('direction is respected', () => {
    expect(fires(up, movePayload(-7, -1))).toBe(false)
    expect(fires(up, movePayload(7, 1))).toBe(true)
    expect(fires(MOVE, movePayload(-7, -1))).toBe(true) // 'down'
    expect(fires(MOVE, movePayload(7, 1))).toBe(false)
  })

  test('a rule watching another window ignores the event', () => {
    // One candle stream serves several windows; without this filter a 1h
    // rule would fire on the 15m reading riding the same subscription.
    expect(fires(either, movePayload(-9, -1, '15m'))).toBe(false)
  })

  test('a first reading with no previous one still fires', () => {
    expect(fires(either, movePayload(-8))).toBe(true)
  })
})
