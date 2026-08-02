// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinbase URL resolution.
 *
 * Coinbase has a single global API — no regional endpoints.
 * Sandbox available for paper trading (orders/accounts only, static data).
 * Market data always uses production API (sandbox has no market data).
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

export type CoinbaseUrls = {
  /** REST base for trading (sandbox in paper mode). */
  restBase: string
  /** REST base for market data (always production). */
  publicRestBase: string
  /** Public WebSocket URL. */
  wsPublicUrl: string
  /** Private (user) WebSocket URL. */
  wsUserUrl: string
}

/**
 * Resolve Coinbase REST + WS URLs.
 *
 * REST goes through the Vite proxy whenever a dev server is serving the app
 * (browser dev AND `tauri dev`); production builds use the exchange origin.
 * NOTE: a Tauri webview enforces CORS like a browser — restFetch routes those
 * absolute-URL calls through the Rust-side HTTP plugin.
 *
 * @param paper - If true, route trading requests to sandbox.
 */
export function resolveCoinbaseUrls(paper?: boolean): CoinbaseUrls {
  const publicRestBase = isBrowser()
    ? '/__coinbase/api/v3/brokerage'
    : 'https://api.coinbase.com/api/v3/brokerage'

  const restBase = paper
    ? isBrowser()
      ? '/__coinbase-sandbox/api/v3/brokerage'
      : 'https://api-sandbox.coinbase.com/api/v3/brokerage'
    : publicRestBase

  return {
    restBase,
    publicRestBase,
    wsPublicUrl: 'wss://advanced-trade-ws.coinbase.com',
    wsUserUrl: 'wss://advanced-trade-ws-user.coinbase.com',
  }
}

/** Resolve public REST base (always production — sandbox has no market data). */
export function resolveCoinbasePublicRest(): string {
  return isBrowser()
    ? '/__coinbase/api/v3/brokerage'
    : 'https://api.coinbase.com/api/v3/brokerage'
}

/** Resolve trading REST base (sandbox in paper mode). */
export function resolveCoinbaseTradingRest(paper?: boolean): string {
  return resolveCoinbaseUrls(paper).restBase
}
