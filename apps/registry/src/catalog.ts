// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  alpacaMarketConnectorManifest,
  anthropicInferenceManifest,
  arcticBlueManifest,
  binanceMarketConnectorManifest,
  bitfinexMarketConnectorManifest,
  bitgetMarketConnectorManifest,
  bitvavoMarketConnectorManifest,
  boomergManifest,
  bybitMarketConnectorManifest,
  coinbaseMarketConnectorManifest,
  cryptoGoldManifest,
  cryptocomMarketConnectorManifest,
  cyberpunkNeonManifest,
  earthTonesManifest,
  emeraldMatrixManifest,
  gateMarketConnectorManifest,
  groqInferenceManifest,
  htxMarketConnectorManifest,
  infraredManifest,
  krakenMarketConnectorManifest,
  kucoinMarketConnectorManifest,
  mexcMarketConnectorManifest,
  midnightEmberManifest,
  okxMarketConnectorManifest,
  openaiInferenceManifest,
  pairlensCoreManifest,
  pairlensIntelligenceManifest,
  royalVioletManifest,
  sakuraBloomManifest,
  terminalClassicManifest,
  upbitMarketConnectorManifest,
} from '@pairlens/plugins/all'

import type {
  RegistryCategory,
  RegistryPluginEntry,
} from '@pairlens/shared/registry-types'

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CATEGORIES: Array<RegistryCategory> = [
  {
    id: 'platform',
    label: 'Platform',
    description: 'Core services routing through the Pairlens server',
    iconName: 'shield-check',
  },
  {
    id: 'exchange',
    label: 'Exchange',
    description: 'Direct exchange connections for market data and trading',
    iconName: 'unplug',
  },
  {
    id: 'broker',
    label: 'Brokers',
    description: 'Stock broker connections for equities data and trading',
    iconName: 'landmark',
  },
  {
    id: 'ai',
    label: 'AI Providers',
    description: 'Language model providers for AI co-pilot analysis',
    iconName: 'brain',
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    description: 'Signal detection and strategy computation',
    iconName: 'cpu',
  },
  {
    id: 'discovery',
    label: 'Discovery',
    description: 'Instrument catalogs for browsing available trading pairs',
    iconName: 'compass',
  },
  {
    id: 'themes',
    label: 'Themes',
    description:
      'Visual themes that override colors, chart palette, and UI styling',
    iconName: 'palette',
  },
]

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const CATALOG: Array<RegistryPluginEntry> = [
  {
    manifest: pairlensCoreManifest,
    category: 'platform',
    tagline:
      'Core trading terminal — charts, order books, trade entry, and market discovery',
    longDescription:
      'The structural backbone of the Pairlens terminal. Provides all core UI panels including candlestick charts, order books, market depth, trade entry, positions, risk guardrails, markets browser, watchlists, and a web pane. Also includes a hardcoded catalog of popular crypto trading pairs for offline browsing.',
    featured: true,
    featuredImage:
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0',
    featuredTitle: 'The complete trading terminal',
    featuredText:
      'Charts, order books, trade entry, risk guardrails, and market discovery — everything you need for spot trading in one plugin.',
    bundled: true,
  },
  {
    manifest: pairlensIntelligenceManifest,
    category: 'intelligence',
    tagline: 'AI co-pilot, news, discovery, and market insights by Pairlens',
    longDescription:
      'The Pairlens Intelligence plugin provides AI-powered trade analysis, instrument discovery, real-time news feeds, fear & greed index, top coins rankings, and market heatmaps — all powered by the Pairlens backend. No API keys required.',
    featured: true,
    featuredImage:
      'https://images.unsplash.com/photo-1617751585781-cd7ea2023587?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    featuredTitle: 'AI-powered market intelligence',
    featuredText:
      'AI co-pilot analysis, real-time news, instrument discovery, and market insights — all built-in with zero configuration.',
    bundled: true,
  },
  {
    manifest: groqInferenceManifest,
    category: 'ai',
    tagline: 'Ultra-fast LLM inference powered by Groq hardware',
    longDescription:
      "Leverage Groq's custom Language Processing Units for the fastest available LLM inference. Supports Llama 3.3 70B and other models with sub-second response times. Requires a Groq API key. Excellent for real-time co-pilot analysis where latency matters.",
    featured: true,
    featuredImage:
      'https://cdn.sanity.io/images/chol0sk5/production/ce0b2266373b3c9722b0bccb9a98441c26c89696-1200x630.png',
    featuredTitle: 'Lightning-fast AI co-pilot',
    featuredText:
      "Groq's custom LPU hardware delivers sub-second LLM inference for real-time trade analysis. The fastest way to get AI-powered signal evaluation.",
    bundled: true,
  },
  {
    manifest: openaiInferenceManifest,
    category: 'ai',
    tagline: 'AI inference via OpenAI GPT models',
    longDescription:
      "Connect to OpenAI's GPT model family for AI co-pilot analysis. Supports GPT-4o, GPT-4o-mini, and other available models. Requires an OpenAI API key. Provides high-quality reasoning for signal evaluation, market context, and trade recommendations.",
    bundled: true,
  },
  {
    manifest: anthropicInferenceManifest,
    category: 'ai',
    tagline: 'AI inference via Anthropic Claude models',
    longDescription:
      "Connect to Anthropic's Claude model family for AI co-pilot analysis. Supports Claude Sonnet, Opus, and Haiku variants. Requires an Anthropic API key. Known for nuanced reasoning and careful risk assessment in trading contexts.",
    bundled: true,
  },
  // --- Exchange connectors ---
  {
    manifest: okxMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Direct market data and spot trading via OKX exchange APIs',
    longDescription:
      'Connect directly to OKX for real-time candle streaming, order book depth, ticker prices, and spot trading. Supports global, US, and EU regional endpoints with automatic routing based on your country setting. Paper trading supported.',
    bundled: true,
  },
  {
    manifest: binanceMarketConnectorManifest,
    category: 'exchange',
    tagline:
      "Market data and spot trading via Binance — the world's largest exchange",
    longDescription:
      'Stream live candles, order books, and ticker data directly from Binance. Place and manage spot orders with full trading support. Automatically routes to Binance US for US-based users. Paper trading supported via Binance testnet.',
    bundled: true,
  },
  {
    manifest: bybitMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via ByBit exchange',
    longDescription:
      'Stream live candles, order books, and ticker data directly from ByBit. Place and manage spot orders with full trading support. EU users are routed to bybit.nl. Paper trading supported via ByBit testnet. Not available in the US.',
    bundled: true,
  },
  {
    manifest: bitvavoMarketConnectorManifest,
    category: 'exchange',
    tagline:
      'Market data and spot trading via Bitvavo — the EUR-focused EU exchange',
    longDescription:
      'Stream live candles, order books, and ticker data directly from Bitvavo, the Amsterdam-based, DNB-registered exchange with deep EUR liquidity. Place and manage spot orders with full trading support. Uses HMAC-SHA256 authentication. Not available in the US.',
    bundled: true,
  },
  {
    manifest: mexcMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via MEXC exchange',
    longDescription:
      'Stream live candles, order books, and ticker data from MEXC. Place and manage spot orders with full trading support. Zero spot trading fees. Not available in the US, UK, or Canada.',
    bundled: true,
  },
  {
    manifest: kucoinMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via KuCoin exchange',
    longDescription:
      'Stream live candles, order books, and ticker data from KuCoin. Place and manage spot orders with full trading support. EU users are routed to kucoin.eu. Paper trading supported via KuCoin sandbox. Not available in the US.',
    bundled: true,
  },
  {
    manifest: gateMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via Gate.io exchange',
    longDescription:
      'Stream live candles, order books, and ticker data from Gate.io. Place and manage spot orders with full trading support. Paper trading supported via Gate.io testnet.',
    bundled: true,
  },
  {
    manifest: bitgetMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via Bitget exchange',
    longDescription:
      'Stream live candles, order books, and ticker data from Bitget. Place and manage spot orders with full trading support. Paper trading supported via Bitget demo mode.',
    bundled: true,
  },
  {
    manifest: coinbaseMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via Coinbase Advanced Trade',
    longDescription:
      'Stream live candles, order books, and ticker data from Coinbase. Place and manage spot orders with full trading support via the Advanced Trade API. Uses ES256 JWT authentication. Paper trading supported via Coinbase sandbox.',
    bundled: true,
  },
  {
    manifest: krakenMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via Kraken exchange',
    longDescription:
      'Stream live candles, order books, and ticker data from Kraken via WebSocket v2. Place and manage spot orders with full trading support. Uses HMAC-SHA512 authentication. Paper trading uses order validation mode.',
    bundled: true,
  },
  {
    manifest: htxMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via HTX (formerly Huobi)',
    longDescription:
      'Stream live candles, order books, and ticker data from HTX. Place and manage spot orders with full trading support. Uses HMAC-SHA256 authentication with SignatureVersion 2.',
    bundled: true,
  },
  {
    manifest: cryptocomMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via Crypto.com exchange',
    longDescription:
      'Stream live candles, order books, and ticker data from Crypto.com. Place and manage spot orders with full trading support. Uses HMAC-SHA256 authentication. Paper trading supported via Crypto.com UAT sandbox.',
    bundled: true,
  },
  {
    manifest: bitfinexMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via Bitfinex exchange',
    longDescription:
      'Stream live candles, order books, and ticker data from Bitfinex. Place and manage spot orders with full trading support. Uses HMAC-SHA384 authentication with array-based WebSocket protocol.',
    bundled: true,
  },
  {
    manifest: upbitMarketConnectorManifest,
    category: 'exchange',
    tagline: 'Market data and spot trading via Upbit Global exchange',
    longDescription:
      'Stream live candles, order books, and ticker data from Upbit Global. Place and manage spot orders with full trading support. Uses JWT HS512 authentication. Regional endpoints for Singapore, Indonesia, and Thailand.',
    bundled: true,
  },
  {
    manifest: alpacaMarketConnectorManifest,
    category: 'broker',
    tagline: 'US stocks and ETFs via the Alpaca broker API',
    longDescription:
      'Trade US equities and ETFs through Alpaca with first-class paper trading. Streams real-time IEX market data over WebSocket and places market and limit orders via the commission-free Trading API. Requires a free Alpaca account — API keys stay on your device.',
    featured: true,
    featuredTitle: 'Trade US equities, commission-free',
    featuredText:
      'US stocks and ETFs through Alpaca with first-class paper trading and real-time IEX market data. Requires a free Alpaca account — API keys stay on your device.',
    bundled: true,
  },
  // --- Themes ---
  {
    manifest: cyberpunkNeonManifest,
    category: 'themes',
    tagline: 'Vibrant cyans, magentas, and electric purples',
    longDescription:
      'A dark-forward theme inspired by neon-lit cityscapes. Electric cyan candles glow against deep purple backgrounds, with magenta accents and high-contrast UI elements. Perfect for late-night trading sessions.',
    bundled: true,
  },
  {
    manifest: earthTonesManifest,
    category: 'themes',
    tagline: 'Warm greens, sage accents, and terracotta touches',
    longDescription:
      'A nature-inspired palette with warm greens, earthy browns, and soft sage tones. Rounded corners and low noise give a calm, organic feel. Ideal for traders who prefer a softer, less aggressive aesthetic.',
    bundled: true,
  },
  {
    manifest: terminalClassicManifest,
    category: 'themes',
    tagline: 'Navy and charcoal inspired by professional trading platforms',
    longDescription:
      'A clean, professional theme with navy blue undertones and charcoal backgrounds. Tight corner radii and subtle borders channel the look of institutional trading terminals. Classic green/red candle colors.',
    bundled: true,
  },
  {
    manifest: cryptoGoldManifest,
    category: 'themes',
    tagline: 'Gold and amber tones with a Bitcoin-inspired palette',
    longDescription:
      'Rich gold accents over deep warm backgrounds evoke the spirit of digital gold. Amber up-candles and steel-blue down-candles create a distinctive, premium trading environment.',
    bundled: true,
  },
  {
    manifest: arcticBlueManifest,
    category: 'themes',
    tagline: 'Cool blue monochrome with icy undertones',
    longDescription:
      'A serene, ice-inspired palette with cool blues ranging from deep navy to pale frost. Rounded UI elements and low noise opacity create a clean, focused environment. Cyan-tinted candles against arctic backgrounds.',
    bundled: true,
  },
  {
    manifest: infraredManifest,
    category: 'themes',
    tagline: 'Ultra-modern crimson with bold red accents',
    longDescription:
      'A high-energy theme built around deep reds and crimson highlights. Bright red up-candles and steel down-candles create a striking, aggressive look suited for active traders who want their UI to match their intensity.',
    bundled: true,
  },
  {
    manifest: emeraldMatrixManifest,
    category: 'themes',
    tagline: 'Deep green with vivid emerald tones and terminal-hacker energy',
    longDescription:
      'Inspired by the digital rain of cyberpunk terminals. Vivid green candles glow against deep forest backgrounds with emerald accents throughout. For traders who want their charts to feel like a command center.',
    bundled: true,
  },
  {
    manifest: royalVioletManifest,
    category: 'themes',
    tagline: 'Rich purple with violet accents and lavender highlights',
    longDescription:
      'A regal palette of deep plums and bright violets. Lavender up-candles and soft pink down-candles create an elegant, distinctive look. Deep purple sidebars and subtle noise give a luxurious feel.',
    bundled: true,
  },
  {
    manifest: midnightEmberManifest,
    category: 'themes',
    tagline: 'Warm dark charcoal with glowing orange-amber accents',
    longDescription:
      'Like a fireplace in a dark room — deep charcoal backgrounds with warm orange ember accents that glow without overwhelming. Amber up-candles and muted steel down-candles create a cozy, focused trading atmosphere.',
    bundled: true,
  },
  {
    manifest: sakuraBloomManifest,
    category: 'themes',
    tagline: 'Delicate cherry blossom pinks with soft rose accents',
    longDescription:
      'A gentle, airy theme inspired by Japanese cherry blossoms. Soft pinks and rose tones with generous corner radii create a light, delicate aesthetic. Low noise opacity keeps the UI clean and inviting.',
    bundled: true,
  },
  {
    manifest: boomergManifest,
    category: 'themes',
    tagline: 'Amber on black in the spirit of a classic Bloomberg terminal',
    longDescription:
      'The institutional terminal look, rebuilt in CSS variables: pure black canvas, amber text, blue selection bars, and square corners on everything. The whole shell switches to a monospace face, so labels and numbers sit on the same grid. Green/red candles and tape stay conventional.',
    bundled: true,
  },

  // --- Remote plugins (not bundled, downloaded from Registry) ---
  {
    manifest: {
      id: 'dev-starter',
      name: 'Dev Starter',
      version: '0.1.0',
      author: 'Pairlens',
      description:
        'A starter plugin demonstrating the Plugin SDK — use as a template for building your own plugins',
      homepage: 'https://pairlens.finance',
      capabilities: [],
      config: {},
      contributes: {
        panels: [
          {
            id: 'hello',
            label: 'Hello World',
            icon: 'Sparkles',
            category: 'discovery',
            description: 'A demo panel showing SDK hooks in action',
          },
        ],
        commands: [
          {
            id: 'greet',
            label: 'Dev Starter: Say Hello',
            icon: 'Sparkles',
          },
        ],
      },
    },
    category: 'discovery',
    tagline:
      'A starter plugin demonstrating the Plugin SDK — build your own plugins with this template',
    longDescription:
      'The Dev Starter plugin is a minimal working example of a Pairlens plugin that uses the Plugin SDK. It contributes a single "Hello World" panel that demonstrates usePanePair(), useAuth(), useNotify(), and other SDK hooks. Use it as a starting point for building your own plugins.',
    moduleUrl: '/static/modules/dev-starter.js',
    latestVersion: '0.1.0',
    bundled: false,
  },
  {
    manifest: {
      id: 'dev-sync',
      name: 'Dev Sync',
      version: '0.1.0',
      author: 'Pairlens',
      description:
        'Demonstrates cross-panel communication via the Service Registry — one panel controls another',
      homepage: 'https://pairlens.finance',
      capabilities: [],
      config: {},
      contributes: {
        panels: [
          {
            id: 'controller',
            label: 'Sync Controller',
            icon: 'Radio',
            category: 'discovery',
            description:
              'Sends commands to the Sync Display panel via the Service Registry',
          },
          {
            id: 'display',
            label: 'Sync Display',
            icon: 'Monitor',
            category: 'discovery',
            description:
              'Receives and renders commands from the Sync Controller panel',
          },
        ],
      },
    },
    category: 'discovery',
    tagline:
      'Cross-panel communication demo — one panel controls another via the Service Registry',
    longDescription:
      'The Dev Sync plugin demonstrates cross-panel communication using the Service Registry. It contributes two panels: a Controller that discovers and calls a service, and a Display that registers the service. Open both panels to see real-time cross-panel sync with color changes, messages, and ping counts. Use this as a template for building plugins that need inter-panel communication.',
    moduleUrl: '/static/modules/dev-sync.js',
    latestVersion: '0.1.0',
    bundled: false,
  },
]
