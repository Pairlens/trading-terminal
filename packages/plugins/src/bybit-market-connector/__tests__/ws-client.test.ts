// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BybitWsClient } from '../ws-client'
import { sleep, waitFor } from '../../test-utils/async'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'

class FakeSocket implements WsConnection {
  sent: Array<string> = []
  closed = false
  constructor(
    readonly url: string,
    readonly events: WsAdapterEvents,
  ) {}
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
  frames(op: string): Array<{ op: string; args?: Array<string> }> {
    return this.sent
      .map((s) => JSON.parse(s) as { op: string; args?: Array<string> })
      .filter((f) => f.op === op)
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new BybitWsClient({
    baseBackoffMs: 2,
    gracePeriodMs: 5,
    backfillRetryDelayMs: 5,
    random: () => 1,
    connect: async (url, events) => {
      const socket = new FakeSocket(url, events)
      sockets.push(socket)
      return socket
    },
  })
  return { client, sockets }
}

const KLINE_UPDATE = {
  topic: 'kline.60.BTCUSDT',
  type: 'delta',
  data: [
    {
      start: 1700000000000,
      open: '100',
      high: '110',
      low: '95',
      close: '105',
      volume: '1234.5',
      confirm: false,
    },
  ],
}

const realFetch = globalThis.fetch

describe('BybitWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // catch path (WS still delivers live candles).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('sends the kline subscribe frame on connect and unsubscribes on release', async () => {
    const { client, sockets } = makeClient()

    const unsub = client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(10)

    const subs = sockets[0].frames('subscribe')
    expect(subs.length).toBe(1)
    expect(subs[0].args).toEqual(['kline.60.BTCUSDT'])

    unsub()
    const unsubs = sockets[0].frames('unsubscribe')
    expect(unsubs.length).toBe(1)
    expect(unsubs[0].args).toEqual(['kline.60.BTCUSDT'])

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
    expect(sockets[0].frames('subscribe').length).toBe(1)
    // The late joiner is caught up from the buffer…
    expect(seenB.length).toBe(1)
    expect((seenB[0] as { type: string }).type).toBe('snapshot')

    // …and BOTH keep receiving live updates
    sockets[0].push(KLINE_UPDATE)
    expect(seenA.length).toBe(2)
    expect(seenB.length).toBe(2)

    client.destroy()
  })

  it('resubscribes all topics after a dropped connection', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    client.subscribeTicker('BTC-USDT', '', () => {})
    await sleep(10)

    sockets[0].drop()
    await waitFor(() => sockets.length === 2 && sockets[1].sent.length > 0)

    expect(sockets.length).toBe(2)
    const topics = sockets[1].frames('subscribe').flatMap((f) => f.args ?? [])
    expect(topics.sort()).toEqual(['kline.60.BTCUSDT', 'tickers.BTCUSDT'])

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (String(input).includes('/v5/market/kline')) fetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient()
    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await waitFor(() => fetches >= 2)

    // One initial attempt + exactly one paced retry. The fixed window is
    // the no-retry-storm half of the claim: negative, so it stays a sleep.
    await sleep(30)
    expect(fetches).toBe(2)

    client.destroy()
  })

  it('replies pong to a server ping frame', async () => {
    const { client, sockets } = makeClient()

    client.subscribeTicker('BTC-USDT', '', () => {})
    await sleep(10)

    sockets[0].push({ op: 'ping' })
    expect(sockets[0].frames('pong').length).toBe(1)

    client.destroy()
  })

  it('restarts onto the regional endpoint when the country changes', async () => {
    const { client, sockets } = makeClient()

    client.subscribeTicker('BTC-USDT', 'AR', () => {})
    await sleep(10)
    expect(sockets[0].url).toBe('wss://stream.bybit.com/v5/public/spot')

    // Country change while connected forces a restart onto the EU endpoint
    client.subscribeCandles('BTC-USDT', '1h', 'DE', () => {})
    await sleep(20)

    expect(sockets.length).toBeGreaterThan(1)
    const current = sockets[sockets.length - 1]
    expect(current.url).toBe('wss://stream.bybit.nl/v5/public/spot')
    const topics = current.frames('subscribe').flatMap((f) => f.args ?? [])
    expect(topics.sort()).toEqual(['kline.60.BTCUSDT', 'tickers.BTCUSDT'])

    client.destroy()
  })

  it('maintains the incremental book and resets it across reconnects', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []

    client.subscribeOrderbook('BTC-USDT', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(10)
    expect(sockets[0].frames('subscribe')[0].args).toEqual([
      'orderbook.50.BTCUSDT',
    ])

    sockets[0].push({
      topic: 'orderbook.50.BTCUSDT',
      type: 'snapshot',
      data: {
        b: [
          ['104.9', '1'],
          ['104.8', '2'],
        ],
        a: [['105.1', '1.5']],
        u: 1,
      },
    })
    expect(books[0].bids).toEqual([
      [104.9, 1],
      [104.8, 2],
    ])

    // Delta: size=0 removes a level
    sockets[0].push({
      topic: 'orderbook.50.BTCUSDT',
      type: 'delta',
      data: { b: [['104.8', '0']], a: [], u: 2 },
    })
    expect(books[1].bids).toEqual([[104.9, 1]])

    // Reconnect: local book resets, fresh snapshot rebuilds it
    sockets[0].drop()
    await sleep(15)
    sockets[1].push({
      topic: 'orderbook.50.BTCUSDT',
      type: 'snapshot',
      data: { b: [['200', '7']], a: [['201', '7']], u: 3 },
    })
    expect(books[2].bids).toEqual([[200, 7]])
    expect(books[2].asks).toEqual([[201, 7]])

    client.destroy()
  })
})
