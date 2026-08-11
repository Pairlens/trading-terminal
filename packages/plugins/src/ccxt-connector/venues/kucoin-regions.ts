// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * KuCoin endpoint selection for the ccxt instance — the native connector's
 * region logic (`kucoin-market-connector/regions.ts`) expressed as the REST
 * bases ccxt reads off `urls.api`.
 *
 * Two things carry over verbatim from the native:
 *
 * - **Public data is always global.** `api.kucoin.eu` returns null for a lot of
 *   market-data fields, so reads stay on `api.kucoin.com` even for EU users and
 *   only the authenticated base moves (MiCA). That split is why this resolver
 *   returns two bases rather than one.
 * - **The US refusal is a plain `Error`, not a `GeoRestrictedError`.** The
 *   native throws `Error('KuCoin is not available in the US')` from exactly this
 *   point, so the terminal shows it as an ordinary connector failure rather than
 *   raising the region dialog. It is an inconsistency with the rest of the fleet
 *   and it is deliberately preserved — changing it here would change UI behavior
 *   that has nothing to do with the ccxt migration.
 *
 * There is no WS entry: KuCoin's socket URL is issued by REST
 * (`POST /api/v1/bullet-public`) and ccxt owns that negotiation end to end.
 * The POST rides `urls.api.public`, which is why the read base has to be right
 * before a socket can open at all.
 *
 * The base is resolved PER INSTANCE rather than per call — ccxt keeps its URLs
 * as instance state — and the exchange host rebuilds the instance on a region
 * change, which is what keeps a module-scope capture from freezing the SSR
 * value into the build.
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

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

const US_COUNTRIES = new Set(['US'])

export const KUCOIN_US_ERROR = 'KuCoin is not available in the US'

export type KucoinCcxtUrls = {
  /** Public market data — always the global host. */
  rest: string
  /** Authenticated endpoints — `api.kucoin.eu` for EU users. */
  tradingRest: string
}

/** Resolve both REST bases, or null when the region is refused. */
export function resolveKucoinCcxtUrls(
  country: string,
  paper = false,
): KucoinCcxtUrls | null {
  const code = country.toUpperCase()
  if (US_COUNTRIES.has(code)) return null

  if (paper) {
    const base = isBrowser()
      ? '/__kucoin-sandbox'
      : 'https://openapi-sandbox.kucoin.com'
    return { rest: base, tradingRest: base }
  }

  const global = isBrowser() ? '/__kucoin-global' : 'https://api.kucoin.com'
  if (EU_COUNTRIES.has(code)) {
    const eu = isBrowser() ? '/__kucoin-eu' : 'https://api.kucoin.eu'
    return { rest: global, tradingRest: eu }
  }
  return { rest: global, tradingRest: global }
}

/** Same, but throwing the native's plain `Error` for a refused region. */
export function requireKucoinCcxtUrls(
  country: string,
  paper = false,
): KucoinCcxtUrls {
  const urls = resolveKucoinCcxtUrls(country, paper)
  if (!urls) throw new Error(KUCOIN_US_ERROR)
  return urls
}
