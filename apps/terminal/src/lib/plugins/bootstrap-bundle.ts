// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bootstrap bundle — build-time imports of all first-party plugins.
 *
 * These ship with the terminal binary and are used on:
 * - First launch (no network)
 * - Offline mode
 * - "Reset to defaults"
 *
 * When the Registry is available, these may be superseded by newer versions.
 */

import {
  createPairlensCorePlugin,
  pairlensCoreManifest,
} from '@pairlens/plugins/pairlens-core'
import {
  createPairlensIntelligencePlugin,
  pairlensIntelligenceManifest,
} from '@pairlens/plugins/pairlens-intelligence'
import {
  createPairlensPredictionsPlugin,
  pairlensPredictionsManifest,
} from '@pairlens/plugins/pairlens-predictions'
// Every CEX venue runs on the CCXT bridge. Same plugin ids, same manifests —
// only the subpath moved, and the ccxt exchange class behind each one is a
// dynamic import, so no venue's chunk is in the entry graph.
import {
  createOkxMarketConnectorPlugin,
  okxMarketConnectorManifest,
} from '@pairlens/plugins/ccxt-connector/okx'
import {
  binanceMarketConnectorManifest,
  createBinanceMarketConnectorPlugin,
} from '@pairlens/plugins/ccxt-connector/binance'
import {
  bybitMarketConnectorManifest,
  createBybitMarketConnectorPlugin,
} from '@pairlens/plugins/ccxt-connector/bybit'
import {
  bitvavoMarketConnectorManifest,
  createBitvavoMarketConnectorPlugin,
} from '@pairlens/plugins/ccxt-connector/bitvavo'
import {
  createMexcMarketConnectorPlugin,
  mexcMarketConnectorManifest,
} from '@pairlens/plugins/ccxt-connector/mexc'
import {
  createKucoinMarketConnectorPlugin,
  kucoinMarketConnectorManifest,
} from '@pairlens/plugins/ccxt-connector/kucoin'
import {
  createGateMarketConnectorPlugin,
  gateMarketConnectorManifest,
} from '@pairlens/plugins/ccxt-connector/gate'
import {
  coinbaseMarketConnectorManifest,
  createCoinbaseMarketConnectorPlugin,
} from '@pairlens/plugins/ccxt-connector/coinbase'
import {
  bitgetMarketConnectorManifest,
  createBitgetMarketConnectorPlugin,
} from '@pairlens/plugins/ccxt-connector/bitget'
import {
  createKrakenMarketConnectorPlugin,
  krakenMarketConnectorManifest,
} from '@pairlens/plugins/ccxt-connector/kraken'
import {
  createHtxMarketConnectorPlugin,
  htxMarketConnectorManifest,
} from '@pairlens/plugins/ccxt-connector/htx'
import {
  createCryptocomMarketConnectorPlugin,
  cryptocomMarketConnectorManifest,
} from '@pairlens/plugins/ccxt-connector/cryptocom'
import {
  bitfinexMarketConnectorManifest,
  createBitfinexMarketConnectorPlugin,
} from '@pairlens/plugins/ccxt-connector/bitfinex'
import {
  createUpbitMarketConnectorPlugin,
  upbitMarketConnectorManifest,
} from '@pairlens/plugins/ccxt-connector/upbit'
import {
  alpacaMarketConnectorManifest,
  createAlpacaMarketConnectorPlugin,
} from '@pairlens/plugins/alpaca-market-connector'
// Prediction venues ride their own runtime (prediction-connector), not the
// ccxt spot bridge — same `-market-connector` id suffix, so the credential
// binding and the marketId fallback regex keep working.
import {
  createKalshiMarketConnectorPlugin,
  kalshiMarketConnectorManifest,
} from '@pairlens/plugins/prediction-connector/kalshi'
import {
  createPolymarketMarketConnectorPlugin,
  polymarketMarketConnectorManifest,
} from '@pairlens/plugins/prediction-connector/polymarket'
import {
  createDexpaprikaDataProviderPlugin,
  dexpaprikaDataProviderManifest,
} from '@pairlens/plugins/dexpaprika-data-provider'
import {
  createGeckoterminalDataProviderPlugin,
  geckoterminalDataProviderManifest,
} from '@pairlens/plugins/geckoterminal-data-provider'
import {
  createJupiterDexConnectorPlugin,
  jupiterDexConnectorManifest,
} from '@pairlens/plugins/jupiter-dex-connector'
import {
  arbitrumDexConnectorManifest,
  baseDexConnectorManifest,
  bscDexConnectorManifest,
  createEvmDexConnectorPlugin,
  ethereumDexConnectorManifest,
  polygonDexConnectorManifest,
} from '@pairlens/plugins/evm-dex-connector'
import {
  anthropicInferenceManifest,
  arcticBlueManifest,
  boomergManifest,
  burntOrangeManifest,
  createAnthropicInferencePlugin,
  createArcticBluePlugin,
  createBoomergPlugin,
  createBurntOrangePlugin,
  createCryptoGoldPlugin,
  createCyberpunkNeonPlugin,
  createEarthTonesPlugin,
  createElectricLimePlugin,
  createEmeraldMatrixPlugin,
  createExaSearchPlugin,
  createEyeComfortPlugin,
  createGroqInferencePlugin,
  createHighContrastPlugin,
  createInfraredPlugin,
  createMidnightEmberPlugin,
  createNightCityPlugin,
  createOpenaiInferencePlugin,
  createOpenrouterInferencePlugin,
  createPairlensThemePlugin,
  createRoyalVioletPlugin,
  createSakuraBloomPlugin,
  createTavilySearchPlugin,
  createTerminalClassicPlugin,
  createZenTradingPlugin,
  cryptoGoldManifest,
  cyberpunkNeonManifest,
  earthTonesManifest,
  electricLimeManifest,
  emeraldMatrixManifest,
  exaSearchManifest,
  eyeComfortManifest,
  groqInferenceManifest,
  highContrastManifest,
  infraredManifest,
  midnightEmberManifest,
  nightCityManifest,
  openaiInferenceManifest,
  openrouterInferenceManifest,
  pairlensThemeManifest,
  royalVioletManifest,
  sakuraBloomManifest,
  tavilySearchManifest,
  terminalClassicManifest,
  zenTradingManifest,
} from '@pairlens/plugins/all'
import type { PluginFactory, PluginManifest } from '@pairlens/plugin-system'

