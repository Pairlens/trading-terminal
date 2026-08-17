// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Side, grid and honesty.
 *
 * The side block is the important one and it is written to be READ, not just
 * run: Binance and Bybit use the same two strings to mean opposite things, so
 * the venue conventions sit next to each other in one table and the assertion
 * that they disagree is explicit. Anyone who later writes a shared
 * `side === 'Buy' ? 'short' : 'long'` helper will fail here rather than ship a
 * liquidation map that is inverted on one venue and still looks plausible.
 */
import { describe, expect, test } from 'bun:test'

import {
  aggregateLiquidationOrders,
  mapCoinglassSide,
  parseFuturesPairKey,
  priceBucketWidth,
  resolveCompleteness,
  rowMatchesExchange,
  rowMatchesPair,
  snapBucketWidth,
} from '../mapper'
import { ORDER_ROWS_MIXED, ORDER_ROW_RECORDED, T0 } from './fixtures'

const BTC_PERP = parseFuturesPairKey('BTC-USDT-USDT')!

describe('side mapping', () => {
  test('Coinglass side is the ORDER direction: 2 Sell closes a long', () => {
    expect(mapCoinglassSide(2)).toBe('long')
    expect(mapCoinglassSide(1)).toBe('short')
  })

  test('string codes from a looser upstream still map', () => {
    expect(mapCoinglassSide('2')).toBe('long')
    expect(mapCoinglassSide('1')).toBe('short')
  })

  test('an unknown code is null, never a defaulted side', () => {
    expect(mapCoinglassSide(0)).toBeNull()
    expect(mapCoinglassSide(3)).toBeNull()
    expect(mapCoinglassSide(undefined)).toBeNull()
    expect(mapCoinglassSide('sell')).toBeNull()
  })

  test('the venue conventions disagree, and that is the point', () => {
    // Documented, verbatim:
    //  Binance !forceOrder  o.S = "SELL" → order side → a LONG was liquidated.
    //  Bybit allLiquidation   S = "Buy"  → position side → a LONG was liquidated.
    //  Coinglass /order    side = 2 (Sell) → order side → a LONG was liquidated.
    const binance = (s: 'BUY' | 'SELL') => (s === 'SELL' ? 'long' : 'short')
    const bybit = (s: 'Buy' | 'Sell') => (s === 'Buy' ? 'long' : 'short')

    expect(binance('SELL')).toBe('long')
    expect(bybit('Buy')).toBe('long')
    expect(mapCoinglassSide(2)).toBe('long')

    // Same word, opposite meaning. A shared helper cannot serve both.
    expect(binance('BUY')).not.toBe(bybit('Buy'))
    // Coinglass follows Binance, not Bybit.
    expect(mapCoinglassSide(1)).toBe(binance('BUY'))
    expect(mapCoinglassSide(1)).not.toBe(bybit('Buy'))
  })
})

describe('bucket grid', () => {
  test('widths snap to 1/2/5 x 10^n', () => {
    expect(snapBucketWidth(0.9)).toBe(1)
    expect(snapBucketWidth(1)).toBe(1)
    expect(snapBucketWidth(1.4)).toBe(2)
    expect(snapBucketWidth(4.9)).toBe(5)
    expect(snapBucketWidth(6)).toBe(10)
    expect(snapBucketWidth(137.4)).toBe(200)
    expect(snapBucketWidth(0)).toBe(0)
    expect(snapBucketWidth(Number.NaN)).toBe(0)
  })

  test('the width targets ~40 buckets across the traded range', () => {
    // 8000 wide / 40 = 200 exactly, which is already a clean step.
    expect(priceBucketWidth(80_000, 88_000)).toBe(200)
    // 180 wide / 40 = 4.5, snapped up to 5.
    expect(priceBucketWidth(87_500, 87_680)).toBe(5)
  })

  test('a single price still yields a drawable width', () => {
    expect(priceBucketWidth(87_500, 87_500)).toBe(100)
  })

  test('degenerate ranges yield 0 rather than a fabricated grid', () => {
    expect(priceBucketWidth(0, 100)).toBe(0)
    expect(priceBucketWidth(200, 100)).toBe(0)
    expect(priceBucketWidth(Number.NaN, 100)).toBe(0)
  })
})

describe('pair and exchange matching', () => {
  test('the venue-native symbol matches its pair key', () => {
    expect(rowMatchesPair('BTCUSDT', BTC_PERP)).toBe(true)
    // KuCoin futures suffixes its contracts.
    expect(rowMatchesPair('BTCUSDTM', BTC_PERP)).toBe(true)
    expect(rowMatchesPair('btc-usdt', BTC_PERP)).toBe(true)
  })

  test('a different quote or a longer base is refused', () => {
    expect(rowMatchesPair('BTCUSDC', BTC_PERP)).toBe(false)
    const eth = parseFuturesPairKey('ETH-USDT-USDT')!
    // The trap: ETHFIUSDT starts with ETH but is a different instrument.
    expect(rowMatchesPair('ETHFIUSDT', eth)).toBe(false)
    expect(rowMatchesPair('ETHUSDT', eth)).toBe(true)
  })

  test('exchange comparison ignores casing', () => {
    // exchange-list says 'Binance', order rows say 'BINANCE'.
    expect(rowMatchesExchange('BINANCE', 'Binance')).toBe(true)
    expect(rowMatchesExchange('Bybit', 'Binance')).toBe(false)
  })

  test('a spot key is refused rather than coerced into a perp', () => {
    expect(parseFuturesPairKey('BTC-USDT')).toBeNull()
    expect(parseFuturesPairKey('')).toBeNull()
    expect(parseFuturesPairKey('BTC-USDT-USDT-X')).toBeNull()
    expect(parseFuturesPairKey('btc-usdt-usdt')).toEqual({
      base: 'BTC',
      quote: 'USDT',
      settle: 'USDT',
    })
  })
})

