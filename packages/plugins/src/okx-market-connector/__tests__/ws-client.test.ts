// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { OkxWsClient } from '../ws-client'
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
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const client = new OkxWsClient({
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

const realFetch = globalThis.fetch

describe('OkxWsClient candle backfill', () => {
  beforeEach(() => {
    // REST backfill must not hit the network; a rejected fetch exercises the
    // catch path (WS still delivers live candles).
    globalThis.fetch = (() =>
      Promise.reject(new Error('offline'))) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('retries the candle backfill once when REST fails', async () => {
    let fetches = 0
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (String(input).includes('/api/v5/market/candles')) fetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient()
    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await sleep(30)

    // One initial attempt + exactly one paced retry — no retry storm.
    expect(fetches).toBe(2)

    client.destroy()
  })
})

describe('OkxWsClient trade stream', () => {
  it('subscribes to the trades channel', async () => {
    const { client, sockets } = makeClient()
    client.subscribeTrades('BTC-USDT', '', () => {})
    await sleep(30)

    const frames = sockets.flatMap((s) => s.sent).join('\n')
    expect(frames).toContain('"channel":"trades"')
    expect(frames).toContain('"instId":"BTC-USDT"')
    client.destroy()
  })

  it('reverses OKX batches so the tape reads oldest-first', async () => {
    // OKX sends newest-first within a frame. Consumers append in arrival
    // order, so emitting the raw order would print a batch backwards.
    const { client, sockets } = makeClient()
    const received: Array<{ trades: Array<{ id: string }> }> = []
    client.subscribeTrades('BTC-USDT', '', (u) => received.push(u))
    await sleep(30)

    sockets[0]?.events.onMessage?.(
      JSON.stringify({
        arg: { channel: 'trades', instId: 'BTC-USDT' },
        data: [
          {
            tradeId: '3',
            px: '100',
            sz: '1',
            side: 'buy',
            ts: '1700000000300',
          },
          {
            tradeId: '2',
            px: '100',
            sz: '1',
            side: 'sell',
            ts: '1700000000200',
          },
          {
            tradeId: '1',
            px: '100',
            sz: '1',
            side: 'buy',
            ts: '1700000000100',
          },
        ],
      }),
    )

    expect(received).toHaveLength(1)
    expect(received[0].trades.map((t) => t.id)).toEqual(['1', '2', '3'])
    client.destroy()
  })

  it('drops malformed rows without discarding the rest of the batch', async () => {
    const { client, sockets } = makeClient()
    const received: Array<{ trades: Array<{ id: string }> }> = []
    client.subscribeTrades('BTC-USDT', '', (u) => received.push(u))
    await sleep(30)

    sockets[0]?.events.onMessage?.(
      JSON.stringify({
        arg: { channel: 'trades', instId: 'BTC-USDT' },
        data: [
          {
            tradeId: '2',
            px: '100',
            sz: '1',
            side: 'buy',
            ts: '1700000000200',
          },
          { tradeId: '', px: '100', sz: '1', side: 'buy', ts: '1700000000150' },
          { tradeId: '1', px: '0', sz: '1', side: 'buy', ts: '1700000000100' },
        ],
      }),
    )

    expect(received[0]?.trades.map((t) => t.id)).toEqual(['2'])
    client.destroy()
  })

  it('emits nothing when every row in a batch is unusable', async () => {
    const { client, sockets } = makeClient()
    const received: Array<unknown> = []
    client.subscribeTrades('BTC-USDT', '', (u) => received.push(u))
    await sleep(30)

    sockets[0]?.events.onMessage?.(
      JSON.stringify({
        arg: { channel: 'trades', instId: 'BTC-USDT' },
        data: [{ tradeId: '', px: '0', sz: '0', side: '', ts: '' }],
      }),
    )

    expect(received).toHaveLength(0)
    client.destroy()
  })
})
