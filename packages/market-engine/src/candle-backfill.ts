// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Shared REST candle-backfill runner for market connectors.
 *
 * The terminal's chart gates live WS candle updates behind the first
 * 'snapshot' emission, so a silently-failed backfill used to strand the
 * chart on stale (or no) data forever while the ticker and orderbook kept
 * streaming — the shipped "live top bar, hours-stale chart" Kraken bug.
 *
 * This runner is the venue-agnostic half of the fix: a short escalating
 * retry schedule, with every step guarded by `isLive()` so a subscription
 * released during the fetch (market switch, unmount) never applies stale
 * results. Venues whose WS can seed history independently (e.g. Kraken's
 * ohlc snapshot) layer that on top in their own clients.
 */

import type { Candle } from './types'

export type CandleBackfillOptions = {
  /** Perform the REST fetch. Called once, then once per retry. */
  fetch: () => Promise<Array<Candle>>
  /**
   * Whether the subscription is still live. Checked before applying results
   * and before scheduling/running the retry.
   */
  isLive: () => boolean
  /**
   * Apply fetched candles — typically load the client's CandleBuffer and
   * emit the merged buffer as a 'snapshot'.
   */
  apply: (candles: Array<Candle>) => void
  /** Base delay before the first retry (default 2.5s). Each further retry doubles it. */
  retryDelayMs?: number
  /**
   * The retry budget is spent and no history was applied. Lets a client stop
   * treating the backfill as pending — a late subscriber on the key can then
   * be served whatever the stream has accumulated instead of waiting on a
   * snapshot that is never coming.
   */
  onExhausted?: () => void
}

/**
 * Constructor-option mixin for ws-clients: lets tests shrink the backfill
 * retry delay (production uses the default).
 */
export type BackfillRetryOption = {
  backfillRetryDelayMs?: number
}

const DEFAULT_RETRY_DELAY_MS = 2_500
/**
 * Retries after the initial fetch, at `retryDelayMs` doubling each time —
 * 2.5s, 5s, 10s by default, so a venue that rate-limited a burst of stream
 * switches has ~17s to answer.
 *
 * One retry was not enough. Rapid timeframe or venue switching fires a
 * 300-candle REST fetch per switch, and OKX rate-limits the burst: both
 * attempts failed inside the same limit window, no snapshot was ever
 * emitted, and the chart fell back to the terminal's raw-update promotion —
 * a single forming bar that never healed, because nothing fetches history
 * again for the life of the subscription.
 */
const MAX_RETRIES = 3

export function backfillCandles(options: CandleBackfillOptions): void {
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS

  const retry = (next: number): boolean => {
    if (!options.isLive()) return false
    if (next > MAX_RETRIES) {
      options.onExhausted?.()
      return false
    }
    // Exchange REST APIs rate-limit and hiccup; paced retries recover the
    // common transient case. Past the budget the WS stream (and the
    // terminal's update-promotion guard) takes over.
    setTimeout(
      () => {
        if (options.isLive()) attempt(next)
      },
      retryDelayMs * 2 ** (next - 1),
    )
    return true
  }

  const attempt = (n: number): void => {
    options
      .fetch()
      .then((candles) => {
        if (!options.isLive()) return // unsubscribed during fetch
        // An empty result is a non-answer, not history: a rate-limited venue
        // that returns `[]` instead of throwing would otherwise settle the
        // backfill on nothing. Retry while the budget lasts, then apply what
        // came back so a pair that genuinely has no REST history still
        // resolves rather than hanging.
        if (candles.length === 0 && retry(n + 1)) return
        options.apply(candles)
      })
      .catch(() => {
        retry(n + 1)
      })
  }

  attempt(0)
}
