// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BitvavoWsClient } from '../ws-client'
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
  /** Subscribe/unsubscribe frames filtered by action + channel name. */
  channelFrames(
    action: 'subscribe' | 'unsubscribe',
    channel: string,
  ): Array<{ name: string; markets: Array<string>; interval?: Array<string> }> {
    return this.sent
      .map((s) => JSON.parse(s) as { action: string; channels?: Array<any> })
      .filter((f) => f.action === action)
      .flatMap((f) => f.channels ?? [])
      .filter((c) => c.name === channel)
  }
  /** Bare action frames (e.g. getBook, getTime). */
  actionFrames(action: string): Array<Record<string, unknown>> {
    return this.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .filter((f) => f['action'] === action)
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new BitvavoWsClient({
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

const CANDLE_EVENT = {
  event: 'candle',
  market: 'BTC-EUR',
  interval: '1h',
  candle: [[1_700_000_000_000, '100', '110', '95', '105', '1234.5']],
}

const realFetch = globalThis.fetch

describe('BitvavoWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // WS-only path (the first live candle still opens the snapshot gate).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('subscribes the candles channel with interval and unsubscribes on release', async () => {
    const { client, sockets } = makeClient()

    const unsub = client.subscribeCandles('BTC-EUR', '1h', '', () => {})
    await sleep(10)

    const subs = sockets[0].channelFrames('subscribe', 'candles')
    expect(subs.length).toBe(1)
    expect(subs[0].markets).toEqual(['BTC-EUR'])
    expect(subs[0].interval).toEqual(['1h'])

    unsub()
    expect(sockets[0].channelFrames('unsubscribe', 'candles').length).toBe(1)

    client.destroy()
  })

  it('opens the snapshot gate from the first WS candle when backfill is offline', async () => {
    const { client, sockets } = makeClient()
    const seen: Array<{ type: string; candles: Array<unknown> }> = []

    client.subscribeCandles('BTC-EUR', '1h', '', (d) =>
      seen.push(d as (typeof seen)[number]),
    )
    await sleep(10)

    // First live bar → a 'snapshot' (gate opens even with REST offline).
    sockets[0].push(CANDLE_EVENT)
    const snapshots = seen.filter((s) => s.type === 'snapshot')
    expect(snapshots.length).toBe(1)
    expect(snapshots[0].candles.length).toBe(1)

    // Subsequent bars are 'update'.
    sockets[0].push({
      ...CANDLE_EVENT,
      candle: [[1_700_000_003_600_000, '105', '115', '104', '112', '10']],
    })
    expect(seen.filter((s) => s.type === 'update').length).toBe(1)

    client.destroy()
  })

  it('shares one wire subscription between two candle subscribers', async () => {
    const { client, sockets } = makeClient()
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    client.subscribeCandles('BTC-EUR', '1h', '', (d) => seenA.push(d))
    await sleep(10)

    sockets[0].push(CANDLE_EVENT)
    expect(seenA.length).toBe(1)

    client.subscribeCandles('BTC-EUR', '1h', '', (d) => seenB.push(d))
    await sleep(5)

    // No second wire subscribe — the key is shared.
    expect(sockets[0].channelFrames('subscribe', 'candles').length).toBe(1)
    // Late joiner is caught up from the buffer…
    expect(seenB.length).toBe(1)
    expect((seenB[0] as { type: string }).type).toBe('snapshot')

    // …and BOTH keep receiving live updates.
    sockets[0].push({
      ...CANDLE_EVENT,
      candle: [[1_700_000_003_600_000, '105', '115', '104', '112', '10']],
    })
    expect(seenA.length).toBe(2)
    expect(seenB.length).toBe(2)

    client.destroy()
  })

  it('fans a ticker out to every subscriber of the pair', async () => {
    const { client, sockets } = makeClient()
    const lasts: Array<number> = []

    const collect = (d: unknown) =>
      lasts.push((d as { ticker: { last: number } }).ticker.last)
    client.subscribeTicker('BTC-EUR', '', collect)
    client.subscribeTicker('BTC-EUR', '', collect)
    await sleep(10)

    expect(sockets[0].channelFrames('subscribe', 'ticker24h').length).toBe(1)

    sockets[0].push({
      event: 'ticker24h',
      data: [
        {
          market: 'BTC-EUR',
          open: '100',
          high: '120',
          low: '90',
          last: '105',
          volume: '50000',
          bid: '104.9',
          ask: '105.1',
          timestamp: 1_700_000_000_000,
        },
      ],
    })

    expect(lasts).toEqual([105, 105])

    client.destroy()
  })

  it('syncs the book via getBook snapshot, applies deltas, and resets on reconnect', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []

    client.subscribeOrderbook('BTC-EUR', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(10)

    // Subscribe sends BOTH the book channel subscribe AND a getBook request.
    expect(sockets[0].channelFrames('subscribe', 'book').length).toBe(1)
    expect(sockets[0].actionFrames('getBook').length).toBe(1)

    // getBook snapshot seeds the book.
    sockets[0].push({
      action: 'getBook',
      response: {
        market: 'BTC-EUR',
        nonce: 10,
        bids: [
          ['104.9', '1'],
          ['104.8', '2'],
        ],
        asks: [
          ['105.1', '1.5'],
          ['105.2', '3'],
        ],
      },
    })
    expect(books[0].bids).toEqual([
      [104.9, 1],
      [104.8, 2],
    ])
    expect(books[0].asks).toEqual([
      [105.1, 1.5],
      [105.2, 3],
    ])

    // Delta: amount '0' removes a level, a new amount updates one.
    sockets[0].push({
      event: 'book',
      market: 'BTC-EUR',
      nonce: 11,
      bids: [['104.8', '0']],
      asks: [['105.1', '2']],
    })
    expect(books[1].bids).toEqual([[104.9, 1]])
    expect(books[1].asks).toEqual([
      [105.1, 2],
      [105.2, 3],
    ])

    // Reconnect resets the book; a fresh getBook is requested + applied.
    sockets[0].drop()
    await sleep(15)
    expect(sockets.length).toBe(2)
    expect(sockets[1].actionFrames('getBook').length).toBe(1)
    sockets[1].push({
      action: 'getBook',
      response: {
        market: 'BTC-EUR',
        nonce: 20,
        bids: [['200', '7']],
        asks: [['201', '7']],
      },
    })
    expect(books.at(-1)!.bids).toEqual([[200, 7]])

    client.destroy()
  })

  it('buffers book deltas that arrive before the snapshot and replays them', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []

    client.subscribeOrderbook('BTC-EUR', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(10)

    // Delta arrives BEFORE the snapshot — must be buffered, not dropped.
    sockets[0].push({
      event: 'book',
      market: 'BTC-EUR',
      nonce: 6,
      bids: [['104.7', '5']],
      asks: [],
    })
    // No emit yet (still unsynced).
    expect(books.length).toBe(0)

    // Snapshot at nonce 5 → replay the buffered nonce-6 delta on top.
    sockets[0].push({
      action: 'getBook',
      response: {
        market: 'BTC-EUR',
        nonce: 5,
        bids: [['104.9', '1']],
        asks: [['105.1', '1']],
      },
    })

    expect(books.length).toBe(1)
    expect(books[0].bids).toEqual([
      [104.9, 1],
      [104.7, 5],
    ])

    client.destroy()
  })

  it('resyncs the book via a fresh getBook when a nonce gap is detected', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{ bids: Array<[number, number]> }> = []

    client.subscribeOrderbook('BTC-EUR', '', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(10)

    sockets[0].push({
      action: 'getBook',
      response: {
        market: 'BTC-EUR',
        nonce: 10,
        bids: [['100', '1']],
        asks: [['101', '1']],
      },
    })
    expect(books.length).toBe(1)
    const getBookBefore = sockets[0].actionFrames('getBook').length

    // Gap: nonce jumps 10 -> 12 (11 missing). The delta is NOT applied; a fresh
    // getBook is requested to rebuild the diverged book.
    sockets[0].push({
      event: 'book',
      market: 'BTC-EUR',
      nonce: 12,
      bids: [['100', '9']],
      asks: [],
    })
    expect(books.length).toBe(1) // no emit for the gapped delta
    expect(sockets[0].actionFrames('getBook').length).toBe(getBookBefore + 1)

    // Fresh snapshot rebuilds the book (the stale nonce-12 delta is discarded).
    sockets[0].push({
      action: 'getBook',
      response: {
        market: 'BTC-EUR',
        nonce: 20,
        bids: [['200', '7']],
        asks: [['201', '7']],
      },
    })
    expect(books.at(-1)!.bids).toEqual([[200, 7]])

    client.destroy()
  })

  it('emits the changed bar, not the buffer tail, on a late confirm', async () => {
    const { client, sockets } = makeClient()
    const updates: Array<{ candles: Array<{ ts: number; close: number }> }> = []

    client.subscribeCandles('BTC-EUR', '1h', '', (d) => {
      const u = d as {
        type: string
        candles: Array<{ ts: number; close: number }>
      }
      if (u.type === 'update') updates.push(u)
    })
    await sleep(10)

    sockets[0].push(CANDLE_EVENT) // ts N-1 → seeds snapshot
    sockets[0].push({
      ...CANDLE_EVENT,
      candle: [[1_700_000_003_600_000, '105', '115', '104', '112', '10']], // bar N → tail
    })
    // Late confirm for the EARLIER bar (ts < tail) — must emit that bar's
    // correction, not the unchanged tail.
    sockets[0].push({
      ...CANDLE_EVENT,
      candle: [[1_700_000_000_000, '100', '111', '95', '106', '1300']],
    })

    const last = updates.at(-1)!
    expect(last.candles[0].ts).toBe(1_700_000_000_000)
    expect(last.candles[0].close).toBe(106)

    client.destroy()
  })

  it('throws on an unsupported timeframe', () => {
    const { client } = makeClient()
    expect(() =>
      client.subscribeCandles('BTC-EUR', '3h', '', () => {}),
    ).toThrow('Unsupported timeframe')
    client.destroy()
  })
})
