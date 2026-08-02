// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { CryptocomWsClient } from '../ws-client'
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
  frames(method: string): Array<Record<string, unknown>> {
    return this.sent
      .map((s) => JSON.parse(s) as { method: string })
      .filter((f) => f.method === method) as Array<Record<string, unknown>>
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new CryptocomWsClient({
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

const CANDLE_PUSH = {
  id: -1,
  method: 'subscribe',
  result: {
    channel: 'candlestick',
    subscription: 'candlestick.1h.BTC_USDT',
    data: [
      { t: 1700000000000, o: '100', h: '110', l: '95', c: '105', v: '12' },
    ],
  },
}

const realFetch = globalThis.fetch

describe('CryptocomWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // catch path (WS still delivers live candles).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('defers the subscribe 1s after connect (rate-limit guidance) and unsubscribes on last release', async () => {
    const { client, sockets } = makeClient()

    const unsubA = client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    const unsubB = client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(50)

    // Within the 1s post-connect window: nothing on the wire yet
    expect(sockets[0].frames('subscribe').length).toBe(0)

    await sleep(1_100)
    const subs = sockets[0].frames('subscribe')
    expect(subs.length).toBe(1) // shared key: one wire subscribe for two callbacks
    expect(subs[0]['params']).toEqual({
      channels: ['candlestick.1h.BTC_USDT'],
    })

    // First release: the key is still held — no wire unsubscribe
    unsubA()
    expect(sockets[0].frames('unsubscribe').length).toBe(0)

    // Last release: wire unsubscribe goes out (never deferred)
    unsubB()
    const unsubs = sockets[0].frames('unsubscribe')
    expect(unsubs.length).toBe(1)
    expect(unsubs[0]['params']).toEqual({
      channels: ['candlestick.1h.BTC_USDT'],
    })

    client.destroy()
  })

  it('fans candle pushes out to both subscribers and replays the buffer to a late joiner', async () => {
    const { client, sockets } = makeClient()
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenA.push(d))
    await sleep(20)

    // Routing does not depend on the deferred wire subscribe
    sockets[0].push(CANDLE_PUSH)
    expect(seenA.length).toBe(1)

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenB.push(d))
    await sleep(5)

    // The late joiner is caught up from the buffer…
    expect(seenB.length).toBe(1)
    expect((seenB[0] as { type: string }).type).toBe('snapshot')

    // …and BOTH keep receiving live updates
    sockets[0].push(CANDLE_PUSH)
    expect(seenA.length).toBe(2)
    expect(seenB.length).toBe(2)

    client.destroy()
  })

  it('resubscribes after a dropped connection, again deferred 1s past the open', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(1_100)
    expect(sockets[0].frames('subscribe').length).toBe(1)

    sockets[0].drop()
    await sleep(50)
    expect(sockets.length).toBe(2)
    // Still inside the fresh socket's post-connect window
    expect(sockets[1].frames('subscribe').length).toBe(0)

    await sleep(1_100)
    const resubs = sockets[1].frames('subscribe')
    expect(resubs.length).toBe(1)
    expect(resubs[0]['params']).toEqual({
      channels: ['candlestick.1h.BTC_USDT'],
    })

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (String(input).includes('public/get-candlestick')) fetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient()
    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(30)

    // One initial attempt + exactly one paced retry — no retry storm.
    expect(fetches).toBe(2)

    client.destroy()
  })

  it('replies to the server heartbeat immediately with the same id', async () => {
    const { client, sockets } = makeClient()

    client.subscribeTicker('BTC-USDT', '', () => {})
    await sleep(20)

    sockets[0].push({ method: 'public/heartbeat', id: 42 })

    const replies = sockets[0].frames('public/respond-heartbeat')
    expect(replies.length).toBe(1)
    expect(replies[0]['id']).toBe(42)

    client.destroy()
  })

  it('routes ticker and book pushes to their pair subscribers', async () => {
    const { client, sockets } = makeClient()
    const lasts: Array<number> = []
    const books: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []

    client.subscribeTicker('BTC-USDT', '', (d) =>
      lasts.push((d as { ticker: { last: number } }).ticker.last),
    )
    client.subscribeOrderbook('BTC-USDT', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(20)

    sockets[0].push({
      id: -1,
      method: 'subscribe',
      result: {
        channel: 'ticker',
        subscription: 'ticker.BTC_USDT',
        data: [
          {
            a: '105',
            b: '104.9',
            k: '105.1',
            h: '120',
            l: '90',
            v: '50000',
            c: '0.05',
            t: 1700000000000,
          },
        ],
      },
    })
    expect(lasts).toEqual([105])

    sockets[0].push({
      id: -1,
      method: 'subscribe',
      result: {
        channel: 'book',
        subscription: 'book.BTC_USDT.10',
        data: [
          {
            bids: [['104.9', '1', '1']],
            asks: [['105.1', '1.5', '1']],
            t: 1700000000000,
          },
        ],
      },
    })
    expect(books.length).toBe(1)
    expect(books[0].bids).toEqual([[104.9, 1]])
    expect(books[0].asks).toEqual([[105.1, 1.5]])

    client.destroy()
  })
})
