// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * OKX endpoint selection for the ccxt instance — the same region logic the
 * native connector runs, expressed as the two URLs ccxt actually reads
 * (`urls.api.rest` and `urls.api.ws`).
 *
 * The base is picked PER CALL, never at module scope: a module-level const
 * captures the SSR value and ships a build whose REST base was decided before
 * a browser existed. ccxt makes that harder than it sounds, because its URLs
 * are instance state rather than a per-request argument — hence the rebuild on
 * region change (see exchange-host.ts) instead of a per-call resolver.
 *
 * The dev-proxy branch returns a RELATIVE prefix, matching every native
 * `regions.ts`. ccxt string-concats `urls.api.rest` with the request path and
 * hands the result to `fetchImplementation`, and `restFetch` leaves relative
 * URLs on `globalThis.fetch` — which resolves them against the dev server's
 * origin, where the proxy lives. An absolute `location.origin + prefix` would
 * instead be routed through the Tauri Rust client under `tauri dev`, whose
 * scope does not list localhost.
 */

import {
  isDevProxyAvailable as isBrowser,
  isCorsConstrained,
} from '@pairlens/market-engine/platform'

// EU member states + EEA.
const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
])

const US_COUNTRIES = new Set(['US', 'AU'])

export type OkxCcxtUrls = {
  /** Concatenated with the request path by ccxt's `sign()`. */
  rest: string
  /** `getUrl()` appends '/public', '/business' or '/private'. */
  ws: string
  /** Kept in step with `rest` for the paths that still implode it. */
  hostname: string
}

/** Dev-server proxy prefix per region (see apps/terminal/vite.config.ts). */
function proxyPrefix(code: string): string {
  if (US_COUNTRIES.has(code)) return '/__okx-us'
  if (EU_COUNTRIES.has(code)) return '/__okx-eu'
  return '/__okx-global'
}

function originFor(code: string): string {
  if (US_COUNTRIES.has(code)) return 'https://us.okx.com'
  if (EU_COUNTRIES.has(code)) return 'https://eea.okx.com'
  return 'https://www.okx.com'
}

function hostFor(code: string): string {
  if (US_COUNTRIES.has(code)) return 'us.okx.com'
  if (EU_COUNTRIES.has(code)) return 'eea.okx.com'
  return 'www.okx.com'
}

/** All OKX WS endpoints are on :8443 — not overridable without rewriting the URL. */
function wsFor(code: string): string {
  if (US_COUNTRIES.has(code)) return 'wss://wsus.okx.com:8443/ws/v5'
  if (EU_COUNTRIES.has(code)) return 'wss://wseea.okx.com:8443/ws/v5'
  return 'wss://ws.okx.com:8443/ws/v5'
}

export function resolveOkxCcxtUrls(country: string): OkxCcxtUrls {
  const code = country.toUpperCase()
  const ws = wsFor(code)
  if (isBrowser()) {
    return { rest: proxyPrefix(code), ws, hostname: hostFor(code) }
  }
  if (isCorsConstrained()) {
    // Public reads only — the global host is CORS-enabled and serves the same
    // instruments and candles as the regional ones. Orders resolve regionally
    // in the trading phase.
    return { rest: 'https://www.okx.com', ws, hostname: 'www.okx.com' }
  }
  return { rest: originFor(code), ws, hostname: hostFor(code) }
}
