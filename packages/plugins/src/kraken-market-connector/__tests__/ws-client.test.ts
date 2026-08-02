// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { KrakenWsClient } from '../ws-client'
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
  frames(method: string, channel?: string): Array<Record<string, unknown>> {
    return this.sent
      .map(
        (s) =>
          JSON.parse(s) as { method: string; params?: { channel?: string } },
      )
      .filter(
        (f) =>
          f.method === method && (!channel || f.params?.channel === channel),
      ) as Array<Record<string, unknown>>
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new KrakenWsClient({
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

const OHLC_UPDATE = {
  channel: 'ohlc',
  type: 'update',
  data: [
    {
      symbol: 'BTC/USDT',
      interval_begin: '2023-11-14T22:00:00.000Z',
      interval: 60,
      open: 100,
      high: 110,
      low: 95,
      close: 105,
      volume: 1234.5,
    },
  ],
}

const realFetch = globalThis.fetch

describe('KrakenWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // catch path (WS still delivers live candles).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('subscribes ohlc with a snapshot on first connect and unsubscribes on release', async () => {
    const { client, sockets } = makeClient()

    const unsub = client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(10)

    const subs = sockets[0].frames('subscribe', 'ohlc')
    expect(subs.length).toBe(1)
    expect(subs[0]['params']).toEqual({
      channel: 'ohlc',
      symbol: ['BTC/USDT'],
      interval: 60,
      snapshot: true,
    })

    unsub()
    const unsubs = sockets[0].frames('unsubscribe', 'ohlc')
    expect(unsubs.length).toBe(1)

    client.destroy()
  })

  it('shares one wire subscription between two candle subscribers (watchlist regression)', async () => {
    const { client, sockets } = makeClient()
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenA.push(d))
    await sleep(10)

    // A live candle lands in the shared buffer before B joins
    sockets[0].push(OHLC_UPDATE)
    expect(seenA.length).toBe(1)

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenB.push(d))
    await sleep(5)

    // No second wire subscribe — the key is shared
    expect(sockets[0].frames('subscribe', 'ohlc').length).toBe(1)
    // The late joiner is caught up from the buffer…
    expect(seenB.length).toBe(1)
    expect((seenB[0] as { type: string }).type).toBe('snapshot')

    // …and BOTH keep receiving live updates (the first subscriber's stream
    // must not die when a second panel subscribes — the shipped watchlist bug)
    sockets[0].push(OHLC_UPDATE)
    expect(seenA.length).toBe(2)
    expect(seenB.length).toBe(2)

    client.destroy()
  })

  it('resubscribes with a fresh snapshot after a dropped connection', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(10)

    sockets[0].drop()
    await sleep(15)

    expect(sockets.length).toBe(2)
    const resubs = sockets[1].frames('subscribe', 'ohlc')
    expect(resubs.length).toBe(1)
    expect((resubs[0]['params'] as { snapshot?: boolean }).snapshot).toBe(true)

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    globalThis.fetch = (() => {
      fetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient()
    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(30)

    // One initial attempt + exactly one paced retry — no retry storm.
    expect(fetches).toBe(2)

    client.destroy()
  })

  it('seeds the chart from the WS ohlc snapshot when REST backfill fails', async () => {
    const { client, sockets } = makeClient()
    const seen: Array<{ type: string; candles: Array<unknown> }> = []

    // REST is offline (beforeEach stub) — the WS snapshot must still deliver
    // a 'snapshot' so the UI's hasSnapshot gate opens (the "live top bar,
    // hours-stale chart" bug when Kraken REST is rate-limited).
    client.subscribeCandles('BTC-USDT', '1h', '', (d) =>
      seen.push(d as (typeof seen)[number]),
    )
    await sleep(10)

    sockets[0].push({
      channel: 'ohlc',
      type: 'snapshot',
      data: [
        { ...OHLC_UPDATE.data[0], interval_begin: '2023-11-14T21:00:00.000Z' },
        OHLC_UPDATE.data[0],
      ],
    })

    const snapshots = seen.filter((s) => s.type === 'snapshot')
    expect(snapshots.length).toBe(1)
    expect(snapshots[0].candles.length).toBe(2)

    // Live updates keep flowing afterwards
    sockets[0].push(OHLC_UPDATE)
    expect(seen.filter((s) => s.type === 'update').length).toBe(1)

    client.destroy()
  })

  it('fans a ticker out to every subscriber of the pair', async () => {
    const { client, sockets } = makeClient()
    const lasts: Array<number> = []

    client.subscribeTicker('BTC-USDT', '', (d) =>
      lasts.push((d as { ticker: { last: number } }).ticker.last),
    )
    client.subscribeTicker('BTC-USDT', '', (d) =>
      lasts.push((d as { ticker: { last: number } }).ticker.last),
    )
    await sleep(10)

    expect(sockets[0].frames('subscribe', 'ticker').length).toBe(1)

    sockets[0].push({
      channel: 'ticker',
      data: [
        {
          symbol: 'BTC/USDT',
          last: 105,
          bid: 104.9,
          ask: 105.1,
          high: 120,
          low: 90,
          volume: 50000,
          change: 5,
          change_pct: 5,
        },
      ],
    })

    expect(lasts).toEqual([105, 105])

    client.destroy()
  })

  it('maintains, trims, and resets the local book across reconnects', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []

    client.subscribeOrderbook('BTC-USDT', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(10)

    sockets[0].push({
      channel: 'book',
      type: 'snapshot',
      data: [
        {
          symbol: 'BTC/USDT',
          bids: [
            { price: 104.9, qty: 1 },
            { price: 104.8, qty: 2 },
          ],
          asks: [
            { price: 105.1, qty: 1.5 },
            { price: 105.2, qty: 3 },
          ],
        },
      ],
    })
    expect(books[0].bids).toEqual([
      [104.9, 1],
      [104.8, 2],
    ])

    // Incremental update: qty=0 removes a level
    sockets[0].push({
      channel: 'book',
      type: 'update',
      data: [
        {
          symbol: 'BTC/USDT',
          bids: [{ price: 104.8, qty: 0 }],
          asks: [],
        },
      ],
    })
    expect(books[1].bids).toEqual([[104.9, 1]])

    // Reconnect: local book resets, fresh snapshot rebuilds it
    sockets[0].drop()
    await sleep(15)
    sockets[1].push({
      channel: 'book',
      type: 'snapshot',
      data: [
        {
          symbol: 'BTC/USDT',
          bids: [{ price: 200, qty: 7 }],
          asks: [{ price: 201, qty: 7 }],
        },
      ],
    })
    expect(books[2].bids).toEqual([[200, 7]])

    client.destroy()
  })

  it('throws on an unsupported timeframe', () => {
    const { client } = makeClient()
    expect(() =>
      client.subscribeCandles('BTC-USDT', '3h', '', () => {}),
    ).toThrow('Unsupported timeframe')
    client.destroy()
  })
})
