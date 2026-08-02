// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Per-connector drivers for the live conformance harness.
 *
 * Each connector ships a WsClient class (structurally compatible with
 * WsClientLike) plus a standalone `fetch*Candles` REST fn whose trailing
 * argument differs (country vs. a `paper` boolean). The wrappers below adapt
 * those into the uniform LiveDriver shape so harness.ts can treat every
 * exchange identically.
 */

import { OkxWsClient } from '../../okx-market-connector/ws-client'
import { fetchOkxCandles } from '../../okx-market-connector/rest-client'
import { BinanceWsClient } from '../../binance-market-connector/ws-client'
import { fetchBinanceCandles } from '../../binance-market-connector/rest-client'
import { BybitWsClient } from '../../bybit-market-connector/ws-client'
import { fetchBybitCandles } from '../../bybit-market-connector/rest-client'
import { CoinbaseWsClient } from '../../coinbase-market-connector/ws-client'
import { fetchCoinbaseCandles } from '../../coinbase-market-connector/rest-client'
import { GateWsClient } from '../../gate-market-connector/ws-client'
import { fetchGateCandles } from '../../gate-market-connector/rest-client'
import { HtxWsClient } from '../../htx-market-connector/ws-client'
import { fetchHtxCandles } from '../../htx-market-connector/rest-client'
import { UpbitWsClient } from '../../upbit-market-connector/ws-client'
import { fetchUpbitCandles } from '../../upbit-market-connector/rest-client'
import { KrakenWsClient } from '../../kraken-market-connector/ws-client'
import { fetchKrakenCandles } from '../../kraken-market-connector/rest-client'
import { KucoinWsClient } from '../../kucoin-market-connector/ws-client'
import { fetchKucoinCandles } from '../../kucoin-market-connector/rest-client'
import { MexcWsClient } from '../../mexc-market-connector/ws-client'
import { fetchMexcCandles } from '../../mexc-market-connector/rest-client'
import { BitgetWsClient } from '../../bitget-market-connector/ws-client'
import { fetchBitgetCandles } from '../../bitget-market-connector/rest-client'
import { CryptocomWsClient } from '../../cryptocom-market-connector/ws-client'
import { fetchCryptocomCandles } from '../../cryptocom-market-connector/rest-client'
import { BfxWsClient } from '../../bitfinex-market-connector/ws-client'
import { fetchBfxCandles } from '../../bitfinex-market-connector/rest-client'
import type { LiveDriver } from './harness'

// Default test pair mirrors what the user reports against: BTC-USDT.
// Coinbase's deepest USD book is BTC-USD; each connector's own normalizePair
// maps the canonical base-quote string to its native symbol.
const PAIR = 'BTC-USDT'
const TF = '1m'
const COUNTRY = ''

export const LIVE_DRIVERS: Array<LiveDriver> = [
  {
    name: 'okx',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new OkxWsClient(),
    fetchHistory: (p, tf, limit, country) =>
      fetchOkxCandles(p, tf, limit, country),
  },
  {
    name: 'binance',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new BinanceWsClient(),
    fetchHistory: (p, tf, limit, country) =>
      fetchBinanceCandles(p, tf, limit, country),
  },
  {
    name: 'bybit',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new BybitWsClient(),
    fetchHistory: (p, tf, limit, country) =>
      fetchBybitCandles(p, tf, limit, country),
  },
  {
    name: 'coinbase',
    pair: 'BTC-USD',
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new CoinbaseWsClient(),
    fetchHistory: (p, tf, limit) => fetchCoinbaseCandles(p, tf, limit),
  },
  {
    name: 'gate',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new GateWsClient(),
    // 5th arg is a `paper` flag, NOT country — keep it false.
    fetchHistory: (p, tf, limit) => fetchGateCandles(p, tf, limit, '', false),
  },
  {
    name: 'htx',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new HtxWsClient(),
    fetchHistory: (p, tf, limit) => fetchHtxCandles(p, tf, limit),
  },
  {
    name: 'upbit',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new UpbitWsClient(),
    fetchHistory: (p, tf, limit, country) =>
      fetchUpbitCandles(p, tf, limit, country),
  },
  {
    name: 'kraken',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new KrakenWsClient(),
    fetchHistory: (p, tf, limit) => fetchKrakenCandles(p, tf, limit),
  },
  {
    name: 'kucoin',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new KucoinWsClient(),
    fetchHistory: (p, tf, limit, country) =>
      fetchKucoinCandles(p, tf, limit, country),
  },
  {
    name: 'mexc',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new MexcWsClient(),
    fetchHistory: (p, tf, limit, country) =>
      fetchMexcCandles(p, tf, limit, country),
  },
  {
    name: 'bitget',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new BitgetWsClient(),
    fetchHistory: (p, tf, limit) => fetchBitgetCandles(p, tf, limit),
  },
  {
    name: 'cryptocom',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new CryptocomWsClient(),
    // 4th arg is a `paper` flag, NOT country — keep it false.
    fetchHistory: (p, tf, limit) => fetchCryptocomCandles(p, tf, limit, false),
  },
  {
    name: 'bitfinex',
    pair: PAIR,
    timeframe: TF,
    country: COUNTRY,
    makeClient: () => new BfxWsClient(),
    fetchHistory: (p, tf, limit) => fetchBfxCandles(p, tf, limit),
  },
]
