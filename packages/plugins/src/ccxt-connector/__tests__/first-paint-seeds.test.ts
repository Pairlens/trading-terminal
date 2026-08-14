// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fleet policy for the REST first-paint seeds — which venue gets which seed
 * and, more importantly, which venue must NEVER get one.
 *
 * The seeds are pure accelerants (the stream always supersedes them), so the
 * flags read like tuning — but two of the exclusions are correctness:
 * Coinbase and Upbit derive their candles FROM the trades stream, and a
 * seeded page of historical prints would re-add its volume to the forming
 * bar. This file is what turns that from a comment into a failing test.
 */

import { describe, expect, it } from 'bun:test'
import { binanceCcxtVenue } from '../venues/binance'
import { okxCcxtVenue } from '../venues/okx'
import { bybitCcxtVenue } from '../venues/bybit'
import { bitvavoCcxtVenue } from '../venues/bitvavo'
import { mexcCcxtVenue } from '../venues/mexc'
import { kucoinCcxtVenue } from '../venues/kucoin'
import { gateCcxtVenue } from '../venues/gate'
import { coinbaseCcxtVenue } from '../venues/coinbase'
import { bitgetCcxtVenue } from '../venues/bitget'
import { krakenCcxtVenue } from '../venues/kraken'
import { htxCcxtVenue } from '../venues/htx'
import { cryptocomCcxtVenue } from '../venues/cryptocom'
import { bitfinexCcxtVenue } from '../venues/bitfinex'
import { upbitCcxtVenue } from '../venues/upbit'

describe('order-book seed policy', () => {
  // The venues whose ccxt book is REST-synced (Binance's post-ack snapshot;
  // MEXC/KuCoin/Gate's buffered-delta window) — the stream cannot paint for
  // seconds, so the parallel REST snapshot carries the first frame.
  it('covers every REST-synced book', () => {
    expect(binanceCcxtVenue.seedOrderBook).toBe(true)
    expect(mexcCcxtVenue.seedOrderBook).toBe(true)
    expect(gateCcxtVenue.seedOrderBook).toBe(true)
    // KuCoin's public REST book serves exactly 20 or 100 levels — the
    // numeric flag overrides `orderbookDepth: 50`, which the endpoint
    // rejects outright.
    expect(kucoinCcxtVenue.seedOrderBook).toBe(100)
  })

  // Socket-snapshot venues whose snapshot is nonetheless slow: HTX's depth
  // channel pushes on a ~1 s cadence (~1.5 s to first book), Bitfinex's
  // subscribe snapshot trailed 1.7-2.3 s and Bitget's 0.5-1.9 s across
  // switches (all measured 2026-08-14).
  it('covers the slow socket-snapshot books', () => {
    expect(htxCcxtVenue.seedOrderBook).toBe(true)
    expect(bitfinexCcxtVenue.seedOrderBook).toBe(true)
    expect(bitgetCcxtVenue.seedOrderBook).toBe(true)
  })

  it('skips the venues whose first socket frame IS the book, promptly', () => {
    for (const venue of [
      okxCcxtVenue,
      bybitCcxtVenue,
      bitvavoCcxtVenue,
      coinbaseCcxtVenue,
      krakenCcxtVenue,
      cryptocomCcxtVenue,
      upbitCcxtVenue,
    ]) {
      expect(venue.seedOrderBook).toBeUndefined()
    }
  })

  // The delta window MEXC buffers before REST-syncing: ccxt ships 25 frames
  // (≥2.5 s at the 100 ms cadence, unbounded on a quiet pair).
  it('shrinks MEXC’s pre-snapshot delta window', () => {
    const options = mexcCcxtVenue.options?.['options'] as Record<
      string,
      Record<string, unknown>
    >
    expect(options['watchOrderBook']?.['snapshotDelay']).toBe(5)
  })
})

