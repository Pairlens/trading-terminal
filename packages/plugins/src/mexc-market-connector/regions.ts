// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

const BLOCKED_COUNTRIES = new Set(['US', 'GB', 'UK', 'CA', 'CN', 'SG', 'HK'])

export type MexcUrls = {
  restBase: string
  wsBase: string
}

// In browser dev mode, REST and WS calls go through Vite proxies to bypass
// CORS. In Tauri desktop, fetch/WS have no CORS restrictions.
/** Resolve MEXC API URLs. Returns null if the country is blocked. */
export function resolveMexcUrls(country: string): MexcUrls | null {
  if (BLOCKED_COUNTRIES.has(country.toUpperCase())) return null
  if (isBrowser()) {
    return {
      restBase: '/__mexc',
      wsBase: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/__mexc-ws`,
    }
  }
  return {
    restBase: 'https://api.mexc.com',
    wsBase: 'wss://wbs-api.mexc.com',
  }
}
