// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One paced door for every DexScreener request this process makes.
 *
 * DexScreener's own budget is far more generous than GeckoTerminal's, so this is
 * not the module that decides whether a pool pane paints. It exists for the case
 * that DOES happen: several pool panes on several chains, each supplementing a
 * primary answer once a minute, plus the resolver behind a pair the terminal has
 * never charted. That sum is metered per IP, and the failure mode is the one the
 * sibling limiter was written for: the provider answers 429 for everything, and a
 * 429 on the reserves path would read as "this pool publishes no reserves".
 *
 * The sliding-window algorithm lives in `@pairlens/market-engine/request-limiter`
 * so a second paced provider does not mean a second copy of the promise-chain
 * admission logic. What stays here is the budget and the provider's name, which
 * are the only things that are actually about DexScreener.
 */
import { restFetch } from '@pairlens/market-engine/http'
import { providerThrottleFromResponse } from '@pairlens/market-engine/errors'
import { noteProviderThrottled } from '@pairlens/market-engine/provider-throttle'
import { createRequestLimiter } from '@pairlens/market-engine/request-limiter'
import type { RequestLimiter } from '@pairlens/market-engine/request-limiter'

/** Provider id in the shared throttle registry, and the label users read. */
export const DEXSCREENER_PROVIDER = 'DexScreener'

/**
 * Requests per window. DexScreener documents 300 a minute for the pair, token
 * and search endpoints this provider uses; 240 leaves room for a second Pairlens
 * window on the same IP and for the retries a browser makes on our behalf.
 */
export const RATE_LIMIT_CAPACITY = 240
/** The window the capacity is measured over. */
export const RATE_LIMIT_WINDOW_MS = 60_000

/** The process-wide limiter every DexScreener client shares. */
export const dexscreenerLimiter = createRequestLimiter({
  capacity: RATE_LIMIT_CAPACITY,
  windowMs: RATE_LIMIT_WINDOW_MS,
})

/**
 * `restFetch` with the budget in front of it and 429/5xx classified.
 *
 * Throwing rather than returning the response is deliberate, exactly as in the
 * GeckoTerminal transport: there is no status a caller both can and should
 * interpret past this point, and a throttle raised as a typed error reaches the
 * terminal as a retryable message instead of an empty state. A 404 passes
 * through untouched, because "no such pool" is an answer.
 */
export function createDexscreenerFetch(
  limiter: RequestLimiter,
): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url, init) => {
    await limiter.acquire()
    const res = await restFetch(url, init)
    const throttled = providerThrottleFromResponse(res, DEXSCREENER_PROVIDER)
    if (throttled) {
      // Hold the queue back, and tell the terminal so it does not read the
      // silence that follows as a pool with nothing to publish.
      limiter.cooldown(throttled.retryAfterMs)
      noteProviderThrottled(DEXSCREENER_PROVIDER, throttled.retryAfterMs)
      throw throttled
    }
    return res
  }
}

export const dexscreenerFetch = createDexscreenerFetch(dexscreenerLimiter)
