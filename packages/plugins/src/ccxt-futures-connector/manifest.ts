// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Manifest builder for perpetual-futures venues.
 *
 * A sibling of `createCexConnectorManifest` rather than an option on it. The
 * capability set differs (positions in, bulk ticker-snapshot deliberately OUT),
 * the family and asset class differ, and `timeframes` has to ride the manifest
 * because a futures venue serves six or seven of them where the terminal's CEX
 * default assumes eleven.
 *
 * The omission worth stating: **no `market-data:ticker-snapshot`.** The bulk
 * snapshot is the app's live LISTING signal and its row parser maps a unified
 * symbol through the SPOT normalizer, which drops the `:SETTLE` leg — so every
 * perp would arrive as a plausible-looking `BTC-USDT` spot row and collide with
 * the real one in the markets scanner. That is exactly the bug the Crypto.com
 * venue patch exists to prevent on a venue that lists both; declaring the
 * capability here would reintroduce it fleet-wide.
 */

import type {
  PluginCapabilityDeclaration,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { Timeframe } from '@pairlens/shared/types'

/**
 * Every futures connector declares the same set, scoped to its own market.
 *
 * `trading:orders` carries `sideEffect: true` so the plugin manager never
 * re-routes a failed placement to another candidate — on a leveraged venue a
 * retry against a different account is not a recoverable mistake.
 */
const FUTURES_CAPABILITIES = [
  { id: 'market-data:candles', streaming: true },
  { id: 'market-data:ticker', streaming: true },
  { id: 'market-data:orderbook', streaming: true },
  { id: 'market-data:trades', streaming: true },
  { id: 'market-data:history', streaming: false },
  { id: 'trading:orders', streaming: true, sideEffect: true },
  { id: 'trading:balances', streaming: true },
  { id: 'trading:positions', streaming: false },
] as const

export type CexFuturesManifestOptions = {
  id: string
  name: string
  /** Display name used in the generated description, e.g. 'Binance Futures'. */
  displayName: string
  description?: string
  marketId: string
  icon: string
  gradient: string
  abbr: string
  headerImage?: string
  /**
   * Timeframes this venue's OHLCV endpoint accepts, ascending. Load-bearing:
   * ccxt throws for an interval a venue does not publish, so a chart offering
   * `2h` on Kraken Futures would draw nothing and blame the network. The
   * terminal reads it through `metadata.timeframes`.
   */
  timeframes: Array<Timeframe>
  /** Highest leverage the venue accepts; the ticket clamps its selector here. */
  maxLeverage: number
  /**
   * Whether a paper credential can be honoured here. Stamped only when the
   * answer is known and load-bearing: `false` says the venue has NO sandbox, so
   * the terminal must not fan a paper-mode credential at it — without the flag
   * it initializes the connector against the PRODUCTION host and the refusal
   * only surfaces at the first order. Venues with a working sandbox leave it
   * unset, like every other optional metadata key.
   */
  paperTrading?: boolean
  /**
   * Venue unreachable from a browser build, because its REST host sends no
   * `Access-Control-Allow-Origin`. The spec flag of the same name makes the
   * CONNECTOR refuse; this one makes the terminal SAY so in the venue picker.
   * Both are needed, or the venue looks ordinary until the chart refuses.
   */
  requiresDesktop?: boolean
  /** Exchange-native trigger (TP/SL) orders via `OrderParams.trigger`. */
  triggerOrders?: boolean
  /**
   * The SPOT market id whose credential also unlocks this venue.
   *
   * One Binance key covers spot and USD-M futures, so provisioning it must
   * initialize both connectors — without the alias the futures plugin has no
   * credentials and the user is told to add a second, identical key. Absent
   * where the venue genuinely issues separate keys: Kraken Futures keys are
   * minted on futures.kraken.com and are not the spot account's.
   */
  credentialAlias?: string
}

export function createCexFuturesConnectorManifest(
  opts: CexFuturesManifestOptions,
): PluginManifest {
  return {
    id: opts.id,
    name: opts.name,
    version: '0.1.0',
    author: 'Pairlens',
    description:
      opts.description ??
      `Perpetual futures market data and trading via ${opts.displayName}`,
    homepage: 'https://pairlens.finance',
    icon: opts.icon,
    capabilities: FUTURES_CAPABILITIES.map(
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
      family: 'cex-futures',
      assetClass: 'crypto-perp',
      timeframes: [...opts.timeframes],
      maxLeverage: opts.maxLeverage,
      ...(opts.paperTrading !== undefined
        ? { paperTrading: opts.paperTrading }
        : {}),
      gradient: opts.gradient,
      abbr: opts.abbr,
      logoUrl: opts.icon,
      ...(opts.headerImage ? { headerImage: opts.headerImage } : {}),
      ...(opts.requiresDesktop ? { requiresDesktop: true } : {}),
      ...(opts.triggerOrders ? { triggerOrders: true } : {}),
      ...(opts.credentialAlias
        ? { credentialAlias: opts.credentialAlias }
        : {}),
    },
    config: {},
  }
}
