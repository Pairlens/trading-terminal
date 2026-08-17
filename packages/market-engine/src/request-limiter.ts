// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A sliding-window request budget, shared by every provider that meters us per
 * IP rather than per key.
 *
 * The shape of the problem is always the same. A keyless data provider allows N
 * requests a minute, and the terminal spends that budget from several places
 * that cannot see each other: a candle poller, a ticker poller, a pool read, a
 * swap tape. Each one is inside its own cadence while the sum is not, and the
 * sum is what the provider meters. Bursting through the limit then makes the
 * WHOLE provider answer 429 for the next minute, and a 429 on the candle path
 * reads downstream as "this venue does not carry this pair".
 *
 * So requests queue here instead. It is a sliding window rather than a fixed
 * delay because a cold start should be allowed to spend the whole budget at
 * once (first paint must not be paced to death); only once the window is full
 * does anything wait, and then only until the oldest request ages out of it.
 *
 * Two things it is NOT. It is not a retry: a queued request is issued exactly
 * once, and a limit that still gets through is the caller's to classify. And it
 * is not a cache: pacing keeps a steady state legal, caching is what keeps the
 * steady state small.
 *
 * NOTE for a later cleanup: `geckoterminal-data-provider/rate-limiter.ts`
 * carries an identical implementation that predates this module and should
 * collapse onto it. It was left alone deliberately rather than refactored under
 * a concurrent change.
 */

export type RequestLimiter = {
  /**
   * Resolves when the caller may issue its request, which may be immediately.
   * Admission is FIFO, so a queued burst keeps its order.
   */
  acquire: () => Promise<void>
  /** Hold every caller back until `Date.now() + ms`. Extends, never shortens. */
  cooldown: (ms: number) => void
  /** Callers currently waiting for a slot. Test/diagnostic seam. */
  waiting: () => number
  /**
   * Forget the window and any cool-off. Test seam only: a shared limiter is
   * process-wide, so a suite that trips a cool-off would otherwise make every
   * later test in the same process wait it out.
   */
  reset: () => void
}

export type RequestLimiterOptions = {
  capacity: number
  windowMs: number
  /** Injected for tests: a virtual clock keeps them instant and deterministic. */
  now?: () => number
  delay?: (ms: number) => Promise<void>
}

const realDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Sliding-window limiter.
 *
 * Admission is serialized through a promise chain, which is the part that is
 * easy to get wrong: without it, twenty callers arriving in the same tick would
 * all read the same "one slot free" and all take it. Each `acquire` waits for
 * the previous admission DECISION only, never for the previous request to
 * finish, so throughput is still the full budget.
 */
export function createRequestLimiter(
  options: RequestLimiterOptions,
): RequestLimiter {
  const { capacity, windowMs } = options
  const now = options.now ?? (() => Date.now())
  const delay = options.delay ?? realDelay

  /** Issue times inside the current window, oldest first. */
  const issued: Array<number> = []
  let cooldownUntil = 0
  let waiting = 0
  let chain: Promise<void> = Promise.resolve()

  const admit = async (): Promise<void> => {
    for (;;) {
      const t = now()
      while (issued.length > 0 && t - issued[0] >= windowMs) issued.shift()

      const coolOff = cooldownUntil - t
      if (coolOff > 0) {
        await delay(coolOff)
        continue
      }
      if (issued.length < capacity) {
        issued.push(t)
        return
      }
      // Wait exactly until the oldest request leaves the window. `+ 1` so the
      // re-check lands after the boundary rather than on it.
      await delay(windowMs - (t - issued[0]) + 1)
    }
  }

  return {
    acquire() {
      waiting += 1
      const admitted = chain.then(admit)
      // The chain must never reject, or every later caller inherits the
      // rejection. It also must not keep the admission's result.
      chain = admitted.then(
        () => undefined,
        () => undefined,
      )
      return admitted.finally(() => {
        waiting -= 1
      })
    },
    cooldown(ms) {
      const until = now() + Math.max(ms, 0)
      if (until > cooldownUntil) cooldownUntil = until
    },
    waiting: () => waiting,
    reset() {
      issued.length = 0
      cooldownUntil = 0
    },
  }
}
