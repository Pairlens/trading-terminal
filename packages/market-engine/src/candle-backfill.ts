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
 * This runner is the venue-agnostic half of the fix: one delayed retry,
 * with every step guarded by `isLive()` so a subscription released during
 * the fetch (market switch, unmount) never applies stale results. Venues
 * whose WS can seed history independently (e.g. Kraken's ohlc snapshot)
 * layer that on top in their own clients.
 */

import type { Candle } from './types'

export type CandleBackfillOptions = {
  /** Perform the REST fetch. Called once, and once more on retry. */
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
  /** Delay before the single retry (default 2.5s). */
  retryDelayMs?: number
}

/**
 * Constructor-option mixin for ws-clients: lets tests shrink the backfill
 * retry delay (production uses the default).
 */
export type BackfillRetryOption = {
  backfillRetryDelayMs?: number
}

const DEFAULT_RETRY_DELAY_MS = 2_500

export function backfillCandles(options: CandleBackfillOptions): void {
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS

  const attempt = (n: number): void => {
    options
      .fetch()
      .then((candles) => {
        if (!options.isLive()) return // unsubscribed during fetch
        options.apply(candles)
      })
      .catch(() => {
        // Exchange REST APIs rate-limit and hiccup; one paced retry
        // recovers the common transient case. Beyond that the WS stream
        // (and the terminal's update-promotion guard) takes over.
        if (n === 0 && options.isLive()) {
          setTimeout(() => {
            if (options.isLive()) attempt(1)
          }, retryDelayMs)
        }
      })
  }

  attempt(0)
}
