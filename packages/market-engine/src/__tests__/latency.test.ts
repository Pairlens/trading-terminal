// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it } from 'bun:test'

import { feedEventTs, latencyMonitor } from '../latency'

afterEach(() => {
  latencyMonitor.clear()
})

describe('latencyMonitor', () => {
  it('reports nothing for a venue that has never sampled', () => {
    expect(latencyMonitor.get('okx')).toBeNull()
  })

  it('summarizes a venue from its samples', () => {
    for (const rtt of [50, 30, 40]) latencyMonitor.record('okx', rtt)

    const latency = latencyMonitor.get('okx')
    expect(latency).toEqual({
      source: 'roundtrip',
      medianMs: 40,
      lastMs: 40,
      bestMs: 30,
      samples: 3,
      updatedAt: expect.any(Number),
    })
  })

  it('keeps venues apart', () => {
    latencyMonitor.record('okx', 20)
    latencyMonitor.record('kraken', 200)

    expect(latencyMonitor.get('okx')?.medianMs).toBe(20)
    expect(latencyMonitor.get('kraken')?.medianMs).toBe(200)
  })

  it('rides out a single outlier — the median is why', () => {
    for (const rtt of [40, 42, 38, 41]) latencyMonitor.record('okx', rtt)
    // A GC pause or a throttled background tab, not the network.
    latencyMonitor.record('okx', 900)

    expect(latencyMonitor.get('okx')?.medianMs).toBe(41)
    expect(latencyMonitor.get('okx')?.lastMs).toBe(900)
  })

  it('drops the oldest sample past the window', () => {
    // Six samples, window of five: the 500 must age out rather than drag the
    // median for the rest of the session.
    for (const rtt of [500, 10, 10, 10, 10, 10]) {
      latencyMonitor.record('okx', rtt)
    }

    expect(latencyMonitor.get('okx')).toMatchObject({
      medianMs: 10,
      bestMs: 10,
      samples: 5,
    })
  })

  it('refuses implausible round trips', () => {
    latencyMonitor.record('okx', -1)
    latencyMonitor.record('okx', Number.NaN)
    // Past the point where this is a measurement rather than a suspended
    // process; the liveness watchdog owns that case.
    latencyMonitor.record('okx', 60_000)

    expect(latencyMonitor.get('okx')).toBeNull()
  })

  it('forgets a venue on reset', () => {
    latencyMonitor.record('okx', 20)
    latencyMonitor.reset('okx')

    expect(latencyMonitor.get('okx')).toBeNull()
  })

  it('notifies subscribers when a sample lands, and stops after release', () => {
    let notified = 0
    const release = latencyMonitor.subscribe(() => {
      notified++
    })

    latencyMonitor.record('okx', 20)
    expect(notified).toBe(1)
    expect(latencyMonitor.getVersion()).toBeGreaterThan(0)

    release()
    latencyMonitor.record('okx', 20)
    expect(notified).toBe(1)
  })

  it('expires a venue that stopped answering', () => {
    const realNow = Date.now
    try {
      latencyMonitor.record('okx', 20)
      expect(latencyMonitor.get('okx')).not.toBeNull()

      // Expiry is a function of elapsed time, checked on read: the sweep timer
      // freezes in a background tab and stops dead on suspend, which is
      // exactly when a number from a dead connection would mislead.
      Date.now = () => realNow() + 5 * 60_000
      expect(latencyMonitor.get('okx')).toBeNull()
    } finally {
      Date.now = realNow
    }
  })
})

describe('feedEventTs', () => {
  it('reads the newest execution off a trade update', () => {
    expect(
      feedEventTs({
        type: 'update',
        trades: [
          { id: '1', price: 1, size: 1, side: 'buy', ts: 1_700_000_000_000 },
          { id: '2', price: 1, size: 1, side: 'sell', ts: 1_700_000_000_500 },
        ],
      }),
    ).toBe(1_700_000_000_500)
  })

  it('skips a tape snapshot — those executions are history', () => {
    expect(
      feedEventTs({
        type: 'snapshot',
        trades: [
          { id: '1', price: 1, size: 1, side: 'buy', ts: 1_700_000_000_000 },
        ],
      }),
    ).toBeNull()
  })

  it('refuses every stream whose timestamp is not a venue emit time', () => {
    // A candle's ts is the bar OPEN — sampling it would report most of a
    // timeframe as delay.
    expect(
      feedEventTs({ type: 'update', candles: [{ ts: 1_700_000_000_000 }] }),
    ).toBeNull()
    // Orderbook ts is Date.now() on some venues and a sequence number on
    // Binance; ticker ts is Date.now() on Coinbase and HTX.
    expect(
      feedEventTs({
        type: 'update',
        bids: [],
        asks: [],
        ts: 1_700_000_000_000,
      }),
    ).toBeNull()
    expect(
      feedEventTs({ type: 'ticker', ticker: { ts: 1_700_000_000_000 } }),
    ).toBeNull()
    expect(feedEventTs(null)).toBeNull()
    expect(feedEventTs('update')).toBeNull()
  })
})

