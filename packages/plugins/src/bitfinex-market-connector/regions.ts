// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitfinex URL resolution.
 *
 * Bitfinex has a single global API — no regional endpoints, no sandbox/testnet.
 *
 * REST public: https://api-pub.bitfinex.com/v2
 * REST auth:   https://api.bitfinex.com/v2
 * WS public:   wss://api-pub.bitfinex.com/ws/2
 * WS auth:     wss://api.bitfinex.com/ws/2
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

export type BfxUrls = {
  restPublicBase: string
  restAuthBase: string
  wsPublicUrl: string
  wsAuthUrl: string
}

export function resolveBfxUrls(): BfxUrls {
  return {
    restPublicBase: isBrowser()
      ? '/__bitfinex'
      : 'https://api-pub.bitfinex.com',
    restAuthBase: isBrowser() ? '/__bitfinex-auth' : 'https://api.bitfinex.com',
    wsPublicUrl: 'wss://api-pub.bitfinex.com/ws/2',
    wsAuthUrl: 'wss://api.bitfinex.com/ws/2',
  }
}
