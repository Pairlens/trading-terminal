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
