// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kraken URL resolution.
 *
 * Kraken has a single global API — no regional endpoints like OKX.
 * REST: https://api.kraken.com/0/public/* and /0/private/*
 * WS public: wss://ws.kraken.com/v2
 * WS private (auth): wss://ws-auth.kraken.com/v2
 *
 * No public paper/testnet — Kraken's UAT requires contacting support.
 * Paper orders use the `validate: true` param on AddOrder (dry-run).
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

export type KrakenUrls = {
  restBase: string
  wsPublicUrl: string
  wsPrivateUrl: string
}

export function resolveKrakenUrls(): KrakenUrls {
  return {
    restBase: isBrowser() ? '/__kraken/0' : 'https://api.kraken.com/0',
    wsPublicUrl: 'wss://ws.kraken.com/v2',
    wsPrivateUrl: 'wss://ws-auth.kraken.com/v2',
  }
}

export function resolveKrakenRestBase(): string {
  return isBrowser() ? '/__kraken/0' : 'https://api.kraken.com/0'
}