describe('latencyMonitor — inferred from feed age', () => {
  /** Trade emitted `ageMs` ago according to the venue's clock. */
  const tradeAged = (venue: string, ageMs: number) =>
    latencyMonitor.recordFeedAge(venue, Date.now() - ageMs)

  it('reports feed age when the venue answers no ping', () => {
    tradeAged('coinbase', 120)

    const latency = latencyMonitor.get('coinbase')
    expect(latency?.source).toBe('feed')
    // No calibration yet, so the machine clock is taken at face value — and
    // the 120ms one-way age is doubled onto the round-trip scale.
    expect(latency?.medianMs).toBeGreaterThanOrEqual(230)
    expect(latency?.medianMs).toBeLessThanOrEqual(400)
  })

  it('prefers a measured round trip over the inferred number', () => {
    tradeAged('okx', 5_000)
    latencyMonitor.record('okx', 40)

    expect(latencyMonitor.get('okx')).toMatchObject({
      source: 'roundtrip',
      medianMs: 40,
    })
  })

  it('solves for the clock offset from a venue that reports both', () => {
    // Machine clock runs 2s ahead: every trade looks 2s old on top of the
    // real one-way delay. The venue's own round trip is 100ms, so one-way is
    // ~50ms and the offset must come out at ~1950ms.
    expect(latencyMonitor.getClockOffsetMs()).toBeNull()
    tradeAged('okx', 2_050)
    latencyMonitor.record('okx', 100)

    const offset = latencyMonitor.getClockOffsetMs()
    expect(offset).not.toBeNull()
    expect(offset!).toBeGreaterThan(1_900)
    expect(offset!).toBeLessThan(2_010)
  })

  it('applies that offset to a venue that can only report feed age', () => {
    // Calibrate on OKX...
    tradeAged('okx', 2_050)
    latencyMonitor.record('okx', 100)

    // ...and Coinbase, whose trades look 2.2s old on the same skewed clock.
    // Real one-way delay is ~250ms once the ~1950ms offset comes off, so the
    // round-trip-scaled reading must be ~500ms — not the raw 2200ms.
    tradeAged('coinbase', 2_200)

    const latency = latencyMonitor.get('coinbase')
    expect(latency?.source).toBe('feed')
    expect(latency!.medianMs).toBeGreaterThan(350)
    expect(latency!.medianMs).toBeLessThan(700)
  })

  it('clamps at zero rather than reporting data that arrived before it was sent', () => {
    tradeAged('okx', 1_000)
    latencyMonitor.record('okx', 100)
    // A venue fresher than the offset estimate: the overshoot is the
    // estimate's, not evidence of negative latency.
    tradeAged('coinbase', 10)

    expect(latencyMonitor.get('coinbase')!.medianMs).toBe(0)
  })

  it('throttles sampling so the trade tape cannot flood the window', () => {
    for (let i = 0; i < 500; i++) tradeAged('coinbase', 100)

    // 500 executions inside one second must leave exactly one sample.
    expect(latencyMonitor.get('coinbase')?.samples).toBe(1)
  })

  it('refuses a timestamp too far out to be a measurement', () => {
    // Seconds mistaken for milliseconds is the classic connector bug.
    latencyMonitor.recordFeedAge('coinbase', Math.floor(Date.now() / 1000))
    latencyMonitor.recordFeedAge('coinbase', 0)
    latencyMonitor.recordFeedAge('coinbase', Number.NaN)

    expect(latencyMonitor.get('coinbase')).toBeNull()
  })
})
