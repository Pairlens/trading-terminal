// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Manifest builder for prediction venues.
 *
 * A sibling of `createCexConnectorManifest`, not a parameterization of it: the
 * capability set differs (events and positions in, ticker-snapshot out), the
 * asset class differs, and `timeframes` has to ride the manifest because a
 * prediction venue offers three or four of them rather than the nine the
 * terminal assumes for a CEX. Keeping the two builders apart also keeps this
 * file out of the way of the family-stamping work happening in the spot shell.
 */

import type {
  PluginCapabilityDeclaration,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { Timeframe } from '@pairlens/shared/types'
import type { PredictionMarketOrderSupport } from './types'

/**
 * Every prediction connector declares the same set, scoped to its own market.
 *
 * `trading:orders` carries `sideEffect: true` so the plugin manager never
 * re-routes a failed placement to another candidate (`manager.ts` treats the
 * capability id specially too, but the flag is what makes the intent explicit
 * and survives a rename).
 */
const PREDICTION_CAPABILITIES = [
  { id: 'market-data:candles', streaming: true },
  { id: 'market-data:ticker', streaming: true },
  { id: 'market-data:orderbook', streaming: true },
  { id: 'market-data:trades', streaming: true },
  { id: 'market-data:history', streaming: false },
  { id: 'market-data:discovery:search', streaming: false },
  { id: 'market-data:events', streaming: false },
  { id: 'trading:orders', streaming: true, sideEffect: true },
  { id: 'trading:balances', streaming: true },
  { id: 'trading:positions', streaming: false },
] as const

export type PredictionManifestOptions = {
  id: string
  name: string
  /** Display name used in the generated description, e.g. 'Kalshi'. */
  displayName: string
  description?: string
  marketId: string
  icon: string
  gradient: string
  abbr: string
  headerImage?: string
  /**
   * The timeframes this venue's OHLCV endpoint accepts, in ascending order.
   *
   * Load-bearing rather than decorative: the terminal's CEX default list has
   * nine entries and ccxt's prediction `fetchOHLCV` throws `BadRequest` for a
   * timeframe the venue does not publish, so a chart offering `15m` on Kalshi
   * would draw nothing and blame the network. The terminal reads this through
   * `metadata.timeframes`.
   */
  timeframes: Array<Timeframe>
  /**
   * Venue unreachable from a browser build. Kalshi's REST hosts answer 403 to
   * any request carrying a foreign `Origin` (measured 2026-08-15), so the
   * connector refuses up front rather than letting the chart hang — and the
   * manifest copy is what makes the terminal SAY so in the venue picker.
   */
  requiresDesktop?: boolean
  /**
   * The venue's book is limit-only: it cannot honour a `type: 'market'` order
   * on both sides. The ticket reads this and hides the market/limit toggle
   * rather than offering an order that is rejected on submit.
   */
  limitOnly?: boolean
  /**
   * Which market-order shapes the venue honours, verbatim from the venue
   * config. Redundant with `limitOnly` today and deliberately so: `limitOnly`
   * is the boolean the ticket branches on, while this names the venue's actual
   * capability, so a future third mode does not have to overload a boolean.
   */
  marketOrders?: PredictionMarketOrderSupport
  /**
   * Chain whose wallet signs for this venue, when credentials are a wallet
   * rather than an API key pair. Same field the EVM DEX connectors publish,
   * so the Accounts flow routes to the wallet wizard on the strength of it.
   */
  walletChain?: string
}

export function createPredictionConnectorManifest(
  opts: PredictionManifestOptions,
): PluginManifest {
  return {
    id: opts.id,
    name: opts.name,
    version: '0.1.0',
    author: 'Pairlens',
    description:
      opts.description ??
      `Prediction market data and trading via ${opts.displayName}`,
    homepage: 'https://pairlens.finance',
    icon: opts.icon,
    capabilities: PREDICTION_CAPABILITIES.map(
      (cap): PluginCapabilityDeclaration => ({
        id: cap.id,
        singleton: false,
        markets: [opts.marketId],
        priority: 1,
        streaming: cap.streaming,
        ...('sideEffect' in cap ? { sideEffect: true } : {}),
      }),
    ),
    metadata: {
      assetClass: 'prediction',
      family: 'predictions',
      timeframes: [...opts.timeframes],
      gradient: opts.gradient,
      abbr: opts.abbr,
      logoUrl: opts.icon,
      ...(opts.headerImage ? { headerImage: opts.headerImage } : {}),
      ...(opts.requiresDesktop ? { requiresDesktop: true } : {}),
      ...(opts.limitOnly ? { limitOnly: true } : {}),
      ...(opts.marketOrders ? { marketOrders: opts.marketOrders } : {}),
      ...(opts.walletChain ? { walletChain: opts.walletChain } : {}),
    },
    config: {},
  }
}
