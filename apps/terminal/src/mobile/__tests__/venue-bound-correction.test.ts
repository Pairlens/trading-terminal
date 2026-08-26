// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A venue-bound link opened on the phone keeps its venue.
 *
 * The shipped defect: `/dex/jupiter/<mint>-USDC` on the mobile shell was
 * rewritten to `/dex/okx/<mint>-USDC` and the chart then said the market only
 * exists on OKX. Two steps produced it, and both are pinned below:
 *
 *   1. The chart terminal's stale-venue correction read the venue table alone.
 *      Connectors activate one at a time and publish as they go, so a table
 *      that is already non-empty is still missing every venue below the one
 *      currently activating — and the correction read that as "the venue is
 *      gone" and swapped in the user's preferred CEX.
 *   2. `useMobileRouteSync` then saw focus disagree with a still address and
 *      wrote the substituted venue back into the URL, where it stuck.
 *
 * The desktop shell was never affected: its chart route refuses to mount until
 * the venue named in the URL is in the table.
 *
 * The same two steps affect every venue-bound class identically — a token IS
 * its chain plus address, an outcome IS its venue plus market id — so the
 * cases below cover `dex` and `prediction` together.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import { decidePairAddress } from '../lib/mobile-history'
import type { MarketOption } from '@/hooks/use-available-markets'
import { correctStaleMarket } from '@/lib/market-ref/resolve'

const market = (value: string, assetClasses: Array<string>): MarketOption =>
  ({
    value,
    label: value.toUpperCase(),
    assetClasses,
    desktopOnly: false,
    credentialedMarketData: false,
  }) as MarketOption

const OKX = market('okx', ['crypto-spot'])
const GATE = market('gate', ['crypto-spot'])
const JUPITER = market('jupiter', ['dex'])
const KALSHI = market('kalshi', ['prediction'])
const BINANCE_FUTURES = market('binance-futures', ['crypto-perp'])

/** The venue table mid-boot: one CEX has published, nothing else has. */
const BOOTING = [OKX]
const SETTLED = [OKX, GATE, JUPITER, KALSHI]

