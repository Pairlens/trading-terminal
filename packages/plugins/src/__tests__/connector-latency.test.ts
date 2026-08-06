// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Cross-connector keepalive-latency conformance.
 *
 * A connector reports round-trip latency by doing two things: calling
 * `session.notePong()` from the branch that recognizes its venue's reply, and
 * recording under its own market id. Both are easy to get quietly wrong — a
 * pong branch that returns early without acking, or a market-id literal that
 * drifts from the manifest — and the only symptom is a header readout that
 * never appears. Neither shows up in typecheck, and neither can be caught by
 * a test that stubs the session.
 *
 * So each venue here drives its REAL ws client over a fake socket: ping goes
 * out, the venue's actual pong frame comes back, and the assertion is that the
 * shared monitor now knows about the market id the venue's MANIFEST declares.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { latencyMonitor } from '@pairlens/market-engine/latency'

import { BfxWsClient } from '../bitfinex-market-connector/ws-client'
import { BinanceWsClient } from '../binance-market-connector/ws-client'
import { BitgetWsClient } from '../bitget-market-connector/ws-client'
import { BitvavoWsClient } from '../bitvavo-market-connector/ws-client'
import { BybitWsClient } from '../bybit-market-connector/ws-client'
import { GateWsClient } from '../gate-market-connector/ws-client'
import { KrakenWsClient } from '../kraken-market-connector/ws-client'
import { KucoinWsClient } from '../kucoin-market-connector/ws-client'
import { MexcWsClient } from '../mexc-market-connector/ws-client'
import { OkxWsClient } from '../okx-market-connector/ws-client'
import { UpbitWsClient } from '../upbit-market-connector/ws-client'

import { bitfinexMarketConnectorManifest } from '../bitfinex-market-connector'
import { binanceMarketConnectorManifest } from '../binance-market-connector'
import { bitgetMarketConnectorManifest } from '../bitget-market-connector'
import { bitvavoMarketConnectorManifest } from '../bitvavo-market-connector'
import { bybitMarketConnectorManifest } from '../bybit-market-connector'
import { gateMarketConnectorManifest } from '../gate-market-connector'
import { krakenMarketConnectorManifest } from '../kraken-market-connector'
import { kucoinMarketConnectorManifest } from '../kucoin-market-connector'
import { mexcMarketConnectorManifest } from '../mexc-market-connector'
import { okxMarketConnectorManifest } from '../okx-market-connector'
import { upbitMarketConnectorManifest } from '../upbit-market-connector'

import { waitFor } from '../test-utils/async'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'
import type { PluginManifest } from '@pairlens/plugin-system/types'

class FakeSocket implements WsConnection {
  sent: Array<string> = []
  closed = false
  constructor(readonly events: WsAdapterEvents) {}
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {
    this.closed = true
  }
  push(text: string): void {
    this.events.onMessage(text)
  }
}

type PublicWsClient = {
  subscribeTicker: (
    pair: string,
    country: string,
    cb: (data: unknown) => void,
  ) => () => void
  destroy: () => void
}

type VenueCase = {
  manifest: PluginManifest
  /**
   * Build the client over the fake transport. `overrides` carries the injected
   * `connect` plus a hair-trigger ping interval so the keepalive fires inside
   * a test rather than 20s later.
   */
  make: (overrides: Partial<WsSessionOptions>) => PublicWsClient
  /** The venue's own reply to the keepalive, verbatim off its wire. */
  pong: (socket: FakeSocket) => string
  /**
   * Venues whose ping frame carries state the reply is matched against (an
   * echoed id) cannot have that frame stubbed — the test would then assert
   * against a correlation the client never performed.
   */
  realPingFrame?: boolean
}

/** Reads the market id out of the manifest so a drifting literal fails here. */
function marketIdOf(manifest: PluginManifest): string {
  const markets = manifest.capabilities.find(
    (c) => c.id === 'market-data:ticker',
  )?.markets
  const marketId = markets?.[0]
  if (!marketId) throw new Error(`${manifest.id}: no ticker market declared`)
  return marketId
}

const STUB_PING = { intervalMs: 5, frame: () => 'ping' }

/** Has the keepalive frame (stubbed, or the venue's own) left the socket yet? */
function pingWasSent(venue: VenueCase, socket: FakeSocket): boolean {
  return venue.realPingFrame
    ? socket.sent.some((s) => s.includes('LIST_SUBSCRIPTIONS'))
    : socket.sent.includes('ping')
}

