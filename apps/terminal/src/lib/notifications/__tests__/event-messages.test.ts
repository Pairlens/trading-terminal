// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeAll, describe, expect, test } from 'bun:test'

import { CORE_NOTIFICATION_STEPS } from '@pairlens/notification-engine/core-steps'
import {
  getStepType,
  registerStepTypes,
} from '@pairlens/notification-engine/step-registry'
import { registerEventMessages } from '../event-messages'
import type { NotificationEventPayload } from '@pairlens/notification-engine/types'

/**
 * The text a notification actually arrives with.
 *
 * `registerEventMessages` overrides the engine's English `formatMessage` by
 * key, and none of those keys carry a `defaultValue` — a typo would render the
 * key path itself into a toast ("notifications.messages.priceAlert.title"),
 * which looks like a crash and reads like one. Nothing else catches that:
 * the catalog-parity test only sees literal `t(...)` call sites in components,
 * and these live behind a registry override.
 */

const EVENT_STEPS = [
  'price-alert',
  'order-executed',
  'signal-generated',
  'indicator-alert',
  'candle-close',
]

function payload(over: Partial<NotificationEventPayload> = {}) {
  return {
    eventType: 'price-alert',
    pair: 'BTC-USDT',
    market: 'okx',
    price: 64000,
    timestamp: 0,
    data: {},
    ...over,
  } as NotificationEventPayload
}

beforeAll(() => {
  registerStepTypes(CORE_NOTIFICATION_STEPS)
  registerEventMessages()
})

describe('translated notification messages', () => {
  test.each(EVENT_STEPS)('%s renders real text, not key paths', (type) => {
    const def = getStepType(type)
    expect(def?.formatMessage).toBeDefined()

    const msg = def!.formatMessage!(def!.defaultData(), payload())

    for (const part of [msg.title, msg.body]) {
      expect(part.length).toBeGreaterThan(0)
      // A missing key renders as the dotted key path.
      expect(part).not.toContain('notifications.messages.')
      // An unsupplied interpolation leaves the braces behind.
      expect(part).not.toContain('{{')
    }
  })

  test('enum fragments reuse the step config-option wording', () => {
    const def = getStepType('order-executed')
    const msg = def!.formatMessage!(
      { side: 'any', status: 'filled' },
      payload({
        eventType: 'order-executed',
        data: { side: 'buy', status: 'filled' },
      }),
    )
    // Same words the builder's Side and Status dropdowns show.
    expect(msg.body).toContain('Buy')
    expect(msg.body).toContain('Filled')
  })

  test("an indicator alert keeps the user's own condition title", () => {
    const def = getStepType('indicator-alert')
    const msg = def!.formatMessage!(
      {},
      payload({
        eventType: 'indicator-alert',
        data: { conditionTitle: 'RSI podniósł się powyżej 70' },
      }),
    )
    expect(msg.title).toBe('RSI podniósł się powyżej 70')
  })
})
