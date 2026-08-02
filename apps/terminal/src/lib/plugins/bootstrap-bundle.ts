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
  createOkxMarketConnectorPlugin,
  okxMarketConnectorManifest,
} from '@pairlens/plugins/okx-market-connector'
import {
  binanceMarketConnectorManifest,
  createBinanceMarketConnectorPlugin,
} from '@pairlens/plugins/binance-market-connector'
import {
  bybitMarketConnectorManifest,
  createBybitMarketConnectorPlugin,
} from '@pairlens/plugins/bybit-market-connector'
import {
  bitvavoMarketConnectorManifest,
  createBitvavoMarketConnectorPlugin,
} from '@pairlens/plugins/bitvavo-market-connector'
import {
  createMexcMarketConnectorPlugin,
  mexcMarketConnectorManifest,
} from '@pairlens/plugins/mexc-market-connector'
import {
  createKucoinMarketConnectorPlugin,
  kucoinMarketConnectorManifest,
} from '@pairlens/plugins/kucoin-market-connector'
import {
  createGateMarketConnectorPlugin,
  gateMarketConnectorManifest,
} from '@pairlens/plugins/gate-market-connector'
import {
  coinbaseMarketConnectorManifest,
  createCoinbaseMarketConnectorPlugin,
} from '@pairlens/plugins/coinbase-market-connector'
import {
  bitgetMarketConnectorManifest,
  createBitgetMarketConnectorPlugin,
} from '@pairlens/plugins/bitget-market-connector'
import {
  createKrakenMarketConnectorPlugin,
  krakenMarketConnectorManifest,
} from '@pairlens/plugins/kraken-market-connector'
import {
  createHtxMarketConnectorPlugin,
  htxMarketConnectorManifest,
} from '@pairlens/plugins/htx-market-connector'
import {
  createCryptocomMarketConnectorPlugin,
  cryptocomMarketConnectorManifest,
} from '@pairlens/plugins/cryptocom-market-connector'
import {
  bitfinexMarketConnectorManifest,
  createBitfinexMarketConnectorPlugin,
} from '@pairlens/plugins/bitfinex-market-connector'
import {
  createUpbitMarketConnectorPlugin,
  upbitMarketConnectorManifest,
} from '@pairlens/plugins/upbit-market-connector'
import {
  alpacaMarketConnectorManifest,
  createAlpacaMarketConnectorPlugin,
} from '@pairlens/plugins/alpaca-market-connector'
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
  burntOrangeManifest,
  createAnthropicInferencePlugin,
  createArcticBluePlugin,
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
