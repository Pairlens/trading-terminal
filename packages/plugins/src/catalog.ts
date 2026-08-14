// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  Instrument,
  InstrumentCategory,
  InstrumentPage,
} from '@pairlens/shared/instrument-types'

// ── Base assets ────────────────────────────────────────────────────
// Each base asset defines the coin metadata. Pairs are generated as
// BASE × QUOTE at runtime, so adding a quote currency automatically
// expands the catalog for every base asset.

type BaseAsset = {
  base: string
  name: string
  categories: Array<InstrumentCategory>
  rank: number
  featured?: boolean
}

const BASE_ASSETS: Array<BaseAsset> = [
  {
    base: 'BTC',
    name: 'Bitcoin',
    categories: ['layer1'],
    rank: 1,
    featured: true,
  },
  {
    base: 'ETH',
    name: 'Ethereum',
    categories: ['layer1', 'defi'],
    rank: 2,
    featured: true,
  },
  {
    base: 'SOL',
    name: 'Solana',
    categories: ['layer1'],
    rank: 3,
    featured: true,
  },
  {
    base: 'BNB',
    name: 'BNB',
    categories: ['layer1', 'infrastructure'],
    rank: 4,
  },
  { base: 'AVAX', name: 'Avalanche', categories: ['layer1'], rank: 5 },
  { base: 'ADA', name: 'Cardano', categories: ['layer1'], rank: 6 },
  {
    base: 'DOT',
    name: 'Polkadot',
    categories: ['layer1', 'infrastructure'],
    rank: 7,
  },
  {
    base: 'MATIC',
    name: 'Polygon',
    categories: ['layer1', 'infrastructure'],
    rank: 8,
  },
  { base: 'NEAR', name: 'NEAR Protocol', categories: ['layer1'], rank: 9 },
  {
    base: 'ATOM',
    name: 'Cosmos',
    categories: ['layer1', 'infrastructure'],
    rank: 10,
  },
  { base: 'SUI', name: 'Sui', categories: ['layer1'], rank: 11 },
  { base: 'APT', name: 'Aptos', categories: ['layer1'], rank: 12 },
  { base: 'UNI', name: 'Uniswap', categories: ['defi'], rank: 13 },
  { base: 'AAVE', name: 'Aave', categories: ['defi'], rank: 14 },
  {
    base: 'LINK',
    name: 'Chainlink',
    categories: ['defi', 'infrastructure'],
    rank: 15,
  },
  { base: 'MKR', name: 'Maker', categories: ['defi'], rank: 16 },
  { base: 'CRV', name: 'Curve', categories: ['defi'], rank: 17 },
  { base: 'DOGE', name: 'Dogecoin', categories: ['meme'], rank: 18 },
  { base: 'SHIB', name: 'Shiba Inu', categories: ['meme'], rank: 19 },
  { base: 'PEPE', name: 'Pepe', categories: ['meme'], rank: 20 },
  { base: 'WIF', name: 'dogwifhat', categories: ['meme'], rank: 21 },
  { base: 'FET', name: 'Fetch.ai', categories: ['ai'], rank: 22 },
  {
    base: 'RENDER',
    name: 'Render',
    categories: ['ai', 'infrastructure'],
    rank: 23,
  },
  {
    base: 'AR',
    name: 'Arweave',
    categories: ['ai', 'infrastructure'],
    rank: 24,
  },
  { base: 'IMX', name: 'Immutable', categories: ['gaming'], rank: 25 },
  { base: 'GALA', name: 'Gala', categories: ['gaming'], rank: 26 },
  { base: 'AXS', name: 'Axie Infinity', categories: ['gaming'], rank: 27 },
  { base: 'XRP', name: 'XRP', categories: ['layer1'], rank: 28 },
  { base: 'TON', name: 'Toncoin', categories: ['layer1'], rank: 29 },
  {
    base: 'TRX',
    name: 'TRON',
    categories: ['layer1', 'infrastructure'],
    rank: 30,
  },
  { base: 'LTC', name: 'Litecoin', categories: ['layer1'], rank: 31 },
]

// ── US stocks & ETFs ───────────────────────────────────────────────
// Curated large-cap equities and index ETFs, quoted in USD. Served with
// assetClass 'stocks' so the pair picker's Stocks tab and stock-broker
// connectors (Alpaca) can discover them. Ranks start after every crypto
// quote tier so the mixed "All" view keeps its existing crypto ordering.

type StockAsset = {
  symbol: string
  name: string
  featured?: boolean
}

