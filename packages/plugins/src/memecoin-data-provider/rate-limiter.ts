// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Paced doors for the two keyless hosts this provider reads.
 *
 * Both budgets are metered per IP, which is the quiet advantage of doing this
 * in the client at all: every user's browser spends its own allowance, so the
 * board scales with users instead of competing with them for one server's
 * quota. What it does NOT excuse is a burst — one board opening fires four
 * column reads in the same tick, and an unspaced burst is what trips a free
 * tier long before the per-minute number does.
 *
 * The sliding-window algorithm comes from `@pairlens/market-engine`, same as
 * the DEX providers. What lives here is the budget per host and the provider
 * names users read in a throttle notice.
 */
import { restFetch } from '@pairlens/market-engine/http'
import { providerThrottleFromResponse } from '@pairlens/market-engine/errors'
import { noteProviderThrottled } from '@pairlens/market-engine/provider-throttle'
import { createRequestLimiter } from '@pairlens/market-engine/request-limiter'
import type { RequestLimiter } from '@pairlens/market-engine/request-limiter'

/** Provider ids in the shared throttle registry, and the labels users read. */
export const JUPITER_PROVIDER = 'Jupiter'
export const COINGECKO_PROVIDER = 'CoinGecko'

/**
 * Jupiter's keyless tier. The published figure for the token endpoints is
 * around 60 a minute per IP; 40 leaves room for the swap-route calls the
 * Jupiter CONNECTOR makes on the same IP while a memecoin board is open, which
 * is not a hypothetical: the board's whole point is to reach a swap ticket.
 */
export const JUPITER_CAPACITY = 40
export const JUPITER_WINDOW_MS = 60_000

/**
 * CoinGecko's free public tier is the tightest budget in the terminal, in the
 * region of 10 a minute and enforced harshly. It funds exactly one read here
 * (the Legendary column, refreshed on the order of minutes), so the budget is
 * set to what that costs plus headroom, and the spacing matters more than the
 * capacity.
 */
export const COINGECKO_CAPACITY = 6
export const COINGECKO_WINDOW_MS = 60_000

export const jupiterLimiter = createRequestLimiter({
  capacity: JUPITER_CAPACITY,
  windowMs: JUPITER_WINDOW_MS,
})

export const coingeckoLimiter = createRequestLimiter({
  capacity: COINGECKO_CAPACITY,
  windowMs: COINGECKO_WINDOW_MS,
})

/**
 * `restFetch` with a budget in front of it and 429/5xx classified.
 *
 * Throwing rather than returning the response, exactly as in the DEX
 * providers: past this point there is no status a caller both can and should
 * interpret, and a throttle raised as a typed error reaches the terminal as a
 * retryable message instead of an empty column. An empty column is the failure
 * mode that matters here, because "no tokens graduated" is a sentence a
 * memecoin trader will believe.
 */
export function createLimitedFetch(
  limiter: RequestLimiter,
  provider: string,
): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url, init) => {
    await limiter.acquire()
    const res = await restFetch(url, init)
    const throttled = providerThrottleFromResponse(res, provider)
    if (throttled) {
      limiter.cooldown(throttled.retryAfterMs)
      noteProviderThrottled(provider, throttled.retryAfterMs)
      throw throttled
    }
    return res
  }
}

export const jupiterFetch = createLimitedFetch(jupiterLimiter, JUPITER_PROVIDER)
export const coingeckoFetch = createLimitedFetch(
  coingeckoLimiter,
  COINGECKO_PROVIDER,
)
