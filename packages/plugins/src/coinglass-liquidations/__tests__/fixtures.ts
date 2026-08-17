// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Recorded Coinglass v4 responses.
 *
 * Bodies marked RECORDED are verbatim from the 2026-08-17 research probes and
 * the official docs repo (`rest/Futures/Liquidation/*.md`); bodies marked
 * SYNTHETIC extend a recorded shape with extra rows so a multi-row case can be
 * tested at all. Nothing here was invented from scratch — the field names,
 * types and the string-typed `code` all come from the real thing, which is the
 * part a hand-written fixture usually gets wrong.
 *
 * No live key exists for this endpoint. These fixtures are the whole test
 * surface, so they are also the documentation of what the client expects.
 */
import type { CoinglassExchangeRow, CoinglassLiquidationOrder } from '../client'

/** RECORDED: no key at all. Note the HTTP status was 200. */
export const BODY_KEY_MISSING = { code: '401', msg: 'API key missing.' }

/** RECORDED: bogus key. Also HTTP 200. */
export const BODY_KEY_INVALID = {
  code: '400',
  msg: 'Invalid API key provided',
}

/** Documented code 429. Shape follows the other error bodies. */
export const BODY_RATE_LIMITED = { code: '429', msg: 'Too many requests' }

/**
 * RECORDED (docs): `/api/futures/liquidation/exchange-list`.
 * The synthetic `All` row is Coinglass's own aggregate, not a venue.
 */
export const BODY_EXCHANGE_LIST = {
  code: '0',
  msg: 'success',
  data: [
    {
      exchange: 'All',
      liquidation_usd: 14673519.81739075,
      long_liquidation_usd: 451394.17404598,
      short_liquidation_usd: 14222125.64334477,
    },
    {
      exchange: 'Bybit',
      liquidation_usd: 4585290.13404,
      long_liquidation_usd: 104560.13885,
      short_liquidation_usd: 4480729.99519,
    },
  ] satisfies Array<CoinglassExchangeRow & Record<string, unknown>>,
}

/**
 * SYNTHETIC: the recorded list plus the venues the plugin claims, so venue
 * resolution can be exercised. `Kucoin` carries Coinglass's own inconsistent
 * casing on purpose — the resolver must not care.
 */
export const BODY_EXCHANGE_LIST_FULL = {
  code: '0',
  msg: 'success',
  data: [
    { exchange: 'All', liquidation_usd: 14673519.81739075 },
    { exchange: 'Binance', liquidation_usd: 9088229.68 },
    { exchange: 'Bybit', liquidation_usd: 4585290.13404 },
    { exchange: 'Kucoin', liquidation_usd: 120334.5 },
  ] satisfies Array<CoinglassExchangeRow>,
}

/**
 * RECORDED (docs): one `/api/futures/liquidation/order` row.
 *
 * `exchange_name` is UPPERCASE here while `exchange-list` returns `Binance` —
 * the reason row matching is case-insensitive rather than an equality check.
 */
export const ORDER_ROW_RECORDED: CoinglassLiquidationOrder = {
  exchange_name: 'BINANCE',
  symbol: 'BTCUSDT',
  base_asset: 'BTC',
  price: 87535.9,
  usd_value: 205534.2932,
  side: 2,
  time: 1745216319263,
}

export const BODY_ORDER_SINGLE = {
  code: '0',
  msg: 'success',
  data: [ORDER_ROW_RECORDED],
}

/** Minute boundary the synthetic rows below are anchored to. */
export const T0 = 1_745_216_280_000

/**
 * SYNTHETIC: six prints across two minutes and both sides, built on the
 * recorded row's field shape. Prices are spread ~$180 so the snapped bucket
 * width lands on a round number a reader can check by hand.
 */
export const ORDER_ROWS_MIXED: Array<CoinglassLiquidationOrder> = [
  // minute 0
  { ...ORDER_ROW_RECORDED, time: T0 + 1_000, price: 87_500, usd_value: 10_000 },
  { ...ORDER_ROW_RECORDED, time: T0 + 5_000, price: 87_505, usd_value: 5_000 },
  {
    ...ORDER_ROW_RECORDED,
    time: T0 + 9_000,
    price: 87_600,
    usd_value: 2_500,
    side: 1,
  },
  // minute 1
  {
    ...ORDER_ROW_RECORDED,
    time: T0 + 61_000,
    price: 87_505,
    usd_value: 1_000,
  },
  {
    ...ORDER_ROW_RECORDED,
    time: T0 + 65_000,
    price: 87_680,
    usd_value: 40_000,
    side: 1,
  },
  // Another venue's row riding the same coin request. Must be filtered out.
  {
    ...ORDER_ROW_RECORDED,
    exchange_name: 'Bybit',
    time: T0 + 66_000,
    price: 87_500,
    usd_value: 900_000,
  },
]