const STOCK_ASSETS: Array<StockAsset> = [
  { symbol: 'AAPL', name: 'Apple', featured: true },
  { symbol: 'NVDA', name: 'NVIDIA', featured: true },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'TSLA', name: 'Tesla', featured: true },
  { symbol: 'AVGO', name: 'Broadcom' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'ORCL', name: 'Oracle' },
  { symbol: 'CRM', name: 'Salesforce' },
  { symbol: 'ADBE', name: 'Adobe' },
  { symbol: 'INTC', name: 'Intel' },
  { symbol: 'PLTR', name: 'Palantir' },
  { symbol: 'JPM', name: 'JPMorgan Chase' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'MA', name: 'Mastercard' },
  { symbol: 'BAC', name: 'Bank of America' },
  { symbol: 'GS', name: 'Goldman Sachs' },
  { symbol: 'COIN', name: 'Coinbase' },
  { symbol: 'HOOD', name: 'Robinhood' },
  { symbol: 'MSTR', name: 'Strategy' },
  { symbol: 'PYPL', name: 'PayPal' },
  { symbol: 'SOFI', name: 'SoFi Technologies' },
  { symbol: 'LLY', name: 'Eli Lilly' },
  { symbol: 'UNH', name: 'UnitedHealth' },
  { symbol: 'JNJ', name: 'Johnson & Johnson' },
  { symbol: 'XOM', name: 'Exxon Mobil' },
  { symbol: 'CVX', name: 'Chevron' },
  { symbol: 'WMT', name: 'Walmart' },
  { symbol: 'COST', name: 'Costco' },
  { symbol: 'PG', name: 'Procter & Gamble' },
  { symbol: 'KO', name: 'Coca-Cola' },
  { symbol: 'PEP', name: 'PepsiCo' },
  { symbol: 'HD', name: 'Home Depot' },
  { symbol: 'DIS', name: 'Disney' },
  { symbol: 'UBER', name: 'Uber' },
  { symbol: 'ABNB', name: 'Airbnb' },
  { symbol: 'SHOP', name: 'Shopify' },
  { symbol: 'BA', name: 'Boeing' },
  { symbol: 'CAT', name: 'Caterpillar' },
  { symbol: 'GE', name: 'GE Aerospace' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', featured: true },
  { symbol: 'QQQ', name: 'Invesco QQQ (Nasdaq-100)' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
  { symbol: 'VTI', name: 'Vanguard Total Market ETF' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF' },
  { symbol: 'DIA', name: 'SPDR Dow Jones ETF' },
  { symbol: 'GLD', name: 'SPDR Gold Shares' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury ETF' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF' },
]

// ── Quote currencies ───────────────────────────────────────────────
// Index determines rank offset: USDT pairs rank at baseRank,
// USDC at baseRank + 100, EUR at baseRank + 200, etc.
// Featured flag only applies to the first quote (USDT).

const QUOTE_CURRENCIES = ['USDT', 'USDC', 'EUR', 'USD', 'BTC', 'ETH'] as const

// ── M×N generation ─────────────────────────────────────────────────

const RANK_OFFSET = BASE_ASSETS.length + 10 // gap between quote tiers

function generateCatalog(): Array<Instrument> {
  const instruments: Array<Instrument> = []
  for (let qi = 0; qi < QUOTE_CURRENCIES.length; qi++) {
    const quote = QUOTE_CURRENCIES[qi]
    for (const asset of BASE_ASSETS) {
      // Skip identity pairs (e.g. BTC-BTC, ETH-ETH)
      if (asset.base === quote) continue
      const symbol = `${asset.base}-${quote}`
      instruments.push({
        id: symbol,
        kind: 'cex-pair',
        market: '',
        symbol,
        name: asset.name,
        base: asset.base,
        quote,
        assetClass: 'crypto',
        categories: asset.categories,
        rank: asset.rank + qi * RANK_OFFSET,
        featured: qi === 0 && (asset.featured ?? false),
      })
    }
  }

  // Stocks rank after all crypto quote tiers so the mixed view is stable.
  // The symbol is the bare ticker — same key the App Server catalog serves, so
  // a watchlist saved online still resolves when this fallback takes over.
  const stockRankBase = QUOTE_CURRENCIES.length * RANK_OFFSET
  for (let i = 0; i < STOCK_ASSETS.length; i++) {
    const stock = STOCK_ASSETS[i]
    const symbol = stock.symbol
    instruments.push({
      id: symbol,
      kind: 'equity',
      market: '',
      symbol,
      name: stock.name,
      base: stock.symbol,
      quote: 'USD',
      assetClass: 'stocks',
      categories: [],
      rank: stockRankBase + i,
      featured: stock.featured ?? false,
    })
  }

  return instruments
}

// Cached — generated once
let _catalog: Array<Instrument> | null = null
function getCatalog(): Array<Instrument> {
  if (!_catalog) _catalog = generateCatalog()
  return _catalog
}

// ── Query engine (shared by pairlens-core + basic-symbols) ─────────

export function toInstruments(market: string): Array<Instrument> {
  return getCatalog().map((inst) => ({
    ...inst,
    id: `${market}:${inst.symbol}`,
    market,
  }))
}

export function queryInstruments(
  market: string,
  p: Record<string, unknown>,
): InstrumentPage {
  const offset = typeof p['offset'] === 'number' ? p['offset'] : 0
  const limit = typeof p['limit'] === 'number' ? p['limit'] : 50
  const category = p['category'] as InstrumentCategory | undefined
  const assetClass = p['assetClass'] ? String(p['assetClass']) : undefined
  const q = p['q'] ? String(p['q']).toLowerCase() : undefined
  const symbolsRaw = p['symbols'] ? String(p['symbols']) : undefined

  let all = toInstruments(market)

  if (assetClass) {
    all = all.filter((inst) => inst.assetClass === assetClass)
  }

  if (symbolsRaw) {
    const symbolSet = new Set(symbolsRaw.split(',').filter(Boolean))
    const matched = all.filter((inst) => symbolSet.has(inst.symbol))
    matched.sort((a, b) => a.rank - b.rank)
    return { items: matched, total: matched.length, hasMore: false }
  }

  if (category) {
    all = all.filter((inst) => inst.categories.includes(category))
  }

  if (q) {
    all = all.filter(
      (inst) =>
        inst.symbol.toLowerCase().includes(q) ||
        inst.name.toLowerCase().includes(q) ||
        inst.base.toLowerCase().includes(q) ||
        inst.quote.toLowerCase().includes(q),
    )
  }

  all.sort((a, b) => a.rank - b.rank)

  const total = all.length
  const paged = all.slice(offset, offset + limit)

  return { items: paged, total, hasMore: offset + limit < total }
}