import {
  communityStoreManifest,
  createCommunityStorePlugin,
} from '@/lib/workspace-store/community-store-plugin'
import {
  createUserIndicatorsPlugin,
  userIndicatorsManifest,
} from '@/lib/indicators/user-indicators-plugin'

export type BootstrapPlugin = {
  manifest: PluginManifest
  factory: PluginFactory
}

/** First-party plugins that define core terminal panels. */
export const BOOTSTRAP_CORE_PLUGINS: Array<BootstrapPlugin> = [
  { manifest: pairlensCoreManifest, factory: createPairlensCorePlugin },
  {
    manifest: pairlensIntelligenceManifest,
    factory: createPairlensIntelligencePlugin,
  },
  // The first-party workspace store, provided through the plugin capability.
  { manifest: communityStoreManifest, factory: createCommunityStorePlugin },
  // The user's own Python indicators, provided through chart:indicator.
  { manifest: userIndicatorsManifest, factory: createUserIndicatorsPlugin },
  // Prediction-market panels. Panels-only, so it declares no capabilities and
  // activates in the generic remaining-plugins pass rather than the connector
  // or theme ones.
  {
    manifest: pairlensPredictionsManifest,
    factory: createPairlensPredictionsPlugin,
  },
]

/** AI inference provider plugins. */
export const BOOTSTRAP_INFERENCE_PLUGINS: Array<BootstrapPlugin> = [
  { manifest: groqInferenceManifest, factory: createGroqInferencePlugin },
  { manifest: openaiInferenceManifest, factory: createOpenaiInferencePlugin },
  {
    manifest: anthropicInferenceManifest,
    factory: createAnthropicInferencePlugin,
  },
  {
    manifest: openrouterInferenceManifest,
    factory: createOpenrouterInferencePlugin,
  },
]