describe('aggregateLiquidationOrders', () => {
  const aggregate = () =>
    aggregateLiquidationOrders({
      rows: ORDER_ROWS_MIXED,
      pair: BTC_PERP,
      exchange: 'Binance',
      since: T0,
    })

  test('prints land in minute buckets on a snapped price grid', () => {
    const { buckets, bucketWidth, matched } = aggregate()
    // The Bybit row is filtered out, so 5 of 6 rows survive.
    expect(matched).toBe(5)
    // Range 87_500..87_680 → 180/40 = 4.5 → snapped to 5.
    expect(bucketWidth).toBe(5)
    expect(buckets).toEqual([
      // 87_500 and 87_505 fall in different $5 buckets.
      { ts: T0, price: 87_500, side: 'long', notionalUsd: 10_000, count: 1 },
      { ts: T0, price: 87_505, side: 'long', notionalUsd: 5_000, count: 1 },
      { ts: T0, price: 87_600, side: 'short', notionalUsd: 2_500, count: 1 },
      {
        ts: T0 + 60_000,
        price: 87_505,
        side: 'long',
        notionalUsd: 1_000,
        count: 1,
      },
      {
        ts: T0 + 60_000,
        price: 87_680,
        side: 'short',
        notionalUsd: 40_000,
        count: 1,
      },
    ])
  })

  test('same minute, same price, same side sums and counts', () => {
    const rows = [
      { ...ORDER_ROW_RECORDED, time: T0 + 1_000, price: 87_500, usd_value: 10 },
      { ...ORDER_ROW_RECORDED, time: T0 + 2_000, price: 87_500, usd_value: 90 },
    ]
    const { buckets } = aggregateLiquidationOrders({
      rows,
      pair: BTC_PERP,
      exchange: 'Binance',
      since: T0,
    })
    expect(buckets).toHaveLength(1)
    expect(buckets[0]).toMatchObject({ notionalUsd: 100, count: 2 })
  })

  test('neighbouring prices collapse once the range makes the bucket wide', () => {
    // 87_500..91_500 → 4000/40 = 100. The two prints 2 apart now share a slab,
    // which is the same behaviour a narrow range would NOT give them.
    const rows = [
      { ...ORDER_ROW_RECORDED, time: T0 + 1_000, price: 87_501, usd_value: 10 },
      { ...ORDER_ROW_RECORDED, time: T0 + 2_000, price: 87_503, usd_value: 90 },
      { ...ORDER_ROW_RECORDED, time: T0 + 3_000, price: 91_500, usd_value: 1 },
    ]
    const { buckets, bucketWidth } = aggregateLiquidationOrders({
      rows,
      pair: BTC_PERP,
      exchange: 'Binance',
      since: T0,
    })
    expect(bucketWidth).toBe(100)
    expect(buckets).toHaveLength(2)
    expect(buckets[0]).toMatchObject({
      price: 87_500,
      notionalUsd: 100,
      count: 2,
    })
  })

  test('rows for another venue riding the same coin request are dropped', () => {
    const { buckets } = aggregateLiquidationOrders({
      rows: ORDER_ROWS_MIXED,
      pair: BTC_PERP,
      exchange: 'Bybit',
      since: T0,
    })
    expect(buckets).toHaveLength(1)
    expect(buckets[0].notionalUsd).toBe(900_000)
  })

  test('rows before the window start are dropped', () => {
    const { matched } = aggregateLiquidationOrders({
      rows: ORDER_ROWS_MIXED,
      pair: BTC_PERP,
      exchange: 'Binance',
      since: T0 + 60_000,
    })
    expect(matched).toBe(2)
  })

  test('unusable rows never become a bucket', () => {
    const rows = [
      { ...ORDER_ROW_RECORDED, time: T0, price: 0, usd_value: 10 },
      { ...ORDER_ROW_RECORDED, time: T0, price: 100, usd_value: 0 },
      { ...ORDER_ROW_RECORDED, time: T0, price: 100, usd_value: 10, side: 9 },
      { ...ORDER_ROW_RECORDED, time: Number.NaN, price: 100, usd_value: 10 },
    ]
    expect(
      aggregateLiquidationOrders({
        rows,
        pair: BTC_PERP,
        exchange: 'Binance',
        since: T0,
      }),
    ).toEqual({ buckets: [], bucketWidth: 0, matched: 0 })
  })

  test('an empty window returns no buckets and no invented width', () => {
    expect(
      aggregateLiquidationOrders({
        rows: [],
        pair: BTC_PERP,
        exchange: 'Binance',
        since: T0,
      }),
    ).toEqual({ buckets: [], bucketWidth: 0, matched: 0 })
  })
})

describe('resolveCompleteness', () => {
  test('a sampled stream stays sampled however clean the read was', () => {
    expect(
      resolveCompleteness('sampled', { thresholdUsd: 0, truncated: false }),
    ).toBe('sampled')
  })

  test('a threshold makes a complete stream a tail', () => {
    expect(
      resolveCompleteness('complete', {
        thresholdUsd: 1_000,
        truncated: false,
      }),
    ).toBe('sampled')
  })

  test('a truncated page makes a complete stream a sample', () => {
    expect(
      resolveCompleteness('complete', { thresholdUsd: 0, truncated: true }),
    ).toBe('sampled')
  })

  test('only an unthresholded, untruncated read of a complete stream is complete', () => {
    expect(
      resolveCompleteness('complete', { thresholdUsd: 0, truncated: false }),
    ).toBe('complete')
  })
})
