// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { KucoinWsClient } from '../ws-client'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

class FakeSocket implements WsConnection {
  sent: Array<string> = []
  closed = false
  constructor(readonly events: WsAdapterEvents) {}
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {
    if (this.closed) return
    this.closed = true
    setTimeout(() => this.events.onClose?.(1000, 'client closed'), 0)
  }
  drop(): void {
    if (this.closed) return
    this.closed = true
    this.events.onClose?.(1006, 'dropped')
  }
  push(msg: unknown): void {
    this.events.onMessage(JSON.stringify(msg))
  }
  frames(type: string): Array<{ type: string; topic?: string }> {
    return this.sent
      .map((s) => JSON.parse(s) as { type: string; topic?: string })
      .filter((f) => f.type === type)
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const urls: Array<string> = []
  const client = new KucoinWsClient({
    baseBackoffMs: 2,
    gracePeriodMs: 5,
    backfillRetryDelayMs: 5,
    random: () => 1,
    connect: async (url, events) => {
      urls.push(url)
      const socket = new FakeSocket(events)
      sockets.push(socket)
      return socket
    },
  })
  return { client, sockets, urls }
}

const BULLET_RESPONSE = {
  code: '200000',
  data: {
    token: 'test-token-abc',
    instanceServers: [
      {
        endpoint: 'wss://ws-api.kucoin.example',
        pingInterval: 18000,
        pingTimeout: 10000,
      },
    ],
  },
}

const realFetch = globalThis.fetch

describe('KucoinWsClient on ReconnectingWsSession', () => {
  let bulletCalls = 0

  beforeEach(() => {
    bulletCalls = 0
    // bullet-public bootstrap succeeds; candle backfill + stats REST fail
    // silently (WS still delivers live data — same as the kraken test).
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (String(input).includes('bullet-public')) {
        bulletCalls++
        return Promise.resolve(
          new Response(JSON.stringify(BULLET_RESPONSE), { status: 200 }),
        )
      }
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('bootstraps a token, connects to the tokenized endpoint, and subscribes the topic', async () => {
    const { client, sockets, urls } = makeClient()

    const unsub = client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(15)

    expect(urls[0]).toContain(
      'wss://ws-api.kucoin.example?token=test-token-abc',
    )
    const subs = sockets[0].frames('subscribe')
    expect(subs.length).toBe(1)
    expect(subs[0].topic).toBe('/market/candles:BTC-USDT_1hour')

    unsub()
    expect(sockets[0].frames('unsubscribe').length).toBe(1)

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let candleFetches = 0
    // Same stub as the describe-level beforeEach — bullet-public must keep
    // succeeding so the WS connects — plus a counter on the candle endpoint.
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (String(input).includes('bullet-public')) {
        bulletCalls++
        return Promise.resolve(
          new Response(JSON.stringify(BULLET_RESPONSE), { status: 200 }),
        )
      }
      if (String(input).includes('/market/candles')) candleFetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient()
    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(30)

    // One initial attempt + exactly one paced retry — no retry storm.
    expect(candleFetches).toBe(2)

    client.destroy()
  })

  it('shares one wire topic between two candle subscribers and fans out updates', async () => {
    const { client, sockets } = makeClient()
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenA.push(d))
    await sleep(15)
    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenB.push(d))
    await sleep(5)

    expect(sockets[0].frames('subscribe').length).toBe(1)

    sockets[0].push({
      type: 'message',
      topic: '/market/candles:BTC-USDT_1hour',
      subject: 'trade.candles.update',
      data: {
        symbol: 'BTC-USDT',
        candles: ['1700000000', '100', '105', '110', '95', '1234.5', '130000'],
      },
    })

    expect(seenA.length).toBe(1)
    expect(seenB.length).toBe(1)
    expect((seenA[0] as { type: string }).type).toBe('update')

    client.destroy()
  })

  it('reconnects with the cached token (no second bullet POST) and resubscribes', async () => {
    const { client, sockets, urls } = makeClient()

    client.subscribeTicker('BTC-USDT', '', () => {})
    await sleep(15)
    expect(bulletCalls).toBe(1)

    sockets[0].drop()
    await sleep(20)

    expect(sockets.length).toBe(2)
    expect(urls[1]).toContain('token=test-token-abc')
    // The ~24h token is reused across reconnects — no serial POST on the
    // reconnect path (it added ~300-500ms to every market switch back).
    expect(bulletCalls).toBe(1)
    const resubs = sockets[1].frames('subscribe')
    expect(resubs.length).toBe(1)
    expect(resubs[0].topic).toBe('/market/ticker:BTC-USDT')

    client.destroy()
  })

  it('drops the cached token when a connect attempt fails', async () => {
    const sockets: Array<FakeSocket> = []
    let failNext = false
    const client = new KucoinWsClient({
      baseBackoffMs: 2,
      gracePeriodMs: 5,
      random: () => 1,
      connect: async (_url, events) => {
        if (failNext) {
          failNext = false
          throw new Error('connect refused')
        }
        const socket = new FakeSocket(events)
        sockets.push(socket)
        return socket
      },
    })

    client.subscribeTicker('BTC-USDT', '', () => {})
    await sleep(15)
    expect(bulletCalls).toBe(1)

    // Drop the socket and refuse the next connect — e.g. the exchange
    // rejected a stale token. The cache must be invalidated so the retry
    // bootstraps a fresh token.
    failNext = true
    sockets[0].drop()
    await sleep(30)

    expect(sockets.length).toBe(2)
    expect(bulletCalls).toBe(2)

    client.destroy()
  })

  it('merges WS price with cached 24h stats when routing tickers', async () => {
    const { client, sockets } = makeClient()
    const tickers: Array<{ ticker: { last: number; high24h: number } }> = []

    client.subscribeTicker('BTC-USDT', '', (d) =>
      tickers.push(d as (typeof tickers)[number]),
    )
    await sleep(15)

    sockets[0].push({
      type: 'message',
      topic: '/market/ticker:BTC-USDT',
      data: {
        price: '61500.5',
        bestBid: '61500',
        bestAsk: '61501',
        time: 1700000000000,
      },
    })

    expect(tickers.length).toBe(1)
    expect(tickers[0].ticker.last).toBe(61500.5)
    // Stats REST failed (offline stub) — 24h fields fall back to 0
    expect(tickers[0].ticker.high24h).toBe(0)

    client.destroy()
  })

  it('routes level2 depth snapshots to the book subscriber', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{ bids: Array<[number, number]> }> = []

    client.subscribeOrderbook('BTC-USDT', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(15)

    sockets[0].push({
      type: 'message',
      topic: '/spotMarket/level2Depth50:BTC-USDT',
      data: {
        bids: [
          ['61500', '1'],
          ['61499', '2'],
        ],
        asks: [['61501', '1.5']],
        timestamp: 1700000000000,
      },
    })

    expect(books.length).toBe(1)
    expect(books[0].bids).toEqual([
      [61500, 1],
      [61499, 2],
    ])

    client.destroy()
  })
})
