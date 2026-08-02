// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BitgetWsClient } from '../ws-client'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type BitgetFrame = {
  op: string
  args?: Array<{ instType: string; channel: string; instId: string }>
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
  pushRaw(text: string): void {
    this.events.onMessage(text)
  }
  frames(op: string): Array<BitgetFrame> {
    return this.sent
      .filter((s) => s.startsWith('{'))
      .map((s) => JSON.parse(s) as BitgetFrame)
      .filter((f) => f.op === op)
  }
}

function makeClient(pingIntervalMs?: number) {
  const sockets: Array<FakeSocket> = []
  const client = new BitgetWsClient({
    baseBackoffMs: 2,
    gracePeriodMs: 5,
    backfillRetryDelayMs: 5,
    random: () => 1,
    ...(pingIntervalMs
      ? { ping: { intervalMs: pingIntervalMs, frame: () => 'ping' } }
      : {}),
    connect: async (_url, events) => {
      const socket = new FakeSocket(events)
      sockets.push(socket)
      return socket
    },
  })
  return { client, sockets }
}

const CANDLE_UPDATE = {
  action: 'update',
  arg: { instType: 'SPOT', channel: 'candle1H', instId: 'BTCUSDT' },
  data: [['1700000000000', '100', '110', '95', '105', '1234.5', '130000']],
  ts: 1700000000001,
}

const realFetch = globalThis.fetch

describe('BitgetWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // catch path (WS still delivers live candles).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('subscribes with {instType, channel, instId} args and unsubscribes on release', async () => {
    const { client, sockets } = makeClient()

    const unsub = client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(10)

    const subs = sockets[0].frames('subscribe')
    expect(subs.length).toBe(1)
    expect(subs[0].args).toEqual([
      { instType: 'SPOT', channel: 'candle1H', instId: 'BTCUSDT' },
    ])

    unsub()
    const unsubs = sockets[0].frames('unsubscribe')
    expect(unsubs.length).toBe(1)
    expect(unsubs[0].args).toEqual([
      { instType: 'SPOT', channel: 'candle1H', instId: 'BTCUSDT' },
    ])

    client.destroy()
  })

  it('shares one wire subscription between two candle subscribers', async () => {
    const { client, sockets } = makeClient()
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenA.push(d))
    await sleep(10)

    // A live candle lands in the shared buffer before B joins
    sockets[0].push(CANDLE_UPDATE)
    expect(seenA.length).toBe(1)

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seenB.push(d))
    await sleep(5)

    // No second wire subscribe — the key is shared
    expect(sockets[0].frames('subscribe').length).toBe(1)
    // The late joiner is caught up from the buffer…
    expect(seenB.length).toBe(1)
    expect((seenB[0] as { type: string }).type).toBe('snapshot')

    // …and BOTH keep receiving live updates
    sockets[0].push(CANDLE_UPDATE)
    expect(seenA.length).toBe(2)
    expect(seenB.length).toBe(2)

    client.destroy()
  })

  it('resubscribes all channels after a dropped connection', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    client.subscribeOrderbook('BTC-USDT', '', () => {})
    await sleep(10)

    sockets[0].drop()
    await sleep(15)

    expect(sockets.length).toBe(2)
    const channels = sockets[1]
      .frames('subscribe')
      .flatMap((f) => (f.args ?? []).map((a) => a.channel))
    expect(channels.sort()).toEqual(['books15', 'candle1H'])

    client.destroy()
  })

  it('sends the raw "ping" string frame and tolerates the raw "pong" reply', async () => {
    const { client, sockets } = makeClient(5)
    const seen: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', '', (d) => seen.push(d))
    await sleep(20)

    // Ping is the raw string "ping" — not JSON
    expect(sockets[0].sent.filter((s) => s === 'ping').length).toBeGreaterThan(
      0,
    )

    // The server replies with a raw "pong" (non-JSON) — must not break routing
    sockets[0].pushRaw('pong')
    sockets[0].pushRaw('not-json-garbage')
    sockets[0].push(CANDLE_UPDATE)
    expect(seen.length).toBe(1)

    client.destroy()
  })

  it('emits the books15 snapshot sorted, to every book subscriber', async () => {
    const { client, sockets } = makeClient()
    const booksA: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []
    const booksB: typeof booksA = []

    client.subscribeOrderbook('BTC-USDT', '', (d) =>
      booksA.push(d as (typeof booksA)[number]),
    )
    client.subscribeOrderbook('BTC-USDT', '', (d) =>
      booksB.push(d as (typeof booksB)[number]),
    )
    await sleep(10)

    // One shared wire subscribe for both subscribers
    expect(sockets[0].frames('subscribe').length).toBe(1)

    sockets[0].push({
      action: 'snapshot',
      arg: { instType: 'SPOT', channel: 'books15', instId: 'BTCUSDT' },
      data: [
        {
          bids: [
            ['104.8', '2'],
            ['104.9', '1'],
          ],
          asks: [
            ['105.2', '3'],
            ['105.1', '1.5'],
          ],
        },
      ],
      ts: 1700000000001,
    })

    // Snapshot-only book: sorted bids descending, asks ascending
    expect(booksA[0].bids).toEqual([
      [104.9, 1],
      [104.8, 2],
    ])
    expect(booksA[0].asks).toEqual([
      [105.1, 1.5],
      [105.2, 3],
    ])
    expect(booksB.length).toBe(1)

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    globalThis.fetch = ((url: string | URL) => {
      if (String(url).includes('/market/candles')) fetches++
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
