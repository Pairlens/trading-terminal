// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it, mock } from 'bun:test'
import { AlpacaWsClient } from '../ws-client'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'
import type { CandleUpdate } from '@pairlens/market-engine/types'

// Alpaca's stream rejects any subscribe sent before the auth handshake
// completes (error 401/404), so the client must queue channel changes until
// the `authenticated` ack. These tests pin that sequencing plus the 1-minute
// bar → timeframe-bucket aggregation the connector does client-side (Alpaca
// only streams 1-minute bars).

type SentMsg = Record<string, unknown>

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
    events.onOpen?.()
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

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const CREDS = { apiKey: 'PKTEST', apiSecret: 'secret' }
const getCreds = () => CREDS

const authenticate = (state: ReturnType<typeof fakeTransport>['state']) => {
  state.events!.onMessage(
    JSON.stringify([{ T: 'success', msg: 'authenticated' }]),
  )
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stubBarsFetch(bars: Array<unknown>) {
  globalThis.fetch = mock(
    async () => new Response(JSON.stringify({ bars }), { status: 200 }),
  ) as unknown as typeof fetch
}

describe('AlpacaWsClient auth-gated subscribe', () => {
  it('authenticates first and only subscribes after the ack', async () => {
    const { state, connectFn } = fakeTransport()
    const client = new AlpacaWsClient(getCreds, connectFn)

    stubBarsFetch([]) // silence the REST snapshot seed
    const unsub = client.subscribeTicker('AAPL-USD', () => {})
    await tick(5)

    // Auth frame went out on open; no subscribe yet.
    expect(state.sent[0]).toMatchObject({ action: 'auth', key: CREDS.apiKey })
    expect(state.sent.find((m) => m['action'] === 'subscribe')).toBeUndefined()

    authenticate(state)
    await tick(5)

    const sub = state.sent.find((m) => m['action'] === 'subscribe')
    expect(sub).toBeDefined()
    expect(sub!['quotes']).toEqual(['AAPL'])
    expect(sub!['trades']).toEqual(['AAPL'])

    unsub()
    client.destroy()
  })

  it('throws a credentials error for candle subs without an account', () => {
    const client = new AlpacaWsClient(() => null)
    expect(() => client.subscribeCandles('AAPL-USD', '1h', () => {})).toThrow(
      /Alpaca market data requires an API key/,
    )
    client.destroy()
  })
})

describe('AlpacaWsClient 1-minute bar aggregation', () => {
  it('merges streamed 1-min bars into the subscribed timeframe bucket', async () => {
    const { state, connectFn } = fakeTransport()
    const client = new AlpacaWsClient(getCreds, connectFn)

    // Backfill: one closed hourly candle anchors the bucket grid.
    const anchorIso = '2026-06-30T14:00:00Z'
    const anchorTs = Date.parse(anchorIso)
    stubBarsFetch([{ t: anchorIso, o: 100, h: 101, l: 99, c: 100.5, v: 5000 }])

    const updates: Array<CandleUpdate> = []
    const unsub = client.subscribeCandles('AAPL-USD', '1h', (u) =>
      updates.push(u),
    )
    await tick(10)
    authenticate(state)
    await tick(10)

    expect(updates[0]?.type).toBe('snapshot')
    expect(updates[0]?.candles).toHaveLength(1)

    // Two 1-min bars inside the NEXT hour bucket stream in.
    const nextBucket = anchorTs + 3_600_000
    state.events!.onMessage(
      JSON.stringify([
        {
          T: 'b',
          S: 'AAPL',
          t: new Date(nextBucket).toISOString(),
          o: 100.5,
          h: 102,
          l: 100.4,
          c: 101.8,
          v: 300,
        },
      ]),
    )
    state.events!.onMessage(
      JSON.stringify([
        {
          T: 'b',
          S: 'AAPL',
          t: new Date(nextBucket + 60_000).toISOString(),
          o: 101.8,
          h: 103,
          l: 101.5,
          c: 102.5,
          v: 200,
        },
      ]),
    )
    await tick(5)

    const updateEvents = updates.filter((u) => u.type === 'update')
    expect(updateEvents).toHaveLength(2)

    const merged = updateEvents[1].candles[0]
    expect(merged.ts).toBe(nextBucket) // aligned to the hour bucket
    expect(merged.open).toBe(100.5) // first bar's open preserved
    expect(merged.high).toBe(103)
    expect(merged.close).toBe(102.5)
    expect(merged.volume).toBe(500) // volumes accumulate

    unsub()
    client.destroy()
  })
})

// ── Connection lifecycle ──
// Alpaca now delegates its lifecycle to ReconnectingWsSession. The cases that
// matter here are the ones its market hours make unusual: the socket must
// survive an overnight silence untouched, but still recover from a suspend.

/** Transport that hands back every socket it opened, for multi-connect tests. */
function recordingTransport() {
  const sockets: Array<{
    sent: Array<SentMsg>
    events: WsAdapterEvents
    closed: boolean
    drop: () => void
  }> = []
  const connectFn = async (
    _url: string,
    events: WsAdapterEvents,
  ): Promise<WsConnection> => {
    const socket = {
      sent: [] as Array<SentMsg>,
      events,
      closed: false,
      drop: () => {
        if (socket.closed) return
        socket.closed = true
        events.onClose?.(1006, 'dropped')
      },
    }
    sockets.push(socket)
    return {
      send(data: string) {
        socket.sent.push(JSON.parse(data) as SentMsg)
      },
      close() {
        if (socket.closed) return
        socket.closed = true
        queueMicrotask(() => events.onClose?.(1000, 'client closed'))
      },
    }
  }
  return { sockets, connectFn }
}

const ackAuth = (socket: { events: WsAdapterEvents }) =>
  socket.events.onMessage(
    JSON.stringify([{ T: 'success', msg: 'authenticated' }]),
  )

const FAST = {
  baseBackoffMs: 2,
  maxBackoffMs: 20,
  stableResetMs: 20,
  random: () => 1,
  wakeSource: { subscribe: () => () => {} },
}

describe('AlpacaWsClient connection lifecycle', () => {
  it('re-authenticates and re-subscribes the full desired set after a drop', async () => {
    const { sockets, connectFn } = recordingTransport()
    stubBarsFetch([])
    const client = new AlpacaWsClient(getCreds, connectFn, undefined, FAST)

    const unsub = client.subscribeTicker('AAPL-USD', () => {})
    await tick(5)
    ackAuth(sockets[0])
    await tick(5)

    sockets[0].drop()
    await tick(20)
    expect(sockets.length).toBe(2)

    // Fresh socket: auth first, and nothing subscribed until it is acked.
    expect(sockets[1].sent[0]).toMatchObject({ action: 'auth' })
    expect(
      sockets[1].sent.find((m) => m['action'] === 'subscribe'),
    ).toBeUndefined()

    ackAuth(sockets[1])
    await tick(5)

    // The server holds nothing on a new socket, so the whole set goes again.
    const sub = sockets[1].sent.find((m) => m['action'] === 'subscribe')
    expect(sub!['quotes']).toEqual(['AAPL'])
    expect(sub!['trades']).toEqual(['AAPL'])

    unsub()
    client.destroy()
  })

  it('does NOT recycle a silent socket — overnight quiet is normal here', async () => {
    const { sockets, connectFn } = recordingTransport()
    stubBarsFetch([])
    const client = new AlpacaWsClient(getCreds, connectFn, undefined, FAST)

    const unsub = client.subscribeTicker('AAPL-USD', () => {})
    await tick(5)
    ackAuth(sockets[0])
    // Long silence with no frames at all — a closed market, not a dead socket.
    await tick(120)

    expect(sockets.length).toBe(1)
    expect(sockets[0].closed).toBe(false)

    unsub()
    client.destroy()
  })

  it('reconnects on resume even though nothing was flowing', async () => {
    const { sockets, connectFn } = recordingTransport()
    stubBarsFetch([])
    const wake: { fire: (() => void) | null } = { fire: null }
    const client = new AlpacaWsClient(getCreds, connectFn, undefined, {
      ...FAST,
      wakeSource: {
        subscribe: (listener) => {
          wake.fire = () => listener({ reason: 'resume', gapMs: 30_000 })
          return () => {
            wake.fire = null
          }
        },
      },
    })

    const unsub = client.subscribeTicker('AAPL-USD', () => {})
    await tick(5)
    ackAuth(sockets[0])
    await tick(5)

    wake.fire?.()
    await tick(20)

    expect(sockets.length).toBe(2)

    unsub()
    client.destroy()
  })

  it('backs off when the stream rejects the credentials', async () => {
    const { sockets, connectFn } = recordingTransport()
    stubBarsFetch([])
    const client = new AlpacaWsClient(getCreds, connectFn, undefined, FAST)

    const unsub = client.subscribeTicker('AAPL-USD', () => {})
    await tick(5)

    sockets[0].events.onMessage(
      JSON.stringify([{ T: 'error', code: 402, msg: 'auth failed' }]),
    )
    await tick(40)

    // Retried rather than sitting on a socket that never subscribes.
    expect(sockets.length).toBeGreaterThanOrEqual(2)
    expect(sockets[0].closed).toBe(true)
    expect(sockets.length).toBeLessThan(12)

    unsub()
    client.destroy()
  })

  it('closes the socket after the grace period once the last sub releases', async () => {
    const { sockets, connectFn } = recordingTransport()
    stubBarsFetch([])
    const client = new AlpacaWsClient(getCreds, connectFn, undefined, {
      ...FAST,
      gracePeriodMs: 10,
    })

    const unsub = client.subscribeTicker('AAPL-USD', () => {})
    await tick(5)
    ackAuth(sockets[0])
    await tick(5)

    unsub()
    await tick(30)

    expect(sockets[0].closed).toBe(true)
    client.destroy()
  })

  it('does not reconnect after destroy', async () => {
    const { sockets, connectFn } = recordingTransport()
    stubBarsFetch([])
    const client = new AlpacaWsClient(getCreds, connectFn, undefined, FAST)

    const unsub = client.subscribeTicker('AAPL-USD', () => {})
    await tick(5)
    ackAuth(sockets[0])
    await tick(5)

    unsub()
    client.destroy()
    sockets[0].drop()
    await tick(30)

    expect(sockets.length).toBe(1)
  })
})

/**
 * Two pair keys, one Alpaca symbol.
 *
 * 'AAPL' comes from the shared instruments catalog and 'AAPL-USD' is this
 * connector's own pair form; both reduce to 'AAPL'. The subscription maps used
 * to be keyed by that symbol, so the second subscriber overwrote the first's
 * entry: the first went permanently silent, and whichever unsubscribed first
 * tore down the other's subscription too. A workspace holding both chips in
 * the recent-pairs strip hit this every time.
 */
describe('AlpacaWsClient — two pair keys sharing one symbol', () => {
  it('feeds both subscribers from a single symbol', async () => {
    const { state, connectFn } = fakeTransport()
    const client = new AlpacaWsClient(getCreds, connectFn)
    // A real snapshot response: the WS trade handler only patches a sub that
    // already holds one, so an empty stub would make both lists empty for a
    // reason that has nothing to do with the collision under test.
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            AAPL: {
              latestTrade: { p: 190, t: '2026-06-30T14:00:00Z' },
              latestQuote: { bp: 189, bs: 1, ap: 191, as: 1 },
              dailyBar: { h: 195, l: 185, v: 1000, c: 190 },
              prevDailyBar: { c: 188 },
            },
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch

    const bare: Array<number> = []
    const quoted: Array<number> = []
    const unsubA = client.subscribeTicker('AAPL', (u) => {
      if (u.type === 'ticker') bare.push(u.ticker.last)
    })
    const unsubB = client.subscribeTicker('AAPL-USD', (u) => {
      if (u.type === 'ticker') quoted.push(u.ticker.last)
    })
    await tick(5)
    authenticate(state)
    await tick(5)

    state.events!.onMessage(
      JSON.stringify([{ T: 't', S: 'AAPL', p: 200, t: 2 }]),
    )
    await tick(5)

    // Neither list may be empty: an empty one is the overwritten subscriber.
    expect(bare.length).toBeGreaterThan(0)
    expect(quoted.length).toBeGreaterThan(0)
    expect(bare.at(-1)).toBe(200)
    expect(quoted.at(-1)).toBe(200)

    unsubA()
    unsubB()
    client.destroy()
  })

  it('unsubscribing one leaves the other subscribed to the symbol', async () => {
    const { state, connectFn } = fakeTransport()
    const client = new AlpacaWsClient(getCreds, connectFn)
    stubBarsFetch([])

    const unsubA = client.subscribeTicker('AAPL', () => {})
    client.subscribeTicker('AAPL-USD', () => {})
    await tick(5)
    authenticate(state)
    await tick(5)

    unsubA()
    await tick(5)

    // The channel must survive: an unsubscribe frame dropping 'AAPL' here
    // would silence the pair key that never asked to leave.
    const unsubscribes = state.sent.filter((m) => m['action'] === 'unsubscribe')
    for (const frame of unsubscribes) {
      expect(frame['trades'] ?? []).not.toContain('AAPL')
    }

    client.destroy()
  })
})

describe('AlpacaWsClient — pairs the venue cannot serve', () => {
  // 'BTC-USDT' reduces to 'BTC', a real NYSE Arca ticker. Subscribing would
  // stream a spot-bitcoin ETF under a crypto pair's label.
  it('never opens a channel for a non-USD quote leg', async () => {
    const { state, connectFn } = fakeTransport()
    const client = new AlpacaWsClient(getCreds, connectFn)
    stubBarsFetch([])

    const ticks: Array<unknown> = []
    const unsubTicker = client.subscribeTicker('BTC-USDT', (u) => ticks.push(u))
    const unsubBook = client.subscribeOrderbook('BTC-USDT', (u) =>
      ticks.push(u),
    )
    const unsubCandles = client.subscribeCandles('BTC-USDT', '15m', (u) =>
      ticks.push(u),
    )
    await tick(5)

    // Nothing subscribed means nothing to authenticate for: no socket work,
    // and above all no callback carrying another instrument's price.
    expect(ticks).toEqual([])
    const subs = state.sent.filter((m) => m['action'] === 'subscribe')
    for (const frame of subs) {
      expect(JSON.stringify(frame)).not.toContain('BTC')
    }

    unsubTicker()
    unsubBook()
    unsubCandles()
    client.destroy()
  })
})