const VENUES: Array<VenueCase> = [
  {
    manifest: okxMarketConnectorManifest,
    make: (o) => new OkxWsClient(o),
    pong: () => 'pong',
  },
  {
    manifest: binanceMarketConnectorManifest,
    // Binance's keepalive is a real LIST_SUBSCRIPTIONS request and its reply
    // is matched on the echoed id, so the client's own frame has to run.
    make: (o) => {
      const client: BinanceWsClient = new BinanceWsClient({
        ...o,
        ping: {
          intervalMs: 5,
          // Lazy on purpose: the frame runs off the timer, long after the
          // constructor this closure is passed into has returned.
          frame: () =>
            (
              client as unknown as { keepaliveFrame: () => string }
            ).keepaliveFrame(),
        },
      })
      return client
    },
    realPingFrame: true,
    pong: (socket) => {
      const sent = socket.sent
        .map((s) => JSON.parse(s) as { method?: string; id?: number })
        .filter((f) => f.method === 'LIST_SUBSCRIPTIONS')
      const id = sent[sent.length - 1]?.id
      return JSON.stringify({ result: [], id })
    },
  },
  {
    manifest: bybitMarketConnectorManifest,
    make: (o) => new BybitWsClient(o),
    pong: () => JSON.stringify({ op: 'pong' }),
  },
  {
    manifest: kucoinMarketConnectorManifest,
    make: (o) => new KucoinWsClient(o),
    pong: () => JSON.stringify({ type: 'pong', id: '1' }),
  },
  {
    manifest: gateMarketConnectorManifest,
    make: (o) => new GateWsClient(o),
    pong: () => JSON.stringify({ channel: 'spot.pong', event: 'update' }),
  },
  {
    manifest: krakenMarketConnectorManifest,
    make: (o) => new KrakenWsClient(o),
    pong: () => JSON.stringify({ method: 'pong' }),
  },
  {
    manifest: bitgetMarketConnectorManifest,
    make: (o) => new BitgetWsClient(o),
    pong: () => 'pong',
  },
  {
    manifest: mexcMarketConnectorManifest,
    make: (o) => new MexcWsClient(o),
    pong: () => JSON.stringify({ id: 0, code: 0, msg: 'PONG' }),
  },
  {
    manifest: upbitMarketConnectorManifest,
    make: (o) => new UpbitWsClient(o),
    pong: () => 'PONG',
  },
  {
    manifest: bitvavoMarketConnectorManifest,
    make: (o) => new BitvavoWsClient(o),
    pong: () =>
      JSON.stringify({ action: 'getTime', response: { time: 1700000000000 } }),
  },
  {
    manifest: bitfinexMarketConnectorManifest,
    make: (o) => new BfxWsClient(o),
    pong: () => JSON.stringify({ event: 'pong', cid: 1, ts: 1700000000000 }),
  },
]

const realFetch = globalThis.fetch

/**
 * KuCoin bootstraps its WS endpoint over REST, so a token has to come back;
 * every other connector's REST here is backfill it already tolerates failing.
 */
const KUCOIN_TOKEN = {
  code: '200000',
  data: {
    token: 'fake-token',
    instanceServers: [
      {
        endpoint: 'wss://fake.example/endpoint',
        pingInterval: 18_000,
        pingTimeout: 10_000,
      },
    ],
  },
}

beforeEach(() => {
  latencyMonitor.clear()
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes('bullet-public')) {
      return Promise.resolve(
        new Response(JSON.stringify(KUCOIN_TOKEN), {
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    return Promise.reject(new Error('offline'))
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  latencyMonitor.clear()
})

describe('connector keepalive latency', () => {
  for (const venue of VENUES) {
    const marketId = marketIdOf(venue.manifest)

    it(`${marketId} records a round trip under its manifest market id`, async () => {
      const sockets: Array<FakeSocket> = []
      const client = venue.make({
        ...(venue.realPingFrame ? {} : { ping: STUB_PING }),
        baseBackoffMs: 2,
        gracePeriodMs: 5,
        connect: async (_url, events) => {
          const socket = new FakeSocket(events)
          sockets.push(socket)
          return socket
        },
      })

      const release = client.subscribeTicker('BTC-USDT', '', () => {})
      await waitFor(() => sockets.length > 0)
      const socket = sockets[0]
      // A round trip only opens once the keepalive itself has gone out — the
      // subscribe frames that precede it are not what is being timed.
      await waitFor(() => pingWasSent(venue, socket))
      expect(pingWasSent(venue, socket), `${marketId} sent no keepalive`).toBe(
        true,
      )

      expect(latencyMonitor.get(marketId)).toBeNull()
      socket.push(venue.pong(socket))

      const latency = latencyMonitor.get(marketId)
      expect(latency, `${marketId} reported no round trip`).not.toBeNull()
      expect(latency!.samples).toBe(1)
      expect(latency!.medianMs).toBeGreaterThanOrEqual(0)

      release()
      client.destroy()
    })
  }

  it('covers every bundled venue whose socket answers a keepalive', () => {
    // A new client-pinged connector that forgets to wire notePong would
    // otherwise just be missing from the list above, silently.
    expect(VENUES.map((v) => marketIdOf(v.manifest)).sort()).toEqual([
      'binance',
      'bitfinex',
      'bitget',
      'bitvavo',
      'bybit',
      'gate',
      'kraken',
      'kucoin',
      'mexc',
      'okx',
      'upbit',
    ])
  })
})
