// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitget URL resolution.
 *
 * Bitget has a single global API — no regional endpoints.
 * Paper/demo trading uses the same REST domain with a `paptrading: 1` header,
 * but separate WebSocket domains.
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

export type BitgetUrls = {
  restBase: string
  wsPublicUrl: string
  wsPrivateUrl: string
}

export function resolveBitgetUrls(paper?: boolean): BitgetUrls {
  const restBase = isBrowser()
    ? '/__bitget/api/v2/spot'
    : 'https://api.bitget.com/api/v2/spot'

  return {
    restBase,
    wsPublicUrl: paper
      ? 'wss://wspap.bitget.com/v2/ws/public'
      : 'wss://ws.bitget.com/v2/ws/public',
    wsPrivateUrl: paper
      ? 'wss://wspap.bitget.com/v2/ws/private'
      : 'wss://ws.bitget.com/v2/ws/private',
  }
}

export function resolveBitgetRestBase(): string {
  return isBrowser()
    ? '/__bitget/api/v2/spot'
    : 'https://api.bitget.com/api/v2/spot'
}

/**
 * Build headers for Bitget REST requests.
 * Paper trading adds `paptrading: 1` header.
 */
export function buildBitgetHeaders(
  paper: boolean,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  }
  if (paper) headers['paptrading'] = '1'
  return headers
}
