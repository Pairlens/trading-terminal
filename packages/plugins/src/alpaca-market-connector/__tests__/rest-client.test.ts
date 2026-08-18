// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { fetchAlpacaBulkTickers, fetchAlpacaQuoteBook } from '../rest-client'
import { alpacaMarketConnectorManifest } from '../index'
import { stockSymbols } from '../../catalog'

const CREDS = { apiKey: 'PKTEST123', apiSecret: 'alpaca-secret-DO-NOT-LEAK' }

type Captured = { url: string; init: RequestInit }

function stubFetch(responseJson: unknown, status = 200): Array<Captured> {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(responseJson), { status })
  }) as unknown as typeof fetch
  return calls
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Verbatim shape from GET /v2/stocks/snapshots. */
function snapshot(last: number, prevClose: number, bid = 0, bidSize = 0) {
  return {
    latestTrade: { p: last, t: '2026-08-14T19:59:59.546902529Z' },
    latestQuote: {
      bp: bid,
      bs: bidSize,
      ap: 0,
      as: 0,
      t: '2026-08-14T20:00:04Z',
    },
    dailyBar: { h: last, l: last, v: 1000, c: last },
    prevDailyBar: { c: prevClose },
  }
}

describe('fetchAlpacaBulkTickers — watchlist quotes', () => {
  it('asks for every symbol in one request on the IEX feed', async () => {
    const calls = stubFetch({ AAPL: snapshot(305.94, 305.305) })
    await fetchAlpacaBulkTickers(['AAPL', 'MSFT', 'NVDA'], CREDS)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('symbols=AAPL%2CMSFT%2CNVDA')
    expect(calls[0].url).toContain('feed=iex')
  })

  // Keyed by the BARE ticker, because consumers do `quotes.get(instrument
  // .symbol)` and a stock instrument's symbol is 'AAPL', not 'AAPL-USD'. This
  // was wrong once, and it fails in the worst way: every lookup misses, the
  // cell stays blank, and it looks identical to the capability not existing.
  it('keys entries by the bare ticker the catalog uses, not a pair key', async () => {
    stubFetch({
      AAPL: snapshot(305.94, 305.305),
      MSFT: snapshot(495.35, 496.79),
    })
    const out = await fetchAlpacaBulkTickers(['AAPL', 'MSFT'], CREDS)
    expect(out).toHaveLength(2)
    expect(out.map((t) => t.symbol)).toEqual(['AAPL', 'MSFT'])
    expect(out[0].symbol).not.toContain('-')
    expect(out[0].price).toBe(305.94)
    // (305.94 - 305.305) / 305.305 * 100
    expect(out[0].change24h).toBeCloseTo(0.20799, 4)
    // A down day stays negative — the watchlist colours rows off this sign.
    expect(out[1].change24h).toBeLessThan(0)
  })

  // A blank row is better than a row confidently reporting $0.
  it('drops symbols the feed has no usable price for', async () => {
    stubFetch({
      AAPL: snapshot(305.94, 305.305),
      NOPE: {},
      ZERO: snapshot(0, 10),
    })
    const out = await fetchAlpacaBulkTickers(['AAPL', 'NOPE', 'ZERO'], CREDS)
    expect(out.map((t) => t.symbol)).toEqual(['AAPL'])
  })

  // The catalog is the contract: every symbol asked for must come back under
  // a key the catalog actually uses, or the row silently never resolves.
  it('returns keys that match the catalog symbols exactly', async () => {
    const catalog = stockSymbols()
    const body: Record<string, unknown> = {}
    for (const s of catalog) body[s] = snapshot(100, 99)
    stubFetch(body)
    const out = await fetchAlpacaBulkTickers(catalog, CREDS)
    expect(out.map((t) => t.symbol)).toEqual(catalog)
  })

  it('makes no request at all for an empty symbol list', async () => {
    const calls = stubFetch({})
    expect(await fetchAlpacaBulkTickers([], CREDS)).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

/**
 * The movers table renders this field with a currency formatter, so a share
 * count here prints '$41.2M' for a stock that traded 41.2M shares of a $600
 * name. The daily bar carries the VWAP that turns one into the other.
 */
describe('fetchAlpacaBulkTickers — traded value', () => {
  /** A daily bar with the volume-weighted average price Alpaca publishes. */
  function withVwap(last: number, prevClose: number, v: number, vw: number) {
    const base = snapshot(last, prevClose)
    return { ...base, dailyBar: { ...base.dailyBar, v, vw } }
  }

  it('reports shares times VWAP, not the share count', async () => {
    stubFetch({ AAPL: withVwap(305.94, 305.305, 41_200_000, 304.5) })
    const [row] = await fetchAlpacaBulkTickers(['AAPL'], CREDS)
    expect(row.volume24h).toBeCloseTo(41_200_000 * 304.5, 0)
  })

  it('falls back to the last print when the bar carries no VWAP', async () => {
    stubFetch({ AAPL: snapshot(200, 199) }) // dailyBar.v = 1000, no vw
    const [row] = await fetchAlpacaBulkTickers(['AAPL'], CREDS)
    expect(row.volume24h).toBe(1000 * 200)
  })

  // Pre-market on a thin name: nothing has traded. An absent figure is the
  // honest answer; a zero would rank it above every stock that did trade.
  it('omits the field when the session has traded nothing', async () => {
    const empty = withVwap(200, 199, 0, 0)
    stubFetch({ AAPL: empty })
    const [row] = await fetchAlpacaBulkTickers(['AAPL'], CREDS)
    expect(row.volume24h).toBeUndefined()
    expect('volume24h' in row).toBe(false)
  })
})

describe('fetchAlpacaQuoteBook — order book seed', () => {
  // Regression: the book used to be seeded from a TickerSnapshot, which
  // carries prices but no sizes, so every level rendered as 0.000 and the
  // pane looked broken rather than one level deep.
  it('carries the quote sizes, not zeros', async () => {
    stubFetch({ AAPL: snapshot(305.94, 305.305, 290.32, 40) })
    const book = await fetchAlpacaQuoteBook('AAPL-USD', CREDS)
    expect(book?.bids).toEqual([[290.32, 40]])
  })

  // The IEX tape has no ask outside regular hours; one live side is correct.
  it('returns a one-sided book when the feed has no ask', async () => {
    stubFetch({ AAPL: snapshot(305.94, 305.305, 290.32, 40) })
    const book = await fetchAlpacaQuoteBook('AAPL-USD', CREDS)
    expect(book?.asks).toEqual([])
  })

  it('returns null rather than throwing when the request fails', async () => {
    stubFetch({ message: 'forbidden' }, 403)
    expect(await fetchAlpacaQuoteBook('AAPL-USD', CREDS)).toBeNull()
  })
})

describe('ticker-snapshot capability declaration', () => {
  // markets: ['*'] is what makes stock rows appear in the watchlist while a
  // crypto venue is charted. Scoped to ['alpaca'] they would only ever show
  // when Alpaca itself was the active market, which is not when you need them.
  it('serves every market, not just Alpaca', () => {
    const cap = alpacaMarketConnectorManifest.capabilities.find(
      (c) => c.id === 'market-data:ticker-snapshot',
    )
    expect(cap).toBeDefined()
    expect(cap?.markets).toEqual(['*'])
    expect(cap?.streaming).toBe(false)
  })
})
