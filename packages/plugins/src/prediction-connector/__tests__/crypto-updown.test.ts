// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The crypto up/down classifier, pinned against both venues' real payloads.
 *
 * Every fixture below is copied from a live call on 2026-08-20 — Kalshi's
 * `fetchEvents({ series_ticker: 'KXBTC15M' })` and gamma's
 * `/events?series_slug=btc-up-or-down-hourly` through ccxt's own parsers — with
 * only the fields the classifier reads kept. They pin the four things that are
 * venue facts rather than choices:
 *
 *  - Kalshi publishes the target as `floor_strike` and prices the book in
 *    `info`, leaving ccxt's unified outcome `price` undefined.
 *  - Polymarket fills the unified price and publishes no strike at all.
 *  - Kalshi labels the sides YES/NO and Polymarket Up/Down.
 *  - A gamma listing ordered by volume returns windows that settled months
 *    ago, so the clock is what decides whether a row is live.
 */
import { describe, expect, it } from 'bun:test'

import {
  UPDOWN_SERIES_LIMIT,
  classifyUpDown,
  openWindows,
  sideOf,
} from '../crypto-updown'
import { kalshiPredictionVenue } from '../venues/kalshi'
import { polymarketPredictionVenue } from '../venues/polymarket'
import type { UpDownSeriesSpec } from '../crypto-updown'
import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'

const KALSHI_SPEC: UpDownSeriesSpec = {
  asset: 'BTC',
  spotPair: 'BTC-USDT',
  horizon: '15m',
  settlementSource: 'CF Benchmarks RTI',
  scope: { series_ticker: 'KXBTC15M' },
  windowMs: 15 * 60_000,
  referenceBasis: 'venue',
  referenceExact: true,
}

const PM_HOURLY_SPEC: UpDownSeriesSpec = {
  asset: 'BTC',
  spotPair: 'BTC-USDT',
  horizon: 'hourly',
  settlementSource: 'Binance BTC/USDT',
  scope: { series_slug: 'btc-up-or-down-hourly' },
  windowMs: 60 * 60_000,
  referenceBasis: 'candle-open',
  referenceTimeframe: '1h',
  referenceExact: true,
}

const PM_DAILY_SPEC: UpDownSeriesSpec = {
  ...PM_HOURLY_SPEC,
  horizon: 'daily',
  scope: { series_slug: 'btc-up-or-down-daily' },
  windowMs: 24 * 60 * 60_000,
  referenceExact: false,
}

/** Kalshi KXBTC15M-26AUG192030, fields the classifier reads. */
const KALSHI_RAW = {
  id: 'KXBTC15M-26AUG192030',
  markets: [
    {
      id: 'KXBTC15M-26AUG192030-30',
      info: {
        floor_strike: 69506.94,
        open_time: '2026-08-20T00:15:00Z',
        close_time: '2026-08-20T00:30:00Z',
        last_price_dollars: '0.7200',
        yes_bid_dollars: '0.7200',
        yes_ask_dollars: '0.7300',
        no_bid_dollars: '0.2700',
        no_ask_dollars: '0.2800',
        status: 'active',
      },
    },
  ],
}

const KALSHI_SUMMARY: PredictionEventSummary = {
  id: 'KXBTC15M-26AUG192030',
  market: 'kalshi',
  title: 'BTC 15 min · $69,506.94 target',
  endMs: 1787185800000,
  markets: [
    {
      id: 'KXBTC15M-26AUG192030-30',
      title: 'BTC price up in next 15 mins?',
      outcomes: [
        { pairKey: 'KXBTC15M-26AUG192030-30', label: 'YES' },
        { pairKey: 'KXBTC15M-26AUG192030-30-NO', label: 'NO' },
      ],
    },
  ],
}

/** Polymarket 868165, through `parseEvent` / `parseEventToMarkets`. */
const PM_RAW = {
  id: '868165',
  markets: [{ id: '0x45034bdd', info: { slug: 'bitcoin-up-or-down' } }],
}

const PM_SUMMARY: PredictionEventSummary = {
  id: '868165',
  market: 'polymarket',
  title: 'Bitcoin Up or Down - August 19, 8PM ET',
  endMs: 1787187600000,
  markets: [
    {
      id: '0x45034bdd',
      title: 'Bitcoin Up or Down - August 19, 8PM ET',
      outcomes: [
        { pairKey: 'BITCOIN_UP_DOWN:UP', label: 'Up', price: 0.785 },
        { pairKey: 'BITCOIN_UP_DOWN:DOWN', label: 'Down', price: 0.215 },
      ],
    },
  ],
}

