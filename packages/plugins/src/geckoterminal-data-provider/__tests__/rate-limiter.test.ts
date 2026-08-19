// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pacing that keeps the DEX surfaces inside GeckoTerminal's free tier, and
 * the 429 classification that stops a limit reading as a missing pair.
 *
 * Both run on a VIRTUAL clock. The limiter takes `now` and `delay` as options
 * for exactly this reason: a real sliding-window test would have to sleep a
 * minute to prove the window slides, and a test that sleeps is a test nobody
 * runs. Here `delay` advances the clock instead of waiting, so a full window
 * boundary costs microseconds and the assertions are exact rather than
 * approximate.
 */
import { afterEach, describe, expect, it } from 'bun:test'

import { isProviderThrottledError } from '@pairlens/market-engine/errors'
import {
  isProviderThrottled,
  resetProviderThrottles,
} from '@pairlens/market-engine/provider-throttle'

import {
  GECKOTERMINAL_PROVIDER,
  RATE_LIMIT_BURST,
  RATE_LIMIT_CAPACITY,
  RATE_LIMIT_SPACING_MS,
  RATE_LIMIT_WINDOW_MS,
  createGeckoFetch,
  createRequestLimiter,
} from '../rate-limiter'

/**
 * A clock that only moves when someone asks to wait. `delay` resolves on a
 * microtask so admission ordering stays observable.
 */
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

afterEach(() => {
  resetProviderThrottles()
})

describe('the budget', () => {
  it('is set under the documented free tier, not at it', () => {
    // Roughly 30 requests a minute is what the provider allows. Sitting exactly
    // on the ceiling means a second Pairlens window on the same IP puts us
    // over it, which is the state this whole module exists to avoid.
    expect(RATE_LIMIT_WINDOW_MS).toBe(60_000)
    expect(RATE_LIMIT_CAPACITY).toBeLessThan(30)
    expect(RATE_LIMIT_CAPACITY).toBeGreaterThanOrEqual(20)
  })
})

describe('the burst allowance', () => {
  it('paces the tail of a burst without pacing its head', async () => {
    // The quota is not the only thing the provider meters. A Discovery board
    // opening cold asks for six chain aggregates and three pages of pools in
    // one tick — nine requests, well inside 25 a minute, and enough to draw a
    // 429 that a browser cannot even read (see geckoFetch). The first few go
    // straight out so the board paints; the rest are spaced.
    const clock = virtualClock()
    const limiter = createRequestLimiter({
      capacity: 25,
      windowMs: 60_000,
      burst: 3,
      minSpacingMs: 600,
      now: clock.now,
      delay: clock.delay,
    })

    for (let i = 0; i < 3; i += 1) await limiter.acquire()
    expect(clock.waits).toEqual([])

    await limiter.acquire()
    await limiter.acquire()
    expect(clock.waits).toEqual([600, 600])
  })

  it('does not make a caller that already waited wait again', async () => {
    const clock = virtualClock()
    const limiter = createRequestLimiter({
      capacity: 25,
      windowMs: 60_000,
      burst: 1,
      minSpacingMs: 500,
      now: clock.now,
      delay: clock.delay,
    })

    await limiter.acquire()
    clock.advance(900)
    await limiter.acquire()
    expect(clock.waits).toEqual([])
  })

  it('ships a burst small enough to matter and a gap long enough to help', () => {
    expect(RATE_LIMIT_BURST).toBeLessThan(RATE_LIMIT_CAPACITY)
    expect(RATE_LIMIT_SPACING_MS).toBeGreaterThanOrEqual(250)
  })
})

