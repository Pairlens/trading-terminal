// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Upbit URL resolution.
 *
 * Upbit Global operates in three regions:
 * - Singapore (sg-api.upbit.com) — default
 * - Indonesia (id-api.upbit.com)
 * - Thailand (th-api.upbit.com) — beta
 *
 * No sandbox/testnet available.
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

export type UpbitUrls = {
  restBase: string
  wsPublicUrl: string
  wsPrivateUrl: string
}

// Map country codes to Upbit regional domains
const ID_COUNTRIES = new Set(['ID'])
const TH_COUNTRIES = new Set(['TH'])

/**
 * Quote currencies accepted by each regional /v1/ticker/all endpoint —
 * a region rejects the whole request when the list names a quote it
 * doesn't trade (e.g. KRW on sg-api).
 */
export function resolveUpbitQuoteCurrencies(country: string): Array<string> {
  const code = country.toUpperCase()
  if (ID_COUNTRIES.has(code)) return ['IDR', 'BTC', 'USDT']
  if (TH_COUNTRIES.has(code)) return ['THB', 'BTC', 'USDT']
  return ['SGD', 'BTC', 'USDT']
}

export function resolveUpbitUrls(country: string): UpbitUrls {
  const code = country.toUpperCase()

  if (ID_COUNTRIES.has(code)) {
    return {
      restBase: isBrowser() ? '/__upbit-id' : 'https://id-api.upbit.com',
      wsPublicUrl: 'wss://id-api.upbit.com/websocket/v1',
      wsPrivateUrl: 'wss://id-api.upbit.com/websocket/v1/private',
    }
  }

  if (TH_COUNTRIES.has(code)) {
    return {
      restBase: isBrowser() ? '/__upbit-th' : 'https://th-api.upbit.com',
      wsPublicUrl: 'wss://th-api.upbit.com/websocket/v1',
      wsPrivateUrl: 'wss://th-api.upbit.com/websocket/v1/private',
    }
  }

  // Default: Singapore
  return {
    restBase: isBrowser() ? '/__upbit' : 'https://sg-api.upbit.com',
    wsPublicUrl: 'wss://sg-api.upbit.com/websocket/v1',
    wsPrivateUrl: 'wss://sg-api.upbit.com/websocket/v1/private',
  }
}
