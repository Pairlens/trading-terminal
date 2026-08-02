// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitvavo URL resolution + geo gating.
 *
 * Bitvavo is an Amsterdam-based, DNB-registered / MiCA-licensed exchange with a
 * single global API — no regional endpoints. It serves the EEA (and a handful
 * of other countries) but explicitly does NOT serve the United States, so we
 * gate US users with a typed GeoRestrictedError the same way ByBit does.
 *
 * REST: https://api.bitvavo.com/v2/*  (all endpoints live under /v2)
 * WS:   wss://ws.bitvavo.com/v2/       (public market data + private account)
 *
 * The signed REST path always carries the `/v2` prefix (see order-executor),
 * so the resolved REST base is the origin only. In browser dev the origin is
 * swapped for a Vite proxy prefix to dodge CORS; Tauri fetch has no CORS.
 */

import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { isDevProxyAvailable } from '@pairlens/market-engine/platform'

/** REST origin (no trailing slash). Endpoints are appended as `/v2/...`. */
export function resolveBitvavoRestBase(): string {
  return isDevProxyAvailable() ? '/__bitvavo' : 'https://api.bitvavo.com'
}

/** Public + private WebSocket endpoint (Bitvavo multiplexes both on one URL). */
export function resolveBitvavoWsUrl(): string {
  return 'wss://ws.bitvavo.com/v2/'
}

/**
 * Throw a typed GeoRestrictedError for regions Bitvavo does not serve. Bitvavo
 * is unavailable in the US; every other region is allowed to attempt a
 * connection (the exchange still enforces its own eligibility on trade).
 */
export function assertBitvavoRegionAllowed(country: string): void {
  if (country.toUpperCase() === 'US') {
    throw new GeoRestrictedError('Bitvavo', country)
  }
}
