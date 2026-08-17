// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One paced door for every GeckoTerminal request this process makes.
 *
 * GeckoTerminal's free tier allows roughly 30 requests a minute per IP, and the
 * DEX surfaces spend that budget from six independent places: the candle
 * poller, the ticker poller, pool state, the swap tape, the chain rail's
 * per-chain listings, and the movers pane's new-pools feed (one request per
 * major chain, on a slow cadence). None of them can see the others, so each one
 * is inside its own cadence while the sum is not, and the sum is what the
 * provider meters.
 * Opening a DEX board on five chains and then navigating pairs used to burst
 * straight through the limit; the whole provider then answered 429 for the next
 * minute, and a 429 on the candle path reads downstream as "this venue does not
 * carry this pair".
 *
 * So requests queue here instead. The limiter is a sliding window rather than a
 * fixed delay: a cold start is allowed to spend the whole budget at once (first
 * paint should not be paced to death), and only once the window is full does
 * anything wait, and then only until the oldest request ages out of it.
 *
 * Two things it is NOT. It is not a retry: a queued request is issued exactly
 * once, and a 429 that still gets through raises `ProviderThrottledError` for
 * the caller to handle. And it is not a cache: `pool-resolver` already caches
 * the expensive lookup for an hour, which is what keeps the steady state inside
 * the budget at all.
 */
import { restFetch } from '@pairlens/market-engine/http'
import { providerThrottleFromResponse } from '@pairlens/market-engine/errors'
import { noteProviderThrottled } from '@pairlens/market-engine/provider-throttle'

/** Provider id in the shared throttle registry, and the label users read. */
export const GECKOTERMINAL_PROVIDER = 'GeckoTerminal'

/**
 * Requests per window. The documented free tier is about 30 a minute; 25 leaves
 * room for the retries the browser makes on our behalf and for a second
 * Pairlens window on the same IP.
 */
export const RATE_LIMIT_CAPACITY = 25
/** The window the capacity is measured over. */
export const RATE_LIMIT_WINDOW_MS = 60_000

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
   * Forget the window and any cool-off. Test seam only: the shared limiter is
   * process-wide, so a suite that trips a cool-off would otherwise make every
   * later test in the same process wait it out.
   */
  reset: () => void
}

type LimiterOptions = {
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
export function createRequestLimiter(options: LimiterOptions): RequestLimiter {
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

/** The process-wide limiter every GeckoTerminal client shares. */
export const geckoLimiter = createRequestLimiter({
  capacity: RATE_LIMIT_CAPACITY,
  windowMs: RATE_LIMIT_WINDOW_MS,
})

/**
 * `restFetch` with the budget in front of it and 429/5xx classified.
 *
 * Throwing rather than returning the response is deliberate: every call site
 * used to read `!res.ok` as "no data here", and there is no status a caller
 * both can and should interpret past this point. A throttle raised as a typed
 * error walks the plugin manager's fallback chain (DexPaprika on desktop) and,
 * failing that, reaches the pane as a retryable message instead of an empty
 * state.
 */
export function createGeckoFetch(
  limiter: RequestLimiter,
): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url, init) => {
    await limiter.acquire()
    const res = await restFetch(url, init)
    const throttled = providerThrottleFromResponse(res, GECKOTERMINAL_PROVIDER)
    if (throttled) {
      // Hold the queue back, and tell the terminal so it does not read the
      // silence that follows as a pair the venue does not list.
      limiter.cooldown(throttled.retryAfterMs)
      noteProviderThrottled(GECKOTERMINAL_PROVIDER, throttled.retryAfterMs)
      throw throttled
    }
    return res
  }
}

export const geckoFetch = createGeckoFetch(geckoLimiter)
