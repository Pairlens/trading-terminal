// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { CoinbaseWsClient } from '../ws-client'
import { sleep, waitFor } from '../../test-utils/async'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'

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
  frames(type: string, channel?: string): Array<Record<string, unknown>> {
    return this.sent
      .map((s) => JSON.parse(s) as { type: string; channel?: string })
      .filter(
        (f) => f.type === type && (!channel || f.channel === channel),
      ) as Array<Record<string, unknown>>
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new CoinbaseWsClient({
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

function tickerPush(productId: string, price: number) {
  return {
    channel: 'ticker',
    events: [
      {
        tickers: [
          {
            product_id: productId,
            price: String(price),
            best_bid: String(price - 0.1),
            best_ask: String(price + 0.1),
            high_24_h: '120',
            low_24_h: '90',
            volume_24_h: '5000',
            price_percent_chg_24_h: '2.5',
          },
        ],
      },
    ],
  }
}

const realFetch = globalThis.fetch

describe('CoinbaseWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill/sync must not hit the network; a rejected fetch exercises
    // the catch path (WS still delivers live data).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('sends heartbeats + batched ticker subscribe on connect and unsubscribes on release', async () => {
    const { client, sockets } = makeClient()

    const unsub = client.subscribeTicker('BTC-USD', '', () => {})
    await sleep(10)

    // On (re)open the frames are batched: heartbeats first, then one ticker
    // frame carrying every demanded pair — no duplicate per-entry frames.
    expect(sockets[0].frames('subscribe', 'heartbeats').length).toBe(1)
    const subs = sockets[0].frames('subscribe', 'ticker')
    expect(subs).toEqual([
      { type: 'subscribe', channel: 'ticker', product_ids: ['BTC-USD'] },
    ])

    unsub()
    expect(sockets[0].frames('unsubscribe', 'ticker')).toEqual([
      { type: 'unsubscribe', channel: 'ticker', product_ids: ['BTC-USD'] },
    ])

    client.destroy()
  })

  it('builds synthetic candles from ticker pushes', async () => {
    const { client, sockets } = makeClient()
    const seen: Array<{
      type: string
      candles: Array<{ open: number; close: number; high: number }>
    }> = []

    client.subscribeCandles('BTC-USD', '1h', '', (d) =>
      seen.push(d as (typeof seen)[number]),
    )
    await sleep(10)

    // Candles ride the ticker channel — no candle-specific wire channel
    expect(sockets[0].frames('subscribe', 'ticker')).toEqual([
      { type: 'subscribe', channel: 'ticker', product_ids: ['BTC-USD'] },
    ])

    sockets[0].push(tickerPush('BTC-USD', 100))
    sockets[0].push(tickerPush('BTC-USD', 105))
    sockets[0].push(tickerPush('BTC-USD', 103))

    expect(seen.length).toBe(3)
    const bucket = Math.floor(Date.now() / 3_600_000) * 3_600_000
    expect(seen[0].candles[0]).toMatchObject({
      ts: bucket,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 0,
    })
    expect(seen[2].candles[0]).toMatchObject({
      open: 100,
      high: 105,
      low: 100,
      close: 103,
    })

    client.destroy()
  })

  it('shares one wire subscription between two candle subscribers', async () => {
    const { client, sockets } = makeClient()
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    client.subscribeCandles('BTC-USD', '1h', '', (d) => seenA.push(d))
    await sleep(10)
    client.subscribeCandles('BTC-USD', '1h', '', (d) => seenB.push(d))
    await sleep(5)

    // No second wire subscribe — the key is shared
    expect(sockets[0].frames('subscribe', 'ticker').length).toBe(1)

    // BOTH receive the synthetic candle updates
    sockets[0].push(tickerPush('BTC-USD', 100))
    expect(seenA.length).toBe(1)
    expect(seenB.length).toBe(1)

    client.destroy()
  })

  it('keeps the shared ticker channel until the LAST demand (candle or ticker) releases', async () => {
    const { client, sockets } = makeClient()

    const unsubCandle = client.subscribeCandles('BTC-USD', '1h', '', () => {})
    await sleep(10)
    const unsubTicker = client.subscribeTicker('BTC-USD', '', () => {})

    // Live subscribe on an open socket sends its own single-pair frame
    // (byte-identical to the original's per-call behavior)
    expect(sockets[0].frames('subscribe', 'ticker').length).toBe(2)

    // The candle release must NOT kill the ticker sub's shared wire channel
    unsubCandle()
    expect(sockets[0].frames('unsubscribe', 'ticker').length).toBe(0)

    unsubTicker()
    expect(sockets[0].frames('unsubscribe', 'ticker')).toEqual([
      { type: 'unsubscribe', channel: 'ticker', product_ids: ['BTC-USD'] },
    ])

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    // limit=300 matches only the initial backfill — the 15s volume-sync timer
    // fetches with limit=2 and cannot fire inside this test's window anyway.
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (
        String(input).includes('/candles?') &&
        String(input).includes('limit=300')
      )
        fetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient()
    client.subscribeCandles('BTC-USD', '1h', '', () => {})
    await waitFor(() => fetches >= 2)

    // One initial attempt + exactly one paced retry. The fixed window is
    // the no-retry-storm half of the claim: negative, so it stays a sleep.
    await sleep(30)
    expect(fetches).toBe(2)

    client.destroy()
  })

  it('resubscribes with batched frames after a dropped connection', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USD', '1h', '', () => {})
    client.subscribeTicker('ETH-USD', '', () => {})
    client.subscribeOrderbook('BTC-USD', '', () => {})
    await sleep(10)

    sockets[0].drop()
    await waitFor(() => sockets.length === 2 && sockets[1].sent.length > 0)

    expect(sockets.length).toBe(2)
    // One batched frame per channel: heartbeats, ticker (candle pairs first),
    // level2 — exactly as the original resubscribeAll built them
    expect(sockets[1].frames('subscribe')).toEqual([
      { type: 'subscribe', channel: 'heartbeats' },
      {
        type: 'subscribe',
        channel: 'ticker',
        product_ids: ['BTC-USD', 'ETH-USD'],
      },
      { type: 'subscribe', channel: 'level2', product_ids: ['BTC-USD'] },
    ])

    client.destroy()
  })

  it('maintains the local level2 book and resets it across reconnects', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []

    client.subscribeOrderbook('BTC-USD', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(10)

    sockets[0].push({
      channel: 'l2_data',
      events: [
        {
          product_id: 'BTC-USD',
          type: 'snapshot',
          updates: [
            { side: 'bid', price_level: '104.9', new_quantity: '1' },
            { side: 'bid', price_level: '104.8', new_quantity: '2' },
            { side: 'offer', price_level: '105.1', new_quantity: '1.5' },
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
      channel: 'l2_data',
      events: [
        {
          product_id: 'BTC-USD',
          type: 'update',
          updates: [{ side: 'bid', price_level: '104.8', new_quantity: '0' }],
        },
      ],
    })
    expect(books[1].bids).toEqual([[104.9, 1]])

    // Reconnect: local book resets, fresh snapshot rebuilds it
    sockets[0].drop()
    await sleep(15)
    sockets[1].push({
      channel: 'l2_data',
      events: [
        {
          product_id: 'BTC-USD',
          type: 'snapshot',
          updates: [
            { side: 'bid', price_level: '200', new_quantity: '7' },
            { side: 'offer', price_level: '201', new_quantity: '7' },
          ],
        },
      ],
    })
    expect(books[2].bids).toEqual([[200, 7]])
    expect(books[2].asks).toEqual([[201, 7]])

    client.destroy()
  })
})
