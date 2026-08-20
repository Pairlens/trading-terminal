// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The focus card's geometry, tested against numbers rather than against a
 * rendered SVG.
 *
 * The rule with teeth is the y-domain: the distance between the tape and the
 * target IS the subject of this chart, so a window whose price has run clear of
 * its reference must still draw the reference. A chart that crops the target
 * out shows a price going up with nothing to go up against.
 */
import { describe, expect, test } from 'bun:test'

import type { UpDownRow } from '@/lib/predictions/crypto-updown'
import {
  MAX_CHART_SPAN_MS,
  appendSample,
  chartStart,
  focusAssets,
  payoutMultiple,
  pickFocusRow,
  priceToY,
  printBarFraction,
  seedSeries,
  seriesBounds,
  seriesPath,
  sideOfTarget,
  tapeFlow,
  windowProgress,
} from '@/lib/predictions/updown-focus'

const NOW = 1_800_000_000_000

function row(
  over: {
    asset?: string
    horizon?: UpDownRow['meta']['horizon']
    msToClose?: number
    opensMs?: number
    venue?: string
  } = {},
): UpDownRow {
  const closesMs = NOW + (over.msToClose ?? 60_000)
  return {
    key: `${over.venue ?? 'kalshi'}:${over.asset ?? 'BTC'}:${closesMs}`,
    venue: over.venue ?? 'kalshi',
    venueLabel: 'Kalshi',
    event: { id: 'e1', market: 'kalshi', title: 'BTC up', markets: [] },
    meta: {
      asset: over.asset ?? 'BTC',
      spotPair: `${over.asset ?? 'BTC'}-USDT`,
      settlementSource: 'CF Benchmarks',
      horizon: over.horizon ?? '15m',
      opensMs: over.opensMs ?? closesMs - 15 * 60_000,
      closesMs,
      referenceBasis: 'venue',
      referenceExact: true,
      marketId: 'm1',
      up: { pairKey: 'up', label: 'Up' },
      down: { pairKey: 'down', label: 'Down' },
    },
    msToClose: over.msToClose ?? 60_000,
    referenceState: 'venue',
  }
}

describe('focusAssets', () => {
  test('puts the majors in a fixed order, not the order they arrived', () => {
    // The switcher is a place people build muscle memory. A row of chips that
    // reorders itself between fetches is a row you have to read every time.
    const assets = focusAssets([
      row({ asset: 'SOL' }),
      row({ asset: 'BTC' }),
      row({ asset: 'XRP' }),
      row({ asset: 'ETH' }),
    ])
    expect(assets).toEqual(['BTC', 'ETH', 'SOL', 'XRP'])
  })

  test('keeps an unknown asset, behind the ones it knows', () => {
    const assets = focusAssets([row({ asset: 'PEPE' }), row({ asset: 'ETH' })])
    expect(assets).toEqual(['ETH', 'PEPE'])
  })

  test('lists each asset once however many venues run it', () => {
    const assets = focusAssets([
      row({ asset: 'BTC', venue: 'kalshi' }),
      row({ asset: 'BTC', venue: 'polymarket' }),
    ])
    expect(assets).toEqual(['BTC'])
  })
})

describe('pickFocusRow', () => {
  test('takes the soonest close, which is the only one with a book', () => {
    // Both venues list the next several windows and all but the first sit at a
    // flat coin flip with nothing behind them.
    const soon = row({ msToClose: 90_000 })
    const later = row({ msToClose: 3_600_000 })
    expect(pickFocusRow([later, soon], 'BTC', null)).toBe(soon)
  })

  test('honours the horizon filter', () => {
    const quarter = row({ horizon: '15m', msToClose: 30_000 })
    const hourly = row({ horizon: 'hourly', msToClose: 600_000 })
    expect(pickFocusRow([quarter, hourly], 'BTC', 'hourly')).toBe(hourly)
  })

  test('is null when the asset has no open window', () => {
    expect(pickFocusRow([row({ asset: 'BTC' })], 'ETH', null)).toBeNull()
  })

  test('a null asset means any asset', () => {
    const eth = row({ asset: 'ETH', msToClose: 10_000 })
    expect(pickFocusRow([row({ asset: 'BTC' }), eth], null, null)).toBe(eth)
  })
})

