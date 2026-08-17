// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The sliding-window budget every paced provider shares.
 *
 * Everything runs on a VIRTUAL clock, which is why the limiter takes `now` and
 * `delay` as options at all: a real test of a sliding window would have to sleep
 * a minute to prove the window slides, and a test that sleeps is a test nobody
 * runs. Here `delay` advances the clock instead of waiting, so a window boundary
 * costs microseconds and the assertions are exact rather than approximate.
 */
import { describe, expect, it } from 'bun:test'

import { createRequestLimiter } from '../request-limiter'

function virtualClock(start = 1_000_000) {
  let t = start
  const waits: Array<number> = []
  return {
    now: () => t,
    delay: (ms: number) => {
      waits.push(ms)
      t += ms
      return Promise.resolve()
    },
    waits,
    advance: (ms: number) => {
      t += ms
    },
    get time() {
      return t
    },
  }
}

const limiterOn = (clock: ReturnType<typeof virtualClock>, capacity = 3) =>
  createRequestLimiter({
    capacity,
    windowMs: 1_000,
    now: clock.now,
    delay: clock.delay,
  })

describe('createRequestLimiter', () => {
  it('lets a cold start spend the whole budget with no waiting', async () => {
    // First paint must not be paced to death: a snapshot, a ticker and a pool
    // read should all go out immediately.
    const clock = virtualClock()
    const limiter = limiterOn(clock)
    await limiter.acquire()
    await limiter.acquire()
    await limiter.acquire()
    expect(clock.waits).toEqual([])
    expect(clock.time).toBe(1_000_000)
  })

  it('holds the next caller until the oldest request leaves the window', async () => {
    const clock = virtualClock()
    const limiter = limiterOn(clock)
    for (let i = 0; i < 3; i += 1) await limiter.acquire()

    clock.advance(400)
    await limiter.acquire()

    // The oldest of the three was issued 400ms ago, so the slot frees in 600ms.
    expect(clock.waits).toEqual([601])
  })

  it('queues a burst instead of dropping or overrunning it', async () => {
    const clock = virtualClock()
    const limiter = limiterOn(clock)
    const order: Array<number> = []

    const all = Array.from({ length: 10 }, (_, i) =>
      limiter.acquire().then(() => {
        order.push(i)
      }),
    )
    expect(limiter.waiting()).toBe(10)
    await Promise.all(all)

    // Every one of them is admitted, in the order it asked.
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(limiter.waiting()).toBe(0)
    // Crossing a boundary retires the whole previous batch at once, so the queue
    // drains in batches of the capacity: one wait per exhausted window, not one
    // per caller.
    expect(clock.waits.length).toBe(3)
  })

  it('never admits more than the capacity inside one window', async () => {
    const clock = virtualClock()
    const admitted: Array<number> = []
    const limiter = createRequestLimiter({
      capacity: 4,
      windowMs: 1_000,
      now: clock.now,
      delay: clock.delay,
    })

    await Promise.all(
      Array.from({ length: 13 }, () =>
        limiter.acquire().then(() => {
          admitted.push(clock.now())
        }),
      ),
    )

    for (const at of admitted) {
      const insideWindow = admitted.filter(
        (other) => other > at - 1_000 && other <= at,
      )
      expect(insideWindow.length).toBeLessThanOrEqual(4)
    }
  })

  it('a cooldown holds every caller back, and extends rather than shortens', async () => {
    const clock = virtualClock()
    const limiter = limiterOn(clock)

    limiter.cooldown(5_000)
    limiter.cooldown(1_000) // shorter: must not cut the first one short
    await limiter.acquire()

    expect(clock.waits).toEqual([5_000])
  })

  it('one caller s rejection does not poison the queue behind it', async () => {
    // Admission is serialized through a promise chain. If that chain kept a
    // rejection, one failed acquire would fail every later one for the life of
    // the process.
    const clock = virtualClock()
    const limiter = limiterOn(clock)
    const first = limiter.acquire().then(() => {
      throw new Error('caller blew up after being admitted')
    })
    await expect(first).rejects.toThrow('caller blew up')
    await limiter.acquire()
    expect(limiter.waiting()).toBe(0)
  })

  it('forgets the window and the cool-off on reset', async () => {
    const clock = virtualClock()
    const limiter = limiterOn(clock)
    for (let i = 0; i < 3; i += 1) await limiter.acquire()
    limiter.cooldown(30_000)

    limiter.reset()
    await limiter.acquire()
    expect(clock.waits).toEqual([])
  })
})