describe('the boot window is not evidence a venue is gone', () => {
  test('a missing venue is left alone until every connector has activated', () => {
    expect(
      correctStaleMarket({
        market: 'jupiter',
        cls: 'dex',
        markets: BOOTING,
        defaultMarket: 'okx',
        settled: false,
      }),
    ).toBeNull()
  })

  /**
   * The reverse direction of the same race, and the reason the gate is not
   * specific to venue-bound classes: the DEX connectors activate before the
   * CEXes, so a `/spot/okx/BTC-USDT` link mid-boot could be moved onto
   * whichever venue happened to have published first.
   */
  test('a spot venue is left alone mid-boot too', () => {
    expect(
      correctStaleMarket({
        market: 'okx',
        cls: 'spot',
        markets: [JUPITER],
        defaultMarket: 'jupiter',
        settled: false,
      }),
    ).toBeNull()
  })

  test('an empty table corrects nothing, settled or not', () => {
    expect(
      correctStaleMarket({
        market: 'jupiter',
        cls: 'dex',
        markets: [],
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBeNull()
  })
})

describe('a venue-bound class is never substituted', () => {
  test.each([
    ['dex', 'jupiter'],
    ['prediction', 'kalshi'],
  ] as const)(
    '%s keeps its venue even once the table has settled without it',
    (cls, venue) => {
      expect(
        correctStaleMarket({
          market: venue,
          cls,
          markets: [OKX, GATE],
          defaultMarket: 'okx',
          settled: true,
        }),
      ).toBeNull()
    },
  )

  /**
   * A venue-bound instrument whose connector really was uninstalled has a
   * refusal of its own to render ("This market only exists on Jupiter"), which
   * is the honest answer. Charting another venue's tape under the same address
   * is not — `resolveMarketRef` returns `venue-missing` for exactly this case.
   */
  test('the refusal is the answer, not another venue', () => {
    const corrected = correctStaleMarket({
      market: 'jupiter',
      cls: 'dex',
      markets: [OKX],
      defaultMarket: 'okx',
      settled: true,
    })
    expect(corrected).not.toBe('okx')
    expect(corrected).toBeNull()
  })
})

describe('the correction still does its own job', () => {
  test('a spot venue that went away is moved to the default', () => {
    expect(
      correctStaleMarket({
        market: 'bitvavo',
        cls: 'spot',
        markets: SETTLED,
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBe('okx')
  })

  test('a caller that names no class keeps the old behaviour', () => {
    expect(
      correctStaleMarket({
        market: 'bitvavo',
        cls: undefined,
        markets: SETTLED,
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBe('okx')
  })

  test('a venue that is present is left alone', () => {
    expect(
      correctStaleMarket({
        market: 'jupiter',
        cls: 'dex',
        markets: SETTLED,
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBeNull()
  })

  /** No write when there is nowhere to go: a set of the same value re-runs the effect. */
  test('a missing venue that IS the default corrects nothing', () => {
    expect(
      correctStaleMarket({
        market: 'okx',
        cls: 'spot',
        markets: [GATE],
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBeNull()
  })
})

/**
 * The two steps together, as the shell runs them: adopt the address, correct
 * the venue, then decide whether the address or the focus is the newer fact.
 * `reassert` here means the substituted venue is about to be written into the
 * URL, which is the state the user sees.
 */
function openLinkOnPhone(input: {
  routedVenue: string
  cls: 'dex' | 'spot' | 'prediction'
  preferredVenue: string
  markets: Array<MarketOption>
  settled: boolean
}): { venue: string; address: 'kept' | 'rewritten' } {
  // `useMobileRouteSync`, first run: the address is the newer fact on a cold
  // load, so its venue is adopted into chart config.
  let venue = input.preferredVenue
  const adopt = decidePairAddress({
    differs: venue !== input.routedVenue,
    addressMoved: true,
    consumeLatch: () => false,
  })
  if (adopt === 'adopt') venue = input.routedVenue

  // `useChartTerminalState`, same commit.
  const corrected = correctStaleMarket({
    market: venue,
    cls: input.cls,
    markets: input.markets,
    defaultMarket: input.markets[0]?.value ?? 'okx',
    settled: input.settled,
  })
  if (corrected) venue = corrected

  // `useMobileRouteSync`, second run: the path has not moved.
  const decision = decidePairAddress({
    differs: venue !== input.routedVenue,
    addressMoved: false,
    consumeLatch: () => false,
  })
  return { venue, address: decision === 'reassert' ? 'rewritten' : 'kept' }
}

describe('opening a Jupiter link on the phone', () => {
  test('mid-boot, the address survives', () => {
    expect(
      openLinkOnPhone({
        routedVenue: 'jupiter',
        cls: 'dex',
        preferredVenue: 'okx',
        markets: BOOTING,
        settled: false,
      }),
    ).toEqual({ venue: 'jupiter', address: 'kept' })
  })

  test('once settled, the address survives', () => {
    expect(
      openLinkOnPhone({
        routedVenue: 'jupiter',
        cls: 'dex',
        preferredVenue: 'okx',
        markets: SETTLED,
        settled: true,
      }),
    ).toEqual({ venue: 'jupiter', address: 'kept' })
  })
})

describe('the mobile shell hands the chart terminal its class', () => {
  /**
   * The correction can only refuse to move a venue-bound venue if it is told
   * the class, and the shell is the only thing that knows it: chart config
   * derives the class FROM the venue, which is exactly the fact in doubt here.
   */
  test('mobile-terminal-root passes instrumentClass', () => {
    const source = readFileSync(
      join(import.meta.dir, '..', 'mobile-terminal-root.tsx'),
      'utf8',
    )
    expect(source).toContain('instrumentClass={focusedClass}')
  })
})

/**
 * The other way a composed address goes wrong, and the one the venue pickers
 * made easy to reach: the venue exists, the class exists, and they disagree.
 *
 * The phone has no venue in its URL. It composes one from `terminal.market`,
 * which is whatever was last charted anywhere — so a perpetual charted on the
 * laptop wrote `/spot/binance-futures/BTC-USDT` the next time a spot pair was
 * opened on the phone: a spot board on a venue that lists no spot pairs.
 */
describe('a venue that cannot serve the class is corrected too', () => {
  const CONNECTED = [OKX, GATE, JUPITER, KALSHI, BINANCE_FUTURES]

  test('a spot pair does not sit on a futures venue', () => {
    expect(
      correctStaleMarket({
        market: 'binance-futures',
        cls: 'spot',
        markets: CONNECTED,
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBe('okx')
  })

  test('the preference wins when it serves, otherwise the first that does', () => {
    expect(
      correctStaleMarket({
        market: 'binance-futures',
        cls: 'spot',
        markets: CONNECTED,
        // Not a spot venue either, so it cannot be the answer.
        defaultMarket: 'jupiter',
        settled: true,
      }),
    ).toBe('okx')
  })

  test('a venue that does serve the class is left alone', () => {
    expect(
      correctStaleMarket({
        market: 'gate',
        cls: 'spot',
        markets: CONNECTED,
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBeNull()
  })

  test('a perp key on its perp venue is left alone', () => {
    expect(
      correctStaleMarket({
        market: 'binance-futures',
        cls: 'perp',
        markets: CONNECTED,
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBeNull()
  })

  // Rule 2 still wins: moving the venue of a token names a different token.
  test('a venue-bound class is not corrected by class either', () => {
    expect(
      correctStaleMarket({
        market: 'okx',
        cls: 'dex',
        markets: CONNECTED,
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBeNull()
  })

  // A workspace pane is pointed at a pair, not an address, so it names no
  // class and keeps the plain does-it-exist behaviour.
  test('a caller that names no class is not corrected by class', () => {
    expect(
      correctStaleMarket({
        market: 'binance-futures',
        cls: undefined,
        markets: CONNECTED,
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBeNull()
  })

  // Better a refusal the surfaces already render than a second wrong venue.
  test('nothing moves when no connected venue serves the class', () => {
    expect(
      correctStaleMarket({
        market: 'okx',
        cls: 'stocks',
        markets: CONNECTED,
        defaultMarket: 'okx',
        settled: true,
      }),
    ).toBeNull()
  })
})
