// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one way this connector talks to OpenSea.
 *
 * Two things it owns that the rest of the package must not duplicate.
 *
 * **The budget.** A free OpenSea key allows on the order of 600 reads an hour,
 * which is tight for a board that can have eight panes open on one collection.
 * The ceiling it is metered against is HOURLY, so a per-minute window cannot
 * express it: 100 a minute is 6000 an hour, ten times the budget, and a limiter
 * that never engages is decoration. So the pacing is two windows over one
 * budget, and a request waits on both.
 *
 * The hourly window is the ceiling: 500 of the ~600 the key allows. The
 * headroom is real, because a 429's own cool-off and any read this module does
 * not see both spend from the same key.
 *
 * The short window is what keeps a cold open honest. A cold collection board is
 * about twenty reads (slug, detail, book, listings, offers, tape, items,
 * traits, floor series), and pacing those to a request a second would make the
 * board crawl for the sake of a budget the whole burst barely dents. So 20 go
 * out at once and only what follows is spaced, at four a second, which is the
 * sliding window's own promise: full speed until the window is full.
 *
 * The trade that buys: a board's steady state, four 20s pollers plus a 90s
 * candle poller, is already ABOVE 500 an hour on its own, so the hourly window
 * does engage and pollers queue behind each other. That is the point. Queueing
 * a refresh is a stale number for a few seconds; spending the key is throttle
 * banners across every pane, and OpenSea's cool-off is not ours to shorten.
 *
 * The live surface does not come through here at all, which is what makes the
 * budget workable: OpenSea's stream is a WebSocket whose events are documented
 * as not counting against the REST limit, so REST is for snapshots and backfill
 * only.
 *
 * **The refusal.** A rate limit is not an empty collection, and the difference
 * has to survive all the way to the pane. A 429 becomes a typed
 * `ProviderThrottledError`, which the plugin manager re-throws unwrapped and
 * the hooks retry with the provider's own advice; anything else that fails
 * throws a plain error, which makes the manager walk to the next provider. What
 * this module must never do is return null on a failure, because null is an
 * ANSWER: it says the collection has nothing, and the board draws that.
 */
import {
  isProviderThrottledError,
  providerThrottleFromNetworkError,
  providerThrottleFromResponse,
} from '@pairlens/market-engine/errors'
import { restFetch } from '@pairlens/market-engine/http'
import { createRequestLimiter } from '@pairlens/market-engine/request-limiter'

export const OPENSEA_PROVIDER = 'opensea'

export const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2'

/** Reads an hour, against the ~600 a free key is metered at. */
export const HOURLY_BUDGET = 500

/** Reads that may leave at once before anything is spaced. One cold board. */
export const BURST_BUDGET = 20

const BURST_WINDOW_MS = 5_000

export type OpenSeaBudget = {
  acquire: () => Promise<void>
  cooldown: (ms: number) => void
  /** Test seam: a shared budget is process-wide. */
  reset: () => void
}

/**
 * The hourly ceiling and the burst window, as one gate.
 *
 * Both are acquired, hourly first, and both are FIFO, so the order a caller
 * arrives in is the order it goes out in. A cool-off from a 429 goes to both:
 * OpenSea is telling us to stop, not to slow down.
 *
 * The clock is injectable so the shape can be tested against a virtual hour
 * rather than a real one.
 */
export function createOpenSeaBudget(
  clock: { now?: () => number; delay?: (ms: number) => Promise<void> } = {},
): OpenSeaBudget {
  const hourly = createRequestLimiter({
    capacity: HOURLY_BUDGET,
    windowMs: 3_600_000,
    ...clock,
  })
  const burst = createRequestLimiter({
    capacity: BURST_BUDGET,
    windowMs: BURST_WINDOW_MS,
    ...clock,
  })
  return {
    async acquire() {
      await hourly.acquire()
      await burst.acquire()
    },
    cooldown(ms) {
      hourly.cooldown(ms)
      burst.cooldown(ms)
    },
    reset() {
      hourly.reset()
      burst.reset()
    },
  }
}

/**
 * Shared process-wide: two boards open on two collections are one budget, and a
 * per-instance limiter would let them spend it twice.
 */
const limiter = createOpenSeaBudget()

export type OpenSeaFetchOptions = {
  method?: string
  body?: unknown
  /** Absolute URL, for the rare endpoint outside the v2 base. */
  absolute?: boolean
}

/**
 * One request, paced, authenticated and classified.
 *
 * The key rides in `x-api-key`, which OpenSea allows on the preflight for both
 * GET and POST. That is what makes the whole connector browser-viable: the
 * response also carries a reflected `access-control-allow-origin`, so the
 * hosted web terminal and the desktop webview take the same path and there is
 * no proxy anywhere in it.
 */
export async function openSeaFetch<T>(
  apiKey: string,
  path: string,
  options: OpenSeaFetchOptions = {},
): Promise<T> {
  const { method = 'GET', body, absolute = false } = options
  await limiter.acquire()

  const url = absolute ? path : `${OPENSEA_API_BASE}${path}`
  let response: Response
  try {
    response = await restFetch(url, {
      method,
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (err) {
    // A browser sees a rate limit that arrives without CORS headers as a bare
    // TypeError with no readable status. Classifying it here is what stops a
    // throttle from surfacing as "the collection does not exist".
    throw providerThrottleFromNetworkError(err, OPENSEA_PROVIDER)
  }

  if (response.status === 401 || response.status === 403) {
    throw new MissingKeyError()
  }
  if (!response.ok) {
    const throttled = providerThrottleFromResponse(response, OPENSEA_PROVIDER)
    if (throttled) {
      limiter.cooldown(throttled.retryAfterMs)
      throw throttled
    }
    throw new Error(`OpenSea REST error: ${response.status}`)
  }

  return (await response.json()) as T
}

/**
 * The key is missing, wrong or revoked.
 *
 * Its own type because it is the one failure with a fix the user can act on,
 * and a pane that names where to paste a key is worth ten that say "request
 * failed". The key is plugin CONFIG, not a trading credential, so it is edited
 * on the plugin rather than under Accounts. Everything else that goes wrong
 * here is either a throttle or a reason to try the next provider.
 */
export class MissingKeyError extends Error {
  readonly __openSeaMissingKey = true
  /**
   * The cross-bundle sentinel the terminal reads. Duck-typed rather than
   * `instanceof`, because this class is minted inside a plugin bundle and read
   * in the app, and the two do not share a class identity across that seam.
   */
  readonly __nftNeedsKey = true
  /** The generic marker the plugin manager passes through unwrapped. */
  readonly __actionable = true
  constructor() {
    super(
      'OpenSea rejected the API key. Add or update it on the OpenSea plugin in the Plugin Store, then reload the board.',
    )
    this.name = 'MissingKeyError'
  }
}

export function isMissingKeyError(err: unknown): err is MissingKeyError {
  return (
    err instanceof Error &&
    (err as { __openSeaMissingKey?: boolean }).__openSeaMissingKey === true
  )
}

export { isProviderThrottledError }

/**
 * The refusal every action this provider does not serve must use.
 *
 * A throw, never a null. The plugin manager walks its fallback chain on a
 * thrown error and stops on a returned value, so a provider answering `null`
 * for something it simply does not publish ends the walk with "there is nothing
 * here" and blanks the pane. Copied deliberately from the DexScreener provider,
 * whose own header records the bug this prevents.
 */
export function unsupported(action: string, chain?: string): never {
  throw new Error(
    chain
      ? `OpenSea does not publish '${action}' on ${chain}.`
      : `OpenSea does not publish '${action}'.`,
  )
}