describe('payoutMultiple', () => {
  test('turns a long shot into odds a reader can hear', () => {
    expect(payoutMultiple(0.08)).toBeCloseTo(12.5, 5)
    expect(payoutMultiple(0.92)).toBeCloseTo(1.087, 3)
  })

  test('refuses sub-cent prices, where the multiple describes rounding', () => {
    expect(payoutMultiple(0.004)).toBeUndefined()
    expect(payoutMultiple(0)).toBeUndefined()
    expect(payoutMultiple(undefined)).toBeUndefined()
  })
})

describe('windowProgress', () => {
  test('is the fraction of the window that has run', () => {
    expect(windowProgress(row({ msToClose: 15 * 60_000 }), NOW)).toBeCloseTo(0)
    expect(windowProgress(row({ msToClose: 5 * 60_000 }), NOW)).toBeCloseTo(
      10 / 15,
      5,
    )
  })

  test('clamps rather than going negative on a window not yet open', () => {
    const future = row({ msToClose: 20 * 60_000 })
    expect(windowProgress(future, NOW)).toBe(0)
  })
})

describe('sideOfTarget', () => {
  test('says which side, and says nothing without both numbers', () => {
    expect(sideOfTarget(101, 100)).toBe('above')
    expect(sideOfTarget(99, 100)).toBe('below')
    expect(sideOfTarget(100, 100)).toBe('at')
    expect(sideOfTarget(undefined, 100)).toBe('unknown')
    expect(sideOfTarget(100, undefined)).toBe('unknown')
  })
})

describe('seedSeries', () => {
  const candles = [
    { ts: 1_000, open: 1, high: 1, low: 1, close: 10, volume: 0 },
    { ts: 2_000, open: 1, high: 1, low: 1, close: 20, volume: 0 },
    { ts: 3_000, open: 1, high: 1, low: 1, close: 30, volume: 0 },
  ]

  test('clips to the window the chart actually draws', () => {
    expect(seedSeries(candles, 2_000, 3_000)).toEqual([
      { ts: 2_000, price: 20 },
      { ts: 3_000, price: 30 },
    ])
  })

  test('reads closes, so the seed joins the live tape without a step', () => {
    expect(seedSeries(candles, 0, 9_999)[0]).toEqual({ ts: 1_000, price: 10 })
  })

  test('is empty rather than undefined with nothing to seed from', () => {
    expect(seedSeries(undefined, 0, 1)).toEqual([])
    expect(seedSeries([], 0, 1)).toEqual([])
  })
})

describe('chartStart', () => {
  test('shows a short window whole', () => {
    const quarter = row({ msToClose: 5 * 60_000 })
    expect(chartStart(quarter, NOW)).toBe(quarter.meta.opensMs)
  })

  test('caps a daily window at the run-up that decides it', () => {
    const daily = row({
      horizon: 'daily',
      msToClose: 60_000,
      opensMs: NOW - 23 * 60 * 60_000,
    })
    expect(chartStart(daily, NOW)).toBe(NOW - MAX_CHART_SPAN_MS)
  })
})

describe('appendSample', () => {
  const from = 0

  test('extends the line', () => {
    const next = appendSample(
      [{ ts: 1, price: 10 }],
      { ts: 2, price: 11 },
      from,
    )
    expect(next).toEqual([
      { ts: 1, price: 10 },
      { ts: 2, price: 11 },
    ])
  })

  test('hands back the SAME array when the price has not moved', () => {
    // The chart re-lays-out its path on every new reference, and a tape that
    // printed the same price twice is not a reason to redraw.
    const series = [{ ts: 2, price: 11 }]
    expect(appendSample(series, { ts: 2, price: 11 }, from)).toBe(series)
  })

  test('replaces rather than appends inside the same sample instant', () => {
    // A zero-width segment is a path command that draws nothing and costs a
    // layout, and it breaks the series being strictly increasing in time.
    const next = appendSample(
      [{ ts: 2, price: 11 }],
      { ts: 2, price: 12 },
      from,
    )
    expect(next).toEqual([{ ts: 2, price: 12 }])
  })

  test('drops what has scrolled off the left edge', () => {
    const next = appendSample(
      [
        { ts: 1, price: 10 },
        { ts: 5, price: 11 },
      ],
      { ts: 9, price: 12 },
      5,
    )
    expect(next.map((p) => p.ts)).toEqual([5, 9])
  })
})

