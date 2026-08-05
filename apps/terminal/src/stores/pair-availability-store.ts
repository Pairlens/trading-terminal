// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import { normalizePairKey } from '@/lib/pairs'

/**
 * Which (venue, pair) combinations this session has proven carry no market
 * data — the venue simply doesn't list the pair (BTC-USDT on Bitvavo, whose
 * quote currency is EUR), or refuses to serve it here.
 *
 * Detection happens in exactly one place: `useCandleStream` is the only stream
 * that can tell "no data yet" from "no such market", because it is the one that
 * probes the venue's REST history endpoint. But the verdict has to reach every
 * pane — without a shared signal the chart says "not available" while the order
 * book keeps rendering the previous venue's book and the tape spins forever on
 * "Waiting for trades…", which is the inconsistency this store exists to kill.
 *
 * Keyed by (market, pair) rather than read off the chart context, because a
 * workspace pane can be pinned to a different venue or pair than the chart
 * above it, and each pane must answer for the stream it is actually showing.
 *
 * Session-scoped and self-healing: an entry survives a resubscribe (so coming
 * back to an unlisted pair is instant rather than a fresh one-second wait) but
 * is dropped the moment any candle actually arrives for that key, so a venue
 * that was merely down for one request isn't remembered as not listing a pair.
 */

export const availabilityKey = (market: string, pairKey: string): string =>
  `${market}:${normalizePairKey(pairKey)}`

type PairAvailabilityStore = {
  /** Set-as-record: `${market}:${PAIR}` → true. */
  unavailable: Record<string, true>
  /** Record that `market` carries no data for `pairKey`. */
  report: (market: string, pairKey: string) => void
  /** Forget a verdict — called when real data arrives for the key. */
  clear: (market: string, pairKey: string) => void
}

export const usePairAvailabilityStore = create<PairAvailabilityStore>(
  (set) => ({
    unavailable: {},
    report: (market, pairKey) =>
      set((s) => {
        const key = availabilityKey(market, pairKey)
        // Same-state writes return the identical object so subscribed panes
        // don't re-render on a repeated verdict.
        if (s.unavailable[key]) return s
        return { unavailable: { ...s.unavailable, [key]: true } }
      }),
    clear: (market, pairKey) =>
      set((s) => {
        const key = availabilityKey(market, pairKey)
        if (!s.unavailable[key]) return s
        const next = { ...s.unavailable }
        delete next[key]
        return { unavailable: next }
      }),
  }),
)

/** True once this venue has been proven not to carry this pair. */
export function usePairUnavailable(market: string, pairKey: string): boolean {
  return usePairAvailabilityStore(
    (s) => s.unavailable[availabilityKey(market, pairKey)] === true,
  )
}
