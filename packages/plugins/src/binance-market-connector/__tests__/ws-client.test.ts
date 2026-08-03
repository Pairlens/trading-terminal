// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { BinanceWsClient } from '../ws-client'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'
import type { TradesUpdate } from '@pairlens/market-engine/types'

// These pin the lost-SUBSCRIBE watchdog. The client tracks subscribed streams
// optimistically, so a SUBSCRIBE that never reaches Binance (e.g. a transport
// send that silently failed) used to leave an open-but-silent socket forever —
// the desktop "data never arrives" stall. An unacked SUBSCRIBE must restart
// the session and resubscribe everything on the fresh connection.

type SentMsg = { method: string; params: Array<string>; id: number }

function fakeTransport() {
  const state = {
    sent: [] as Array<SentMsg>,
    events: null as WsAdapterEvents | null,
    connects: 0,
    closes: 0,
  }
  const connectFn = async (
    _url: string,
    events: WsAdapterEvents,
  ): Promise<WsConnection> => {
    state.connects++
    state.events = events
    return {
      send(data: string) {
        state.sent.push(JSON.parse(data) as SentMsg)
      },
      close() {
        state.closes++
        queueMicrotask(() => events.onClose?.(1000, 'client closed'))
      },
    }
  }
  return { state, connectFn }
}

