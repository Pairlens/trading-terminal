// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import { streamHealth } from '../stream-health'

const T0 = new Date('2026-07-31T12:00:00Z')

/** Advance the clock by `ms` from T0. */
const at = (ms: number) => setSystemTime(new Date(T0.getTime() + ms))

afterEach(() => {
  streamHealth.clear()
  setSystemTime()
})

describe('streamHealth', () => {
  test('is idle with nothing subscribed', () => {
    at(0)
    expect(streamHealth.getSnapshot()).toBe('idle')
  })

  test('stays idle for a stream that has never delivered', () => {
    at(0)
    streamHealth.register('candles:okx:BTC-USDT:15m')
    // A pair that does not exist on the venue is the pane's empty state, not
    // a transport fault — it must not read as a broken connection.
    at(120_000)
    expect(streamHealth.getSnapshot()).toBe('idle')
  })

  test('reports live once data arrives', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    streamHealth.mark('ticker:okx:BTC-USDT')
    expect(streamHealth.getSnapshot()).toBe('live')
  })

  test('reports stale after the silence threshold', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    streamHealth.mark('ticker:okx:BTC-USDT')

    at(29_000)
    expect(streamHealth.getSnapshot()).toBe('live')

    at(31_000)
    expect(streamHealth.getSnapshot()).toBe('stale')
  })

  test('one delivering stream keeps the app live', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    streamHealth.register('ticker:okx:QUIET-USDT')
    streamHealth.mark('ticker:okx:BTC-USDT')
    streamHealth.mark('ticker:okx:QUIET-USDT')

    // The illiquid pair goes quiet; the liquid one keeps ticking.
    at(60_000)
    streamHealth.mark('ticker:okx:BTC-USDT')
    expect(streamHealth.getSnapshot()).toBe('live')
  })

  test('recovers to live when data resumes', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    streamHealth.mark('ticker:okx:BTC-USDT')

    at(60_000)
    expect(streamHealth.getSnapshot()).toBe('stale')

    streamHealth.mark('ticker:okx:BTC-USDT')
    expect(streamHealth.getSnapshot()).toBe('live')
  })

  test('unregistering the last stream returns to idle', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    streamHealth.mark('ticker:okx:BTC-USDT')
    at(60_000)
    expect(streamHealth.getSnapshot()).toBe('stale')

    streamHealth.unregister('ticker:okx:BTC-USDT')
    expect(streamHealth.getSnapshot()).toBe('idle')
  })

  // ── The degraded tier ───────────────────────────────────────────────
  //
  // The 30s ceiling on its own is a binary a weak mobile link walks straight
  // past: frames keep trickling in, so something is always inside the window
  // and the dot stays green over a tape that is visibly behind. These pin the
  // middle answer, and just as importantly they pin the false positive it
  // could have introduced.

  /** Teach `key` a `gapMs` rhythm from `startedAt`, and return the last mark. */
  const teach = (key: string, gapMs: number, marks: number, startedAt = 0) => {
    for (let i = 0; i < marks; i++) {
      at(startedAt + i * gapMs)
      streamHealth.mark(key)
    }
    return startedAt + (marks - 1) * gapMs
  }

  test('warns while the socket is still up when a busy stream goes quiet', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    // A quarter-second rhythm: an order book that has no business being
    // silent for five seconds, let alone thirty.
    const last = teach('ticker:okx:BTC-USDT', 250, 12)

    at(last + 4_000)
    expect(streamHealth.getSnapshot()).toBe('live')

    // This is the whole point: amber at six seconds, not at thirty, and while
    // the socket the connector holds is still open.
    at(last + 6_000)
    expect(streamHealth.getSnapshot()).toBe('degraded')

    at(last + 40_000)
    expect(streamHealth.getSnapshot()).toBe('stale')
  })

  test('a thin pair is not accused of lagging for being thin', () => {
    at(0)
    streamHealth.register('trades:okx:THIN-USDT')
    // Twenty seconds between prints is this market, not this link. Six times
    // that is past the hard ceiling, so the ceiling governs and the behaviour
    // is exactly what it was before the tier existed.
    const last = teach('trades:okx:THIN-USDT', 20_000, 8)

    at(last + 25_000)
    expect(streamHealth.getSnapshot()).toBe('live')

    at(last + 31_000)
    expect(streamHealth.getSnapshot()).toBe('stale')
  })

  test('one stream keeping its own rhythm still holds the app live', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    streamHealth.register('trades:okx:THIN-USDT')
    teach('trades:okx:THIN-USDT', 20_000, 8)
    const last = teach('ticker:okx:BTC-USDT', 250, 12, 140_000)

    // The thin pair is 20s quiet and the busy one is not: a quiet market
    // alongside a live one is not a fault.
    at(last + 1_000)
    expect(streamHealth.getSnapshot()).toBe('live')
  })

  test('a stream with no rhythm of its own cannot vouch for a dead one', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    streamHealth.register('history:okx:BTC-USDT')
    // One delivery and nothing since: this stream has no rhythm to be late
    // against, so it is not evidence of anything either way. Reading it as
    // health is what held the dot green through a whole outage on a live OKX
    // board while the order book beside it sat frozen (measured 2026-08-26).
    streamHealth.mark('history:okx:BTC-USDT')
    const last = teach('ticker:okx:BTC-USDT', 250, 12)

    at(last + 6_000)
    expect(streamHealth.getSnapshot()).toBe('degraded')
  })

  test('a slow stream cannot vouch for a busy one that has stopped', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    streamHealth.register('trades:okx:THIN-USDT')
    // The thin tape's own window is the 30s ceiling, so at second six it is
    // not late. Not-yet-late is not the same as healthy, and only the second
    // reading may keep the dot green.
    teach('trades:okx:THIN-USDT', 20_000, 8)
    const last = teach('ticker:okx:BTC-USDT', 250, 12, 140_000)

    at(last + 6_000)
    expect(streamHealth.getSnapshot()).toBe('degraded')
  })

  test('a stall does not teach the baseline that stalling is normal', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    const learned = teach('ticker:okx:BTC-USDT', 250, 12)

    // Twenty seconds of nothing, then the link comes back. Fed in raw, that
    // one gap would move the baseline far enough that the NEXT stall passes
    // unreported — a failure mode that conceals itself.
    at(learned + 20_000)
    streamHealth.mark('ticker:okx:BTC-USDT')
    const resumed = teach('ticker:okx:BTC-USDT', 250, 12, learned + 20_250)

    at(resumed + 6_000)
    expect(streamHealth.getSnapshot()).toBe('degraded')
  })

  test('a single frame mid-stall does not blink the warning off', () => {
    at(0)
    streamHealth.register('ticker:okx:BTC-USDT')
    const last = teach('ticker:okx:BTC-USDT', 250, 12)

    at(last + 6_000)
    expect(streamHealth.getSnapshot()).toBe('degraded')

    // A burst arrives. Two seconds of it is not yet a recovery, and a header
    // that strobes green/amber is unreadable at exactly the wrong moment.
    teach('ticker:okx:BTC-USDT', 250, 9, last + 6_250)
    expect(streamHealth.getSnapshot()).toBe('degraded')

    // Six seconds of steady delivery is.
    teach('ticker:okx:BTC-USDT', 250, 16, last + 8_500)
    expect(streamHealth.getSnapshot()).toBe('live')
  })

  test('reports when the newest delivery landed', () => {
    at(0)
    expect(streamHealth.getLastDeliveryAt()).toBe(0)

    streamHealth.register('ticker:okx:BTC-USDT')
    expect(streamHealth.getLastDeliveryAt()).toBe(0)

    at(4_000)
    streamHealth.mark('ticker:okx:BTC-USDT')
    at(9_000)
    expect(Date.now() - streamHealth.getLastDeliveryAt()).toBe(5_000)
  })

  test('notifies subscribers when health transitions', () => {
    at(0)
    let notifications = 0
    const release = streamHealth.subscribe(() => {
      notifications++
    })

    streamHealth.register('ticker:okx:BTC-USDT')
    streamHealth.mark('ticker:okx:BTC-USDT')
    expect(notifications).toBe(1) // idle → live

    streamHealth.mark('ticker:okx:BTC-USDT')
    expect(notifications).toBe(1) // still live, no churn

    release()
  })
})