describe('seriesBounds', () => {
  test('always includes the target, however far the tape has run from it', () => {
    // The whole subject of the chart is the distance to the target. A domain
    // that crops it out shows a price going up with nothing to go up against.
    const bounds = seriesBounds(
      [
        { ts: 1, price: 100 },
        { ts: 2, price: 104 },
      ],
      80,
    )
    expect(bounds).not.toBeNull()
    expect(bounds!.min).toBeLessThan(80)
    expect(bounds!.max).toBeGreaterThan(104)
  })

  test('pads a dead-flat minute instead of collapsing to a zero domain', () => {
    const bounds = seriesBounds(
      [
        { ts: 1, price: 100 },
        { ts: 2, price: 100 },
      ],
      100,
    )
    expect(bounds!.max).toBeGreaterThan(bounds!.min)
  })

  test('is null with nothing to plot', () => {
    expect(seriesBounds([], undefined)).toBeNull()
  })
})

describe('seriesPath', () => {
  const bounds = { min: 0, max: 100 }

  test('projects into the box with y inverted', () => {
    const d = seriesPath(
      [
        { ts: 0, price: 0 },
        { ts: 10, price: 100 },
      ],
      bounds,
      0,
      10,
      200,
      50,
    )
    expect(d).toBe('M0.00 50.00L200.00 0.00')
  })

  test('draws nothing rather than NaN for anything unplottable', () => {
    expect(seriesPath([{ ts: 0, price: 1 }], bounds, 0, 10, 100, 10)).toBe('')
    expect(seriesPath([], bounds, 0, 10, 100, 10)).toBe('')
    expect(
      seriesPath(
        [
          { ts: 0, price: 1 },
          { ts: 1, price: 2 },
        ],
        { min: 5, max: 5 },
        0,
        10,
        100,
        10,
      ),
    ).toBe('')
  })
})

describe('priceToY', () => {
  test('clamps a point outside the domain into the box', () => {
    expect(priceToY(500, { min: 0, max: 100 }, 50)).toBe(0)
    expect(priceToY(-5, { min: 0, max: 100 }, 50)).toBe(50)
  })
})

describe('tapeFlow', () => {
  const prints = [
    { side: 'buy' as const, price: 100, size: 3 },
    { side: 'sell' as const, price: 100, size: 1 },
    { side: 'buy' as const, price: 50, size: 2 },
  ]

  test('sums each side in notional, not in base size', () => {
    // "0.7" and "6.2" are not comparable across assets. Dollars are.
    const flow = tapeFlow(prints)
    expect(flow.buyUsd).toBe(400)
    expect(flow.sellUsd).toBe(100)
    expect(flow.buyShare).toBeCloseTo(0.8, 5)
  })

  test('reports the largest single print, which the row bars scale against', () => {
    expect(tapeFlow(prints).maxUsd).toBe(300)
  })

  test('an empty tape has a NULL share, not a balanced one', () => {
    // "Nothing has printed" and "perfectly balanced" are the same picture and
    // must not be the same number.
    expect(tapeFlow([]).buyShare).toBeNull()
  })

  test('ignores a print that priced or sized to nothing', () => {
    const flow = tapeFlow([
      { side: 'buy', price: 100, size: 1 },
      { side: 'sell', price: 0, size: 5 },
      { side: 'sell', price: Number.NaN, size: 5 },
    ])
    expect(flow.buyUsd).toBe(100)
    expect(flow.sellUsd).toBe(0)
  })
})

describe('printBarFraction', () => {
  test('scales against the biggest print on screen', () => {
    expect(printBarFraction(50, 100)).toBeCloseTo(0.5, 5)
    expect(printBarFraction(100, 100)).toBe(1)
  })

  test('floors the smallest print at a visible mark', () => {
    // A row that renders as empty reads as a row that failed to load.
    expect(printBarFraction(0.0001, 1_000_000)).toBe(0.04)
    expect(printBarFraction(10, 0)).toBe(0.04)
  })
})
