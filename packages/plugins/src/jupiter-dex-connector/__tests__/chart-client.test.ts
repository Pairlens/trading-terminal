// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The mint-keyed chart source, pinned on the four things that break silently.
 *
 * This source exists because a token still on its bonding curve has no AMM
 * pool, so GeckoTerminal has nothing to resolve and the chart is BLANK for
 * exactly the tokens the New and Graduating columns exist to surface. Measured
 * against three mints minted within the hour, GeckoTerminal answered zero pools
 * for every one of them and this endpoint answered candles for all three. So
 * the failure this guards is not a slow chart, it is an empty one.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import {
  fetchJupiterCandles,
  mintOfPair,
  supportsTimeframe,
} from '../chart-client'

const MINT = 'FptuDJmnrdVsJj2FEdKW84PqPEm1AWFmtkmxN6rfpump'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Captures the URL so the request's own shape can be asserted. */
function stub(body: unknown, status = 200): { urls: Array<string> } {
  const urls: Array<string> = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(typeof input === 'string' ? input : String(input))
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof globalThis.fetch
  return { urls }
}

describe('mintOfPair', () => {
  test('takes the base leg of a memecoin key', () => {
    expect(mintOfPair(`${MINT}-USDC`)).toBe(MINT)
    expect(mintOfPair(`${MINT}-SOL`)).toBe(MINT)
  })

  test('refuses a symbol pair, so it falls through to the pool provider', () => {
    // The endpoint is keyed on a mint and cannot answer for `SOL`. Guessing
    // here would claim a pair this source cannot serve and strand the pane on
    // an empty chart rather than letting GeckoTerminal answer it.
    expect(mintOfPair('SOL-USDC')).toBeNull()
    expect(mintOfPair('BTC-USDT')).toBeNull()
  })

  test('splits on the LAST hyphen', () => {
    // Quote legs are hyphen-free and addresses are base58, but the split has to
    // be anchored at the end regardless or a future quote with a hyphen in it
    // would silently truncate the mint.
    expect(mintOfPair(MINT)).toBe(MINT)
  })
})

describe('timeframe mapping', () => {
  test('maps what the endpoint accepts and refuses what it does not', () => {
    for (const tf of ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']) {
      expect(supportsTimeframe(tf)).toBe(true)
    }
    // Probed live: these have no interval token, and approximating `2h` from
    // 1h bars would draw a chart that is wrong rather than absent.
    for (const tf of ['2h', '3d', '1M']) {
      expect(supportsTimeframe(tf)).toBe(false)
    }
  })
})

describe('fetchJupiterCandles', () => {
  test('asks in MILLISECONDS and names a candle count', async () => {
    // Both learned against the live endpoint: a second-denominated window
    // answers `200 {"candles":[]}` — a silent empty chart, not an error — and
    // a missing `candles` answers 400.
    const { urls } = stub({ candles: [] })
    const now = 1_787_760_000_000
    await fetchJupiterCandles(`${MINT}-USDC`, '1m', 100, now)

    const url = new URL(urls[0])
    expect(url.pathname.endsWith(`/${MINT}`)).toBe(true)
    expect(url.searchParams.get('interval')).toBe('1_MINUTE')
    expect(url.searchParams.get('candles')).toBe('100')
    expect(Number(url.searchParams.get('to'))).toBe(now)
    // A millisecond window, which for 100 one-minute bars is hours, not seconds.
    const from = Number(url.searchParams.get('from'))
    expect(now - from).toBeGreaterThan(60_000 * 100)
  })

  test('converts second timestamps to the millisecond ts the terminal uses', async () => {
    stub({
      candles: [
        {
          time: 1_787_749_860,
          open: 2,
          high: 3,
          low: 1,
          close: 2.5,
          volume: 10,
        },
        { time: 1_787_749_800, open: 1, high: 2, low: 1, close: 2, volume: 5 },
      ],
    })
    const candles = await fetchJupiterCandles(`${MINT}-USDC`, '1m', 100)

    // Chronological, oldest first: the endpoint's order is not guaranteed and
    // a chart fed newest-first draws backwards.
    expect(candles.map((c) => c.ts)).toEqual([
      1_787_749_800_000, 1_787_749_860_000,
    ])
    // Seconds, not milliseconds: getting this backwards paints every bar in 1970.
    expect(new Date(candles[0].ts).getUTCFullYear()).toBeGreaterThan(2020)
  })

  test('drops a bar missing a price rather than charting a zero', async () => {
    stub({
      candles: [
        { time: 1_787_749_800, open: 1, high: 2, low: 1, close: 2, volume: 5 },
        { time: 1_787_749_860, open: null, high: 3, low: 1, close: 2.5 },
      ],
    })
    const candles = await fetchJupiterCandles(`${MINT}-USDC`, '1m', 100)
    expect(candles).toHaveLength(1)
    // Volume is the one field allowed to default: a bar with prices and no
    // reported volume is a real bar.
    expect(candles[0].volume).toBe(5)
  })

  test('throws on a bad status so the wildcard provider answers instead', async () => {
    // The endpoint is jup.ag's own undocumented frontend backend. Returning
    // empty on a 500 would latch "this token does not trade" as the answer;
    // throwing lets the plugin manager walk past to GeckoTerminal.
    stub({ error: 'nope' }, 502)
    await expect(
      fetchJupiterCandles(`${MINT}-USDC`, '1m', 100),
    ).rejects.toThrow('502')
  })

  test('answers empty for a pair or timeframe it cannot serve, without a request', async () => {
    const { urls } = stub({ candles: [] })
    expect(await fetchJupiterCandles('SOL-USDC', '1m', 100)).toEqual([])
    expect(await fetchJupiterCandles(`${MINT}-USDC`, '2h', 100)).toEqual([])
    expect(urls).toHaveLength(0)
  })
})