/** AI web-search provider plugins (BYOK grounding for research). */
export const BOOTSTRAP_WEB_SEARCH_PLUGINS: Array<BootstrapPlugin> = [
  { manifest: tavilySearchManifest, factory: createTavilySearchPlugin },
  { manifest: exaSearchManifest, factory: createExaSearchPlugin },
]

/** Theme plugins. */
export const BOOTSTRAP_THEME_PLUGINS: Array<BootstrapPlugin> = [
  { manifest: pairlensThemeManifest, factory: createPairlensThemePlugin },
  { manifest: zenTradingManifest, factory: createZenTradingPlugin },
  { manifest: cyberpunkNeonManifest, factory: createCyberpunkNeonPlugin },
  { manifest: earthTonesManifest, factory: createEarthTonesPlugin },
  { manifest: terminalClassicManifest, factory: createTerminalClassicPlugin },
  { manifest: cryptoGoldManifest, factory: createCryptoGoldPlugin },
  { manifest: arcticBlueManifest, factory: createArcticBluePlugin },
  { manifest: infraredManifest, factory: createInfraredPlugin },
  { manifest: emeraldMatrixManifest, factory: createEmeraldMatrixPlugin },
  { manifest: royalVioletManifest, factory: createRoyalVioletPlugin },
  { manifest: midnightEmberManifest, factory: createMidnightEmberPlugin },
  { manifest: sakuraBloomManifest, factory: createSakuraBloomPlugin },
  { manifest: electricLimeManifest, factory: createElectricLimePlugin },
  { manifest: burntOrangeManifest, factory: createBurntOrangePlugin },
  { manifest: nightCityManifest, factory: createNightCityPlugin },
  { manifest: eyeComfortManifest, factory: createEyeComfortPlugin },
  { manifest: highContrastManifest, factory: createHighContrastPlugin },
  { manifest: boomergManifest, factory: createBoomergPlugin },
]

/** DEX data providers + connectors. */
export const BOOTSTRAP_DEX_PLUGINS: Array<BootstrapPlugin> = [
  {
    manifest: dexpaprikaDataProviderManifest,
    factory: createDexpaprikaDataProviderPlugin,
  },
  {
    manifest: geckoterminalDataProviderManifest,
    factory: createGeckoterminalDataProviderPlugin,
  },
  {
    manifest: jupiterDexConnectorManifest,
    factory: createJupiterDexConnectorPlugin,
  },
  {
    manifest: ethereumDexConnectorManifest,
    factory: createEvmDexConnectorPlugin,
  },
  {
    manifest: baseDexConnectorManifest,
    factory: createEvmDexConnectorPlugin,
  },
  {
    manifest: arbitrumDexConnectorManifest,
    factory: createEvmDexConnectorPlugin,
  },
  {
    manifest: bscDexConnectorManifest,
    factory: createEvmDexConnectorPlugin,
  },
  {
    manifest: polygonDexConnectorManifest,
    factory: createEvmDexConnectorPlugin,
  },
]

/** Market connector plugins — direct exchange connections. */
export const BOOTSTRAP_MARKET_CONNECTOR_PLUGINS: Array<BootstrapPlugin> = [
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
  {
    manifest: kalshiMarketConnectorManifest,
    factory: createKalshiMarketConnectorPlugin,
  },
  {
    manifest: polymarketMarketConnectorManifest,
    factory: createPolymarketMarketConnectorPlugin,
  },
]

/** All bootstrap plugins combined. */
export const BOOTSTRAP_PLUGINS: Array<BootstrapPlugin> = [
  ...BOOTSTRAP_CORE_PLUGINS,
  ...BOOTSTRAP_INFERENCE_PLUGINS,
  ...BOOTSTRAP_WEB_SEARCH_PLUGINS,
  ...BOOTSTRAP_THEME_PLUGINS,
  ...BOOTSTRAP_MARKET_CONNECTOR_PLUGINS,
  ...BOOTSTRAP_DEX_PLUGINS,
]

/** Set of plugin IDs included in the bootstrap bundle. */
export const BOOTSTRAP_PLUGIN_IDS = new Set(
  BOOTSTRAP_PLUGINS.map((p) => p.manifest.id),
)
