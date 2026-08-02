// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Gate.io URL resolution.
 *
 * Gate.io has NO regional variants and NO US blocking.
 * Just global production + testnet for paper trading.
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

export type GateUrls = {
  restBase: string
  wsUrl: string
}

/**
 * Resolve Gate.io REST + WS URLs.
 *
 * REST goes through the Vite proxy whenever a dev server is serving the app
 * (browser dev AND `tauri dev`); production builds use the exchange origin.
 * NOTE: a Tauri webview enforces CORS like a browser — restFetch routes those
 * absolute-URL calls through the Rust-side HTTP plugin.
 *
 * @param paper - If true, use testnet endpoints.
 */
export function resolveGateUrls(paper?: boolean): GateUrls {
  if (paper) {
    return {
      restBase: isBrowser()
        ? '/__gate-testnet/api/v4'
        : 'https://api-testnet.gateapi.io/api/v4',
      wsUrl: 'wss://ws-testnet.gate.com/v4/ws/spot',
    }
  }

  return {
    restBase: isBrowser()
      ? '/__gate-global/api/v4'
      : 'https://api.gateio.ws/api/v4',
    wsUrl: 'wss://api.gateio.ws/ws/v4/',
  }
}

/** Resolve public REST base. */
export function resolveGateRestBase(paper?: boolean): string {
  return resolveGateUrls(paper).restBase
}

/** Resolve WS URL. */
export function resolveGateWsUrl(paper?: boolean): string {
  return resolveGateUrls(paper).wsUrl
}
