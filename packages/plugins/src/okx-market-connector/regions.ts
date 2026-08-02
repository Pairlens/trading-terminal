// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

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
  restBase: string
  wsPublic: string
  wsBusiness: string
  wsPrivate: string
  wsPrivatePaper: string
}

// REST goes through the Vite proxy whenever a dev server is serving the app
// (browser dev AND `tauri dev`); production builds use the exchange origin.
// NOTE: a Tauri webview enforces CORS like a browser — restFetch routes those
// absolute-URL calls through the Rust-side HTTP plugin.
// Read per call — a module-level const would capture the SSR value.
export function resolveOkxUrls(country: string): OkxUrls {
  const code = country.toUpperCase()
  const browser = isBrowser()

  if (US_COUNTRIES.has(code)) {
    return {
      restBase: browser ? '/__okx-us' : 'https://us.okx.com',
      wsPublic: 'wss://wsus.okx.com:8443/ws/v5/public',
      wsBusiness: 'wss://wsus.okx.com:8443/ws/v5/business',
      wsPrivate: 'wss://wsus.okx.com:8443/ws/v5/private',
      wsPrivatePaper: 'wss://wsuspap.okx.com:8443/ws/v5/private',
    }
  }

  if (EU_COUNTRIES.has(code)) {
    return {
      restBase: browser ? '/__okx-eu' : 'https://eea.okx.com',
      wsPublic: 'wss://wseea.okx.com:8443/ws/v5/public',
      wsBusiness: 'wss://wseea.okx.com:8443/ws/v5/business',
      wsPrivate: 'wss://wseea.okx.com:8443/ws/v5/private',
      wsPrivatePaper: 'wss://wseeapap.okx.com:8443/ws/v5/private',
    }
  }

  return {
    restBase: browser ? '/__okx-global' : 'https://www.okx.com',
    wsPublic: 'wss://ws.okx.com:8443/ws/v5/public',
    wsBusiness: 'wss://ws.okx.com:8443/ws/v5/business',
    wsPrivate: 'wss://ws.okx.com:8443/ws/v5/private',
    wsPrivatePaper: 'wss://wspap.okx.com:8443/ws/v5/private',
  }
}
