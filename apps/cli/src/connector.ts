// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Headless market connector — initializes the plugin system and activates
 * a market connector plugin for CLI use (no browser, no React).
 */

import { PluginManager } from '@pairlens/plugin-system/manager'
import {
  alpacaMarketConnectorManifest,
  binanceFuturesMarketConnectorManifest,
  binanceMarketConnectorManifest,
  bitfinexMarketConnectorManifest,
  bitgetMarketConnectorManifest,
  bitvavoMarketConnectorManifest,
  bybitMarketConnectorManifest,
  coinbaseMarketConnectorManifest,
  createAlpacaMarketConnectorPlugin,
  createBinanceFuturesMarketConnectorPlugin,
  createBinanceMarketConnectorPlugin,
  createBitfinexMarketConnectorPlugin,
  createBitgetMarketConnectorPlugin,
  createBitvavoMarketConnectorPlugin,
  createBybitMarketConnectorPlugin,
  createCoinbaseMarketConnectorPlugin,
  createCryptocomMarketConnectorPlugin,
  createGateMarketConnectorPlugin,
  createHtxMarketConnectorPlugin,
  createKalshiMarketConnectorPlugin,
  createKrakenFuturesMarketConnectorPlugin,
  createKrakenMarketConnectorPlugin,
  createKucoinFuturesMarketConnectorPlugin,
  createKucoinMarketConnectorPlugin,
  createMexcMarketConnectorPlugin,
  createOkxMarketConnectorPlugin,
  createPolymarketMarketConnectorPlugin,
  createUpbitMarketConnectorPlugin,
  cryptocomMarketConnectorManifest,
  gateMarketConnectorManifest,
  htxMarketConnectorManifest,
  kalshiMarketConnectorManifest,
  krakenFuturesMarketConnectorManifest,
  krakenMarketConnectorManifest,
  kucoinFuturesMarketConnectorManifest,
  kucoinMarketConnectorManifest,
  mexcMarketConnectorManifest,
  okxMarketConnectorManifest,
  polymarketMarketConnectorManifest,
  upbitMarketConnectorManifest,
} from '@pairlens/plugins/all'

const CONNECTORS = [
  {
    manifest: okxMarketConnectorManifest,
    factory: createOkxMarketConnectorPlugin,
  },
  {
    manifest: binanceMarketConnectorManifest,
    factory: createBinanceMarketConnectorPlugin,
  },
  {
    manifest: bybitMarketConnectorManifest,
    factory: createBybitMarketConnectorPlugin,
  },
  {
    manifest: bitvavoMarketConnectorManifest,
    factory: createBitvavoMarketConnectorPlugin,
  },
  {
    manifest: mexcMarketConnectorManifest,
    factory: createMexcMarketConnectorPlugin,
  },
  {
    manifest: kucoinMarketConnectorManifest,
    factory: createKucoinMarketConnectorPlugin,
  },
  {
    manifest: gateMarketConnectorManifest,
    factory: createGateMarketConnectorPlugin,
  },
  {
    manifest: coinbaseMarketConnectorManifest,
    factory: createCoinbaseMarketConnectorPlugin,
  },
  {
    manifest: bitgetMarketConnectorManifest,
    factory: createBitgetMarketConnectorPlugin,
  },
  {
    manifest: krakenMarketConnectorManifest,
    factory: createKrakenMarketConnectorPlugin,
  },
  {
    manifest: htxMarketConnectorManifest,
    factory: createHtxMarketConnectorPlugin,
  },
  {
    manifest: cryptocomMarketConnectorManifest,
    factory: createCryptocomMarketConnectorPlugin,
  },
  {
    manifest: bitfinexMarketConnectorManifest,
    factory: createBitfinexMarketConnectorPlugin,
  },
  {
    manifest: upbitMarketConnectorManifest,
    factory: createUpbitMarketConnectorPlugin,
  },
  {
    manifest: alpacaMarketConnectorManifest,
    factory: createAlpacaMarketConnectorPlugin,
  },
  // Prediction venues. Both are reachable headlessly: bun sends no Origin, so
  // Kalshi's browser-only 403 does not apply here.
  {
    manifest: kalshiMarketConnectorManifest,
    factory: createKalshiMarketConnectorPlugin,
  },
  {
    manifest: polymarketMarketConnectorManifest,
    factory: createPolymarketMarketConnectorPlugin,
  },
  // Perpetual-futures venues. Reachable headlessly for the same reason: the
  // two that refuse a browser do so over CORS, which bun is not subject to.
  {
    manifest: binanceFuturesMarketConnectorManifest,
    factory: createBinanceFuturesMarketConnectorPlugin,
  },
  {
    manifest: kucoinFuturesMarketConnectorManifest,
    factory: createKucoinFuturesMarketConnectorPlugin,
  },
  {
    manifest: krakenFuturesMarketConnectorManifest,
    factory: createKrakenFuturesMarketConnectorPlugin,
  },
]

export async function createConnector(
  market: string,
  country: string,
  mode: 'paper' | 'live' = 'paper',
): Promise<PluginManager> {
  const manager = new PluginManager({
    market,
    pair: '',
    timeframe: '1h',
    mode,
    country,
  })

  // Install and activate all connectors
  for (const { manifest, factory } of CONNECTORS) {
    await manager.installPlugin(manifest, factory)
    await manager.activatePlugin(manifest.id, {})
  }

  return manager
}

export function getAvailableMarkets(): Array<string> {
  return CONNECTORS.map((c) => {
    const cap = c.manifest.capabilities.find(
      (candidate) => candidate.id === 'market-data:candles',
    )
    return cap?.markets[0] ?? c.manifest.id.replace('-market-connector', '')
  })
}