function makeClient(ackTimeoutMs: number) {
  const { state, connectFn } = fakeTransport()
  const client = new BinanceWsClient(
    {
      connect: connectFn,
      baseBackoffMs: 20,
      backfillRetryDelayMs: 5,
      random: () => 1,
    },
    ackTimeoutMs,
  )
  return { state, client }
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const lastSubscribe = (sent: Array<SentMsg>) =>
  [...sent].reverse().find((m) => m.method === 'SUBSCRIBE')

describe('BinanceWsClient SUBSCRIBE ack watchdog', () => {
  it('keeps the socket when Binance acks the SUBSCRIBE', async () => {
    const { state, client } = makeClient(30)

    const unsub = client.subscribeTicker('BTC-USDT', '', () => {})
    await tick(5)

    const sub = lastSubscribe(state.sent)
    expect(sub).toBeDefined()
    expect(sub!.params).toContain('btcusdt@ticker')

    // Ack arrives well inside the watchdog window.
    state.events!.onMessage(JSON.stringify({ result: null, id: sub!.id }))
    await tick(60)

    expect(state.closes).toBe(0)
    expect(state.connects).toBe(1)
    unsub()
    client.destroy()
  })

  it('restarts the session and resubscribes when the SUBSCRIBE is never acked', async () => {
    const { state, client } = makeClient(20)

    const unsub = client.subscribeTicker('BTC-USDT', '', () => {})
    await tick(5)
    expect(lastSubscribe(state.sent)).toBeDefined()

    // No ack → watchdog fires → socket recycled.
    await tick(40)
    expect(state.closes).toBe(1)

    // The reconnect (20ms backoff) must resubscribe the full desired set from
    // scratch on the fresh socket. Ack it promptly — otherwise the watchdog
    // correctly keeps recycling the still-silent connection.
    for (let i = 0; i < 20 && state.connects < 2; i++) await tick(5)
    expect(state.connects).toBe(2)
    const resub = lastSubscribe(state.sent)
    expect(resub!.params).toContain('btcusdt@ticker')
    state.events!.onMessage(JSON.stringify({ result: null, id: resub!.id }))

    // Acked: the session must now hold steady on the second socket.
    await tick(50)
    expect(state.connects).toBe(2)
    expect(state.closes).toBe(1)

    unsub()
    client.destroy()
  })

  it('ignores acks for unknown ids', async () => {
    const { state, client } = makeClient(1000)

    client.subscribeTicker('BTC-USDT', '', () => {})
    await tick(5)

    state.events!.onMessage(JSON.stringify({ result: null, id: 999 }))
    await tick(5)
    expect(state.closes).toBe(0)
    client.destroy()
  })
})

describe('BinanceWsClient subscription reconcile', () => {
  it('coalesces a market switch into one SUBSCRIBE and shares streams between subscribers', async () => {
    const { state, client } = makeClient(1000)
    const seenA: Array<unknown> = []
    const seenB: Array<unknown> = []

    // Two subscribers to the same ticker + one candle sub, all in one burst.
    client.subscribeTicker('BTC-USDT', '', (d) => seenA.push(d))
    client.subscribeTicker('BTC-USDT', '', (d) => seenB.push(d))
    client.subscribeOrderbook('BTC-USDT', '', () => {})
    await tick(10)

    // One coalesced SUBSCRIBE with both streams; the shared ticker appears once.
    const subs = state.sent.filter((m) => m.method === 'SUBSCRIBE')
    expect(subs.length).toBe(1)
    expect(subs[0].params).toEqual(
      expect.arrayContaining(['btcusdt@ticker', 'btcusdt@depth20@100ms']),
    )
    expect(subs[0].params.filter((p) => p === 'btcusdt@ticker').length).toBe(1)

    // Both callbacks receive the fanned-out ticker (the watchlist regression).
    state.events!.onMessage(
      JSON.stringify({
        stream: 'btcusdt@ticker',
        data: {
          e: '24hrTicker',
          s: 'BTCUSDT',
          c: '61500.1',
          b: '61500.0',
          a: '61500.2',
          h: '62000',
          l: '60000',
          v: '1000',
          P: '2.5',
          E: 1_700_000_000_000,
        },
      }),
    )
    expect(seenA.length).toBe(1)
    expect(seenB.length).toBe(1)

    client.destroy()
  })

  it('sends UNSUBSCRIBE only after the last subscriber of a stream releases', async () => {
    const { state, client } = makeClient(1000)

    const un1 = client.subscribeTicker('BTC-USDT', '', () => {})
    const un2 = client.subscribeTicker('BTC-USDT', '', () => {})
    await tick(10)

    un1()
    await tick(10)
    expect(state.sent.some((m) => m.method === 'UNSUBSCRIBE')).toBe(false)

    un2()
    await tick(10)
    const unsubs = state.sent.filter((m) => m.method === 'UNSUBSCRIBE')
    expect(unsubs.length).toBe(1)
    expect(unsubs[0].params).toContain('btcusdt@ticker')

    client.destroy()
  })
})

describe('BinanceWsClient candle backfill', () => {
  it('retries the candle backfill once when REST fails', async () => {
    const realFetch = globalThis.fetch
    let fetches = 0
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (String(input).includes('/api/v3/klines')) fetches++
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const { client } = makeClient(1000)
    client.subscribeCandles('BTC-USDT', '1h', '', () => {})
    await tick(30)

    // One initial attempt + exactly one paced retry — no retry storm.
    expect(fetches).toBe(2)

    client.destroy()
    globalThis.fetch = realFetch
  })
})

describe('BinanceWsClient — trade stream', () => {
  // The parser's aggressor mapping is pinned in __tests__/trade-parsers.test.ts;
  // what's left to prove here is the wiring: that subscribeTrades asks for the
  // right stream and that an inbound frame is routed to the right session key
  // rather than being swallowed by the ticker/kline/depth branches.
  it('subscribes to the venue trade stream', async () => {
    const { state, client } = makeClient(5_000)
    client.subscribeTrades('BTC-USDT', 'US', () => {})
    await tick(60)

    const sub = lastSubscribe(state.sent)
    expect(sub?.params).toContain('btcusdt@trade')
    client.destroy()
  })

  it('routes an inbound trade frame to its subscriber', async () => {
    const { state, client } = makeClient(5_000)
    const received: Array<TradesUpdate> = []
    client.subscribeTrades('BTC-USDT', 'US', (u) => received.push(u))
    await tick(60)

    state.events?.onMessage?.(
      JSON.stringify({
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          s: 'BTCUSDT',
          t: 42,
          p: '63000.10',
          q: '0.5',
          T: 1700000000000,
          m: true, // buyer was the maker → the seller crossed
        },
      }),
    )

    expect(received).toHaveLength(1)
    expect(received[0].trades[0]).toEqual({
      id: '42',
      price: 63000.1,
      size: 0.5,
      side: 'sell',
      ts: 1700000000000,
    })
    client.destroy()
  })

  it('does not deliver a trade frame to a ticker subscriber', async () => {
    // Routing is substring-based, so this guards the branch order.
    const { state, client } = makeClient(5_000)
    const tickerUpdates: Array<unknown> = []
    client.subscribeTicker('BTC-USDT', 'US', (u) => tickerUpdates.push(u))
    await tick(60)

    state.events?.onMessage?.(
      JSON.stringify({
        stream: 'btcusdt@trade',
        data: {
          e: 'trade',
          s: 'BTCUSDT',
          t: 1,
          p: '1',
          q: '1',
          T: 1,
          m: false,
        },
      }),
    )

    expect(tickerUpdates).toHaveLength(0)
    client.destroy()
  })
})
