// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * ByBit endpoint selection for the ccxt instance.
 *
 * ByBit is the one venue in the fleet where regional routing costs a single
 * field: every REST and WS URL in ccxt's table is `{hostname}`-templated
 * (`https://api.{hostname}`, `wss://stream.{hostname}/v5/public/spot`) and
 * `implodeHostname` runs per call — in `sign()` for REST and in
 * `getUrlByMarketType()` for the socket. So one assignment moves both, and it
 * keeps moving them after a region change without rebuilding the URL tables.
 *
 * The region set is the native connector's, verbatim (`bybit-market-connector/
 * regions.ts`): EU/EEA reads and trades on `bybit.nl`, the US is refused
 * outright, everyone else is on `bybit.com`. `resolveBybitRegion` returns null
 * exactly where the native's `resolveBybitUrls` returns null, because the
 * connector's `geoCheck` is written against that null.
 *
 * Neither ByBit host has a Vite dev proxy and neither needs one: `api.bybit.com`
 * reflects the request origin (measured 2026-08-11), and the native connector
 * has always gone direct from the browser.
 */

// EU member states + EEA — the native connector's list, unchanged.
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

export type BybitCcxtRegion = {
  /**
   * ccxt's `hostname`, imploded into every REST and WS URL. `bybit.nl` yields
   * `api.bybit.nl` / `stream.bybit.nl`, matching the native's EU endpoints.
   */
  hostname: string
}

/**
 * The ByBit region for `country`, or null where ByBit does not serve it.
 *
 * Null means the same thing it means in the native connector: refuse. Today
 * that is the US and only the US, and the connector's `geoCheck` checks both
 * conditions so a future addition to this list refuses market data too.
 */
export function resolveBybitRegion(country: string): BybitCcxtRegion | null {
  const code = country.toUpperCase()
  if (code === 'US') return null
  if (EU_COUNTRIES.has(code)) return { hostname: 'bybit.nl' }
  return { hostname: 'bybit.com' }
}

/**
 * Spot orderbook depths ByBit's WS accepts, in ascending order.
 *
 * ccxt throws `BadRequest` for anything else (`pro/bybit.js:906-915`) rather
 * than snapping to the nearest channel the way OKX and Bitget do, so a UI depth
 * has to be clamped before it reaches `watchOrderBook`.
 */
export const BYBIT_SPOT_BOOK_DEPTHS = [1, 50, 200, 1000] as const

/** The native connector's channel is `orderbook.50` — ccxt's default matches. */
export const BYBIT_DEFAULT_BOOK_DEPTH = 50

/**
 * Snap a requested depth up to the smallest ByBit spot channel that covers it.
 *
 * Rounding UP rather than to the nearest: a book that shows fewer levels than
 * the caller asked for looks like missing liquidity, while extra levels are
 * free (the terminal slices what it renders).
 */
export function clampBybitBookDepth(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return BYBIT_DEFAULT_BOOK_DEPTH
  }
  for (const depth of BYBIT_SPOT_BOOK_DEPTHS) {
    if (requested <= depth) return depth
  }
  return BYBIT_SPOT_BOOK_DEPTHS[BYBIT_SPOT_BOOK_DEPTHS.length - 1] as number
}

type UrlTable = Record<string, unknown>

/**
 * Point a freshly built ccxt instance at the right ByBit endpoints.
 *
 * `paper` swaps in the testnet table (`api-testnet.{hostname}` /
 * `stream-testnet.{hostname}`), which is what ccxt's own `setSandboxMode(true)`
 * does — reproduced here rather than called because `sandbox` is a constructor
 * flag and the bridge builds one instance per region, not per mode.
 *
 * **The testnet is ONE global environment**, not a regional pair: the native's
 * `resolveBybitTestnetUrls()` takes no country at all and always returns
 * `api-testnet.bybit.com` / `stream-testnet.bybit.com`. Left to the hostname
 * template an EU slot would come out on `api-testnet.bybit.nl` — which does
 * answer (measured 2026-08-11, both REST and WS) but is not the environment the
 * native's testnet keys were issued against. So paper pins the global host.
 *
 * An unserved region falls back to the global host. That is deliberate: the
 * refusal belongs to `geoCheck`, which runs before any call reaches this
 * instance, and a half-built exchange with no URLs would turn a typed
 * `GeoRestrictedError` into an opaque request failure.
 */
export function applyBybitCcxtUrls(
  exchange: { urls: Record<string, unknown>; hostname?: string },
  country: string,
  paper = false,
): void {
  const region = resolveBybitRegion(country)
  exchange.hostname = paper ? 'bybit.com' : (region?.hostname ?? 'bybit.com')
  if (!paper) return
  const test = exchange.urls['test']
  if (test && typeof test === 'object') {
    exchange.urls['api'] = {
      ...((exchange.urls['api'] as UrlTable | undefined) ?? {}),
      ...(test as UrlTable),
    }
  }
}
