// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The candle path, driven through the exact call sequence the terminal makes.
 *
 * This file exists because three separate bugs all produced the SAME visible
 * symptom — an outcome the terminal declared "isn't available on this venue",
 * which hides the working order book, tape and ticket along with the chart —
 * and none of them was visible to a test that called `fetchOHLCV` directly:
 *
 *  1. **Volume was mandatory in the parser.** Polymarket buckets a price-history
 *     tape that carries no size, so every row arrived with `undefined` in slot
 *     5 and the whole series parsed to nothing. 300 rows in, 0 candles out.
 *  2. **The history window was derived from `limit`.** Both venues turn a bar
 *     COUNT into a time SPAN, and the terminal's availability probe asks for
 *     exactly one bar (`probeVenueHistory(…, 1)`) — a one-bar-wide window of a
 *     tape that is often silent.
 *  3. **Cold-key recovery searched with too many words.** A reload on another
 *     device has no persisted map, and the venue's title search matches the
 *     event-slug prefix only.
 *
 * So the mock below models the two venue behaviours that caused them: a bar
 * tape that only answers within `limit × timeframe` of now, and rows whose
 * volume slot is empty.
 */

import { describe, expect, it } from 'bun:test'
import { createPredictionConnectorPlugin } from '../index'
import {
  polymarketMarketConnectorManifest,
  polymarketPredictionVenue,
} from '../venues/polymarket'
import {
  kalshiMarketConnectorManifest,
  kalshiPredictionVenue,
} from '../venues/kalshi'
import { fakeEvent } from './fake-exchange'
import type {
  PluginExecuteParams,
  PluginInstance,
} from '@pairlens/plugin-system/types'
import type { PredictionExchangeCtor, PredictionOhlcvRow } from '../types'

const MINUTE = 60_000
const NOW = 1_800_000_000_000

