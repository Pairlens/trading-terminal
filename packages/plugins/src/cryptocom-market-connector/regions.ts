// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Crypto.com URL resolution.
 *
 * Crypto.com has a single global API — no regional endpoints.
 * Paper trading uses the UAT sandbox at uat-api.3ona.co / uat-stream.3ona.co.
 *
 * Production:
 *   REST: https://api.crypto.com/exchange/v1/{method}
 *   WS Market: wss://stream.crypto.com/exchange/v1/market
 *   WS User: wss://stream.crypto.com/exchange/v1/user
 *
 * UAT Sandbox (paper):
 *   REST: https://uat-api.3ona.co/exchange/v1/{method}
 *   WS Market: wss://uat-stream.3ona.co/exchange/v1/market
 *   WS User: wss://uat-stream.3ona.co/exchange/v1/user
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

export type CryptocomUrls = {
  restBase: string
  wsMarketUrl: string
  wsUserUrl: string
}

export function resolveCryptocomUrls(paper: boolean): CryptocomUrls {
  if (paper) {
    return {
      restBase: isBrowser()
        ? '/__cryptocom-sandbox'
        : 'https://uat-api.3ona.co',
      wsMarketUrl: 'wss://uat-stream.3ona.co/exchange/v1/market',
      wsUserUrl: 'wss://uat-stream.3ona.co/exchange/v1/user',
    }
  }

  return {
    restBase: isBrowser() ? '/__cryptocom' : 'https://api.crypto.com',
    wsMarketUrl: 'wss://stream.crypto.com/exchange/v1/market',
    wsUserUrl: 'wss://stream.crypto.com/exchange/v1/user',
  }
}

export function resolveCryptocomRestBase(paper: boolean): string {
  return resolveCryptocomUrls(paper).restBase
}
