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

/**
 * What a name does for a living, curated.
 *
 * Deliberately NOT a GICS sector: those are licensed, and the eleven of them
 * put NVIDIA and Adobe in the same bucket, which is useless on a movers row
 * where the whole job of the label is to say why this ticker sits next to that
 * one. These are trading-desk groupings instead, and they are stated as
 * curation rather than derived from a provider, because per-symbol fundamentals
 * would be one request per row.
 */
export type StockSector =
  | 'software'
  | 'semiconductors'
  | 'internet'
  | 'hardware'
  | 'banks'
  | 'payments'
  | 'cryptoEquity'
  | 'healthcare'
  | 'energy'
  | 'retail'
  | 'staples'
  | 'media'
  | 'travel'
  | 'industrials'
  | 'autos'
  | 'etfEquity'
  | 'etfBonds'
  | 'etfCommodity'

type StockAsset = {
  symbol: string
  name: string
  sector: StockSector
  featured?: boolean
}

const STOCK_ASSETS: Array<StockAsset> = [
  { symbol: 'AAPL', name: 'Apple', sector: 'hardware', featured: true },
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'semiconductors', featured: true },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'software' },
  { symbol: 'GOOGL', name: 'Alphabet', sector: 'internet' },
  { symbol: 'AMZN', name: 'Amazon', sector: 'internet' },
  { symbol: 'META', name: 'Meta Platforms', sector: 'internet' },
  { symbol: 'TSLA', name: 'Tesla', sector: 'autos', featured: true },
  { symbol: 'AVGO', name: 'Broadcom', sector: 'semiconductors' },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    sector: 'semiconductors',
  },
  { symbol: 'NFLX', name: 'Netflix', sector: 'media' },
  { symbol: 'ORCL', name: 'Oracle', sector: 'software' },
  { symbol: 'CRM', name: 'Salesforce', sector: 'software' },
  { symbol: 'ADBE', name: 'Adobe', sector: 'software' },
  { symbol: 'INTC', name: 'Intel', sector: 'semiconductors' },
  { symbol: 'PLTR', name: 'Palantir', sector: 'software' },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'banks' },
  { symbol: 'V', name: 'Visa', sector: 'payments' },
  { symbol: 'MA', name: 'Mastercard', sector: 'payments' },
  { symbol: 'BAC', name: 'Bank of America', sector: 'banks' },
  { symbol: 'GS', name: 'Goldman Sachs', sector: 'banks' },
  { symbol: 'COIN', name: 'Coinbase', sector: 'cryptoEquity' },
  { symbol: 'HOOD', name: 'Robinhood', sector: 'payments' },
  { symbol: 'MSTR', name: 'Strategy', sector: 'cryptoEquity' },
  { symbol: 'PYPL', name: 'PayPal', sector: 'payments' },
  { symbol: 'SOFI', name: 'SoFi Technologies', sector: 'banks' },
  { symbol: 'LLY', name: 'Eli Lilly', sector: 'healthcare' },
  { symbol: 'UNH', name: 'UnitedHealth', sector: 'healthcare' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'healthcare' },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'energy' },
  { symbol: 'CVX', name: 'Chevron', sector: 'energy' },
  { symbol: 'WMT', name: 'Walmart', sector: 'retail' },
  { symbol: 'COST', name: 'Costco', sector: 'retail' },
  { symbol: 'PG', name: 'Procter & Gamble', sector: 'staples' },
  { symbol: 'KO', name: 'Coca-Cola', sector: 'staples' },
  { symbol: 'PEP', name: 'PepsiCo', sector: 'staples' },
  { symbol: 'HD', name: 'Home Depot', sector: 'retail' },
  { symbol: 'DIS', name: 'Disney', sector: 'media' },
  { symbol: 'UBER', name: 'Uber', sector: 'travel' },
  { symbol: 'ABNB', name: 'Airbnb', sector: 'travel' },
  { symbol: 'SHOP', name: 'Shopify', sector: 'software' },
  { symbol: 'BA', name: 'Boeing', sector: 'industrials' },
  { symbol: 'CAT', name: 'Caterpillar', sector: 'industrials' },
  { symbol: 'GE', name: 'GE Aerospace', sector: 'industrials' },
  {
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF',
    sector: 'etfEquity',
    featured: true,
  },
  { symbol: 'QQQ', name: 'Invesco QQQ (Nasdaq-100)', sector: 'etfEquity' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', sector: 'etfEquity' },
  { symbol: 'VTI', name: 'Vanguard Total Market ETF', sector: 'etfEquity' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', sector: 'etfEquity' },
  { symbol: 'DIA', name: 'SPDR Dow Jones ETF', sector: 'etfEquity' },
  { symbol: 'GLD', name: 'SPDR Gold Shares', sector: 'etfCommodity' },
  {
    symbol: 'TLT',
    name: 'iShares 20+ Year Treasury ETF',
    sector: 'etfBonds',
  },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', sector: 'etfEquity' },
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

/**
 * Ticker symbols of every stock and ETF in the bundled catalog.
 *
 * This IS the stock universe the app surfaces, so it is also the right symbol
 * set for a broker's bulk quote snapshot: Alpaca's snapshots endpoint takes an
 * explicit list rather than returning every listing the way a CEX ticker
 * endpoint does.
 */
export function stockSymbols(): Array<string> {
  return STOCK_ASSETS.map((s) => s.symbol)
}

/**
 * The curated sector of one ticker, or null for anything not in the catalog.
 *
 * Read by the terminal's movers rows, which need a one-word reason a stock sits
 * where it does and cannot spend a fundamentals request per row to get one.
 * Null is a real answer: a symbol from a broker's own universe that this
 * catalog never listed gets no label rather than a guessed one.
 */
export function stockSector(symbol: string): StockSector | null {
  const upper = symbol.toUpperCase()
  return STOCK_ASSETS.find((s) => s.symbol === upper)?.sector ?? null
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
