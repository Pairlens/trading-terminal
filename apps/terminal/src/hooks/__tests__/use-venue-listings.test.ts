// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The venue check is only worth having if a cross means what it says.
 *
 * The empty state disables a crossed venue, so a wrong cross hides the venue
 * the user actually wanted — and the two ways to get one are the same two that
 * once made an unlisted verdict stick to a pair a venue lists: a rate limit and
 * a dead transport. Those must come back `unknown` (offered, unmarked), and a
 * region block must come back as itself rather than as "doesn't list it".
 */
import { afterEach, describe, expect, test } from 'bun:test'

import {
  GeoRestrictedError,
  PlatformRestrictedError,
  ProviderThrottledError,
} from '@pairlens/market-engine/errors'
import {
  classifyVenueProbe,
  listingVerdict,
  resetVenueListingCache,
} from '../use-venue-listings'
import type { Candle } from '@pairlens/shared/types'

const CANDLE: Candle = {
  ts: 1,
  open: 1,
  high: 1,
  low: 1,
  close: 1,
  volume: 1,
}

/** A `probeVenueHistory` that always answers the same way. */
const answering =
  (answer: Array<Candle> | Error | null) =>
  (): Promise<Array<Candle>> | null => {
    if (answer === null) return null
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer)
  }

afterEach(() => {
  resetVenueListingCache()
})

describe('classifyVenueProbe', () => {
  test('candles mean the venue lists the pair', async () => {
    expect(
      await classifyVenueProbe('gate', 'BTC-USDT', answering([CANDLE])),
    ).toBe('listed')
  })

  test('an empty answer is a refusal', async () => {
    expect(await classifyVenueProbe('gate', 'BTC-USDT', answering([]))).toBe(
      'unlisted',
    )
  })

  test('a venue naming the market invalid is a refusal', async () => {
    expect(
      await classifyVenueProbe(
        'bitvavo',
        'BTC-USDT',
        answering(new Error('market parameter is invalid')),
      ),
    ).toBe('unlisted')
  })

  test('a rate limit is not an answer about the pair', async () => {
    expect(
      await classifyVenueProbe(
        'jupiter',
        'SOL-USDC',
        answering(new ProviderThrottledError('GeckoTerminal', 429, 30_000)),
      ),
    ).toBe('unknown')
  })

  test('a dead transport is not an answer about the pair', async () => {
    expect(
      await classifyVenueProbe(
        'gate',
        'BTC-USDT',
        answering(new TypeError('Failed to fetch')),
      ),
    ).toBe('unknown')
  })

  test('the browser wall is not an answer about the pair', async () => {
    expect(
      await classifyVenueProbe(
        'kucoin',
        'BTC-USDT',
        answering(new PlatformRestrictedError('KuCoin')),
      ),
    ).toBe('unknown')
  })

  test('a venue with no history provider cannot be asked', async () => {
    expect(await classifyVenueProbe('gate', 'BTC-USDT', answering(null))).toBe(
      'unknown',
    )
  })

  test('a region block is its own verdict, not an unlisted one', async () => {
    expect(
      await classifyVenueProbe(
        'bybit',
        'BTC-USDT',
        answering(new GeoRestrictedError('bybit', 'US', 451)),
      ),
    ).toBe('blocked')
  })
})

describe('listingVerdict', () => {
  test('asks a venue once per pair, however many panes ask', async () => {
    let calls = 0
    const probe = () => {
      calls += 1
      return Promise.resolve([CANDLE])
    }
    const [a, b] = await Promise.all([
      listingVerdict('gate', 'BTC-USDT', probe),
      listingVerdict('gate', 'BTC-USDT', probe),
    ])
    expect([a, b]).toEqual(['listed', 'listed'])
    // The third asks after the first settled, so it is the CACHE being read
    // rather than the in-flight promise being shared.
    expect(await listingVerdict('gate', 'BTC-USDT', probe)).toBe('listed')
    expect(calls).toBe(1)
  })

  test('the pair is part of the question', async () => {
    let calls = 0
    const probe = (_m: string, pair: string) => {
      calls += 1
      return Promise.resolve(pair === 'BTC-USDT' ? [CANDLE] : [])
    }
    expect(await listingVerdict('bitvavo', 'BTC-USDT', probe)).toBe('listed')
    expect(await listingVerdict('bitvavo', 'BTC-EUR', probe)).toBe('unlisted')
    expect(calls).toBe(2)
  })

  test('a verdict survives the case the pair key arrives in', async () => {
    let calls = 0
    const probe = () => {
      calls += 1
      return Promise.resolve([CANDLE])
    }
    expect(await listingVerdict('gate', 'BTC-USDT', probe)).toBe('listed')
    expect(await listingVerdict('gate', 'btc-usdt', probe)).toBe('listed')
    expect(calls).toBe(1)
  })
})
