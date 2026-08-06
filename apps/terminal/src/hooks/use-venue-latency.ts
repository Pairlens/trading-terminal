// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo, useSyncExternalStore } from 'react'

import { latencyMonitor } from '@pairlens/market-engine/latency'
import type { VenueLatency } from '@pairlens/market-engine/latency'

/**
 * Round-trip latency to a venue's market-data socket, or null when it is not
 * being measured — no connection, or a connector whose venue answers no
 * keepalive we can time. See market-engine/latency for what the number is.
 *
 * The store's snapshot is a version counter, so the object handed to React is
 * rebuilt only when a sample lands (every 15-30s per venue) rather than on
 * every render.
 */
export function useVenueLatency(venue: string): VenueLatency | null {
  const version = useSyncExternalStore(
    latencyMonitor.subscribe,
    latencyMonitor.getVersion,
    // Nothing is connected during SSR/prerender; the readout renders as absent
    // on both sides, so hydration cannot mismatch.
    () => 0,
  )

  // `version` is the dependency that matters: it changes exactly when get()
  // would return something new.
  return useMemo(
    () => (venue ? latencyMonitor.get(venue) : null),
    [venue, version],
  )
}
