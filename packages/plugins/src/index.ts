// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export {
  pairlensCoreManifest,
  createPairlensCorePlugin,
} from './pairlens-core/index.ts'
export {
  pairlensPredictionsManifest,
  createPairlensPredictionsPlugin,
} from './pairlens-predictions/index.ts'
export {
  pairlensCexFuturesManifest,
  createPairlensCexFuturesPlugin,
} from './pairlens-cex-futures/index.ts'
// Presets-only family plugins: every pane they arrange already ships in
// pairlens-core, so what they carry is the arrangement.
export {
  pairlensDexManifest,
  createPairlensDexPlugin,
} from './pairlens-dex/index.ts'
export {
  pairlensEquitiesManifest,
  createPairlensEquitiesPlugin,
} from './pairlens-equities/index.ts'
// Every CEX venue is served by the CCXT bridge (packages/plugins/src/
// ccxt-connector). Same plugin ids, same manifests, same exported triple as the
// hand-written connectors these replaced, so a saved workspace and a
// provisioned credential still resolve.
export {
  okxMarketConnectorManifest,
  createOkxMarketConnectorPlugin,
  OKX_ADAPTER_INFO,
} from './ccxt-connector/venues/okx.ts'
export {
  binanceMarketConnectorManifest,
  createBinanceMarketConnectorPlugin,
  BINANCE_ADAPTER_INFO,
} from './ccxt-connector/venues/binance.ts'
export {
  bybitMarketConnectorManifest,
  createBybitMarketConnectorPlugin,
  BYBIT_ADAPTER_INFO,
} from './ccxt-connector/venues/bybit.ts'
export {
  bitvavoMarketConnectorManifest,
  createBitvavoMarketConnectorPlugin,
  BITVAVO_ADAPTER_INFO,
} from './ccxt-connector/venues/bitvavo.ts'
export {
  mexcMarketConnectorManifest,
  createMexcMarketConnectorPlugin,
  MEXC_ADAPTER_INFO,
} from './ccxt-connector/venues/mexc.ts'
export {
  kucoinMarketConnectorManifest,
  createKucoinMarketConnectorPlugin,
  KUCOIN_ADAPTER_INFO,
} from './ccxt-connector/venues/kucoin.ts'
export {
  gateMarketConnectorManifest,
  createGateMarketConnectorPlugin,
  GATE_ADAPTER_INFO,
} from './ccxt-connector/venues/gate.ts'
export {
  coinbaseMarketConnectorManifest,
  createCoinbaseMarketConnectorPlugin,
  COINBASE_ADAPTER_INFO,
} from './ccxt-connector/venues/coinbase.ts'
export {
  bitgetMarketConnectorManifest,
  createBitgetMarketConnectorPlugin,
  BITGET_ADAPTER_INFO,
} from './ccxt-connector/venues/bitget.ts'
export {
  krakenMarketConnectorManifest,
  createKrakenMarketConnectorPlugin,
  KRAKEN_ADAPTER_INFO,
} from './ccxt-connector/venues/kraken.ts'
export {
  htxMarketConnectorManifest,
  createHtxMarketConnectorPlugin,
  HTX_ADAPTER_INFO,
} from './ccxt-connector/venues/htx.ts'
export {
  cryptocomMarketConnectorManifest,
  createCryptocomMarketConnectorPlugin,
  CRYPTOCOM_ADAPTER_INFO,
} from './ccxt-connector/venues/cryptocom.ts'
export {
  bitfinexMarketConnectorManifest,
  createBitfinexMarketConnectorPlugin,
  BITFINEX_ADAPTER_INFO,
} from './ccxt-connector/venues/bitfinex.ts'
export {
  upbitMarketConnectorManifest,
  createUpbitMarketConnectorPlugin,
  UPBIT_ADAPTER_INFO,
} from './ccxt-connector/venues/upbit.ts'
// Perpetual futures ride a parallel runtime (packages/plugins/src/
// ccxt-futures-connector): pair keys carry a settlement leg, the markets table
// filters and caches under its own namespace, and orders are contract counts —
// all three of which the spot bridge is written against the opposite of.
export {
  binanceFuturesMarketConnectorManifest,
  createBinanceFuturesMarketConnectorPlugin,
  BINANCE_FUTURES_ADAPTER_INFO,
} from './ccxt-futures-connector/venues/binance-futures.ts'
export {
  kucoinFuturesMarketConnectorManifest,
  createKucoinFuturesMarketConnectorPlugin,
  KUCOIN_FUTURES_ADAPTER_INFO,
} from './ccxt-futures-connector/venues/kucoin-futures.ts'
export {
  krakenFuturesMarketConnectorManifest,
  createKrakenFuturesMarketConnectorPlugin,
  KRAKEN_FUTURES_ADAPTER_INFO,
} from './ccxt-futures-connector/venues/kraken-futures.ts'
export {
  alpacaMarketConnectorManifest,
  createAlpacaMarketConnectorPlugin,
  ALPACA_ADAPTER_INFO,
} from './alpaca-market-connector/index.ts'
// Prediction venues ride a parallel runtime (packages/plugins/src/
// prediction-connector): ccxt's PredictionExchange is outcome-addressed and
// its market rows carry no symbol at all, which the spot bridge's markets
// pipeline, parser and order builder are all written against.
export {
  kalshiMarketConnectorManifest,
  createKalshiMarketConnectorPlugin,
  KALSHI_ADAPTER_INFO,
} from './prediction-connector/venues/kalshi.ts'
export {
  polymarketMarketConnectorManifest,
  createPolymarketMarketConnectorPlugin,
  POLYMARKET_ADAPTER_INFO,
} from './prediction-connector/venues/polymarket.ts'
export {
  groqInferenceManifest,
  createGroqInferencePlugin,
} from './groq-inference/index.ts'
export {
  openaiInferenceManifest,
  createOpenaiInferencePlugin,
} from './openai-inference/index.ts'
export {
  anthropicInferenceManifest,
  createAnthropicInferencePlugin,
} from './anthropic-inference/index.ts'
export {
  openrouterInferenceManifest,
  createOpenrouterInferencePlugin,
} from './openrouter-inference/index.ts'
export {
  pairlensIntelligenceManifest,
  createPairlensIntelligencePlugin,
} from './pairlens-intelligence/index.ts'
export {
  tavilySearchManifest,
  createTavilySearchPlugin,
} from './tavily-search/index.ts'
export { exaSearchManifest, createExaSearchPlugin } from './exa-search/index.ts'
// basic-symbols is deprecated — its functionality is absorbed into pairlens-core.
// Kept for backward compatibility with Registry catalog but not used in terminal.
export {
  basicSymbolsManifest,
  createBasicSymbolsPlugin,
} from './basic-symbols/index.ts'
export {
  pairlensThemeManifest,
  createPairlensThemePlugin,
  zenTradingManifest,
  createZenTradingPlugin,
  cyberpunkNeonManifest,
  createCyberpunkNeonPlugin,
  earthTonesManifest,
  createEarthTonesPlugin,
  terminalClassicManifest,
  createTerminalClassicPlugin,
  cryptoGoldManifest,
  createCryptoGoldPlugin,
  arcticBlueManifest,
  createArcticBluePlugin,
  infraredManifest,
  createInfraredPlugin,
  emeraldMatrixManifest,
  createEmeraldMatrixPlugin,
  royalVioletManifest,
  createRoyalVioletPlugin,
  midnightEmberManifest,
  createMidnightEmberPlugin,
  sakuraBloomManifest,
  createSakuraBloomPlugin,
  electricLimeManifest,
  createElectricLimePlugin,
  burntOrangeManifest,
  createBurntOrangePlugin,
  nightCityManifest,
  createNightCityPlugin,
  eyeComfortManifest,
  createEyeComfortPlugin,
  highContrastManifest,
  createHighContrastPlugin,
  boomergManifest,
  createBoomergPlugin,
} from './themes/index.ts'
export type { ThemeDefinition, ThemeVariableMap } from './themes/index.ts'
export {
  dexpaprikaDataProviderManifest,
  createDexpaprikaDataProviderPlugin,
} from './dexpaprika-data-provider/index.ts'
export {
  geckoterminalDataProviderManifest,
  createGeckoterminalDataProviderPlugin,
} from './geckoterminal-data-provider/index.ts'
export {
  jupiterDexConnectorManifest,
  createJupiterDexConnectorPlugin,
} from './jupiter-dex-connector/index.ts'
