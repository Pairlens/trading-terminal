// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The streaming liveness watchdog.
 *
 * ccxt cannot detect a half-open socket for us: its stall detector degrades to
 * `this.lastPong = now` in a browser and so can never fire, and a `watch*`
 * promise for a socket that a laptop lid or a middlebox idle timeout left
 * half-open simply never settles. Without a bound the run loop parks on that
 * await forever — no rejection, therefore no backoff and no reconnect — and the
 * book, tape and chart freeze while the UI still reads "connected".
 *
 * Two properties are pinned here, and they pull against each other:
 *
 *  - a socket that says NOTHING must be torn down and rebuilt, and
 *  - a socket that is merely QUIET (a prediction market with no ticker update
 *    for a minute, answering its own keepalive) must be left alone.
 *
 * The second is why the budget is measured against raw inbound frames — which
 * include the PONGs Polymarket answers its 10 s text PING with — rather than
 * against the channel's own await.
 */

import { describe, expect, it } from 'bun:test'
import { PredictionStreamHub } from '../streams'
import { OutcomeKeyMap } from '../outcome-keys'
import { OutcomeResolver } from '../outcomes'
import { polymarketPredictionVenue } from '../venues/polymarket'
import { memoryStorage } from './fake-exchange'
import type { PredictionExchangeHost } from '../exchange-host'
import type { PredictionExchangeLike, PredictionVenueConfig } from '../types'

const LIVENESS_MS = 50

/** A host whose instance can be "closed" and rebuilt, tracking generations. */
function fakeHost(exchange: PredictionExchangeLike): {
  host: PredictionExchangeHost
  closes: () => number
} {
  let generation = 0
  let closes = 0
  const host = {
    get generation() {
      return generation
    },
    paperActive: false,
    authed: false,
    peek: () => exchange,
    setCountry: () => false,
    acquire: async () => ({ exchange, generation }),
    close: async () => {
      closes++
      generation++
    },
    destroy: async () => undefined,
  }
  return {
    host: host as unknown as PredictionExchangeHost,
    closes: () => closes,
  }
}

function venue(
  overrides: Partial<PredictionVenueConfig> = {},
): PredictionVenueConfig {
  return {
    ...polymarketPredictionVenue,
    livenessTimeoutMs: LIVENESS_MS,
    ...overrides,
  }
}

function hubFor(
  exchange: PredictionExchangeLike,
  config: PredictionVenueConfig,
): {
  hub: PredictionStreamHub
  closes: () => number
  errors: Array<string>
} {
  const { host, closes } = fakeHost(exchange)
  const errors: Array<string> = []
  const resolver = new OutcomeResolver(
    config,
    new OutcomeKeyMap(config.marketId, memoryStorage()),
  )
  // Pre-register so the loop never goes to the network to resolve.
  resolver.register({ outcome: 'FED_CUT:YES', outcomeId: '111' })
  const hub = new PredictionStreamHub({
    venue: config,
    host,
    resolver,
    onError: (scope) => errors.push(scope),
    // Collapse the equal-jitter backoff so a recovery is observable inside a
    // test tick; the watchdog itself still runs on the real clock.
    sleep: (ms) => nextTick(Math.min(ms, 5)),
  })
  return { hub, closes, errors }
}

const KEY = 'FED-CUT-YES'

function nextTick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('a silent socket is torn down and rebuilt', () => {
  it('recovers a ticker loop whose watch* never resolves', async () => {
    let attempts = 0
    const exchange = {
      has: {},
      urls: {},
      options: {},
      timeframes: {},
      close: async () => undefined,
      fetchTicker: async () => ({}),
      fetchOrderBook: async () => ({ bids: [], asks: [] }),
      fetchOHLCV: async () => [],
      fetchTrades: async () => [],
      // The half-open socket: the promise NEVER settles.
      watchTicker: async () => {
        attempts++
        return new Promise<Record<string, unknown>>(() => {})
      },
    } as unknown as PredictionExchangeLike

    const { hub, closes, errors } = hubFor(exchange, venue())
    const stop = hub.subscribeTicker(KEY, () => {})
    try {
      // Long enough for the watchdog to fire and the loop to back off and
      // re-enter at least once.
      await nextTick(LIVENESS_MS * 6)
      // It did not park: the loop re-entered against a fresh instance.
      expect(attempts).toBeGreaterThan(1)
      // And the dead instance was discarded rather than reused — ccxt keys
      // `exchange.clients` by URL and never reconnects one itself.
      expect(closes()).toBeGreaterThan(0)
      expect(errors.some((scope) => scope.startsWith('ticker:'))).toBe(true)
    } finally {
      stop()
      await hub.destroy()
    }
  })

  it('leaves a quiet-but-alive socket alone', async () => {
    // The socket produces no ticker frame, but the connection is answering its
    // keepalive — which the host reports through `onInbound`. Tearing this down
    // would reconnect every quiet outcome on a venue full of them.
    let attempts = 0
    const exchange = {
      has: {},
      urls: {},
      options: {},
      timeframes: {},
      close: async () => undefined,
      fetchTicker: async () => ({}),
      fetchOrderBook: async () => ({ bids: [], asks: [] }),
      fetchOHLCV: async () => [],
      fetchTrades: async () => [],
      watchTicker: async () => {
        attempts++
        return new Promise<Record<string, unknown>>(() => {})
      },
    } as unknown as PredictionExchangeLike

    const { hub, closes } = hubFor(exchange, venue())
    const stop = hub.subscribeTicker(KEY, () => {})
    const heartbeat = setInterval(() => hub.noteInbound(), LIVENESS_MS / 4)
    try {
      await nextTick(LIVENESS_MS * 6)
      expect(attempts).toBe(1)
      expect(closes()).toBe(0)
    } finally {
      clearInterval(heartbeat)
      stop()
      await hub.destroy()
    }
  })

  it('does not bound a polling venue, whose reads always settle', async () => {
    // Kalshi has no sockets at all; its transport timeout is ccxt's own.
    let polls = 0
    const exchange = {
      has: {},
      urls: {},
      options: {},
      timeframes: {},
      close: async () => undefined,
      fetchTicker: async () => {
        polls++
        return { last: 0.5, timestamp: Date.now() }
      },
      fetchOrderBook: async () => ({ bids: [], asks: [] }),
      fetchOHLCV: async () => [],
      fetchTrades: async () => [],
    } as unknown as PredictionExchangeLike

    const { hub, closes } = hubFor(
      exchange,
      venue({
        streaming: 'poll',
        outcomeAddressing: 'passthrough',
        pollIntervals: { ticker: LIVENESS_MS / 5 },
      }),
    )
    const stop = hub.subscribeTicker(KEY, () => {})
    try {
      await nextTick(LIVENESS_MS * 4)
      expect(polls).toBeGreaterThan(1)
      expect(closes()).toBe(0)
    } finally {
      stop()
      await hub.destroy()
    }
  })

  it('reads the budget off the venue config', () => {
    expect(polymarketPredictionVenue.livenessTimeoutMs).toBe(60_000)
  })
})
