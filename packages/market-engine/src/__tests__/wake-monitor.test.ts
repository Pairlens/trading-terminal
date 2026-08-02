// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { WakeMonitor } from '../wake-monitor'
import type { WakeEvent } from '../wake-monitor'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Drives the monitor's clock by hand so a "suspend" needs no real waiting. */
function fakeClock(start = 1_000_000) {
  let value = start
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms
    },
  }
}

describe('WakeMonitor', () => {
  it('reports a resume when the clock jumps past the threshold', async () => {
    const clock = fakeClock()
    const seen: Array<WakeEvent> = []
    const monitor = new WakeMonitor({
      tickMs: 2,
      thresholdMs: 500,
      now: clock.now,
      subscribeOnline: () => null,
    })

    const release = monitor.subscribe((e) => seen.push(e))
    // The process was frozen for 30s between two ticks.
    clock.advance(30_000)
    await sleep(10)

    expect(seen.length).toBeGreaterThanOrEqual(1)
    expect(seen[0].reason).toBe('resume')
    expect(seen[0].gapMs).toBe(30_000)

    release()
  })

  it('stays quiet while ticks arrive on schedule', async () => {
    const clock = fakeClock()
    const seen: Array<WakeEvent> = []
    const monitor = new WakeMonitor({
      tickMs: 2,
      thresholdMs: 500,
      now: clock.now,
      subscribeOnline: () => null,
    })

    const release = monitor.subscribe((e) => seen.push(e))
    for (let i = 0; i < 5; i++) {
      clock.advance(2)
      await sleep(4)
    }

    expect(seen).toEqual([])
    release()
  })

  it('reports network restoration from the online source', async () => {
    const clock = fakeClock()
    const seen: Array<WakeEvent> = []
    let fireOnline: (() => void) | null = null

    const monitor = new WakeMonitor({
      tickMs: 5,
      thresholdMs: 500,
      now: clock.now,
      subscribeOnline: (handler) => {
        fireOnline = handler
        return () => {
          fireOnline = null
        }
      },
    })

    const release = monitor.subscribe((e) => seen.push(e))
    fireOnline?.()

    expect(seen).toEqual([{ reason: 'online', gapMs: 0 }])

    release()
    // Releasing the last listener tears the online subscription down too.
    expect(fireOnline).toBeNull()
  })

  it('runs no timer once the last listener releases', async () => {
    const clock = fakeClock()
    const seen: Array<WakeEvent> = []
    const monitor = new WakeMonitor({
      tickMs: 2,
      thresholdMs: 100,
      now: clock.now,
      subscribeOnline: () => null,
    })

    const releaseA = monitor.subscribe((e) => seen.push(e))
    const releaseB = monitor.subscribe((e) => seen.push(e))
    releaseA()
    releaseB()

    clock.advance(30_000)
    await sleep(10)

    expect(seen).toEqual([])
  })

  it('fans one event out to every listener', async () => {
    const clock = fakeClock()
    const seen: Array<string> = []
    const monitor = new WakeMonitor({
      tickMs: 2,
      thresholdMs: 100,
      now: clock.now,
      subscribeOnline: () => null,
    })

    const releaseA = monitor.subscribe(() => seen.push('a'))
    const releaseB = monitor.subscribe(() => seen.push('b'))
    clock.advance(5_000)
    await sleep(10)

    expect(seen.slice(0, 2).sort()).toEqual(['a', 'b'])

    releaseA()
    releaseB()
  })
})
