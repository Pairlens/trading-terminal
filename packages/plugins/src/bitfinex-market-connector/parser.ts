// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'
/**
 * Bitfinex pair normalization, timeframe mapping, and data parsers.
 *
 * Bitfinex uses TWO symbol formats:
 *
 * 1. **Candle key** format (full currency names, colon-separated):
 *    `tBTC:USDT`, `tDOGE:USD` — used inside candle keys like `trade:1h:tBTC:USDT`
 *
 * 2. **Pair** format (Bitfinex-specific abbreviations):
 *    `tBTCUST`, `tDOGE:UST` — used for ticker/book/trades symbol field.
 *    USDT → UST, USDC → UDC in pair names.
 *    Short pairs (both ≤3 chars after aliasing): concatenated `tBTCUST`
 *    Long pairs (any >3 chars after aliasing): colon `tDOGE:UST`
 *
 * Candle fields (OCHLV — NOT OHLCV):
 *   [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME]
 *
 * Amount sign encodes side: positive = buy/bid, negative = sell/ask.
 */

import type { Candle, TickerSnapshot } from '@pairlens/market-engine/types'

// ── Currency aliasing ──
// Bitfinex uses abbreviated currency codes in pair names

const CURRENCY_TO_BFX: Record<string, string> = {
  USDT: 'UST',
  USDC: 'UDC',
  DASH: 'DSH',
  IOTA: 'IOT',
  ALGO: 'ALG',
  ATOM: 'ATO',
}

const BFX_TO_CURRENCY: Record<string, string> = {
  UST: 'USDT',
  UDC: 'USDC',
  DSH: 'DASH',
  IOT: 'IOTA',
  ALG: 'ALGO',
  ATO: 'ATOM',
}

function toBfxCurrency(ccy: string): string {
  return CURRENCY_TO_BFX[ccy] ?? ccy
}

function fromBfxCurrency(ccy: string): string {
  return BFX_TO_CURRENCY[ccy] ?? ccy
}

// ── Pair normalization ──

/**
 * Pairlens "BTC-USDT" → Bitfinex candle key symbol "tBTC:USDT"
 * Used inside candle key: `trade:1h:tBTC:USDT`
 */
export function toBfxCandleSymbol(pair: string): string {
  const [base, quote] = pair.split('-')
  if (!base || !quote) return `t${pair.replace('-', '')}`
  if (base.length > 3 || quote.length > 3) {
    return `t${base}:${quote}`
  }
  return `t${base}${quote}`
}

/**
 * Pairlens "BTC-USDT" → Bitfinex pair symbol "tBTCUST"
 * Used for ticker/book/trades subscribe symbol field.
 * Applies currency aliasing (USDT→UST, USDC→UDC).
 */
export function toBfxSymbol(pair: string): string {
  const [base, quote] = pair.split('-')
  if (!base || !quote) return `t${pair.replace('-', '')}`
  const bBase = toBfxCurrency(base)
  const bQuote = toBfxCurrency(quote)
  if (bBase.length > 3 || bQuote.length > 3) {
    return `t${bBase}:${bQuote}`
  }
  return `t${bBase}${bQuote}`
}

/** Bitfinex "tBTCUST" or "tDOGE:UST" → Pairlens "BTC-USDT" or "DOGE-USDT" */
export function fromBfxSymbol(symbol: string): string {
  // Strip 't' prefix
  const raw = symbol.startsWith('t') ? symbol.slice(1) : symbol

  // Colon-separated
  if (raw.includes(':')) {
    const [base, quote] = raw.split(':')
    return `${fromBfxCurrency(base)}-${fromBfxCurrency(quote)}`
  }

  // Short pairs: always 6 chars (3+3)
  if (raw.length === 6) {
    const base = fromBfxCurrency(raw.slice(0, 3))
    const quote = fromBfxCurrency(raw.slice(3))
    return `${base}-${quote}`
  }

  // Fallback
  return raw
}

// ── Timeframe mapping ──

const TF_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h', // Bitfinex doesn't have 2h, map 4h directly
  '1d': '1D',
  '1w': '1W',
  // Bitfinex has no 3-day timeframe — '3d' stays unmapped (unsupported).
  '1M': '1M',
}

const REVERSE_TF: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
}

/** Pairlens timeframe → Bitfinex timeframe string. */
export function toBfxTimeframe(tf: string): string | undefined {
  return TF_MAP[tf]
}

/** Bitfinex timeframe → Pairlens timeframe. */
export function fromBfxTimeframe(tf: string): string | undefined {
  return REVERSE_TF[tf]
}

// ── Data parsers ──

/**
 * Parse Bitfinex candle array.
 * Bitfinex uses OCHLV order: [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME]
 * NOT the standard OHLCV.
 */
export function parseBfxCandle(arr: Array<number>): Candle {
  return {
    ts: arr[0],
    open: arr[1],
    high: arr[3], // index 3, NOT 2
    low: arr[4],
    close: arr[2], // index 2, NOT 3
    volume: arr[5],
  }
}

/**
 * Parse Bitfinex ticker array (10 fields for trading pairs).
 * [BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_RELATIVE, LAST_PRICE, VOLUME, HIGH, LOW]
 */
export function parseBfxTicker(arr: Array<number>): TickerSnapshot {
  return {
    bid: arr[0],
    ask: arr[2],
    last: arr[6],
    volume24h: arr[7],
    high24h: arr[8],
    low24h: arr[9],
    change24h: (arr[5] ?? 0) * 100, // DAILY_CHANGE_RELATIVE is decimal
    ts: Date.now(),
  }
}

// ── Bulk ticker snapshot parsing ──

/**
 * One row of /v2/tickers?symbols=ALL → bulk-quote entry. Trading rows
 * start with 't' (funding rows 'f' are skipped): [SYMBOL, BID, BID_SIZE,
 * ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_RELATIVE, LAST_PRICE, ...].
 */
export function parseBfxBulkTickerRow(
  row: Array<unknown>,
): BulkTickerEntry | null {
  const raw = String(row[0] ?? '')
  if (!raw.startsWith('t')) return null
  const symbol = fromBfxSymbol(raw)
  if (!symbol.includes('-')) return null
  const price = Number(row[7] ?? 0)
  if (!Number.isFinite(price) || price <= 0) return null
  return { symbol, price, change24h: Number(row[6] ?? 0) * 100 }
}
