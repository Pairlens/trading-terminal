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

/**
 * An OKX API key exists on exactly ONE regional entity — the one the account
 * was registered with (verified live: an EEA key returns 50119 "API key
 * doesn't exist" on www/us and authenticates on eea). Routing by the user's
 * country is only a guess at that entity, and it is wrong whenever someone
 * trades away from where they registered. `entity` is the per-credential
 * override: it names the account's home entity directly, and credentialed
 * calls route there regardless of the country setting. Empty = no override.
 *
 * This KEEPS the legal boundary — orders still go to the entity the account
 * belongs to; the override only corrects which entity that is.
 */
export type OkxEntity = 'global' | 'eea' | 'us' | ''

/**
 * Resolve the routing country for credentialed calls: an explicit account
 * entity wins, otherwise the caller's country. Returns a representative
 * country code so every downstream path (regional origin, dev-proxy prefix,
 * demo WS host) keeps working unchanged.
 */
export function resolveOkxTradingCountry(
  entity: string | undefined,
  country: string,
): string {
  switch (entity) {
    case 'us':
      return 'US'
    case 'eea':
      return 'DE'
    case 'global':
      return ''
    default:
      return country
  }
}

/**
 * Demo-trading WS hosts are regional too — a key created on my.okx.com (EEA)
 * does not exist on the global `wspap` demo socket (error 60032, found by the
 * authenticated demo E2E). ccxt's `setSandboxMode` clobbers the regional WS
 * with the global demo host, so the venue re-applies this via `applyPaperUrls`.
 */
export function okxPaperWs(country: string): string {
  const code = country.toUpperCase()
  if (US_COUNTRIES.has(code)) return 'wss://wsuspap.okx.com:8443/ws/v5'
  if (EU_COUNTRIES.has(code)) return 'wss://wseeapap.okx.com:8443/ws/v5'
  return 'wss://wspap.okx.com:8443/ws/v5'
}

/**
 * The REST base, WS base and hostname for one INSTANCE.
 *
 * `authed` is not a nicety. The native connector resolved two different bases
 * from the same country — `resolveOkxPublicRestBase` (CORS fallback allowed)
 * for market data, `resolveOkxUrls().restBase` (never) for orders — because
 * where orders go is the boundary that carries legal meaning. ccxt has no
 * per-call base to split: `urls.api.rest` is instance state, so the split has
 * to happen here, per instance, and the exchange host builds a separate
 * instance for every credential slot precisely so it can.
 *
 * Getting this wrong is not a visible failure. An EEA user placing an order
 * from the hosted web terminal would sign it for `www.okx.com`, where their
 * key does not exist, and read back `50119 API key doesn't exist` — a
 * wrong-platform error that looks like a bad credential.
 */
export function resolveOkxCcxtUrls(
  country: string,
  opts: { authed?: boolean } = {},
): OkxCcxtUrls {
  const code = country.toUpperCase()
  const ws = wsFor(code)
  if (isBrowser()) {
    return { rest: proxyPrefix(code), ws, hostname: hostFor(code) }
  }
  if (isCorsConstrained() && !opts.authed) {
    // Public reads only — the global host is CORS-enabled and serves the same
    // instruments and candles as the regional ones. An authed instance falls
    // through to the regional origin and fails honestly (network/CORS) rather
    // than succeeding against the wrong legal entity.
    return { rest: 'https://www.okx.com', ws, hostname: 'www.okx.com' }
  }
  return { rest: originFor(code), ws, hostname: hostFor(code) }
}
