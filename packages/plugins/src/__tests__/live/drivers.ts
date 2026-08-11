// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Per-connector drivers for the live conformance harness.
 *
 * Every CEX now reads through the ccxt bridge, which exposes one uniform
 * surface — the plugin instance — instead of the WsClient-class-plus-loose-REST
 * -function pair each native connector used to ship. So this file is a single
 * adapter over `PluginInstance` plus a table of venues, rather than fourteen
 * hand-written wrappers.
 *
 * Driving the PLUGIN rather than some inner client is also the more honest
 * instrument: it is the exact surface the terminal talks to, so a venue that
 * streams fine but is mis-wired at the capability boundary now fails here.
 */

import {
  binanceMarketConnectorManifest,
  bitfinexMarketConnectorManifest,
  bitgetMarketConnectorManifest,
  bybitMarketConnectorManifest,
  coinbaseMarketConnectorManifest,
  createBinanceMarketConnectorPlugin,
  createBitfinexMarketConnectorPlugin,
  createBitgetMarketConnectorPlugin,
  createBybitMarketConnectorPlugin,
  createCoinbaseMarketConnectorPlugin,
  createCryptocomMarketConnectorPlugin,
  createGateMarketConnectorPlugin,
  createHtxMarketConnectorPlugin,
  createKrakenMarketConnectorPlugin,
  createKucoinMarketConnectorPlugin,
  createMexcMarketConnectorPlugin,
  createOkxMarketConnectorPlugin,
  createUpbitMarketConnectorPlugin,
  cryptocomMarketConnectorManifest,
  gateMarketConnectorManifest,
  htxMarketConnectorManifest,
  krakenMarketConnectorManifest,
  kucoinMarketConnectorManifest,
  mexcMarketConnectorManifest,
  okxMarketConnectorManifest,
  upbitMarketConnectorManifest,
} from '../../index'
import type { LiveDriver, WsClientLike } from './harness'
import type { Candle } from '@pairlens/shared/types'
import type {
  CapabilityId,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

// Default test pair mirrors what the user reports against: BTC-USDT.
// Each venue's own market table maps the canonical base-quote string to its
// native symbol.
const PAIR = 'BTC-USDT'
const TF = '1m'
const COUNTRY = ''

type MakePlugin = (manifest: PluginManifest) => PluginInstance

/**
 * Adapts a plugin instance to the harness's client shape.
 *
 * One plugin per client so a check tears its venue all the way down: the ccxt
 * exchange, its market table and its sockets all hang off the instance, and a
 * shared one would leak state between checks.
 */
function pluginClient(
  plugin: PluginInstance,
  market: string,
  timeframe: string,
): WsClientLike {
  const subscribe = (
    capability: CapabilityId,
    pair: string,
    country: string,
    callback: (data: never) => void,
  ) =>
    plugin.subscribe!(
      {
        capability,
        params: { pair, timeframe },
        context: { pair, market, timeframe, mode: 'paper', country },
      },
      callback as (data: unknown) => void,
    )

  return {
    subscribeCandles: (pair, _tf, country, cb) =>
      subscribe('market-data:candles', pair, country, cb as never),
    subscribeTicker: (pair, country, cb) =>
      subscribe('market-data:ticker', pair, country, cb as never),
    subscribeOrderbook: (pair, country, cb) =>
      subscribe('market-data:orderbook', pair, country, cb as never),
    // The harness tears down between checks; the plugin's own destroy closes
    // the ccxt client and every socket under it.
    destroy: () => void plugin.destroy?.(),
  }
}

function driver(
  name: string,
  make: MakePlugin,
  manifest: PluginManifest,
  overrides: Partial<Pick<LiveDriver, 'pair' | 'timeframe' | 'country'>> = {},
): LiveDriver {
  const pair = overrides.pair ?? PAIR
  const timeframe = overrides.timeframe ?? TF
  const country = overrides.country ?? COUNTRY

  return {
    name,
    pair,
    timeframe,
    country,
    makeClient: () => pluginClient(make(manifest), name, timeframe),
    fetchHistory: async (p, tf, limit, c): Promise<Array<Candle>> => {
      const plugin = make(manifest)
      try {
        return (await plugin.execute({
          capability: 'market-data:history',
          params: { pair: p, timeframe: tf, limit },
          context: {
            pair: p,
            market: name,
            timeframe: tf,
            mode: 'paper',
            country: c,
          },
        })) as Array<Candle>
      } finally {
        await plugin.destroy?.()
      }
    },
  }
}

export const LIVE_DRIVERS: Array<LiveDriver> = [
  driver('okx', createOkxMarketConnectorPlugin, okxMarketConnectorManifest),
  driver(
    'binance',
    createBinanceMarketConnectorPlugin,
    binanceMarketConnectorManifest,
  ),
  driver(
    'bybit',
    createBybitMarketConnectorPlugin,
    bybitMarketConnectorManifest,
  ),
  driver(
    'coinbase',
    createCoinbaseMarketConnectorPlugin,
    coinbaseMarketConnectorManifest,
    { pair: 'BTC-USD' },
  ),
  driver('gate', createGateMarketConnectorPlugin, gateMarketConnectorManifest),
  driver('htx', createHtxMarketConnectorPlugin, htxMarketConnectorManifest),
  driver(
    'upbit',
    createUpbitMarketConnectorPlugin,
    upbitMarketConnectorManifest,
  ),
  driver(
    'kraken',
    createKrakenMarketConnectorPlugin,
    krakenMarketConnectorManifest,
    {
      // Not the default BTC-USDT, and not a connector quirk — a liquidity one.
      // Kraken's OHLC channel emits on trades, and its USDT book is thin enough
      // that the forming-bar check is a coin flip: measured over 45s it produced
      // one update (first at 12.9s) against a 40s ceiling, where BTC-USD
      // produced ten (first at 1.9s). So the check was passing or failing on
      // whether a trade happened to land, which is what took the nightly red on
      // its first run while the connector was working correctly.
      //
      // Every other venue streams BTC-USDT comfortably, so this stays a
      // per-driver exception rather than a change of default. Widening the
      // timeout instead would only make the flake rarer and slower.
      pair: 'BTC-USD',
    },
  ),
  driver(
    'kucoin',
    createKucoinMarketConnectorPlugin,
    kucoinMarketConnectorManifest,
  ),
  driver('mexc', createMexcMarketConnectorPlugin, mexcMarketConnectorManifest),
  driver(
    'bitget',
    createBitgetMarketConnectorPlugin,
    bitgetMarketConnectorManifest,
  ),
  driver(
    'cryptocom',
    createCryptocomMarketConnectorPlugin,
    cryptocomMarketConnectorManifest,
  ),
  driver(
    'bitfinex',
    createBitfinexMarketConnectorPlugin,
    bitfinexMarketConnectorManifest,
  ),
]

/**
 * Optional comma-separated allowlist of connector names; empty means all.
 *
 * This is about WHERE the run happens, not what is worth testing. Some venues
 * refuse whole countries — Binance answers a US address with HTTP 451, ByBit
 * and MEXC are region-gated the same way — and GitHub's hosted runners are
 * US-based. Run the full set there and those rows fail every night for a
 * reason no commit caused, which is how a nightly job becomes noise and then
 * gets muted.
 *
 * So narrowing the nightly is a statement about the runner's address and
 * nothing else. It is also a real coverage gap rather than a fix: nothing
 * watches the excluded venues for contract drift until the job runs somewhere
 * that can reach them.
 *
 * It lives here, beside the drivers, because both live suites iterate them and
 * a filter applied in only one is worse than none — the run looks narrowed
 * while the other file quietly calls every venue anyway.
 */
const ONLY = (process.env.PAIRLENS_LIVE_MARKETS ?? '')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean)

const KNOWN = new Set(LIVE_DRIVERS.map((d) => d.name))
// A typo would otherwise silently shrink the run — possibly to nothing — and
// still report success, the one outcome a drift detector must never fake.
const UNKNOWN = ONLY.filter((name) => !KNOWN.has(name))
if (UNKNOWN.length > 0) {
  throw new Error(
    `PAIRLENS_LIVE_MARKETS names unknown connectors: ${UNKNOWN.join(', ')}. ` +
      `Known: ${[...KNOWN].join(', ')}`,
  )
}

/** The drivers this run will actually exercise. */
export const SELECTED_DRIVERS: Array<LiveDriver> =
  ONLY.length > 0
    ? LIVE_DRIVERS.filter((d) => ONLY.includes(d.name))
    : LIVE_DRIVERS

/** Named so a narrowed run can never be read as a full sweep. */
export const SKIPPED_DRIVER_NAMES: Array<string> = LIVE_DRIVERS.filter(
  (d) => !SELECTED_DRIVERS.includes(d),
).map((d) => d.name)
