// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { UpbitWsClient } from '../ws-client'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type SubSection = {
  type?: string
  codes?: Array<string>
  ticket?: string
  format?: string
  is_only_realtime?: boolean
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
  pushJson(msg: unknown): void {
    this.events.onMessage(JSON.stringify(msg))
  }
  pushBinary(msg: unknown): void {
    const bytes = new TextEncoder().encode(JSON.stringify(msg))
    this.events.onMessage(bytes.buffer)
  }
  pushRaw(text: string): void {
    this.events.onMessage(text)
  }
  /** All full-array subscription frames sent so far (PINGs excluded). */
  subFrames(): Array<Array<SubSection>> {
    return this.sent
      .filter((s) => s.startsWith('['))
      .map((s) => JSON.parse(s) as Array<SubSection>)
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new UpbitWsClient({
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
  type: 'candle.60m',
  code: 'USDT-BTC',
  candle_date_time_utc: '2023-11-14T22:00:00',
  timestamp: 1700000000000,
  opening_price: 100,
  high_price: 110,
  low_price: 95,
  trade_price: 105,
  candle_acc_trade_volume: 1234.5,
}

const realFetch = globalThis.fetch

describe('UpbitWsClient on ReconnectingWsSession', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // catch path (WS still delivers live candles).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('sends one full subscription array covering all channels after connect', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USDT', '1h', 'SG', () => {})
    client.subscribeTicker('BTC-USDT', 'SG', () => {})
    client.subscribeOrderbook('BTC-USDT', 'SG', () => {})
    await sleep(100)

    // Burst of subscribes coalesced by the debounce into ONE frame
    const frames = sockets[0].subFrames()
    expect(frames.length).toBe(1)

    const frame = frames[0]
    expect(frame[0].ticket).toStartWith('pairlens-')
    expect(frame).toContainEqual({
      type: 'ticker',
      codes: ['USDT-BTC'],
      is_only_realtime: false,
    })
    expect(frame).toContainEqual({
      type: 'orderbook',
      codes: ['USDT-BTC'],
      is_only_realtime: false,
    })
    expect(frame).toContainEqual({
      type: 'candle.60m',
      codes: ['USDT-BTC'],
      is_only_realtime: false,
    })
    expect(frame[frame.length - 1]).toEqual({ format: 'DEFAULT' })

    client.destroy()
  })

  it('shares one key between two candle subscribers and replays the buffer to the late joiner', async () => {
    const { client, sockets } = makeClient()
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    client.subscribeCandles('BTC-USDT', '1h', 'SG', (d) => seenA.push(d))
    await sleep(100)
    const framesBefore = sockets[0].subFrames().length

    // A live candle lands in the shared buffer before B joins
    sockets[0].pushJson(CANDLE_PUSH)
    expect(seenA.length).toBe(1)

    client.subscribeCandles('BTC-USDT', '1h', 'SG', (d) => seenB.push(d))
    await sleep(100)

    // Joining an existing key adds no wire traffic (no resync needed)
    expect(sockets[0].subFrames().length).toBe(framesBefore)
    // The late joiner is caught up from the buffer…
    expect(seenB.length).toBe(1)
    expect((seenB[0] as { type: string }).type).toBe('snapshot')

    // …and BOTH keep receiving live updates
    sockets[0].pushJson(CANDLE_PUSH)
    expect(seenA.length).toBe(2)
    expect(seenB.length).toBe(2)

    client.destroy()
  })

  it('re-sends the full array after a dropped connection', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USDT', '1h', 'SG', () => {})
    client.subscribeTicker('ETH-USDT', 'SG', () => {})
    await sleep(100)

    sockets[0].drop()
    await sleep(100)

    expect(sockets.length).toBe(2)
    const frames = sockets[1].subFrames()
    expect(frames.length).toBe(1)
    expect(frames[0]).toContainEqual({
      type: 'ticker',
      codes: ['USDT-ETH'],
      is_only_realtime: false,
    })
    expect(frames[0]).toContainEqual({
      type: 'candle.60m',
      codes: ['USDT-BTC'],
      is_only_realtime: false,
    })

    client.destroy()
  })

  it('resyncs without the released channel on last release (Upbit has no per-channel unsubscribe)', async () => {
    const { client, sockets } = makeClient()

    client.subscribeCandles('BTC-USDT', '1h', 'SG', () => {})
    const unsubTicker = client.subscribeTicker('BTC-USDT', 'SG', () => {})
    await sleep(100)
    expect(sockets[0].subFrames().length).toBe(1)

    unsubTicker()
    await sleep(100)

    // Releasing the ticker triggers a full-array resync that simply omits it
    const frames = sockets[0].subFrames()
    expect(frames.length).toBe(2)
    const last = frames[1]
    expect(last.some((s) => s.type === 'ticker')).toBe(false)
    expect(last).toContainEqual({
      type: 'candle.60m',
      codes: ['USDT-BTC'],
      is_only_realtime: false,
    })

    client.destroy()
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (String(input).includes('/v1/candles/')) fetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient()
    client.subscribeCandles('BTC-USDT', '1h', 'SG', () => {})
    await sleep(30)

    // One initial attempt + exactly one paced retry — no retry storm.
    expect(fetches).toBe(2)

    client.destroy()
  })

  it('decodes binary UTF-8 frames and tolerates raw PONG replies', async () => {
    const { client, sockets } = makeClient()
    const lasts: Array<number> = []

    client.subscribeTicker('BTC-USDT', 'SG', (d) =>
      lasts.push((d as { ticker: { last: number } }).ticker.last),
    )
    await sleep(100)

    // Raw non-JSON keep-alive frames must not crash the handler
    sockets[0].pushRaw('PONG')
    sockets[0].pushJson({ status: 'UP' })
    expect(lasts.length).toBe(0)

    // Upbit often delivers pushes as binary UTF-8 JSON
    sockets[0].pushBinary({
      type: 'ticker',
      code: 'USDT-BTC',
      trade_price: 105,
      opening_price: 100,
      high_price: 120,
      low_price: 90,
      acc_trade_volume_24h: 50000,
      signed_change_rate: 0.05,
      timestamp: 1700000000000,
      trade_timestamp: 1700000000000,
    })
    expect(lasts).toEqual([105])

    client.destroy()
  })
})
