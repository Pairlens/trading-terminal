// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, test } from 'bun:test'

import { clearRegistry, registerStepTypes } from '../step-registry'
import { CORE_NOTIFICATION_STEPS } from '../core-steps'
import { evaluateRule } from '../evaluator'
import type {
  NotificationBinding,
  NotificationEventPayload,
  NotificationRuleDSL,
} from '../types'

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

function makeBinding(
  overrides: Partial<NotificationBinding> = {},
): NotificationBinding {
  return {
    id: 'binding-1',
    ruleId: 'rule-1',
    pair: 'BTC-USDT',
    market: 'okx',
    enabled: true,
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('evaluateRule', () => {
  test('returns no-fire for disabled binding', () => {
    const rule = makeRule()
    const binding = makeBinding({ enabled: false })
    const payload: NotificationEventPayload = {
      eventType: 'price-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      data: {},
    }
    const result = evaluateRule(rule, binding, payload)
    expect(result.shouldFire).toBe(false)
  })

  test('returns no-fire when binding pair does not match payload', () => {
    const rule = makeRule({
      steps: [
        {
          id: 'event',
          type: 'price-alert',
          position: { x: 0, y: 0 },
          data: { direction: 'above', price: 100000 },
        },
        {
          id: 'channel',
          type: 'local-toast',
          position: { x: 0, y: 100 },
          data: {},
        },
      ],
      edges: [{ id: 'e1', source: 'event', target: 'channel' }],
    })
    const binding = makeBinding({ pair: 'ETH-USDT' })
    const payload: NotificationEventPayload = {
      eventType: 'price-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      price: 105000,
      data: {},
    }
    const result = evaluateRule(rule, binding, payload)
    expect(result.shouldFire).toBe(false)
  })

  test('fires when binding pair matches and event type matches', () => {
    const rule = makeRule({
      steps: [
        {
          id: 'event',
          type: 'price-alert',
          position: { x: 0, y: 0 },
          data: { direction: 'above', price: 100000 },
        },
        {
          id: 'channel',
          type: 'local-toast',
          position: { x: 0, y: 100 },
          data: {},
        },
      ],
      edges: [{ id: 'e1', source: 'event', target: 'channel' }],
    })
    const binding = makeBinding()
    const payload: NotificationEventPayload = {
      eventType: 'price-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      price: 105000,
      data: {},
    }
    const result = evaluateRule(rule, binding, payload)
    expect(result.shouldFire).toBe(true)
    expect(result.message).not.toBeNull()
    expect(result.channelSteps).toHaveLength(1)
  })

  test('same rule, different bindings — each evaluated independently', () => {
    const rule = makeRule({
      steps: [
        {
          id: 'event',
          type: 'price-alert',
          position: { x: 0, y: 0 },
          data: { direction: 'above', price: 100000 },
        },
        {
          id: 'channel',
          type: 'local-toast',
          position: { x: 0, y: 100 },
          data: {},
        },
      ],
      edges: [{ id: 'e1', source: 'event', target: 'channel' }],
    })

    const btcBinding = makeBinding({ pair: 'BTC-USDT' })
    const ethBinding = makeBinding({ id: 'binding-2', pair: 'ETH-USDT' })

    const btcPayload: NotificationEventPayload = {
      eventType: 'price-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      price: 105000,
      data: {},
    }

    expect(evaluateRule(rule, btcBinding, btcPayload).shouldFire).toBe(true)
    expect(evaluateRule(rule, ethBinding, btcPayload).shouldFire).toBe(false)
  })

  test('multiple event steps — only matching one fires', () => {
    const rule = makeRule({
      steps: [
        {
          id: 'price-event',
          type: 'price-alert',
          position: { x: -100, y: 0 },
          data: { direction: 'above', price: 100000 },
        },
        {
          id: 'order-event',
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
        { id: 'e1', source: 'price-event', target: 'channel' },
        { id: 'e2', source: 'order-event', target: 'channel' },
      ],
    })
    const binding = makeBinding()

    const priceResult = evaluateRule(rule, binding, {
      eventType: 'price-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      price: 105000,
      data: {},
    })
    expect(priceResult.shouldFire).toBe(true)

    const orderResult = evaluateRule(rule, binding, {
      eventType: 'order-executed',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      data: { side: 'buy', status: 'filled' },
    })
    expect(orderResult.shouldFire).toBe(true)
  })

  test('condition pass/fail branching', () => {
    const rule = makeRule({
      steps: [
        {
          id: 'event',
          type: 'price-alert',
          position: { x: 0, y: 0 },
          data: { direction: 'above', price: 0 },
        },
        {
          id: 'cond',
          type: 'price-condition',
          position: { x: 0, y: 100 },
          data: { direction: 'above', price: 100000 },
        },
        {
          id: 'pass-channel',
          type: 'local-toast',
          position: { x: -100, y: 200 },
          data: {},
        },
        {
          id: 'fail-channel',
          type: 'webhook',
          position: { x: 100, y: 200 },
          data: {
            url: 'https://example.com',
            method: 'POST',
            includePayload: true,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'event', target: 'cond' },
        {
          id: 'e2',
          source: 'cond',
          sourceHandle: 'pass',
          target: 'pass-channel',
        },
        {
          id: 'e3',
          source: 'cond',
          sourceHandle: 'fail',
          target: 'fail-channel',
        },
      ],
    })
    const binding = makeBinding()

    const aboveResult = evaluateRule(rule, binding, {
      eventType: 'price-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      price: 105000,
      data: {},
    })
    expect(aboveResult.shouldFire).toBe(true)
    expect(aboveResult.channelSteps[0].def.type).toBe('local-toast')

    const belowResult = evaluateRule(rule, binding, {
      eventType: 'price-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      price: 95000,
      data: {},
    })
    expect(belowResult.shouldFire).toBe(true)
    expect(belowResult.channelSteps[0].def.type).toBe('webhook')
  })

  test('returns no-fire when the rule itself is disabled', () => {
    const rule = makeRule({
      enabled: false,
      steps: [
        {
          id: 'event',
          type: 'price-alert',
          position: { x: 0, y: 0 },
          data: { direction: 'above', price: 100000 },
        },
        {
          id: 'channel',
          type: 'local-toast',
          position: { x: 0, y: 100 },
          data: {},
        },
      ],
      edges: [{ id: 'e1', source: 'event', target: 'channel' }],
    })
    const result = evaluateRule(rule, makeBinding(), {
      eventType: 'price-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      price: 105000,
      data: {},
    })
    expect(result.shouldFire).toBe(false)
  })

  test('price alert fires only on threshold crossing when prevPrice is present', () => {
    const rule = makeRule({
      steps: [
        {
          id: 'event',
          type: 'price-alert',
          position: { x: 0, y: 0 },
          data: { direction: 'above', price: 100000 },
        },
        {
          id: 'channel',
          type: 'local-toast',
          position: { x: 0, y: 100 },
          data: {},
        },
      ],
      edges: [{ id: 'e1', source: 'event', target: 'channel' }],
    })
    const binding = makeBinding()
    const payload = (price: number, prevPrice?: number) =>
      ({
        eventType: 'price-alert',
        timestamp: Date.now(),
        pair: 'BTC-USDT',
        market: 'okx',
        price,
        prevPrice,
        data: {},
      }) satisfies NotificationEventPayload

    // Crossing from below → fires
    expect(evaluateRule(rule, binding, payload(100500, 99500)).shouldFire).toBe(
      true,
    )
    // Already above on the previous tick → does NOT re-fire
    expect(
      evaluateRule(rule, binding, payload(101000, 100500)).shouldFire,
    ).toBe(false)
    // Dips back below → no fire
    expect(evaluateRule(rule, binding, payload(99000, 101000)).shouldFire).toBe(
      false,
    )
    // Crosses again → fires again
    expect(evaluateRule(rule, binding, payload(100200, 99000)).shouldFire).toBe(
      true,
    )
    // First tick ever (no prevPrice) with level already breached → fires once
    expect(evaluateRule(rule, binding, payload(105000)).shouldFire).toBe(true)
  })

  test('price alert below direction uses crossing semantics too', () => {
    const rule = makeRule({
      steps: [
        {
          id: 'event',
          type: 'price-alert',
          position: { x: 0, y: 0 },
          data: { direction: 'below', price: 90000 },
        },
        {
          id: 'channel',
          type: 'local-toast',
          position: { x: 0, y: 100 },
          data: {},
        },
      ],
      edges: [{ id: 'e1', source: 'event', target: 'channel' }],
    })
    const binding = makeBinding()
    const payload = (price: number, prevPrice?: number) =>
      ({
        eventType: 'price-alert',
        timestamp: Date.now(),
        pair: 'BTC-USDT',
        market: 'okx',
        price,
        prevPrice,
        data: {},
      }) satisfies NotificationEventPayload

    expect(evaluateRule(rule, binding, payload(89500, 90500)).shouldFire).toBe(
      true,
    )
    expect(evaluateRule(rule, binding, payload(89000, 89500)).shouldFire).toBe(
      false,
    )
  })

  test('a throwing condition routes to the fail branch instead of aborting', () => {
    registerStepTypes([
      {
        type: 'exploding-condition',
        label: 'Exploding',
        icon: 'Bomb',
        category: 'condition',
        branching: true,
        handles: {
          inputs: [{ id: 'in' }],
          outputs: [{ id: 'pass' }, { id: 'fail' }],
        },
        configSchema: [],
        validate: () => [],
        defaultData: () => ({}),
        evaluate: () => {
          throw new Error('boom')
        },
      },
    ])

    const rule = makeRule({
      steps: [
        {
          id: 'event',
          type: 'price-alert',
          position: { x: 0, y: 0 },
          data: { direction: 'above', price: 100000 },
        },
        {
          id: 'cond',
          type: 'exploding-condition',
          position: { x: 0, y: 100 },
          data: {},
        },
        {
          id: 'pass-channel',
          type: 'local-toast',
          position: { x: -100, y: 200 },
          data: {},
        },
        {
          id: 'fail-channel',
          type: 'os-notification',
          position: { x: 100, y: 200 },
          data: { sound: true },
        },
      ],
      edges: [
        { id: 'e1', source: 'event', target: 'cond' },
        {
          id: 'e2',
          source: 'cond',
          sourceHandle: 'pass',
          target: 'pass-channel',
        },
        {
          id: 'e3',
          source: 'cond',
          sourceHandle: 'fail',
          target: 'fail-channel',
        },
      ],
    })

    const result = evaluateRule(rule, makeBinding(), {
      eventType: 'price-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      price: 105000,
      data: {},
    })
    expect(result.shouldFire).toBe(true)
    expect(result.channelSteps).toHaveLength(1)
    expect(result.channelSteps[0].def.type).toBe('os-notification')
  })

  test('a throwing formatMessage falls back to a generic message', () => {
    registerStepTypes([
      {
        type: 'price-alert',
        label: 'Price Alert',
        icon: 'TrendingUp',
        category: 'event',
        handles: { inputs: [], outputs: [{ id: 'out' }] },
        configSchema: [],
        validate: () => [],
        defaultData: () => ({}),
        formatMessage: () => {
          throw new Error('boom')
        },
      },
    ])

    const rule = makeRule({
      steps: [
        {
          id: 'event',
          type: 'price-alert',
          position: { x: 0, y: 0 },
          data: { direction: 'above', price: 100000 },
        },
        {
          id: 'channel',
          type: 'local-toast',
          position: { x: 0, y: 100 },
          data: {},
        },
      ],
      edges: [{ id: 'e1', source: 'event', target: 'channel' }],
    })

    const result = evaluateRule(rule, makeBinding(), {
      eventType: 'price-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      price: 105000,
      data: {},
    })
    expect(result.shouldFire).toBe(true)
    expect(result.message?.title).toBe('Notification')
  })

  test('percent-change condition evaluates payload percentChange', () => {
    const rule = makeRule({
      steps: [
        {
          id: 'event',
          type: 'candle-close',
          position: { x: 0, y: 0 },
          data: { timeframe: '1h' },
        },
        {
          id: 'cond',
          type: 'percent-change',
          position: { x: 0, y: 100 },
          data: { percent: 2, direction: 'down' },
        },
        {
          id: 'channel',
          type: 'local-toast',
          position: { x: -100, y: 200 },
          data: {},
        },
      ],
      edges: [
        { id: 'e1', source: 'event', target: 'cond' },
        { id: 'e2', source: 'cond', sourceHandle: 'pass', target: 'channel' },
      ],
    })
    const binding = makeBinding()
    const payload = (percentChange: number) =>
      ({
        eventType: 'candle-close',
        timestamp: Date.now(),
        pair: 'BTC-USDT',
        market: 'okx',
        price: 100000,
        data: { timeframe: '1h', percentChange },
      }) satisfies NotificationEventPayload

    expect(evaluateRule(rule, binding, payload(-2.5)).shouldFire).toBe(true)
    expect(evaluateRule(rule, binding, payload(-1)).shouldFire).toBe(false)
    expect(evaluateRule(rule, binding, payload(3)).shouldFire).toBe(false)
  })

  describe('indicator-alert', () => {
    const indicatorRule = (data: Record<string, unknown>) =>
      makeRule({
        steps: [
          {
            id: 'event',
            type: 'indicator-alert',
            position: { x: 0, y: 0 },
            data,
          },
          {
            id: 'channel',
            type: 'local-toast',
            position: { x: 0, y: 100 },
            data: {},
          },
        ],
        edges: [{ id: 'e1', source: 'event', target: 'channel' }],
      })

    const indicatorPayload = (
      data: Record<string, unknown>,
    ): NotificationEventPayload => ({
      eventType: 'indicator-alert',
      timestamp: Date.now(),
      pair: 'BTC-USDT',
      market: 'okx',
      price: 63000,
      data,
    })

    const fired = {
      indicator: 'custom:user-indicators:rsi',
      indicatorTitle: 'RSI',
      condition: 'crossed_up',
      conditionTitle: 'RSI overbought',
      message: 'BTC-USDT RSI crossed above 70',
    }

    test('blank fields match any indicator and any condition', () => {
      const result = evaluateRule(
        indicatorRule({ indicator: '', condition: '' }),
        makeBinding(),
        indicatorPayload(fired),
      )
      expect(result.shouldFire).toBe(true)
      expect(result.message?.title).toBe('RSI overbought')
      expect(result.message?.body).toBe('BTC-USDT RSI crossed above 70')
    })

    test('matches an indicator by type or by title', () => {
      for (const indicator of [fired.indicator, fired.indicatorTitle]) {
        const result = evaluateRule(
          indicatorRule({ indicator, condition: '' }),
          makeBinding(),
          indicatorPayload(fired),
        )
        expect(result.shouldFire).toBe(true)
      }
    })

    test('does not fire for a different indicator or condition', () => {
      expect(
        evaluateRule(
          indicatorRule({ indicator: 'MACD', condition: '' }),
          makeBinding(),
          indicatorPayload(fired),
        ).shouldFire,
      ).toBe(false)

      expect(
        evaluateRule(
          indicatorRule({ indicator: '', condition: 'crossed_down' }),
          makeBinding(),
          indicatorPayload(fired),
        ).shouldFire,
      ).toBe(false)
    })

    test('falls back to a generic body when the script sent no message', () => {
      const result = evaluateRule(
        indicatorRule({ indicator: '', condition: '' }),
        makeBinding(),
        indicatorPayload({ ...fired, message: undefined }),
      )
      expect(result.shouldFire).toBe(true)
      expect(result.message?.body).toContain('RSI')
      expect(result.message?.body).toContain('BTC-USDT')
    })
  })
})

describe('dispatchNotification', () => {
  test('reports per-channel outcomes and isolates failures', async () => {
    const { dispatchNotification } = await import('../evaluator')
    const delivered: Array<string> = []

    const okDef = {
      type: 'ok-channel',
      label: 'OK',
      icon: 'Check',
      category: 'channel' as const,
      handles: { inputs: [{ id: 'in' }], outputs: [] },
      configSchema: [],
      validate: () => [],
      defaultData: () => ({}),
      deliver: async () => {
        delivered.push('ok-channel')
      },
    }
    const failDef = {
      ...okDef,
      type: 'fail-channel',
      deliver: async () => {
        throw new Error('endpoint unreachable')
      },
    }

    const message = {
      ruleId: 'rule-1',
      ruleName: 'Test',
      title: 'T',
      body: 'B',
      severity: 'info' as const,
      timestamp: Date.now(),
      payload: {
        eventType: 'price-alert',
        timestamp: Date.now(),
        data: {},
      },
    }

    const results = await dispatchNotification(message, [
      {
        step: {
          id: 'a',
          type: 'fail-channel',
          position: { x: 0, y: 0 },
          data: {},
        },
        def: failDef,
      },
      {
        step: {
          id: 'b',
          type: 'ok-channel',
          position: { x: 0, y: 0 },
          data: {},
        },
        def: okDef,
      },
    ])

    expect(delivered).toEqual(['ok-channel'])
    expect(results).toHaveLength(2)
    const fail = results.find((r) => r.channel === 'fail-channel')
    expect(fail?.ok).toBe(false)
    expect(fail?.error).toContain('endpoint unreachable')
    const ok = results.find((r) => r.channel === 'ok-channel')
    expect(ok?.ok).toBe(true)
  })
})
