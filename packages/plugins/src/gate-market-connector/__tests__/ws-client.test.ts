// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { GateWsClient } from '../ws-client'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type GateFrame = {
  time: number
  channel: string
  event: string
  payload?: Array<string>
}

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
  frames(event: string, channel?: string): Array<GateFrame> {
    return this.sent
      .map((s) => JSON.parse(s) as GateFrame)
      .filter((f) => f.event === event && (!channel || f.channel === channel))
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new GateWsClient({
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

const KLINE_UPDATE = {
  time: 1700000000,
  channel: 'spot.candlesticks',
  event: 'update',
  result: {
    t: '1700000000',
    o: '100',
    c: '105',
    h: '110',
    l: '95',
    a: '1234.5',
    v: '130000',
    n: '1h_BTC_USDT',
    w: false,
  },
}

const realFetch = globalThis.fetch

describe('GateWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // catch path (WS still delivers live candles).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('subscribes candlesticks with [interval, pair] payload and unsubscribes on release', async () => {
    const { client, sockets } = makeClient()

    const unsub = client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(10)

    const subs = sockets[0].frames('subscribe', 'spot.candlesticks')
    expect(subs.length).toBe(1)
    expect(subs[0].payload).toEqual(['1h', 'BTC_USDT'])
    expect(typeof subs[0].time).toBe('number')

    unsub()
    const unsubs = sockets[0].frames('unsubscribe', 'spot.candlesticks')
    expect(unsubs.length).toBe(1)
    expect(unsubs[0].payload).toEqual(['1h', 'BTC_USDT'])

    client.destroy()
  })

  it('shares one wire subscription between two candle subscribers', async () => {
    const { client, sockets } = makeClient()
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenA.push(d))
    await sleep(10)

    // A live candle lands in the shared buffer before B joins
    sockets[0].push(KLINE_UPDATE)
    expect(seenA.length).toBe(1)

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenB.push(d))
    await sleep(5)

    // No second wire subscribe — the key is shared
    expect(sockets[0].frames('subscribe', 'spot.candlesticks').length).toBe(1)
    // The late joiner is caught up from the buffer…
    expect(seenB.length).toBe(1)
    expect((seenB[0] as { type: string }).type).toBe('snapshot')

    // …and BOTH keep receiving live updates
    sockets[0].push(KLINE_UPDATE)
    expect(seenA.length).toBe(2)
    expect(seenB.length).toBe(2)

    client.destroy()
  })

  it('resubscribes all channels after a dropped connection', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    client.subscribeTicker('BTC-USDT', '', () => {})
    await sleep(10)

    sockets[0].drop()
    await sleep(15)

    expect(sockets.length).toBe(2)
    expect(
      sockets[1].frames('subscribe', 'spot.candlesticks')[0].payload,
    ).toEqual(['1h', 'BTC_USDT'])
    expect(sockets[1].frames('subscribe', 'spot.tickers')[0].payload).toEqual([
      'BTC_USDT',
    ])

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

    expect(sockets[0].frames('subscribe', 'spot.tickers').length).toBe(1)

    sockets[0].push({
      time: 1700000000,
      channel: 'spot.tickers',
      event: 'update',
      result: {
        currency_pair: 'BTC_USDT',
        last: '105',
        highest_bid: '104.9',
        lowest_ask: '105.1',
        high_24h: '120',
        low_24h: '90',
        base_volume: '50000',
        change_percentage: '5',
      },
    })

    expect(lasts).toEqual([105, 105])

    client.destroy()
  })

  it('subscribes the snapshot-only book with [pair, 50, 1000ms] payload and emits sorted levels', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []

    client.subscribeOrderbook('BTC-USDT', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(10)

    const subs = sockets[0].frames('subscribe', 'spot.order_book')
    expect(subs.length).toBe(1)
    expect(subs[0].payload).toEqual(['BTC_USDT', '50', '1000ms'])

    sockets[0].push({
      time: 1700000000,
      channel: 'spot.order_book',
      event: 'update',
      result: {
        s: 'BTC_USDT',
        t: 1700000000123,
        bids: [
          ['104.8', '2'],
          ['104.9', '1'],
        ],
        asks: [
          ['105.2', '3'],
          ['105.1', '1.5'],
        ],
      },
    })

    // Each frame is a full snapshot, sorted: bids descending, asks ascending
    expect(books[0].bids).toEqual([
      [104.9, 1],
      [104.8, 2],
    ])
    expect(books[0].asks).toEqual([
      [105.1, 1.5],
      [105.2, 3],
    ])

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    globalThis.fetch = ((url: string | URL) => {
      if (String(url).includes('/spot/candlesticks')) fetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient()
    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(30)

    // One initial attempt + exactly one paced retry — no retry storm.
    expect(fetches).toBe(2)

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
