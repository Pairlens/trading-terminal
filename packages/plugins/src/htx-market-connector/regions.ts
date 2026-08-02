// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * HTX URL resolution.
 *
 * HTX has a single global API (still on the huobi.pro domain).
 * REST: https://api.huobi.pro
 * WS market data: wss://api.huobi.pro/ws (GZIP compressed)
 * WS account/order: wss://api.huobi.pro/ws/v2 (plain JSON)
 *
 * No regional endpoints. No public testnet/paper trading.
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

export type HtxUrls = {
  restBase: string
  wsPublicUrl: string
  wsPrivateUrl: string
}

export function resolveHtxUrls(): HtxUrls {
  return {
    restBase: isBrowser() ? '/__htx' : 'https://api.huobi.pro',
    wsPublicUrl: 'wss://api.huobi.pro/ws',
    wsPrivateUrl: 'wss://api.huobi.pro/ws/v2',
  }
}

export function resolveHtxRestBase(): string {
  return isBrowser() ? '/__htx' : 'https://api.huobi.pro'
}
