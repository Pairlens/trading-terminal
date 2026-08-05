// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  isDevProxyAvailable as isBrowser,
  isCorsConstrained,
} from '@pairlens/market-engine/platform'

// EU member states + EEA
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

export type OkxUrls = {
  /**
   * REST base for credentialed endpoints (orders, balances) — always the
   * user's regional entity. Public market data resolves separately, via
   * `resolveOkxPublicRestBase`, because it can fall back to the global host.
   */
  restBase: string
  wsPublic: string
  wsBusiness: string
  wsPrivate: string
  wsPrivatePaper: string
}

/** Dev-server proxy prefix per region (see apps/terminal/vite.config.ts). */
function okxProxyPrefix(code: string): string {
  if (US_COUNTRIES.has(code)) return '/__okx-us'
  if (EU_COUNTRIES.has(code)) return '/__okx-eu'
  return '/__okx-global'
}

/** Exchange origin per region. */
function okxOrigin(code: string): string {
  if (US_COUNTRIES.has(code)) return 'https://us.okx.com'
  if (EU_COUNTRIES.has(code)) return 'https://eea.okx.com'
  return 'https://www.okx.com'
}

/**
 * Public market-data REST base.
 *
 * `eea.okx.com` and `us.okx.com` send no `Access-Control-Allow-Origin`, so the
 * hosted web terminal cannot read candles from them at all — the bug that left
 * EU/US users with a chart stuck on "Switching to OKX…" and one live candle.
 *
 * `www.okx.com` does send CORS, and the regional split is a legal wrapper over
 * a single matching engine rather than three markets: the three hosts return
 * byte-identical SPOT instrument lists (1335 each, zero difference) and
 * identical candle rows, and the global host serves EEA IPs without geo-blocking
 * (verified from an ES connection). So a CORS-constrained build reads public
 * data from the global host — same numbers, no proxy, no middleman.
 *
 * This is PUBLIC data only. Live streaming still uses the regional WS hosts,
 * and trading still routes to the user's regional entity via `restBase` — the
 * legal boundary that actually matters is where orders go, not where public
 * prices are read from.
 */
export function resolveOkxPublicRestBase(country: string): string {
  const code = country.toUpperCase()
  if (isBrowser()) return okxProxyPrefix(code)
  if (isCorsConstrained()) return 'https://www.okx.com'
  return okxOrigin(code)
}

// REST goes through the Vite proxy whenever a dev server is serving the app
// (browser dev AND `tauri dev`); production builds use the exchange origin.
// NOTE: a Tauri webview enforces CORS like a browser — restFetch routes those
// absolute-URL calls through the Rust-side HTTP plugin.
// Read per call — a module-level const would capture the SSR value.
export function resolveOkxUrls(country: string): OkxUrls {
  const code = country.toUpperCase()
  const browser = isBrowser()
  // Trading always resolves to the caller's regional entity — unlike public
  // reads, which may fall back to the global host. Where orders go is the
  // boundary that carries legal meaning.
  const restBase = browser ? okxProxyPrefix(code) : okxOrigin(code)

  if (US_COUNTRIES.has(code)) {
    return {
      restBase,
      wsPublic: 'wss://wsus.okx.com:8443/ws/v5/public',
      wsBusiness: 'wss://wsus.okx.com:8443/ws/v5/business',
      wsPrivate: 'wss://wsus.okx.com:8443/ws/v5/private',
      wsPrivatePaper: 'wss://wsuspap.okx.com:8443/ws/v5/private',
    }
  }

  if (EU_COUNTRIES.has(code)) {
    return {
      restBase,
      wsPublic: 'wss://wseea.okx.com:8443/ws/v5/public',
      wsBusiness: 'wss://wseea.okx.com:8443/ws/v5/business',
      wsPrivate: 'wss://wseea.okx.com:8443/ws/v5/private',
      wsPrivatePaper: 'wss://wseeapap.okx.com:8443/ws/v5/private',
    }
  }

  return {
    restBase,
    wsPublic: 'wss://ws.okx.com:8443/ws/v5/public',
    wsBusiness: 'wss://ws.okx.com:8443/ws/v5/business',
    wsPrivate: 'wss://ws.okx.com:8443/ws/v5/private',
    wsPrivatePaper: 'wss://wspap.okx.com:8443/ws/v5/private',
  }
}
