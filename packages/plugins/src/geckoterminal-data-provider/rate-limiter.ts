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
 * dislikes the burst.
 *
 * Two, not the three this used to allow. Measured against the live endpoint:
 * the FOURTH request of a cold burst draws a 429 about a second and a half in,
 * so a burst of three plus a request 600ms behind it landed exactly on the
 * cliff — and the cost of stepping over it is not one refused request but a
 * cool-off that outlasts the whole board's opening.
 */
export const RATE_LIMIT_BURST = 2
/**
 * Minimum gap between requests once the burst allowance is spent.
 *
 * Measured, not guessed: a bare shell loop against the same endpoint draws
 * 429s at roughly one request a second, well under the documented per-minute
 * quota, and the documented free tier itself works out to one request every
 * two seconds. 600ms was between the two and was tripping the edge on every
 * cold open; 1.2s spreads the board's eleven opening requests over about ten
 * seconds, which the panes spend showing a loading state instead of spending
 * the first three on a 429 and the rest on the cool-off it arms.
 */
export const RATE_LIMIT_SPACING_MS = 1_200
/**
 * The longest a request may wait for admission before it is refused.
 *
 * Every wait the limiter can impose is measured against this one ceiling: the
 * spacing between admissions, the wait for a slot once the minute's capacity
 * is spent, and the provider's own cool-off. A caller is better off queued for
 * a wait that ends than told the provider is refusing it, and a wait that does
 * NOT end is exactly what the ceiling is here to convert into a refusal.
 *
 * Fifteen seconds is one poll of the fastest read behind this limiter (the
 * swap tape), so a refused caller never waits longer than the retry it already
 * had scheduled.
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

      // A cool-off is waited out like any other wait, and refused only when
      // it outlasts the ceiling.
      //
      // It used to be refused on the spot, on the reasoning that a cool-off is
      // the PROVIDER's schedule rather than ours and a caller parked on one is
      // invisible — nothing has been sent, so the pane above it still believes
      // it is loading. The invisibility was real; the blanket refusal was an
      // over-correction, and the swap tape paid for it. A cool-off from this
      // provider is EIGHT SECONDS, an order of magnitude inside the ceiling,
      // and a board opening from cold arms one before the tape's first request
      // is ever admitted — so the pane that was one short wait away from its
      // data drew "Swaps unavailable right now" instead, and then held it
      // until a fifteen-second poll happened to land in the clear. Refusing a
      // wait we would happily have spent is how a transient refusal became a
      // pane that never loads.
      //
      // The ceiling is what makes waiting safe, and it is the thing the old
      // reasoning was missing rather than a reason to refuse: every wait here
      // is bounded by `deadline`, so a hold that really is open-ended still
      // reaches the caller as a refusal within `maxWaitMs` and the pane still
      // gets to say what is wrong. Nothing can hold "Loading swaps" forever.
      const coolOff = cooldownUntil - t
      if (coolOff > 0) {
        await waitOrRefuse(coolOff, t)
        continue
      }
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