describe('trades seed policy', () => {
  it('fills the tape on every empty-opening stream', () => {
    for (const venue of [
      binanceCcxtVenue,
      okxCcxtVenue,
      bitvavoCcxtVenue,
      kucoinCcxtVenue,
      gateCcxtVenue,
      bitgetCcxtVenue,
      htxCcxtVenue,
      cryptocomCcxtVenue,
    ]) {
      expect(venue.seedTrades).toBe(true)
    }
    // ByBit's spot recent-trades endpoint caps at 60 and ccxt does not
    // clamp — the numeric flag carries the venue's own limit.
    expect(bybitCcxtVenue.seedTrades).toBe(60)
  })

  // CORRECTNESS, not tuning: these two venues fold candles FROM the trades
  // stream — a seeded page of historical prints would re-add its volume to
  // the forming bar. Never enable.
  it('never seeds a trade-fold venue', () => {
    expect(coinbaseCcxtVenue.seedTrades).toBeUndefined()
    expect(upbitCcxtVenue.seedTrades).toBeUndefined()
  })

  // Kraken's v1 trade channel sends no snapshot at all — a quiet pair's
  // tape never painted in 20 s (measured 2026-08-14) — but its throttler is
  // a strict ~1 s/call serial queue, so the seed is held past the subscribe
  // burst instead of queueing ahead of the chart backfill.
  it('seeds Kraken late, behind the chart backfill', () => {
    expect(krakenCcxtVenue.seedTrades).toBe(true)
    expect(krakenCcxtVenue.seedTradesDelayMs).toBe(2_500)
  })

  it('skips venues where the seed buys nothing or costs elsewhere', () => {
    // Bitfinex's trade channel already opens with a snapshot.
    expect(bitfinexCcxtVenue.seedTrades).toBeUndefined()
    // MEXC exposes no trades capability at all.
    expect(mexcCcxtVenue.seedTrades).toBeUndefined()
  })
})

describe('ticker seed policy', () => {
  // Venues whose per-symbol ticker stream emits only when the pair trades —
  // a switch to a quiet pair left the price header on '—' for seconds
  // (measured 2026-08-14: KuCoin 7 s, Gate 8.5 s, MEXC 2 s worst case).
  it('seeds every trade-driven ticker stream', () => {
    for (const venue of [
      kucoinCcxtVenue,
      gateCcxtVenue,
      mexcCcxtVenue,
      bitvavoCcxtVenue,
      bitgetCcxtVenue,
      coinbaseCcxtVenue,
    ]) {
      expect(venue.seedTicker).toBe(true)
    }
  })

  it('skips venues whose subscribe answers with a ticker snapshot', () => {
    for (const venue of [
      okxCcxtVenue,
      bybitCcxtVenue,
      krakenCcxtVenue,
      htxCcxtVenue,
      cryptocomCcxtVenue,
      upbitCcxtVenue,
    ]) {
      expect(venue.seedTicker).toBeUndefined()
    }
    // Binance's fan runs its own batched REST seed — the singular flag
    // must stay off so the two never race.
    expect(binanceCcxtVenue.seedTicker).toBeUndefined()
    expect(binanceCcxtVenue.batchTickers).toBe(true)
  })
})

describe('unwatch suppression policy', () => {
  // Coinbase's ccxt unsubscribe wedges `unSubscriptionPending` and leaves
  // the local subscription entry behind — a revisited pair's watch parks on
  // a channel the server no longer sends (dead price header, verified live
  // on BTC-USD 2026-08-14). Orphan-counting instead is the fix.
  it('suppresses Coinbase unwatch calls', () => {
    expect(coinbaseCcxtVenue.suppressUnwatch).toBe(true)
  })

  it('leaves every other venue on real unsubscribes', () => {
    for (const venue of [
      binanceCcxtVenue,
      okxCcxtVenue,
      bybitCcxtVenue,
      bitvavoCcxtVenue,
      mexcCcxtVenue,
      kucoinCcxtVenue,
      gateCcxtVenue,
      bitgetCcxtVenue,
      krakenCcxtVenue,
      htxCcxtVenue,
      cryptocomCcxtVenue,
      bitfinexCcxtVenue,
      upbitCcxtVenue,
    ]) {
      expect(venue.suppressUnwatch).toBeUndefined()
    }
  })
})
