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
 * So requests queue here instead. The limiter is a sliding window with a burst
 * allowance rather than a fixed delay: the first few requests of a cold start
 * go straight through (first paint should not be paced to death), the rest of
 * the same burst are spaced, and once the window is full anything further waits
 * only until the oldest request ages out of it.
 *
 * The spacing is there because the quota is not the only thing metered. Nine
 * requests in one tick — a Discovery board's six chain aggregates plus three
 * pages of pools — is well inside 25 a minute and still draws a 429, and a 429
 * from this provider is invisible to a browser (see `createGeckoFetch`).
 *
 * Two things it is NOT. It is not a retry: a queued request is issued exactly
 * once, and a 429 that still gets through raises `ProviderThrottledError` for
 * the caller to handle. And it is not a cache: `pool-resolver` already caches
 * the expensive lookup for an hour, which is what keeps the steady state inside
 * the budget at all.
 */
import { restFetch } from '@pairlens/market-engine/http'
import {
  ProviderThrottledError,
  providerThrottleFromNetworkError,
  providerThrottleFromResponse,
} from '@pairlens/market-engine/errors'
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
/**
 * Requests allowed back to back before spacing kicks in.
 *
 * The per-minute quota is not the only thing the provider meters. Opening the
 * DEX Discovery board from cold asks for six chain aggregates and three pages
 * of the selected chain's pools in the same tick — nine requests, comfortably
 * inside 25 a minute and still enough to draw a 429, because the edge also
 * dislikes the burst. Four through, then paced, is what a board opening
 * actually looks like to the provider.
 */
export const RATE_LIMIT_BURST = 3
/**
 * Minimum gap between requests once the burst allowance is spent.
 *
 * Measured, not guessed: a bare shell loop against the same endpoint draws
 * 429s at roughly one request a second, well under the documented per-minute
 * quota. Three straight through and the rest at 600ms puts a cold board's
 * eight requests inside four seconds, which the panes now spend showing a
 * loading state rather than an empty one.
 */
export const RATE_LIMIT_SPACING_MS = 600
/**
 * The longest a request may sit in the PACING queue before it is refused.
 *
 * Distinct from a cool-off, which is never waited out at all — see
 * `waitsOutCooldown` below. This ceiling only covers the waits the limiter
 * imposes on itself: the spacing between admissions, and the wait for a slot
 * once the minute's capacity is genuinely spent. Those are ours, they are
 * bounded, and a caller is better off queued for them than refused.
 */
export const RATE_LIMIT_MAX_WAIT_MS = 15_000

export type RequestLimiter = {
  /**
   * Resolves when the caller may issue its request, which may be immediately.
   * Admission is FIFO, so a queued burst keeps its order.
   *
   * REJECTS with `ProviderThrottledError` when admission would take longer
   * than `maxWaitMs` — see that option. A caller must treat that exactly like
   * a 429, because that is what it is: the provider is refusing us, we simply
   * declined to spend the wait finding out again.
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
  /** Requests admitted with no spacing before `minSpacingMs` applies. */
  burst?: number
  /** Minimum gap between admissions once the burst allowance is spent. */
  minSpacingMs?: number
  /**
   * Refuse rather than queue when admission is further away than this. Omit
   * for an unbounded queue, which is what the pure-pacing tests want.
   */
  maxWaitMs?: number
  /** Injected for tests: a virtual clock keeps them instant and deterministic. */
  now?: () => number
  delay?: (ms: number) => Promise<void>
}

const realDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** The refusal a caller gets instead of a wait. Identical to a real 429. */
function refusal(retryAfterMs: number): ProviderThrottledError {
  return new ProviderThrottledError(
    GECKOTERMINAL_PROVIDER,
    429,
    Math.max(retryAfterMs, 1_000),
  )
}

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
  const burst = options.burst ?? capacity
  const minSpacingMs = options.minSpacingMs ?? 0
  const maxWaitMs = options.maxWaitMs ?? Infinity
  const now = options.now ?? (() => Date.now())
  const delay = options.delay ?? realDelay

  /** Issue times inside the current window, oldest first. */
  const issued: Array<number> = []
  let lastIssued = 0
  let cooldownUntil = 0
  let waiting = 0
  let chain: Promise<void> = Promise.resolve()

  const admit = async (): Promise<void> => {
    const deadline = now() + maxWaitMs
    /** Wait, or give up and let the caller hear about it. */
    const waitOrRefuse = async (ms: number, t: number): Promise<void> => {
      if (t + ms > deadline) throw refusal(ms)
      await delay(ms)
    }

    for (;;) {
      const t = now()
      while (issued.length > 0 && t - issued[0] >= windowMs) issued.shift()

      // A cool-off is refused on the spot, never slept through.
      //
      // This is the distinction the panes were losing. A pacing wait is the
      // limiter's own decision and it ends; a cool-off is the PROVIDER
      // refusing us, and it does not end on a schedule we control — every 429
      // extends it, so an endpoint stuck on 429 re-arms the hold each time it
      // is let through and everything behind it starves. Sleeping on it made
      // that invisible: `acquire()` had not resolved, so nothing had been
      // sent, so react-query still saw a fetch in flight and the pool panes
      // held "Loading swaps" and "Loading pool state" for as long as it
      // lasted. Nothing is lost by refusing instead: every read behind this
      // limiter polls on its own interval (15s for the tape, a minute for
      // pool state, five for listings), so the next attempt is already
      // scheduled, and in the meantime the pane gets to say what is wrong.
      const coolOff = cooldownUntil - t
      if (coolOff > 0) throw refusal(coolOff)
      // Spacing applies only once the burst allowance inside this window is
      // spent, so a cold board still paints as fast as the provider allows and
      // only the tail of the same burst waits.
      if (issued.length >= burst && minSpacingMs > 0) {
        const gap = minSpacingMs - (t - lastIssued)
        if (gap > 0) {
          await waitOrRefuse(gap, t)
          continue
        }
      }
      if (issued.length < capacity) {
        issued.push(t)
        lastIssued = t
        return
      }
      // Wait exactly until the oldest request leaves the window. `+ 1` so the
      // re-check lands after the boundary rather than on it.
      await waitOrRefuse(windowMs - (t - issued[0]) + 1, t)
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
      lastIssued = 0
      cooldownUntil = 0
    },
  }
}

/** The process-wide limiter every GeckoTerminal client shares. */
export const geckoLimiter = createRequestLimiter({
  capacity: RATE_LIMIT_CAPACITY,
  windowMs: RATE_LIMIT_WINDOW_MS,
  burst: RATE_LIMIT_BURST,
  minSpacingMs: RATE_LIMIT_SPACING_MS,
  maxWaitMs: RATE_LIMIT_MAX_WAIT_MS,
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
    let res: Response
    try {
      res = await restFetch(url, init)
    } catch (err) {
      // The refusal we are not allowed to read.
      //
      // GeckoTerminal sends `Access-Control-Allow-Origin` on its 200s and NOT
      // on its 429s, so from a page a rate limit is a blocked response and a
      // bare `TypeError`, with no status to classify. Left alone it walked the
      // plugin fallback chain and came back as "this chain has no pools" —
      // a rate limit rendered as a fact about the chain. Treated as the
      // transient refusal it is, it cools the queue off and retries instead.
      const opaque = providerThrottleFromNetworkError(
        err,
        GECKOTERMINAL_PROVIDER,
      )
      if (!opaque) throw err
      limiter.cooldown(opaque.retryAfterMs)
      noteProviderThrottled(GECKOTERMINAL_PROVIDER, opaque.retryAfterMs)
      throw opaque
    }
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
