// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
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

export type BybitUrls = {
  restBase: string
  wsPublic: string
  wsPrivate: string
}

/**
 * Resolve ByBit API URLs by country code.
 * Returns null for US (ByBit is blocked in the US).
 * EU users get bybit.nl; everyone else gets bybit.com.
 */
export function resolveBybitUrls(country: string): BybitUrls | null {
  const code = country.toUpperCase()

  if (code === 'US') {
    return null
  }

  if (EU_COUNTRIES.has(code)) {
    return {
      restBase: 'https://api.bybit.nl',
      wsPublic: 'wss://stream.bybit.nl/v5/public/spot',
      wsPrivate: 'wss://stream.bybit.nl/v5/private',
    }
  }

  return {
    restBase: 'https://api.bybit.com',
    wsPublic: 'wss://stream.bybit.com/v5/public/spot',
    wsPrivate: 'wss://stream.bybit.com/v5/private',
  }
}

/**
 * Resolve ByBit testnet URLs for paper trading mode.
 * Testnet is region-agnostic (single global endpoint).
 */
export function resolveBybitTestnetUrls(): BybitUrls {
  return {
    restBase: 'https://api-testnet.bybit.com',
    wsPublic: 'wss://stream-testnet.bybit.com/v5/public/spot',
    wsPrivate: 'wss://stream-testnet.bybit.com/v5/private',
  }
}
