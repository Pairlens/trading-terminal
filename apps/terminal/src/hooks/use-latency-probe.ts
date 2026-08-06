// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo } from 'react'

import { useMarketData } from '@/lib/market-data-provider'
import { normalizePairKey } from '@/lib/pairs'

/**
 * Holds the venue's trade feed open so latency can be inferred from it.
 *
 * The feed-age estimate needs message timestamps, and trades are the only
 * stream carrying the venue's own emit time (see market-engine/latency for the
 * audit). Without this, the number for Coinbase, HTX and Crypto.com would only
 * appear when the user happened to have the Time and Sales pane open.
 *
 * It runs on EVERY venue and releases itself the moment a measured round trip
 * shows up — which is one keepalive interval on the eleven venues that answer
 * a ping, and indefinitely on the three that don't. Two reasons that beats
 * probing only the venues known to need it:
 *
 * - no list to keep in sync. A connector added later, or one whose venue stops
 *   answering pings, is handled by the same rule rather than by remembering to
 *   add it somewhere.
 * - the transient probe is what CALIBRATES the clock. The offset can only be
 *   solved on a venue reporting both a round trip and a feed age, so running
 *   here for one ping interval on a measurable venue is not waste — it is the
 *   observation that makes every inferred number absolute rather than
 *   skew-contaminated.
 *
 * Costs nothing when the tape is already open: the provider's multiplexer
 * refcounts by (channel, market, pair), so this joins that subscription rather
 * than opening a second one. The callback is a no-op on purpose — sampling
 * happens in the multiplexer on raw arrival, ahead of any consumer.
 */
export type ProbeConditions = {
  /** A measured round trip is already available for this venue. */
  measured: boolean
  /** The venue serves market-data:trades, and plugins have finished activating. */
  supported: boolean
  pairKey: string
  connected: boolean
}

/**
 * Whether the probe should be holding the tape open.
 *
 * Split out as a pure rule because the release half is the part that can
 * silently rot: a bug that never releases turns a transient calibration probe
 * into a permanent trade subscription on all fifteen venues, and nothing about
 * the readout would look wrong.
 */
export function shouldProbe({
  measured,
  supported,
  pairKey,
  connected,
}: ProbeConditions): boolean {
  // A venue whose round trip we can measure needs nothing from the tape, and
  // one with no trade feed at all (Alpaca, the DEX connectors) has nothing to
  // offer — for those the readout stays empty rather than guessing.
  if (measured || !supported) return false
  return pairKey.length > 0 && connected
}

export function useLatencyProbe(
  market: string,
  /**
   * Tolerates undefined on purpose. This runs inside the header, where an
   * unhandled throw swaps the entire top bar for an error boundary — too high
   * a price for a diagnostic readout to charge for a pair that has not
   * resolved yet.
   */
  pairKey: string | undefined,
  /** Whether a measured round trip is already available for this venue. */
  measured: boolean,
): void {
  const {
    subscribeTrades,
    hasCapability,
    pluginsReady,
    status,
    streamVersion,
  } = useMarketData()

  const normalizedPairKey = useMemo(
    () => (pairKey ? normalizePairKey(pairKey) : ''),
    [pairKey],
  )

  const supported = useMemo(
    // Recomputed once plugins finish activating — before that every venue
    // reports no trade feed.
    () => pluginsReady && hasCapability('market-data:trades', market),
    [hasCapability, market, pluginsReady],
  )

  useEffect(() => {
    const wanted = shouldProbe({
      measured,
      supported,
      pairKey: normalizedPairKey,
      connected: status === 'connected',
    })
    if (!wanted) return

    return subscribeTrades(market, normalizedPairKey, () => {})
  }, [
    measured,
    supported,
    market,
    normalizedPairKey,
    status,
    streamVersion,
    subscribeTrades,
  ])
}
