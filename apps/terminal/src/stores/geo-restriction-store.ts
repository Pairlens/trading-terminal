// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

/**
 * Global store for connector geo-restrictions.
 *
 * A connector is "geo-restricted" when the exchange refuses service for the
 * user's region — detected either proactively (we statically know the venue is
 * unavailable, e.g. ByBit in the US) or reactively (a REST call returns a
 * 451/403 geo-block status). Detection happens per-stream in use-candle-stream;
 * the active restriction drives a single app-level dialog.
 *
 * `market` is the connector marketId the block applies to. The dialog only
 * shows while the *currently selected* connector matches, so switching away
 * (or to a working connector) hides it without an explicit dismiss.
 */
export type GeoRestriction = {
  /** Display name of the blocked exchange, e.g. "ByBit". */
  exchange: string
  /** Connector marketId the block applies to, e.g. "bybit". */
  market: string
  /** User's ISO country code at detection time, or '' if unset. */
  region: string
}

type GeoRestrictionStore = {
  restriction: GeoRestriction | null
  /** Record a detected block (no-op if an identical one is already active). */
  report: (r: GeoRestriction) => void
  /** Clear any active restriction. */
  clear: () => void
  /** Clear the active restriction only if it applies to `market`. */
  clearForMarket: (market: string) => void
}

export const useGeoRestrictionStore = create<GeoRestrictionStore>((set) => ({
  restriction: null,
  report: (r) =>
    set((s) =>
      s.restriction?.exchange === r.exchange &&
      s.restriction?.market === r.market &&
      s.restriction?.region === r.region
        ? s
        : { restriction: r },
    ),
  clear: () => set((s) => (s.restriction ? { restriction: null } : s)),
  clearForMarket: (market) =>
    set((s) =>
      s.restriction && s.restriction.market === market
        ? { restriction: null }
        : s,
    ),
}))