describe('createRequestLimiter', () => {
  it('lets a cold start spend the whole budget with no waiting', async () => {
    // First paint must not be paced to death: the chart's 500-candle snapshot,
    // the ticker and the pool read should all go out immediately.
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

    // Ten callers in one tick, which is what opening a five-chain board on top
    // of a charted pair looks like.
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
    // Ten callers, three per window: one wait per exhausted window rather than
    // one per caller. Crossing the boundary retires the whole previous batch at
    // once, so the queue drains in batches of the capacity.
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

  it('a cooldown refuses every caller, and extends rather than shortens', async () => {
    // Refuses rather than holds. A cool-off is the provider turning us away,
    // and a caller parked on one is invisible: nothing has been sent, so the
    // pane above it still believes it is loading. Every read here polls on its
    // own interval, so the refusal costs nothing but tells the truth.
    const clock = virtualClock()
    const limiter = limiterOn(clock)

    limiter.cooldown(5_000)
    limiter.cooldown(1_000) // shorter: must not cut the first one short

    await expect(limiter.acquire()).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 5_000,
    })
    expect(clock.waits).toEqual([])
  })

  it('still queues a PACING wait, which is the limiter s own doing', async () => {
    // The ceiling covers our own spacing, not the provider's refusal. A caller
    // spaced 600ms behind the burst is genuinely about to be sent.
    const clock = virtualClock()
    const limiter = createRequestLimiter({
      capacity: 10,
      windowMs: 60_000,
      burst: 1,
      minSpacingMs: 600,
      maxWaitMs: 15_000,
      now: clock.now,
      delay: clock.delay,
    })

    await limiter.acquire()
    await limiter.acquire()
    expect(clock.waits).toEqual([600])
  })

  it('refuses a pacing wait past the ceiling rather than queue on it', async () => {
    // The minute's budget is genuinely spent and the next slot is 60s out.
    // Sixty seconds of a pane claiming to load is the same lie as a cool-off.
    const clock = virtualClock()
    const limiter = createRequestLimiter({
      capacity: 1,
      windowMs: 60_000,
      maxWaitMs: 5_000,
      now: clock.now,
      delay: clock.delay,
    })

    await limiter.acquire()
    await expect(limiter.acquire()).rejects.toMatchObject({ status: 429 })
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
})

describe('geckoFetch', () => {
  const stubFetch = (
    responses: Array<{ status: number; headers?: Record<string, string> }>,
  ) => {
    const calls: Array<string> = []
    const original = globalThis.fetch
    let index = 0
    globalThis.fetch = ((url: string) => {
      calls.push(String(url))
      const spec = responses[Math.min(index, responses.length - 1)]
      index += 1
      return Promise.resolve(
        new Response(spec.status === 200 ? '{}' : '', {
          status: spec.status,
          headers: spec.headers,
        }),
      )
    }) as typeof globalThis.fetch
    return {
      calls,
      restore: () => {
        globalThis.fetch = original
      },
    }
  }

  it('passes a 2xx straight through', async () => {
    const clock = virtualClock()
    const fetchPaced = createGeckoFetch(limiterOn(clock))
    const stub = stubFetch([{ status: 200 }])
    try {
      const res = await fetchPaced('https://api.geckoterminal.com/api/v2/x')
      expect(res.status).toBe(200)
      expect(stub.calls.length).toBe(1)
      expect(isProviderThrottled(GECKOTERMINAL_PROVIDER)).toBe(false)
    } finally {
      stub.restore()
    }
  })

  it('turns a 429 into a typed throttle, and registers it', async () => {
    const clock = virtualClock()
    const limiter = limiterOn(clock)
    const fetchPaced = createGeckoFetch(limiter)
    const stub = stubFetch([{ status: 429, headers: { 'retry-after': '7' } }])
    try {
      let thrown: unknown
      try {
        await fetchPaced('https://api.geckoterminal.com/api/v2/x')
      } catch (e) {
        thrown = e
      }

      expect(isProviderThrottledError(thrown)).toBe(true)
      // Registered, which is what stops the terminal recording the pair as one
      // this venue does not carry.
      expect(isProviderThrottled(GECKOTERMINAL_PROVIDER)).toBe(true)

      // And the queue is held back for the provider's own Retry-After, so the
      // next poll does not walk straight back into the limit. Held back by
      // being REFUSED, not by being parked: see the cooldown test above.
      await expect(limiter.acquire()).rejects.toMatchObject({
        retryAfterMs: 7_000,
      })
    } finally {
      stub.restore()
    }
  })

  it('treats a 5xx as transient too, with a shorter hold', async () => {
    const clock = virtualClock()
    const limiter = limiterOn(clock)
    const fetchPaced = createGeckoFetch(limiter)
    const stub = stubFetch([{ status: 503 }])
    try {
      await expect(
        fetchPaced('https://api.geckoterminal.com/api/v2/x'),
      ).rejects.toThrow(/temporarily unavailable/)
      await expect(limiter.acquire()).rejects.toMatchObject({
        retryAfterMs: 3_000,
      })
    } finally {
      stub.restore()
    }
  })

  it('does not retry on its own: one acquire, one request', async () => {
    // Retrying inside the transport would spend budget the caller cannot see
    // and hide the throttle from the terminal.
    const clock = virtualClock()
    const fetchPaced = createGeckoFetch(limiterOn(clock))
    const stub = stubFetch([{ status: 429 }])
    try {
      await fetchPaced('https://api.geckoterminal.com/api/v2/x').catch(
        () => undefined,
      )
      expect(stub.calls.length).toBe(1)
    } finally {
      stub.restore()
    }
  })

  it('leaves a 404 alone, so "no pool here" stays an answer', async () => {
    const clock = virtualClock()
    const fetchPaced = createGeckoFetch(limiterOn(clock))
    const stub = stubFetch([{ status: 404 }])
    try {
      const res = await fetchPaced('https://api.geckoterminal.com/api/v2/x')
      expect(res.status).toBe(404)
      expect(isProviderThrottled()).toBe(false)
    } finally {
      stub.restore()
    }
  })
})
