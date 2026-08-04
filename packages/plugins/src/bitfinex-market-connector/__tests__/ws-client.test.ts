// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BfxWsClient } from '../ws-client'
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
  frames(event: string, channel?: string): Array<Record<string, unknown>> {
    return this.sent
      .map((s) => JSON.parse(s) as { event: string; channel?: string })
      .filter(
        (f) => f.event === event && (!channel || f.channel === channel),
      ) as Array<Record<string, unknown>>
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new BfxWsClient({
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

// OCHLV: [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME]
const CANDLE_ROW = [1700000000000, 100, 105, 110, 95, 12.5]
const PARSED_CANDLE = {
  ts: 1700000000000,
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 12.5,
}

const realFetch = globalThis.fetch

describe('BfxWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // catch path (WS still delivers live candles).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('subscribes candles, routes data by assigned chanId, and unsubscribes by chanId', async () => {
    const { client, sockets } = makeClient()
    const seen: Array<unknown> = []

    const unsub = client.subscribeCandles('BTC-USDT', '1h', '', (d) =>
      seen.push(d),
    )
    await sleep(10)

    expect(sockets[0].frames('subscribe', 'candles')).toEqual([
      { event: 'subscribe', channel: 'candles', key: 'trade:1h:tBTCUST' },
    ])

    // Data before the 'subscribed' ack has no chanId mapping — dropped
    sockets[0].push([17, CANDLE_ROW])
    expect(seen.length).toBe(0)

    sockets[0].push({
      event: 'subscribed',
      channel: 'candles',
      chanId: 17,
      key: 'trade:1h:tBTCUST',
    })
    sockets[0].push([17, CANDLE_ROW])
    expect(seen).toEqual([{ type: 'update', candles: [PARSED_CANDLE] }])

    // Heartbeats are ignored
    sockets[0].push([17, 'hb'])
    expect(seen.length).toBe(1)

    unsub()
    expect(sockets[0].frames('unsubscribe')).toEqual([
      { event: 'unsubscribe', chanId: 17 },
    ])

    client.destroy()
  })

  it('fans ticker data out to every subscriber of the pair', async () => {
    const { client, sockets } = makeClient()
    const lasts: Array<number> = []
    const push = (d: unknown) =>
      lasts.push((d as { ticker: { last: number } }).ticker.last)

    client.subscribeTicker('BTC-USDT', '', push)
    client.subscribeTicker('BTC-USDT', '', push)
    await sleep(10)

    // One wire subscribe for the shared key
    expect(sockets[0].frames('subscribe', 'ticker')).toEqual([
      { event: 'subscribe', channel: 'ticker', symbol: 'tBTCUST' },
    ])

    sockets[0].push({
      event: 'subscribed',
      channel: 'ticker',
      chanId: 5,
      symbol: 'tBTCUST',
    })
    // [BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_RELATIVE, LAST_PRICE, VOLUME, HIGH, LOW]
    sockets[0].push([5, [104.9, 10, 105.1, 8, 5, 0.05, 105, 50000, 120, 90]])

    expect(lasts).toEqual([105, 105])

    client.destroy()
  })

  it('releases the wire channel only on the last unsubscribe, and only once assigned', async () => {
    const { client, sockets } = makeClient()

    const unsubA = client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    const unsubB = client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(10)

    expect(sockets[0].frames('subscribe', 'candles').length).toBe(1)

    unsubA()
    expect(sockets[0].frames('unsubscribe').length).toBe(0)

    // Last release before the server assigned a chanId — nothing to send
    unsubB()
    expect(sockets[0].frames('unsubscribe').length).toBe(0)

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (String(input).includes('/v2/candles/')) fetches++
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

  it('drops stale chanIds on reconnect and routes via the fresh assignment', async () => {
    const { client, sockets } = makeClient()
    const seen: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seen.push(d))
    await sleep(10)

    sockets[0].push({
      event: 'subscribed',
      channel: 'candles',
      chanId: 3,
      key: 'trade:1h:tBTCUST',
    })
    sockets[0].push([3, CANDLE_ROW])
    expect(seen.length).toBe(1)

    sockets[0].drop()
    await sleep(15)

    // Fresh socket resubscribed with the same frame
    expect(sockets.length).toBe(2)
    expect(sockets[1].frames('subscribe', 'candles')).toEqual([
      { event: 'subscribe', channel: 'candles', key: 'trade:1h:tBTCUST' },
    ])

    // The old chanId must no longer route (revive cleared the mapping)
    sockets[1].push([3, CANDLE_ROW])
    expect(seen.length).toBe(1)

    // The fresh assignment does
    sockets[1].push({
      event: 'subscribed',
      channel: 'candles',
      chanId: 8,
      key: 'trade:1h:tBTCUST',
    })
    sockets[1].push([8, CANDLE_ROW])
    expect(seen.length).toBe(2)

    client.destroy()
  })

  it('maintains the local book from [price, count, amount] entries', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []

    client.subscribeOrderbook('BTC-USDT', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(10)

    expect(sockets[0].frames('subscribe', 'book')).toEqual([
      {
        event: 'subscribe',
        channel: 'book',
        symbol: 'tBTCUST',
        prec: 'P0',
        freq: 'F0',
        len: '25',
      },
    ])

    sockets[0].push({
      event: 'subscribed',
      channel: 'book',
      chanId: 9,
      symbol: 'tBTCUST',
    })

    // Snapshot: amount sign encodes side (positive=bid, negative=ask)
    sockets[0].push([
      9,
      [
        [104.9, 2, 1],
        [104.8, 1, 2],
        [105.1, 1, -1.5],
      ],
    ])
    expect(books[0].bids).toEqual([
      [104.9, 1],
      [104.8, 2],
    ])
    expect(books[0].asks).toEqual([[105.1, 1.5]])

    // Update with count=0 deletes the level
    sockets[0].push([9, [104.8, 0, 1]])
    expect(books[1].bids).toEqual([[104.9, 1]])

    client.destroy()
  })

  it('throws on an unsupported timeframe', () => {
    const { client } = makeClient()
    expect(() =>
      client.subscribeCandles('BTC-USDT', '2h', '', () => {}),
    ).toThrow('Unsupported timeframe')
    client.destroy()
  })
})
