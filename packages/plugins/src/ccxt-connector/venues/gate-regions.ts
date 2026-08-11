// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Gate.io endpoint selection for the ccxt instance.
 *
 * Gate has no regional variants and no blocked regions — the only axis is
 * production vs testnet, which is what `paper` selects. That mirrors the native
 * `gate-market-connector/regions.ts` exactly.
 *
 * The shape of the override is Gate-specific: ccxt keeps a REST base per API
 * SECTION (`urls.api.public.spot`, `.margin`, `.wallet`, … and the same list
 * again under `private`), not a single string, so a base swap has to walk both
 * records. `applyGateRestBase` is that walk.
 *
 * ccxt's `gateeu` class is deliberately not used: it is not just a hostname, it
 * also swaps the orderbook channel (`spot.order_book_update` instead of
 * `spot.obu`), and the native has no EU routing to match.
 */

import { isDevProxyAvailable as isBrowser } from '@pairlens/market-engine/platform'

export type GateCcxtUrls = {
  /** REST base, already including the `/api/v4` prefix ccxt's paths hang off. */
  rest: string
  /** Spot WS endpoint — public and private share it. */
  ws: string
}

export function resolveGateCcxtUrls(paper = false): GateCcxtUrls {
  if (paper) {
    return {
      rest: isBrowser()
        ? '/__gate-testnet/api/v4'
        : 'https://api-testnet.gateapi.io/api/v4',
      ws: 'wss://ws-testnet.gate.com/v4/ws/spot',
    }
  }
  return {
    rest: isBrowser()
      ? '/__gate-global/api/v4'
      : 'https://api.gateio.ws/api/v4',
    ws: 'wss://api.gateio.ws/ws/v4/',
  }
}

/**
 * Point every REST section — public and private, every product — at `base`.
 *
 * Rewriting the whole record rather than just `spot` is intentional: ccxt picks
 * the section from the market type and the endpoint family, and a half-moved
 * table would send some calls to the proxy and some straight at the origin,
 * where they die of CORS in the browser and of scope denial on desktop.
 */
export function applyGateRestBase(
  api: Record<string, unknown>,
  base: string,
): void {
  for (const section of ['public', 'private']) {
    const table = api[section]
    if (!table || typeof table !== 'object') continue
    const record = table as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (typeof record[key] === 'string') record[key] = base
    }
  }
}
