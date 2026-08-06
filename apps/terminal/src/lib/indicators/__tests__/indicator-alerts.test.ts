// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterAll, describe, expect, it } from 'bun:test'

import {
  evaluateIndicatorAlerts,
  formatAlertMessage,
} from '../indicator-alerts'
import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import type { NotificationEventPayload } from '@pairlens/notification-engine/types'
import { notificationRuntime } from '@/lib/notifications/notification-runtime'

// The alert bridge pushes straight into the notification runtime singleton.
// Patch the instance rather than the module: bun's mock.module is registered
// process-wide, so mocking this module here also replaced it for the
// subscription-manager suite and broke it.
const events: Array<NotificationEventPayload> = []
const realHandleEvent = notificationRuntime.handleEvent
notificationRuntime.handleEvent = (payload: NotificationEventPayload) => {
  events.push(payload)
  return Promise.resolve()
}

afterAll(() => {
  notificationRuntime.handleEvent = realHandleEvent
})

describe('formatAlertMessage', () => {
  it('expands every known placeholder', () => {
    const out = formatAlertMessage(
      '{{pair}} {{title}} hit {{value}} at {{price}} on {{timeframe}}',
      {
        pair: 'BTC-USDT',
        title: 'RSI overbought',
        value: '71.4',
        price: '63000',
        timeframe: '1h',
      },
    )
    expect(out).toBe('BTC-USDT RSI overbought hit 71.4 at 63000 on 1h')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(formatAlertMessage('{{ pair }}', { pair: 'ETH-USDT' })).toBe(
      'ETH-USDT',
    )
  })

  it('leaves unknown placeholders alone rather than blanking them', () => {
    // A typo should be visible in the notification, not silently swallowed.
    expect(formatAlertMessage('{{pare}} moved', { pair: 'BTC-USDT' })).toBe(
      '{{pare}} moved',
    )
  })

  it('passes through a template with no placeholders', () => {
    expect(formatAlertMessage('Something happened', {})).toBe(
      'Something happened',
    )
  })
})

// ── Edge state isolation ─────────────────────────────────────────────

const META: CustomIndicatorMeta = {
  id: 'x',
  title: 'Crosser',
  pane: 'separate',
  inputs: [],
  series: [],
  alerts: [{ key: 'fired', title: 'Fired', message: '{{title}} on {{pair}}' }],
}

const bars = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    ts: i * 60_000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
  }))

/**
 * `values` is the per-bar condition series; the last bar is still forming.
 * `indicatorType` varies per test — the bridge keeps edge state in module
 * scope by design (it has to outlive a render), so tests must not share a key.
 */
const run = (indicatorType: string, timeframe: string, values: Array<number>) =>
  evaluateIndicatorAlerts({
    indicatorType,
    meta: META,
    bars: bars(values.length),
    outputs: { fired: Float64Array.from(values) },
    market: 'okx',
    pair: 'BTC-USDT',
    timeframe,
  })

describe('evaluateIndicatorAlerts edge state', () => {
  it('fires once on the 0 → true edge of a closed bar', () => {
    events.length = 0
    run('custom:test:edge', '1h', [0, 0, 1, 0])
    expect(events).toHaveLength(1)
    expect(events[0].data.conditionTitle).toBe('Fired')

    // Same closed bar again (a re-render, a throttled refresh) must not repeat.
    run('custom:test:edge', '1h', [0, 0, 1, 0])
    expect(events).toHaveLength(1)
  })

  it('keeps per-timeframe state separate', () => {
    events.length = 0
    // The chart watching 1h and the headless notification runner watching 4h
    // evaluate the same condition on the same pair. Sharing one state slot let
    // whichever ran second overwrite the other's edge and swallow its alert.
    run('custom:test:tf', '1h', [0, 0, 1, 0])
    run('custom:test:tf', '4h', [0, 0, 1, 0])

    expect(events.map((e) => e.data.timeframe)).toEqual(['1h', '4h'])
  })
})
