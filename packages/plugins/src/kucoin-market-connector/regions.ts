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

const US_COUNTRIES = new Set(['US'])

export type KucoinUrls = {
  /** REST base for public market data (always global). */
  restBase: string
  /** REST base for authenticated trading (EU uses kucoin.eu). */
  tradingRestBase: string
}

/**
 * Resolve KuCoin REST URLs.
 * Returns null for US (blocked).
 *
 * Public market data always uses the global endpoint (api.kucoin.com) because
 * the EU endpoint (api.kucoin.eu) returns null for many market data fields.
 * Authenticated trading uses the EU endpoint for EU users (MiCA compliance).
 *
 * KuCoin WS URLs are dynamic — obtained from the bullet token endpoint.
 */
export function resolveKucoinUrls(
  country: string,
  paper?: boolean,
): KucoinUrls | null {
  const code = country.toUpperCase()

  if (US_COUNTRIES.has(code)) return null

  if (paper) {
    const base = isBrowser()
      ? '/__kucoin-sandbox'
      : 'https://openapi-sandbox.kucoin.com'
    return { restBase: base, tradingRestBase: base }
  }

  const globalBase = isBrowser() ? '/__kucoin-global' : 'https://api.kucoin.com'

  if (EU_COUNTRIES.has(code)) {
    const euBase = isBrowser() ? '/__kucoin-eu' : 'https://api.kucoin.eu'
    return { restBase: globalBase, tradingRestBase: euBase }
  }

  return { restBase: globalBase, tradingRestBase: globalBase }
}

/** Resolve public REST base (market data). Throws for US. */
export function resolveKucoinRestBase(
  country: string,
  paper?: boolean,
): string {
  const urls = resolveKucoinUrls(country, paper)
  if (!urls) throw new Error('KuCoin is not available in the US')
  return urls.restBase
}

/** Resolve trading REST base (authenticated endpoints). Throws for US. */
export function resolveKucoinTradingBase(
  country: string,
  paper?: boolean,
): string {
  const urls = resolveKucoinUrls(country, paper)
  if (!urls) throw new Error('KuCoin is not available in the US')
  return urls.tradingRestBase
}
