// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A ccxt `PredictionExchange` stand-in for the unit suites.
 *
 * Every prediction test drives real runtime code (the trading runtime, the
 * resolver, the events projection) against this rather than a socket, which is
 * what lets the order path's "never throws" contract be asserted for the cases
 * that only happen when the venue rejects — a bad signature, an unknown
 * outcome, a network drop mid-flight.
 */

import type { PredictionExchangeLike } from '../types'

export type FakeExchangeOptions = Partial<PredictionExchangeLike> & {
  has?: Record<string, unknown>
}

/** In-memory storage for `OutcomeKeyMap`, so tests never touch localStorage. */
export function memoryStorage(): {
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

export function fakeExchange(
  overrides: FakeExchangeOptions = {},
): PredictionExchangeLike {
  const base: PredictionExchangeLike = {
    has: {
      prediction: true,
      fetchClosedOrders: true,
      ...(overrides.has ?? {}),
    },
    urls: { api: { rest: 'https://example.invalid' } },
    options: {},
    timeframes: { '1m': 1, '1h': 60, '1d': 1440 },
    close: async () => undefined,
    fetchTicker: async () => ({}),
    fetchOrderBook: async () => ({ bids: [], asks: [] }),
    fetchOHLCV: async () => [],
    fetchTrades: async () => [],
  }
  return { ...base, ...overrides, has: base.has }
}

/** One ccxt prediction event, shaped as the real classes emit it. */
export function fakeEvent(opts: {
  id: string
  title: string
  marketId: string
  marketTitle: string
  outcomes: Array<{ outcome: string; outcomeId?: string; label: string }>
  end?: number
}): Record<string, unknown> {
  return {
    id: opts.id,
    event: opts.id,
    title: opts.title,
    category: 'Economics',
    volume: 1_000_000,
    markets: [
      {
        id: opts.marketId,
        market: opts.marketId,
        title: opts.marketTitle,
        marketType: 'binary',
        active: true,
        ...(opts.end !== undefined ? { end: opts.end } : {}),
        outcomes: opts.outcomes.map((o, index) => ({
          outcome: o.outcome,
          ...(o.outcomeId !== undefined ? { outcomeId: o.outcomeId } : {}),
          label: o.label,
          price: index === 0 ? 0.62 : 0.38,
        })),
      },
    ],
  }
}