/** Persistent storage that survives a "reload" (a new runtime instance). */
function disk(): {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
} {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

const EVENT = fakeEvent({
  id: 'fed-decision-jan',
  title: 'Fed decision, January',
  marketId: '0xcond',
  marketTitle: 'Will the Fed cut 25bps?',
  outcomes: [
    {
      outcome: 'FED_DECISION_JAN_CUT_25BPS:YES',
      outcomeId: '111',
      label: 'Yes',
    },
    { outcome: 'FED_DECISION_JAN_CUT_25BPS:NO', outcomeId: '222', label: 'No' },
  ],
})

const PAIR_KEY = 'FED-DECISION-JAN-CUT-25BPS-YES'

type Recorder = {
  ohlcv: Array<{ outcome: string; timeframe: string; limit: number }>
  searches: Array<string>
}

/**
 * A venue class that reproduces the two behaviours that broke the chart.
 *
 * `quietBars` is how long ago the tape's newest bar is: a market that has not
 * traded for a while. A request whose `limit × timeframe` window does not reach
 * back that far returns nothing at all, exactly as both venues do.
 */
function venueClass(
  log: Recorder,
  opts: { quietBars: number; searchable: boolean },
): PredictionExchangeCtor {
  return class {
    has = { prediction: true }
    urls = { api: { rest: 'https://example.invalid' } }
    options = {}
    timeframes = { '1m': 1, '5m': 5, '1h': 60, '1d': 1440 }
    close = async () => undefined
    fetchTicker = async () => ({ last: 0.53, timestamp: NOW })
    fetchOrderBook = async () => ({ bids: [], asks: [] })
    fetchTrades = async () => []

    // The unqueried browse path: the venue's own trending listing, run
    // through its own parsers (see browsePolymarketEvents).
    markets: Record<string, unknown> = {}
    createSafeDictionary = () => ({})
    populateOutcomes = () => {}
    fetchRawEventsList = async () => [{ raw: true }]
    parseEventToMarkets = () => [{ market: 'FED_DECISION_JAN_CUT_25BPS:YES' }]
    parseEvent = () => EVENT

    async fetchEvents(params?: Record<string, unknown>) {
      const query = String(params?.['query'] ?? '')
      log.searches.push(query)
      // The venue's search matches the EVENT title, so only a short leading
      // prefix of a handle-derived key can hit.
      if (!opts.searchable) return []
      return query.split(' ').length <= 3 ? [EVENT] : []
    }

    async fetchOHLCV(
      outcome: string,
      timeframe = '1m',
      _since?: number,
      limit = 100,
    ): Promise<Array<PredictionOhlcvRow>> {
      log.ohlcv.push({ outcome, timeframe, limit })
      const widthMs =
        (this.timeframes as Record<string, number>)[timeframe] * MINUTE
      const rows: Array<PredictionOhlcvRow> = []
      for (let i = opts.quietBars; i < opts.quietBars + 40; i++) {
        // Only bars inside the window the venue derives from the bar COUNT.
        if (i >= limit) break
        // Volume slot deliberately empty: a price tape reports no size.
        rows.unshift([NOW - i * widthMs, 0.5, 0.55, 0.45, 0.53, undefined])
      }
      return rows
    }
  } as unknown as PredictionExchangeCtor
}

function ctx(pair: string, timeframe: string, market: string) {
  return {
    pair,
    market,
    timeframe,
    mode: 'paper' as const,
    country: 'DE',
  }
}

function historyCall(
  pair: string,
  timeframe: string,
  limit: number,
  market: string,
): PluginExecuteParams {
  return {
    capability: 'market-data:history',
    params: { pair, timeframe, limit },
    context: ctx(pair, timeframe, market),
  }
}

function build(
  log: Recorder,
  opts: {
    quietBars: number
    searchable: boolean
    storage: ReturnType<typeof disk> | null
  },
): PluginInstance {
  return createPredictionConnectorPlugin(
    {
      ...polymarketPredictionVenue,
      loadExchangeClass: async () => venueClass(log, opts),
    },
    polymarketMarketConnectorManifest,
    { outcomeStorage: opts.storage },
  )
}

function recorder(): Recorder {
  return { ohlcv: [], searches: [] }
}

describe('candles survive a reload', () => {
  it('serves history and a live snapshot from a persisted map, on a fresh runtime', async () => {
    const store = disk()
    const rec = recorder()

    // Load 1: the Events pane browses, which is what fills the map.
    const first = build(rec, {
      quietBars: 0,
      searchable: true,
      storage: store,
    })
    const events = (await first.execute({
      capability: 'market-data:events',
      params: { limit: 5 },
      context: ctx('', '1h', 'polymarket'),
    })) as {
      events: Array<{
        markets: Array<{ outcomes: Array<{ pairKey: string }> }>
      }>
    }
    expect(events.events[0]?.markets[0]?.outcomes[0]?.pairKey).toBe(PAIR_KEY)
    await first.destroy?.()

    // Load 2: RELOAD. New runtime, same storage, and the pair key is the only
    // thing the route carries.
    const second = build(rec, {
      quietBars: 0,
      searchable: false,
      storage: store,
    })
    try {
      const history = (await second.execute(
        historyCall(PAIR_KEY, '5m', 300, 'polymarket'),
      )) as Array<unknown>
      expect(history.length).toBeGreaterThan(0)

      const snapshot = await new Promise<{
        type: string
        candles: Array<unknown>
      } | null>((resolve) => {
        const stop = second.subscribe?.(
          {
            capability: 'market-data:candles',
            params: { pair: PAIR_KEY, timeframe: '5m' },
            context: ctx(PAIR_KEY, '5m', 'polymarket'),
          },
          (data) => {
            const frame = data as { type?: string; candles?: Array<unknown> }
            if (frame?.type === 'snapshot') {
              stop?.()
              resolve(frame as { type: string; candles: Array<unknown> })
            }
          },
        )
        setTimeout(() => {
          stop?.()
          resolve(null)
        }, 2_000)
      })
      expect(snapshot).not.toBeNull()
      expect(snapshot!.candles.length).toBeGreaterThan(0)
    } finally {
      await second.destroy?.()
    }
  })

  it('recovers a cold key through the venue search, shortest prefix first', async () => {
    // A shared link on a device that has never browsed: no persisted map.
    const rec = recorder()
    const plugin = build(rec, {
      quietBars: 0,
      searchable: true,
      storage: null,
    })
    try {
      const history = (await plugin.execute(
        historyCall(PAIR_KEY, '5m', 300, 'polymarket'),
      )) as Array<unknown>
      expect(history.length).toBeGreaterThan(0)
      // The full key is twelve words and matches nothing; the ladder starts
      // short, so the first attempt is the one that hits.
      expect(rec.searches[0]?.split(' ').length).toBeLessThanOrEqual(3)
    } finally {
      await plugin.destroy?.()
    }
  })

  it('fails with an actionable sentence when no prefix resolves', async () => {
    const rec = recorder()
    const plugin = build(rec, {
      quietBars: 0,
      searchable: false,
      storage: null,
    })
    try {
      await expect(
        plugin.execute(historyCall('GONE-FOREVER-YES', '5m', 10, 'polymarket')),
      ).rejects.toThrow('events browser')
      // Bounded: a miss must not walk an unbounded ladder of requests.
      expect(rec.searches.length).toBeLessThanOrEqual(5)
    } finally {
      await plugin.destroy?.()
    }
  })
})

describe('the availability probe gets a real answer', () => {
  it('asks the venue about a real window even when one bar is requested', async () => {
    // `probeVenueHistory(market, pair, timeframe, 1)`: a bar COUNT of 1 becomes
    // a one-bar-wide time window on both venues, and a market that last traded
    // 30 bars ago answers with nothing — which the terminal reads as "unlisted"
    // and uses to hide the whole pair.
    const rec = recorder()
    const store = disk()
    const warm = build(rec, { quietBars: 0, searchable: true, storage: store })
    await warm.execute({
      capability: 'market-data:events',
      params: { limit: 5 },
      context: ctx('', '1h', 'polymarket'),
    })
    await warm.destroy?.()

    const quiet = recorder()
    const plugin = createPredictionConnectorPlugin(
      {
        ...polymarketPredictionVenue,
        loadExchangeClass: async () =>
          venueClass(quiet, { quietBars: 30, searchable: false }),
      },
      polymarketMarketConnectorManifest,
      { outcomeStorage: store },
    )
    try {
      const probed = (await plugin.execute(
        historyCall(PAIR_KEY, '5m', 1, 'polymarket'),
      )) as Array<unknown>
      expect(probed.length).toBe(1)
      // Widened at the venue, sliced afterwards — same single request.
      expect(quiet.ohlcv.length).toBe(1)
      expect(quiet.ohlcv[0]?.limit).toBeGreaterThanOrEqual(200)
    } finally {
      await plugin.destroy?.()
    }
  })

  it('returns the NEWEST bars when the widened window overshoots', async () => {
    const rec = recorder()
    const plugin = build(rec, {
      quietBars: 0,
      searchable: true,
      storage: null,
    })
    try {
      const all = (await plugin.execute(
        historyCall(PAIR_KEY, '5m', 300, 'polymarket'),
      )) as Array<{ ts: number }>
      const three = (await plugin.execute(
        historyCall(PAIR_KEY, '5m', 3, 'polymarket'),
      )) as Array<{ ts: number }>
      expect(three.length).toBe(3)
      // The bars nearest now, not the oldest of the widened window.
      expect(three.map((c) => c.ts)).toEqual(all.slice(-3).map((c) => c.ts))
    } finally {
      await plugin.destroy?.()
    }
  })

  it('applies the same floor on the passthrough venue', async () => {
    // Kalshi derives `start_ts = now - count × tf` the same way; measured
    // 2026-08-15, `limit: 1` at 1h returned 0 rows where 300 returned 21.
    const rec = recorder()
    const plugin = createPredictionConnectorPlugin(
      {
        ...kalshiPredictionVenue,
        loadExchangeClass: async () =>
          venueClass(rec, { quietBars: 30, searchable: false }),
      },
      kalshiMarketConnectorManifest,
      { outcomeStorage: null },
    )
    try {
      const probed = (await plugin.execute(
        historyCall('KXFED-26AUG15-T53', '1h', 1, 'kalshi'),
      )) as Array<unknown>
      expect(probed.length).toBe(1)
      expect(rec.ohlcv[0]?.limit).toBeGreaterThanOrEqual(200)
    } finally {
      await plugin.destroy?.()
    }
  })
})
