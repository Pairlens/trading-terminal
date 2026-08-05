// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it } from 'bun:test'

import { fetchOkxCandles } from '../rest-client'
import { resolveOkxPublicRestBase, resolveOkxUrls } from '../regions'

const g = globalThis as {
  window?: unknown
  fetch: typeof globalThis.fetch
}
const hadWindow = 'window' in g
const originalWindow = g.window
const originalFetch = g.fetch

afterEach(() => {
  if (hadWindow) g.window = originalWindow
  else delete g.window
  g.fetch = originalFetch
})

/** Capture request URLs and answer with one OKX candle row. */
function stubFetch(rows: Array<Array<string>> = [CANDLE_ROW]) {
  const urls: Array<string> = []
  g.fetch = ((input: string | URL | Request) => {
    urls.push(String(input))
    return Promise.resolve(
      new Response(JSON.stringify({ code: '0', data: rows })),
    )
  }) as unknown as typeof globalThis.fetch
  return urls
}

// [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
const CANDLE_ROW = [
  '1785920400000',
  '100',
  '110',
  '95',
  '105',
  '12',
  '1200',
  '1200',
  '1',
]

describe('fetchOkxCandles endpoint selection', () => {
  // Regression: /market/candles serves only ~1440 recent bars per timeframe and
  // then returns `{code:"0", data:[]}` — a SUCCESS with no rows. The terminal's
  // pan-left backfill reads an empty page as "no older data" and latches
  // `exhausted`, so OKX charts dead-ended at ~1440 bars against a 5000-bar
  // budget. /market/history-candles covers the deep archive and is a measured
  // superset of /market/candles at the head.
  it('pages older data through history-candles, not candles', async () => {
    // A browser build, so the request stays on globalThis.fetch — the Tauri
    // branch would hand it to the Rust plugin and skip the stub entirely.
    g.window = {}
    const urls = stubFetch()

    await fetchOkxCandles('BTC-USDT', '15m', 300, 'ES', 1785920400000)

    expect(urls.length).toBe(1)
    expect(urls[0]).toContain('/api/v5/market/history-candles')
    expect(urls[0]).not.toContain('/api/v5/market/candles')
    // `after` pages strictly backwards from the oldest loaded bar.
    expect(urls[0]).toContain('after=1785920400000')
  })

  it('keeps the first page on the recent candles endpoint', async () => {
    g.window = {}
    const urls = stubFetch()

    await fetchOkxCandles('BTC-USDT', '15m', 300, 'ES')

    expect(urls[0]).toContain('/api/v5/market/candles')
    expect(urls[0]).not.toContain('history-candles')
    expect(urls[0]).not.toContain('after=')
  })

  it('clamps the page size to the venue maximum', async () => {
    g.window = {}
    const urls = stubFetch()

    await fetchOkxCandles('BTC-USDT', '15m', 5000, 'ES')

    expect(urls[0]).toContain('limit=300')
  })
})

describe('OKX public REST base', () => {
  // Regression: neither regional host sends Access-Control-Allow-Origin, so a
  // production browser build could not reach them at all — the candle backfill
  // died silently while the CORS-exempt WS feeds kept streaming.
  it('reads public data from the CORS-enabled global host on the web', () => {
    g.window = {} // production browser build
    // eea/us send no Access-Control-Allow-Origin; www.okx.com does, and serves
    // byte-identical instruments and candles (one engine, three legal wrappers).
    expect(resolveOkxPublicRestBase('ES')).toBe('https://www.okx.com')
    expect(resolveOkxPublicRestBase('US')).toBe('https://www.okx.com')
    expect(resolveOkxPublicRestBase('AR')).toBe('https://www.okx.com')
  })

  it('uses the exchange origin on desktop, where Rust-side fetch bypasses CORS', () => {
    g.window = { __TAURI_INTERNALS__: {} }
    expect(resolveOkxPublicRestBase('ES')).toBe('https://eea.okx.com')
    expect(resolveOkxPublicRestBase('US')).toBe('https://us.okx.com')
    expect(resolveOkxPublicRestBase('AR')).toBe('https://www.okx.com')
  })

  it('never routes public data through a same-origin path on the web', async () => {
    g.window = {}
    const urls = stubFetch()
    await fetchOkxCandles('BTC-USDT', '15m', 10, 'DE')
    // A `/__okx-*` prefix has no production counterpart — there is deliberately
    // no hosted proxy — so emitting one would fall through to the SPA catch-all
    // and hand the connector HTML instead of candles.
    expect(urls[0].startsWith('/')).toBe(false)
    expect(urls[0].startsWith('https://www.okx.com/api/v5/')).toBe(true)
  })

  // Reading public prices from the global host does NOT move the legal
  // boundary: orders still go to the user's regional entity.
  it('keeps trading pointed at the regional entity', () => {
    g.window = {}
    expect(resolveOkxUrls('ES').restBase).toBe('https://eea.okx.com')
    expect(resolveOkxUrls('US').restBase).toBe('https://us.okx.com')
    expect(resolveOkxUrls('AR').restBase).toBe('https://www.okx.com')
  })
})
