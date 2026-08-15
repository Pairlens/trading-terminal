// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The venue-timeframe clamp.
 *
 * The failure this prevents is not cosmetic. A persisted `15m` handed to
 * Polymarket (1m/5m/1h/1d) fails the history probe, the chart never leaves
 * "Analyzing market…", and because that probe doubles as the availability
 * probe the pair is then published as unlisted — so the order book, the tape
 * AND the trade pane all hide themselves behind "isn't available on
 * Polymarket" while the ticket works perfectly. Verified in the browser.
 */

import { describe, expect, test } from 'bun:test'

import { TIMEFRAMES } from '@pairlens/shared/timeframe'
import { clampTimeframeToVenue, orderTimeframes } from '@/lib/chart-timeframes'
import { supportedTimeframeOptions } from '@/components/terminal/chart-toolbar'

const POLYMARKET = ['1m', '5m', '1h', '1d']
const KALSHI = ['1m', '1h', '1d']
const CEX = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w']

describe('clampTimeframeToVenue', () => {
  test('a supported interval is handed through untouched', () => {
    expect(clampTimeframeToVenue('1h', POLYMARKET)).toBe('1h')
    expect(clampTimeframeToVenue('15m', CEX)).toBe('15m')
  })

  test('an unsupported interval clamps to the nearest SMALLER one', () => {
    // The 15m that broke the chart: Polymarket's next one down is 5m.
    expect(clampTimeframeToVenue('15m', POLYMARKET)).toBe('5m')
    expect(clampTimeframeToVenue('30m', POLYMARKET)).toBe('5m')
    expect(clampTimeframeToVenue('4h', POLYMARKET)).toBe('1h')
    expect(clampTimeframeToVenue('1w', POLYMARKET)).toBe('1d')
    // Kalshi has no 5m at all, so 15m lands on 1m.
    expect(clampTimeframeToVenue('15m', KALSHI)).toBe('1m')
  })

  test('when nothing is smaller, the smallest supported one wins', () => {
    expect(clampTimeframeToVenue('1m', ['1h', '1d'])).toBe('1h')
  })

  test('a venue that declares nothing keeps the request', () => {
    // Empty means "this venue did not say", which is every venue that has not
    // stamped `metadata.timeframes` — assuming capability is what the
    // terminal's other unknown-venue checks do.
    expect(clampTimeframeToVenue('15m', [])).toBe('15m')
  })

  test('an interval this build cannot order falls to the venue floor', () => {
    expect(clampTimeframeToVenue('7s', POLYMARKET)).toBe('1m')
  })

  test('a venue spelling its own intervals is honoured but never a target', () => {
    // A connector may serve an interval this build has no chip for. The user
    // can be ON it, so it passes through untouched...
    expect(clampTimeframeToVenue('6h', ['1h', '6h', '1d'])).toBe('6h')
    // ...but it has no position in the order, so the clamp never lands on it
    // and picks the shortest interval it can actually reason about.
    expect(clampTimeframeToVenue('4h', ['6h', '1d'])).toBe('1d')
  })

  test('it is deterministic — a reload does not move the chart', () => {
    const once = clampTimeframeToVenue('15m', POLYMARKET)
    expect(clampTimeframeToVenue('15m', [...POLYMARKET].reverse())).toBe(once)
  })

  test('the preference itself is untouched, so leaving restores it', () => {
    // The clamp is a pure read: the same request still resolves to 15m the
    // moment the venue serves it again.
    const persisted = '15m'
    expect(clampTimeframeToVenue(persisted, POLYMARKET)).toBe('5m')
    expect(clampTimeframeToVenue(persisted, CEX)).toBe('15m')
  })
})

describe('orderTimeframes', () => {
  test('shortest first, unknown spellings last in declared order', () => {
    expect(orderTimeframes(['1d', '1m', '1h'])).toEqual(['1m', '1h', '1d'])
    expect(orderTimeframes(['zzz', '1d', 'aaa', '1m'])).toEqual([
      '1m',
      '1d',
      'zzz',
      'aaa',
    ])
  })
})

describe('supportedTimeframeOptions', () => {
  test('the picker offers only what the venue serves', () => {
    expect(supportedTimeframeOptions(POLYMARKET).map((o) => o.value)).toEqual([
      '1m',
      '5m',
      '1h',
      '1d',
    ])
    expect(supportedTimeframeOptions(KALSHI).map((o) => o.value)).toEqual([
      '1m',
      '1h',
      '1d',
    ])
  })

  test('a venue that declares nothing keeps the full list', () => {
    expect(supportedTimeframeOptions([]).length).toBeGreaterThan(4)
  })

  test('an unrecognisable list falls back rather than emptying the picker', () => {
    expect(supportedTimeframeOptions(['7s', '9y']).length).toBeGreaterThan(4)
  })

  test('every offered chip is one the clamp would leave alone', () => {
    for (const venue of [POLYMARKET, KALSHI, CEX]) {
      for (const option of supportedTimeframeOptions(venue)) {
        expect(clampTimeframeToVenue(option.value, venue)).toBe(option.value)
      }
    }
  })
})

/**
 * The clamp now lives at the provider's egress, not only in the chart, so
 * these are the properties every consumer inherits: the keyboard shortcuts,
 * the copilot's candle tools and the Python indicators' `request.security`
 * all reach a venue through `subscribe` / `fetchHistory` / `probeVenueHistory`.
 */
describe('clamp as an egress invariant', () => {
  test('whatever comes out is something the venue serves', () => {
    for (const venue of [POLYMARKET, KALSHI, CEX]) {
      for (const requested of [...CEX, '3d', '1M', '7s', 'hourly', '', '15m']) {
        expect(venue).toContain(clampTimeframeToVenue(requested, venue))
      }
    }
  })

  test('an unknown venue is left entirely alone', () => {
    // A third-party connector that stamps no `metadata.timeframes` must not
    // have its requests rewritten — the terminal knows nothing about it.
    for (const requested of [...CEX, '6h', 'hourly']) {
      expect(clampTimeframeToVenue(requested, [])).toBe(requested)
    }
  })

  test('the clamp is idempotent, so a re-subscribe is the same stream', () => {
    // The multiplex key is built from the clamped value: two consumers asking
    // for 15m and 30m on Kalshi must land on ONE key, not two.
    for (const venue of [POLYMARKET, KALSHI]) {
      for (const requested of CEX) {
        const once = clampTimeframeToVenue(requested, venue)
        expect(clampTimeframeToVenue(once, venue)).toBe(once)
      }
    }
    expect(clampTimeframeToVenue('15m', KALSHI)).toBe(
      clampTimeframeToVenue('30m', KALSHI),
    )
  })
})

describe('the ms table is the shared one', () => {
  test('every interval in the union is orderable', () => {
    // A local copy would go on silently treating a newly added `Timeframe` as
    // unknown, which means never clamping onto it.
    expect(orderTimeframes([...TIMEFRAMES])).toEqual([...TIMEFRAMES])
    for (const tf of TIMEFRAMES) {
      expect(clampTimeframeToVenue('1M', [tf])).toBe(tf)
    }
  })
})