describe('sideOf', () => {
  it('reads both venues own vocabulary for the two sides', () => {
    expect(sideOf('Up')).toBe('up')
    expect(sideOf('YES')).toBe('up')
    expect(sideOf('Down')).toBe('down')
    expect(sideOf('no')).toBe('down')
    // A venue nobody has met yet gets no positional guess dressed as a read.
    expect(sideOf('Gavin Newsom')).toBe('unknown')
  })
})

describe('classifyUpDown — Kalshi', () => {
  const meta = classifyUpDown(KALSHI_RAW, KALSHI_SUMMARY, KALSHI_SPEC)!

  it('takes the published target as an exact reference', () => {
    expect(meta.referencePrice).toBe(69506.94)
    expect(meta.referenceBasis).toBe('venue')
    expect(meta.referenceExact).toBe(true)
    // Nothing for a terminal to go and read, so no candle is named.
    expect(meta.referenceTimeframe).toBeUndefined()
  })

  it('reads the window off the venue payload rather than the spec', () => {
    expect(meta.opensMs).toBe(Date.parse('2026-08-20T00:15:00Z'))
    expect(meta.closesMs).toBe(Date.parse('2026-08-20T00:30:00Z'))
  })

  it('prices both legs from info, which ccxt leaves off the outcome', () => {
    // The YES quotes, straight through.
    expect(meta.up.bid).toBeCloseTo(0.72, 6)
    expect(meta.up.ask).toBeCloseTo(0.73, 6)
    expect(meta.up.price).toBeCloseTo(0.72, 6)
    // The NO side reads its OWN quotes — 1 - yes_ask would be 0.27 and
    // 1 - yes_bid 0.28, so a subtraction would silently invert the spread.
    expect(meta.down.bid).toBeCloseTo(0.27, 6)
    expect(meta.down.ask).toBeCloseTo(0.28, 6)
    // The last print is YES-denominated and the other side did trade at its
    // complement.
    expect(meta.down.price).toBeCloseTo(0.28, 6)
  })

  it('keeps the pair keys an order addresses', () => {
    expect(meta.up.pairKey).toBe('KXBTC15M-26AUG192030-30')
    expect(meta.down.pairKey).toBe('KXBTC15M-26AUG192030-30-NO')
  })
})

describe('classifyUpDown — Polymarket', () => {
  it('names the candle to read when the venue publishes no number', () => {
    const meta = classifyUpDown(PM_RAW, PM_SUMMARY, PM_HOURLY_SPEC)!
    expect(meta.referencePrice).toBeUndefined()
    expect(meta.referenceBasis).toBe('candle-open')
    expect(meta.referenceTimeframe).toBe('1h')
    expect(meta.referenceExact).toBe(true)
    expect(meta.spotPair).toBe('BTC-USDT')
    expect(meta.settlementSource).toBe('Binance BTC/USDT')
  })

  it('derives the window open by backing off the close', () => {
    const meta = classifyUpDown(PM_RAW, PM_SUMMARY, PM_HOURLY_SPEC)!
    expect(meta.closesMs).toBe(1787187600000)
    expect(meta.opensMs).toBe(1787187600000 - 60 * 60_000)
  })

  it('marks the daily reference inexact — it settles on a 1m close', () => {
    const meta = classifyUpDown(PM_RAW, PM_SUMMARY, PM_DAILY_SPEC)!
    expect(meta.referenceExact).toBe(false)
    expect(meta.opensMs).toBe(1787187600000 - 24 * 60 * 60_000)
  })

  it('uses the unified outcome price the venue does fill', () => {
    const meta = classifyUpDown(PM_RAW, PM_SUMMARY, PM_HOURLY_SPEC)!
    expect(meta.up.price).toBe(0.785)
    expect(meta.down.price).toBe(0.215)
  })
})

