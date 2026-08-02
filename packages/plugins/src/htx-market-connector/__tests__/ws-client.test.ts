// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { gzipSync } from 'bun'

import { HtxWsClient } from '../ws-client'
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
  /** HTX sends every frame gzip-compressed as binary. */
  pushGzip(msg: unknown): void {
    const gz = gzipSync(JSON.stringify(msg))
    this.events.onMessage(
      gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength),
    )
  }
  frames(field: 'sub' | 'unsub' | 'pong'): Array<Record<string, unknown>> {
    return this.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .filter((f) => field in f)
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new HtxWsClient({
    baseBackoffMs: 2,
    gracePeriodMs: 5,
    backfillRetryDelayMs: 5,
    random: () => 1,
    connect: async (_url, events) => {
      const socket = new FakeSocket(events)
      sockets.push(socket)
      return socket
    },
  })
  return { client, sockets }
}

const KLINE_PUSH = {
  ch: 'market.btcusdt.kline.60min',
  ts: 1700000000000,
  tick: {
    id: 1700000000,
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    amount: 12.5,
  },
}

const realFetch = globalThis.fetch

describe('HtxWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // catch path (WS still delivers live candles).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('subscribes kline on first connect and unsubscribes on release', async () => {
    const { client, sockets } = makeClient()

    const unsub = client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(10)

    const subs = sockets[0].frames('sub')
    expect(subs).toEqual([
      { sub: 'market.btcusdt.kline.60min', id: 'market.btcusdt.kline.60min' },
    ])

    unsub()
    expect(sockets[0].frames('unsub')).toEqual([
      { unsub: 'market.btcusdt.kline.60min', id: 'market.btcusdt.kline.60min' },
    ])

    client.destroy()
  })

  it('decodes gzip binary frames and echoes server ping as pong', async () => {
    const { client, sockets } = makeClient()
    const seen: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seen.push(d))
    await sleep(10)

    sockets[0].pushGzip(KLINE_PUSH)
    await sleep(10) // async gunzip
    expect(seen.length).toBe(1)
    expect(seen[0]).toEqual({
      type: 'update',
      candles: [
        {
          ts: 1700000000000,
          open: 100,
          high: 110,
          low: 95,
          close: 105,
          volume: 12.5,
        },
      ],
    })

    sockets[0].pushGzip({ ping: 424242 })
    await sleep(10)
    expect(sockets[0].frames('pong')).toEqual([{ pong: 424242 }])

    client.destroy()
  })

  it('shares one wire subscription between two candle subscribers with buffer replay', async () => {
    const { client, sockets } = makeClient()
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenA.push(d))
    await sleep(10)

    sockets[0].pushGzip(KLINE_PUSH)
    await sleep(10)
    expect(seenA.length).toBe(1)

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenB.push(d))
    await sleep(10)

    // No second wire subscribe — the key is shared
    expect(sockets[0].frames('sub').length).toBe(1)
    // The late joiner is caught up from the buffer…
    expect(seenB.length).toBe(1)
    expect((seenB[0] as { type: string }).type).toBe('snapshot')

    // …and BOTH keep receiving live updates
    sockets[0].pushGzip(KLINE_PUSH)
    await sleep(10)
    expect(seenA.length).toBe(2)
    expect(seenB.length).toBe(2)

    client.destroy()
  })

  it('merges detail + bbo channels into one ticker and unsubscribes both on last release', async () => {
    const { client, sockets } = makeClient()
    const tickers: Array<{ last: number; bid: number; ask: number }> = []

    const unsubA = client.subscribeTicker('BTC-USDT', '', (d) =>
      tickers.push((d as { ticker: (typeof tickers)[number] }).ticker),
    )
    const unsubB = client.subscribeTicker('BTC-USDT', '', () => {})
    await sleep(10)

    // One logical ticker = exactly two wire subs (detail + bbo), sent once
    expect(sockets[0].frames('sub').map((f) => f['sub'])).toEqual([
      'market.btcusdt.detail',
      'market.btcusdt.bbo',
    ])

    sockets[0].pushGzip({
      ch: 'market.btcusdt.bbo',
      tick: { bid: 104.9, ask: 105.1 },
    })
    await sleep(10)
    sockets[0].pushGzip({
      ch: 'market.btcusdt.detail',
      tick: { open: 100, close: 105, high: 120, low: 90, amount: 5000 },
    })
    await sleep(10)

    // Second emit carries the merged state from BOTH channels
    expect(tickers.length).toBe(2)
    expect(tickers[1]).toMatchObject({ last: 105, bid: 104.9, ask: 105.1 })

    // First release keeps the shared wire subscription alive
    unsubA()
    expect(sockets[0].frames('unsub').length).toBe(0)

    // Last release unsubscribes BOTH wire channels
    unsubB()
    expect(sockets[0].frames('unsub').map((f) => f['unsub'])).toEqual([
      'market.btcusdt.detail',
      'market.btcusdt.bbo',
    ])

    client.destroy()
  })

  it('resubscribes every channel after a dropped connection', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    client.subscribeOrderbook('BTC-USDT', '', () => {})
    await sleep(10)

    sockets[0].drop()
    await sleep(15)

    expect(sockets.length).toBe(2)
    expect(sockets[1].frames('sub').map((f) => f['sub'])).toEqual([
      'market.btcusdt.kline.60min',
      'market.btcusdt.depth.step0',
    ])

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    globalThis.fetch = ((url: string | URL) => {
      if (String(url).includes('/market/history/kline')) fetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient()
    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(30)

    // One initial attempt + exactly one paced retry — no retry storm.
    expect(fetches).toBe(2)

    client.destroy()
  })

  it('trims depth snapshots to 20 levels', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []

    client.subscribeOrderbook('BTC-USDT', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(10)

    const bids = Array.from({ length: 30 }, (_, i) => [100 - i, i + 1])
    const asks = Array.from({ length: 30 }, (_, i) => [101 + i, i + 1])
    sockets[0].pushGzip({
      ch: 'market.btcusdt.depth.step0',
      tick: { bids, asks },
    })
    await sleep(10)

    expect(books.length).toBe(1)
    expect(books[0].bids.length).toBe(20)
    expect(books[0].asks.length).toBe(20)
    expect(books[0].bids[0]).toEqual([100, 1])
    expect(books[0].asks[0]).toEqual([101, 1])

    client.destroy()
  })
})
