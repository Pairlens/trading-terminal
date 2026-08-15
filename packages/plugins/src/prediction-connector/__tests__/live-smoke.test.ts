// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Public-REST smoke tests against the real venues.
 *
 * Skipped unless `PAIRLENS_LIVE_TESTS=1`, so CI stays hermetic. Run them by
 * hand after a ccxt bump or a venue-config change:
 *
 *     PAIRLENS_LIVE_TESTS=1 bun test packages/plugins/src/prediction-connector
 *
 * They read only public endpoints and never place an order. Note that Kalshi's
 * hosts 403 any request carrying an `Origin` header — under bun there is none,
 * which is exactly why this file can reach it and a browser build cannot.
 */

import { describe, expect, it } from 'bun:test'
import { PredictionExchangeHost } from '../exchange-host'
import { fetchPredictionEvents } from '../events'
import { OutcomeKeyMap } from '../outcome-keys'
import { OutcomeResolver } from '../outcomes'
import {
  kalshiMarketConnectorManifest,
  kalshiPredictionVenue,
} from '../venues/kalshi'
import {
  polymarketMarketConnectorManifest,
  polymarketPredictionVenue,
} from '../venues/polymarket'
import { createPredictionConnectorPlugin } from '../index'
import { memoryStorage } from './fake-exchange'
import type { PredictionVenueConfig } from '../types'

const LIVE = process.env['PAIRLENS_LIVE_TESTS'] === '1'

async function browseEvents(venue: PredictionVenueConfig): Promise<unknown> {
  const host = new PredictionExchangeHost({ venue })
  try {
    const { exchange } = await host.acquire()
    return await fetchPredictionEvents(
      exchange,
      {
        venue,
        resolver: new OutcomeResolver(
          venue,
          new OutcomeKeyMap(venue.marketId, memoryStorage()),
        ),
      },
      { limit: 5 },
    )
  } finally {
    await host.destroy()
  }
}

type BrowseResult = {
  market: string
  events: Array<{
    title: string
    markets: Array<{
      title: string
      outcomes: Array<{ pairKey: string; label: string }>
    }>
  }>
}

/**
 * What "the browse works" means, on either venue.
 *
 * All three of these regressed at least once against a fully green mock
 * suite, because none of them can be observed from a mock: whether the venue
 * accepts the scope at all, which payload field carries the question, and
 * which of a listing row's two outcome forms the pair key is built from.
 */
function assertBrowsable(response: BrowseResult, market: string): void {
  expect(response.market).toBe(market)
  expect(response.events.length).toBeGreaterThan(0)
  const event = response.events[0]
  expect(event.title.length).toBeGreaterThan(0)
  expect(event.markets.length).toBeGreaterThan(0)

  for (const entry of event.markets) {
    // A title that is the raw id means the payload read fell through.
    expect(
      entry.title.startsWith('0x'),
      `market title is a condition hash: ${entry.title}`,
    ).toBe(false)
    expect(entry.outcomes.length).toBeGreaterThan(0)
    for (const outcome of entry.outcomes) {
      // Route-safe by construction: no handle separator survives.
      expect(outcome.pairKey).toBe(outcome.pairKey.toUpperCase())
      expect(outcome.pairKey).not.toContain('_')
      expect(outcome.pairKey).not.toContain(':')
    }
  }
}

describe.skipIf(!LIVE)('live prediction venues', () => {
  it('kalshi: the default browse returns questions and ticker-form keys', async () => {
    const response = (await browseEvents(kalshiPredictionVenue)) as BrowseResult
    assertBrowsable(response, 'kalshi')
    // Passthrough addressing: the key IS the venue's ticker, so it has to be
    // ticker-shaped rather than a sanitized handle.
    const key = response.events[0].markets[0].outcomes[0].pairKey
    expect(key).toMatch(/^[A-Z0-9.-]+$/)
  }, 60_000)

  it('polymarket: the default browse returns questions, not hashes', async () => {
    // Regression: this threw ArgumentsRequired on every unsearched open of the
    // Events pane, because no combination of status/sort/limit is a scope
    // selector on a venue that declares no eventScopeParams.
    const response = (await browseEvents(
      polymarketPredictionVenue,
    )) as BrowseResult
    assertBrowsable(response, 'polymarket')
  }, 60_000)

  /**
   * A reload on a device that has never browsed this venue: the pair key from
   * the URL is ALL the runtime has, and the persisted map is empty. Every step
   * — resolving the key, floor-widening the window, parsing rows whose volume
   * slot is empty — has to work from cold, and none of it can be observed from
   * a mock.
   */
  for (const [label, venue, timeframes] of [
    ['kalshi', kalshiPredictionVenue, ['1h', '1d']],
    ['polymarket', polymarketPredictionVenue, ['5m', '1h']],
  ] as const) {
    it(`${label}: a cold-start pair key serves history and live candles`, async () => {
      // Warm run only to obtain a REAL key, exactly as the pair picker would.
      const browsed = (await browseEvents(venue)) as BrowseResult
      const key = browsed.events[0].markets[0].outcomes[0].pairKey

      // Everything below runs on a runtime with NO persisted map.
      const plugin = createPredictionConnectorPlugin(
        venue,
        venue.marketId === 'kalshi'
          ? kalshiMarketConnectorManifest
          : polymarketMarketConnectorManifest,
        { outcomeStorage: { getItem: () => null, setItem: () => {} } },
      )
      try {
        for (const timeframe of timeframes) {
          const context = {
            pair: key,
            market: venue.marketId,
            timeframe,
            mode: 'paper' as const,
            country: 'DE',
          }
          // The terminal's availability probe. A zero-length answer here is
          // what marks the whole pair unavailable and hides the book and tape.
          const probed = (await plugin.execute({
            capability: 'market-data:history',
            params: { pair: key, timeframe, limit: 1 },
            context,
          })) as Array<unknown>
          expect(
            probed.length,
            `${label} ${timeframe} availability probe`,
          ).toBeGreaterThan(0)

          const backfill = (await plugin.execute({
            capability: 'market-data:history',
            params: { pair: key, timeframe, limit: 300 },
            context,
          })) as Array<unknown>
          expect(
            backfill.length,
            `${label} ${timeframe} backfill`,
          ).toBeGreaterThan(0)

          const snapshot = await new Promise<Array<unknown> | null>(
            (resolve) => {
              const stop = plugin.subscribe?.(
                {
                  capability: 'market-data:candles',
                  params: { pair: key, timeframe },
                  context,
                },
                (data) => {
                  const frame = data as {
                    type?: string
                    candles?: Array<unknown>
                  }
                  if (frame?.type === 'snapshot') {
                    stop?.()
                    resolve(frame.candles ?? [])
                  }
                },
              )
              setTimeout(() => {
                stop?.()
                resolve(null)
              }, 25_000)
            },
          )
          expect(snapshot, `${label} ${timeframe} live snapshot`).not.toBeNull()
          expect(snapshot!.length).toBeGreaterThan(0)
        }
      } finally {
        await plugin.destroy?.()
      }
    }, 180_000)
  }
})