describe('classifyUpDown — refusals', () => {
  it('refuses a strike ladder wearing a directional name', () => {
    // Kalshi's hourly KXBTCD is 188 markets on one question. The nearest-the-
    // money row of a ladder is not an up/down contract.
    const ladder: PredictionEventSummary = {
      ...KALSHI_SUMMARY,
      markets: [
        KALSHI_SUMMARY.markets[0],
        { ...KALSHI_SUMMARY.markets[0], id: 'second-strike' },
      ],
    }
    expect(classifyUpDown(KALSHI_RAW, ladder, KALSHI_SPEC)).toBeNull()
  })

  it('refuses a market that is not two-sided', () => {
    const threeWay: PredictionEventSummary = {
      ...PM_SUMMARY,
      markets: [
        {
          ...PM_SUMMARY.markets[0],
          outcomes: [
            { pairKey: 'a', label: 'Up' },
            { pairKey: 'b', label: 'Down' },
            { pairKey: 'c', label: 'Flat' },
          ],
        },
      ],
    }
    expect(classifyUpDown(PM_RAW, threeWay, PM_HOURLY_SPEC)).toBeNull()
  })

  it('refuses a window whose close cannot be read', () => {
    const undated: PredictionEventSummary = {
      ...PM_SUMMARY,
      endMs: undefined,
      markets: [{ ...PM_SUMMARY.markets[0], endMs: undefined }],
    }
    expect(classifyUpDown(PM_RAW, undated, PM_HOURLY_SPEC)).toBeNull()
  })

  it('refuses a candle-based reference with no candle named', () => {
    const spec = { ...PM_HOURLY_SPEC, referenceTimeframe: undefined }
    expect(classifyUpDown(PM_RAW, PM_SUMMARY, spec)).toBeNull()
  })

  it('refuses a zero-filled strike rather than targeting $0', () => {
    const zeroed = {
      ...KALSHI_RAW,
      markets: [
        {
          ...KALSHI_RAW.markets[0],
          info: { ...KALSHI_RAW.markets[0].info, floor_strike: 0 },
        },
      ],
    }
    // Falls back to the spec's basis, which for Kalshi names no candle.
    expect(classifyUpDown(zeroed, KALSHI_SUMMARY, KALSHI_SPEC)).toBeNull()
  })
})

describe('openWindows', () => {
  const at = (closesMs: number, id: string): PredictionEventSummary => ({
    ...PM_SUMMARY,
    id,
    upDown: {
      ...classifyUpDown(PM_RAW, PM_SUMMARY, PM_HOURLY_SPEC)!,
      closesMs,
    },
  })

  it('drops a settled window gamma still lists as active', () => {
    const now = 1787187600000
    // The May window that volume ordering keeps returning three months on.
    const rows = openWindows(
      [at(now - 86_400_000, 'stale'), at(now + 60_000, 'live')],
      now,
    )
    expect(rows.map((r) => r.id)).toEqual(['live'])
  })

  it('orders by what settles soonest', () => {
    const now = 0
    const rows = openWindows(
      [at(3_000, 'third'), at(1_000, 'first'), at(2_000, 'second')],
      now,
    )
    expect(rows.map((r) => r.id)).toEqual(['first', 'second', 'third'])
  })
})

describe('the declared slates', () => {
  it('Kalshi runs the fifteen-minute series and nothing laddered', () => {
    const series = kalshiPredictionVenue.cryptoUpDown!.series
    expect(series.map((s) => s.asset)).toEqual([
      'BTC',
      'ETH',
      'SOL',
      'XRP',
      'DOGE',
    ])
    for (const spec of series) {
      expect(spec.horizon).toBe('15m')
      expect(spec.windowMs).toBe(15 * 60_000)
      // The hourly 'Directional' series are ladders — see the venue file.
      expect(String(spec.scope['series_ticker'])).toMatch(/15M$/)
    }
  })

  it('Polymarket runs four assets over two horizons', () => {
    const series = polymarketPredictionVenue.cryptoUpDown!.series
    expect(series).toHaveLength(8)
    expect(new Set(series.map((s) => s.asset))).toEqual(
      new Set(['BTC', 'ETH', 'SOL', 'XRP']),
    )
    // gamma abbreviates two of the four and spells out the others; the slugs
    // are not derivable from the asset, which is why they are declared.
    expect(series.map((s) => s.scope['series_slug'])).toContain(
      'solana-up-or-down-daily',
    )
    expect(series.map((s) => s.scope['series_slug'])).toContain(
      'btc-up-or-down-hourly',
    )
    for (const spec of series) {
      expect(spec.referenceBasis).toBe('candle-open')
      expect(spec.referenceTimeframe).toBe('1h')
      // Only the daily one is a stand-in for a one-minute close.
      expect(spec.referenceExact).toBe(spec.horizon === 'hourly')
    }
  })

  it('asks for few enough windows that the live one leads', () => {
    expect(UPDOWN_SERIES_LIMIT).toBeLessThanOrEqual(10)
  })
})
