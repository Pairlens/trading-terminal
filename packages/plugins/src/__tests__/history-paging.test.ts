// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pan-left history paging contract.
 *
 * The chart backfills older bars by passing `endTs` — the oldest bar it holds —
 * and keeps only what comes back strictly older. A connector that ignores the
 * cursor therefore returns the same recent window every time, that window
 * filters to empty, and `use-chart-terminal-state` latches `exhausted`: scroll
 * back dies at the initial seed for the rest of the session, silently.
 *
 * Eleven of fifteen connectors shipped that way. These tests pin the cursor
 * onto the wire so it cannot be dropped again.
 */
import { afterEach, describe, expect, it } from 'bun:test'

import { fetchBitgetCandles } from '../bitget-market-connector/rest-client'
import { fetchCoinbaseCandles } from '../coinbase-market-connector/rest-client'
import { fetchKucoinCandles } from '../kucoin-market-connector/rest-client'
import { fetchGateCandles } from '../gate-market-connector/rest-client'
import { fetchBfxCandles } from '../bitfinex-market-connector/rest-client'
import { fetchCryptocomCandles } from '../cryptocom-market-connector/rest-client'
import { fetchUpbitCandles } from '../upbit-market-connector/rest-client'
import { fetchMexcCandles } from '../mexc-market-connector/rest-client'
import { fetchHtxCandles } from '../htx-market-connector/rest-client'
import { fetchKrakenCandles } from '../kraken-market-connector/rest-client'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Capture request URLs; answer with a shape each parser tolerates. */
function captureUrls(body: unknown) {
  const urls: Array<string> = []
  globalThis.fetch = ((input: string | URL | Request) => {
    urls.push(String(input))
    return Promise.resolve(new Response(JSON.stringify(body)))
  }) as unknown as typeof globalThis.fetch
  return urls
}

// A round timestamp so the expected cursor arithmetic is readable.
const CURSOR = 1_700_000_000_000
const SEC = Math.floor(CURSOR / 1000)

describe('connectors put the paging cursor on the wire', () => {
  const cases: Array<{
    venue: string
    body: unknown
    call: (endTs: number) => Promise<unknown>
    /** Substring the paged request URL must contain. */
    expected: string
  }> = [
    {
      venue: 'bitget',
      body: { code: '00000', data: [] },
      call: (e) => fetchBitgetCandles('BTC-USDT', '15m', 300, '', e),
      expected: `endTime=${CURSOR - 1}`,
    },
    {
      venue: 'coinbase',
      body: { candles: [] },
      call: (e) => fetchCoinbaseCandles('BTC-USDT', '15m', 300, '', e),
      expected: `end=${SEC - 1}`,
    },
    {
      venue: 'kucoin',
      body: { code: '200000', data: [] },
      call: (e) => fetchKucoinCandles('BTC-USDT', '15m', 300, '', e),
      expected: `endAt=${SEC - 1}`,
    },
    {
      venue: 'gate',
      body: [],
      call: (e) => fetchGateCandles('BTC-USDT', '15m', 300, '', undefined, e),
      expected: `to=${SEC - 1}`,
    },
    {
      venue: 'bitfinex',
      body: [],
      call: (e) => fetchBfxCandles('BTC-USD', '15m', 300, e),
      expected: `end=${CURSOR - 1}`,
    },
    {
      venue: 'cryptocom',
      body: { result: { data: [] } },
      call: (e) => fetchCryptocomCandles('BTC-USDT', '15m', 300, false, e),
      expected: `end_ts=${CURSOR - 1}`,
    },
    {
      venue: 'upbit',
      body: [],
      call: (e) => fetchUpbitCandles('BTC-USDT', '15m', 300, '', e),
      expected: 'to=2023-11-14T22:13:19Z',
    },
    {
      // MEXC ignores `endTime` unless `startTime` rides along (measured), so
      // the window is explicit rather than implied.
      venue: 'mexc',
      body: [],
      call: (e) => fetchMexcCandles('BTC-USDT', '15m', 300, '', e),
      expected: `startTime=`,
    },
  ]

  for (const c of cases) {
    it(`${c.venue} sends its cursor`, async () => {
      const urls = captureUrls(c.body)
      await c.call(CURSOR).catch(() => {})
      expect(urls.length).toBeGreaterThan(0)
      expect(decodeURIComponent(urls[0])).toContain(c.expected)
    })

    // The venues that page by time RANGE (Coinbase, KuCoin, Gate) always send
    // their bound; what must change is the value. Asserting "absent on first
    // load" would be wrong for them, so assert the request actually differs.
    it(`${c.venue} requests a different window when paging`, async () => {
      const unpaged = captureUrls(c.body)
      const first = c.call as unknown as (e?: number) => Promise<unknown>
      await first(undefined).catch(() => {})
      const paged = captureUrls(c.body)
      await c.call(CURSOR).catch(() => {})
      expect(unpaged[0]).not.toBe(paged[0])
      expect(decodeURIComponent(unpaged[0])).not.toContain(c.expected)
    })
  }

  it('mexc pairs endTime with startTime, since endTime alone is ignored', async () => {
    const urls = captureUrls([])
    await fetchMexcCandles('BTC-USDT', '15m', 300, '', CURSOR).catch(() => {})
    expect(urls[0]).toContain(`endTime=${CURSOR - 1}`)
    expect(urls[0]).toContain('startTime=')
  })
})

// HTX and Kraken expose no time cursor at all: HTX's kline endpoint takes only
// `size`, and Kraken's `since` selects a start and pages FORWARD. They page by
// pulling the widest window the venue allows and slicing older bars out of it,
// so the guarantee they must still honour is the filtering one.
describe('cursorless venues still return only older bars', () => {
  it('htx filters the widest window it can fetch', async () => {
    const sec = Math.floor(CURSOR / 1000)
    captureUrls({
      status: 'ok',
      data: [
        { id: sec, open: 1, high: 1, low: 1, close: 1, amount: 1 },
        { id: sec - 900, open: 1, high: 1, low: 1, close: 1, amount: 1 },
        { id: sec - 1800, open: 1, high: 1, low: 1, close: 1, amount: 1 },
      ],
    })
    const out = (await fetchHtxCandles(
      'BTC-USDT',
      '15m',
      300,
      CURSOR,
    )) as Array<{
      ts: number
    }>
    expect(out.every((c) => c.ts < CURSOR)).toBe(true)
    expect(out.length).toBe(2)
  })

  it('kraken filters the widest window it can fetch', async () => {
    const sec = Math.floor(CURSOR / 1000)
    const row = (t: number) => [t, '1', '1', '1', '1', '1', '1', 1]
    captureUrls({
      error: [],
      result: { XXBTZUSD: [row(sec - 1800), row(sec - 900), row(sec)] },
    })
    const out = (await fetchKrakenCandles(
      'BTC-USD',
      '15m',
      300,
      CURSOR,
    )) as Array<{
      ts: number
    }>
    expect(out.every((c) => c.ts < CURSOR)).toBe(true)
    expect(out.length).toBe(2)
  })
})
