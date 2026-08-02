// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
/**
 * Kraken pair normalization, timeframe mapping, and data parsers.
 *
 * Pair formats:
 * - Pairlens:  "BTC-USDT"
 * - Kraken WS: "BTC/USDT" (slash-separated)
 * - Kraken REST param: "BTCUSDT" (no separator, also accepts alt forms)
 * - Kraken REST response key: variable ("XXBTZUSD", "BTCUSDT", etc.)
 *
 * Kraken quirks:
 * - Bitcoin = XBT (legacy), WS v2 accepts BTC as alias
 * - Dogecoin = XDG (legacy), WS v2 accepts DOGE
 * - REST response keys may have X/Z prefixes on legacy assets
 */

import type { Candle, TickerSnapshot } from '@pairlens/market-engine/types'

// ── Pair normalization ──

/** Pairlens "BTC-USDT" → Kraken WS "BTC/USDT" */
export function toWsPair(pair: string): string {
  return pair.replace('-', '/')
}

/** Pairlens "BTC-USDT" → Kraken REST "BTCUSDT" */
export function toRestPair(pair: string): string {
  return pair.replace('-', '').toUpperCase()
}

/** Kraken WS "BTC/USDT" → Pairlens "BTC-USDT" */
export function fromWsPair(symbol: string): string {
  return symbol.replace('/', '-')
}

// ── Timeframe mapping ──

const TF_TO_INTERVAL: Record<string, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
  '1w': 10080,
}

const INTERVAL_TO_TF: Record<number, string> = {
  1: '1m',
  5: '5m',
  15: '15m',
  30: '30m',
  60: '1h',
  240: '4h',
  1440: '1d',
  10080: '1w',
}

/** Pairlens timeframe → Kraken WS interval (minutes). */
export function toInterval(tf: string): number | undefined {
  return TF_TO_INTERVAL[tf]
}

/** Kraken WS interval → Pairlens timeframe. */
export function fromInterval(interval: number): string | undefined {
  return INTERVAL_TO_TF[interval]
}

/** Pairlens timeframe → Kraken REST interval (same numeric minutes). */
export function toRestInterval(tf: string): number | undefined {
  return TF_TO_INTERVAL[tf]
}

// ── Data parsers ──

/**
 * Parse REST OHLC row: [time, "open", "high", "low", "close", "vwap", "volume", count]
 * Prices are strings, timestamps are Unix seconds (integer).
 */
export function parseRestCandle(row: Array<string | number>): Candle | null {
  if (row.length < 7) return null
  return {
    ts: (row[0] as number) * 1000,
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6]),
  }
}

/**
 * Parse WS v2 OHLC data item.
 * All values are numbers; interval_begin is RFC3339 string.
 */
export function parseWsCandle(data: {
  interval_begin: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}): Candle {
  return {
    ts: new Date(data.interval_begin).getTime(),
    open: data.open,
    high: data.high,
    low: data.low,
    close: data.close,
    volume: data.volume,
  }
}

/** Parse WS v2 ticker data item. */
export function parseWsTicker(data: {
  last: number
  bid: number
  ask: number
  high: number
  low: number
  volume: number
  change: number
  change_pct: number
  timestamp?: string
}): TickerSnapshot {
  return {
    last: data.last,
    bid: data.bid,
    ask: data.ask,
    high24h: data.high,
    low24h: data.low,
    volume24h: data.volume,
    change24h: data.change_pct,
    ts: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
  }
}

// ── REST balance asset name cleanup ──

const ASSET_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XDG: 'DOGE',
}

/**
 * Clean Kraken REST asset name: strip X/Z prefixes, map legacy aliases.
 * "XXBT" → "BTC", "ZUSD" → "USD", "SOL" → "SOL", "USD.M" → skip (staking)
 */
export function cleanAssetName(raw: string): string | null {
  // Skip staking/earn variants
  if (raw.includes('.')) return null

  let name = raw
  // Strip X prefix for crypto or Z prefix for fiat on 4-char legacy names
  if (name.length === 4 && (name.startsWith('X') || name.startsWith('Z'))) {
    name = name.slice(1)
  }

  return ASSET_ALIASES[name] ?? name
}

// ── Bulk ticker snapshot parsing ──

// Kraken's classic currency codes → canonical tickers.
const KRAKEN_CURRENCY_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XDG: 'DOGE',
}

/** Kraken wsname 'XBT/USD' → canonical 'BTC-USD'; null when malformed. */
export function krakenWsNameToCanonical(wsname: string): string | null {
  const [base, quote] = wsname.split('/')
  if (!base || !quote) return null
  return `${KRAKEN_CURRENCY_ALIASES[base] ?? base}-${
    KRAKEN_CURRENCY_ALIASES[quote] ?? quote
  }`
}

/**
 * One /0/public/Ticker entry (keyed by internal pair name, so the caller
 * resolves `wsname` via /0/public/AssetPairs) → bulk-quote entry.
 * c[0] is the last trade; o is today's opening price.
 */
export function parseKrakenBulkEntry(
  wsname: string,
  data: { c?: Array<string>; o?: string },
): BulkTickerEntry | null {
  const symbol = krakenWsNameToCanonical(wsname)
  if (!symbol) return null
  const last = Number(data.c?.[0] ?? 0)
  if (!Number.isFinite(last) || last <= 0) return null
  const open = Number(data.o ?? 0)
  return {
    symbol,
    price: last,
    change24h: open > 0 ? ((last - open) / open) * 100 : 0,
  }
}
