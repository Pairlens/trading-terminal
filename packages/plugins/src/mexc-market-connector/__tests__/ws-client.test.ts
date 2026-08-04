// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { MexcWsClient } from '../ws-client'
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
  pushText(msg: unknown): void {
    this.events.onMessage(JSON.stringify(msg))
  }
  pushBinary(buf: ArrayBuffer): void {
    this.events.onMessage(buf)
  }
  frames(method: string): Array<{ method: string; params: Array<string> }> {
    return this.sent
      .map((s) => JSON.parse(s) as { method: string; params?: Array<string> })
      .filter((f) => f.method === method) as Array<{
      method: string
      params: Array<string>
    }>
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new MexcWsClient({
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

// ── Minimal protobuf encoder for PushDataV3ApiWrapper test frames ──

function varint(n: number): Array<number> {
  const out: Array<number> = []
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80)
    n >>>= 7
  }
  out.push(n)
  return out
}

function pbString(field: number, s: string): Array<number> {
  const bytes = Array.from(new TextEncoder().encode(s))
  return [...varint((field << 3) | 2), ...varint(bytes.length), ...bytes]
}

function pbVarint(field: number, n: number): Array<number> {
  return [...varint(field << 3), ...varint(n)]
}

function pbMessage(field: number, body: Array<number>): Array<number> {
  return [...varint((field << 3) | 2), ...varint(body.length), ...body]
}

function wrapper(
  channel: string,
  symbol: string,
  body: Array<number>,
): ArrayBuffer {
  return new Uint8Array([
    ...pbString(1, channel),
    ...pbString(3, symbol),
    ...body,
  ]).buffer
}

/** Wrapper field 308: publicSpotKline */
function klinePush(symbol: string, interval: string, close: number) {
  return wrapper(
    `spot@public.kline.v3.api.pb@${symbol}@${interval}`,
    symbol,
    pbMessage(308, [
      ...pbString(1, interval),
      ...pbVarint(2, 1_700_000_000), // windowStart (seconds)
      ...pbString(3, '100'),
      ...pbString(4, String(close)),
      ...pbString(5, '110'),
      ...pbString(6, '95'),
      ...pbString(7, '1234.5'),
    ]),
  )
}

/** Wrapper field 309: publicMiniTicker */
function tickerPush(symbol: string, price: number) {
  return wrapper(
    `spot@public.miniTicker.v3.api.pb@${symbol}@UTC+0`,
    symbol,
    pbMessage(309, [
      ...pbString(1, symbol),
      ...pbString(2, String(price)),
      ...pbString(3, '0.05'),
      ...pbString(5, '120'),
      ...pbString(6, '90'),
      ...pbString(7, '50000'),
      ...pbString(8, '480'),
    ]),
  )
}

/** Wrapper field 303: publicLimitDepths */
function depthsPush(symbol: string) {
  const item = (price: string, qty: string) => [
    ...pbString(1, price),
    ...pbString(2, qty),
  ]
  return wrapper(
    `spot@public.limit.depth.v3.api.pb@${symbol}@20`,
    symbol,
    pbMessage(303, [
      ...pbMessage(1, item('105.2', '3')), // asks
      ...pbMessage(1, item('105.1', '1.5')),
      ...pbMessage(2, item('104.8', '2')), // bids
      ...pbMessage(2, item('104.9', '1')),
    ]),
  )
}

const realFetch = globalThis.fetch

describe('MexcWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // catch path (WS still delivers live candles).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('sends the exact kline SUBSCRIPTION on connect and UNSUBSCRIPTION on last release', async () => {
    const { client, sockets } = makeClient()

    const unsubA = client.subscribeCandles('BTC-USDT', '1h', 'DE', () => {})
    const unsubB = client.subscribeCandles('BTC-USDT', '1h', 'DE', () => {})
    await sleep(10)

    const subs = sockets[0].frames('SUBSCRIPTION')
    expect(subs.length).toBe(1)
    expect(subs[0].params).toEqual([
      'spot@public.kline.v3.api.pb@BTCUSDT@Min60',
    ])

    // First release: the key is still held — no wire unsubscribe
    unsubA()
    expect(sockets[0].frames('UNSUBSCRIPTION').length).toBe(0)

    // Last release: wire unsubscribe goes out
    unsubB()
    const unsubs = sockets[0].frames('UNSUBSCRIPTION')
    expect(unsubs.length).toBe(1)
    expect(unsubs[0].params).toEqual([
      'spot@public.kline.v3.api.pb@BTCUSDT@Min60',
    ])

    client.destroy()
  })

  it('decodes binary kline pushes and fans them out to both candle subscribers', async () => {
    const { client, sockets } = makeClient()
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', 'DE', (d) => seenA.push(d))
    await sleep(10)

    // A live candle lands in the shared buffer before B joins
    sockets[0].pushBinary(klinePush('BTCUSDT', 'Min60', 105))
    expect(seenA.length).toBe(1)
    expect(
      (seenA[0] as { candles: Array<{ close: number }> }).candles[0].close,
    ).toBe(105)

    client.subscribeCandles('BTC-USDT', '1h', 'DE', (d) => seenB.push(d))
    await sleep(5)

    // No second wire subscribe — the key is shared
    expect(sockets[0].frames('SUBSCRIPTION').length).toBe(1)
    // The late joiner is caught up from the buffer…
    expect(seenB.length).toBe(1)
    expect((seenB[0] as { type: string }).type).toBe('snapshot')

    // …and BOTH keep receiving live updates
    sockets[0].pushBinary(klinePush('BTCUSDT', 'Min60', 106))
    expect(seenA.length).toBe(2)
    expect(seenB.length).toBe(2)

    client.destroy()
  })

  it('resubscribes every channel after a dropped connection', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USDT', '1h', 'DE', () => {})
    client.subscribeTicker('BTC-USDT', 'DE', () => {})
    await sleep(10)

    sockets[0].drop()
    await waitFor(() => sockets.length === 2 && sockets[1].sent.length > 0)

    expect(sockets.length).toBe(2)
    const channels = sockets[1].frames('SUBSCRIPTION').flatMap((f) => f.params)
    expect(channels).toContain('spot@public.kline.v3.api.pb@BTCUSDT@Min60')
    expect(channels).toContain('spot@public.miniTicker.v3.api.pb@BTCUSDT@UTC+0')

    client.destroy()
  })

  it('routes binary miniTicker pushes and ignores JSON text control frames', async () => {
    const { client, sockets } = makeClient()
    const lasts: Array<number> = []

    client.subscribeTicker('BTC-USDT', 'DE', (d) =>
      lasts.push((d as { ticker: { last: number } }).ticker.last),
    )
    await sleep(10)

    // JSON control frames (ack / pong) must be ignored, not crash
    sockets[0].pushText({ id: 0, code: 0, msg: 'ok' })
    sockets[0].pushText({ msg: 'PONG' })
    expect(lasts.length).toBe(0)

    sockets[0].pushBinary(tickerPush('BTCUSDT', 105))
    expect(lasts).toEqual([105])

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    globalThis.fetch = ((url: string | URL) => {
      if (String(url).includes('/api/v3/klines')) fetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient()
    client.subscribeCandles('BTC-USDT', '1h', 'DE', () => {})
    await waitFor(() => fetches >= 2)

    // One initial attempt + exactly one paced retry. The fixed window is
    // the no-retry-storm half of the claim: negative, so it stays a sleep.
    await sleep(30)
    expect(fetches).toBe(2)

    client.destroy()
  })

  it('emits a sorted snapshot for binary limit-depth pushes', async () => {
    const { client, sockets } = makeClient()
    const books: Array<{
      bids: Array<[number, number]>
      asks: Array<[number, number]>
    }> = []

    client.subscribeOrderbook('BTC-USDT', 'DE', (d) =>
      books.push(d as (typeof books)[number]),
    )
    await sleep(10)

    const subs = sockets[0].frames('SUBSCRIPTION')
    expect(subs[0].params).toEqual([
      'spot@public.limit.depth.v3.api.pb@BTCUSDT@20',
    ])

    sockets[0].pushBinary(depthsPush('BTCUSDT'))
    expect(books.length).toBe(1)
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
})
