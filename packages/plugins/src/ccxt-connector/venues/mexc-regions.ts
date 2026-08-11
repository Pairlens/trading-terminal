// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * MEXC endpoint selection and region gate — the native
 * `mexc-market-connector/regions.ts`, expressed as the URLs ccxt reads.
 *
 * The blocked-country list is copied verbatim, `UK` included: the country
 * setting is a free-text ISO-ish code and users type both `GB` and `UK`, so the
 * native lists both and so does this.
 *
 * MEXC is the one venue in the group whose WS host also needs a dev-proxy
 * rewrite. Its socket is not CORS-constrained (sockets never are), but the
 * `/__mexc-ws` proxy exists and the native uses it, so browser dev keeps a
 * single origin for the whole venue.
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

const BLOCKED_COUNTRIES = new Set(['US', 'GB', 'UK', 'CA', 'CN', 'SG', 'HK'])

export type MexcCcxtUrls = {
  rest: string
  /** Full spot socket URL — ccxt appends `?listenKey=` for the private one. */
  ws: string
}

export function isMexcBlocked(country: string): boolean {
  return BLOCKED_COUNTRIES.has(country.toUpperCase())
}

/** Resolve MEXC's URLs, or null when the region is blocked. */
export function resolveMexcCcxtUrls(country: string): MexcCcxtUrls | null {
  if (isMexcBlocked(country)) return null
  if (isBrowser()) {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return {
      rest: '/__mexc',
      ws: `${scheme}//${location.host}/__mexc-ws/ws`,
    }
  }
  return { rest: 'https://api.mexc.com', ws: 'wss://wbs-api.mexc.com/ws' }
}
