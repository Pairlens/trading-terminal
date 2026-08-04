// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { OkxPrivateWsClient } from '../private-ws'
import { sleep, waitFor } from '../../test-utils/async'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'
import type {
  NormalizedBalance,
  NormalizedOrderUpdate,
} from '@pairlens/market-engine/types'

const CREDS = { apiKey: 'k', apiSecret: 's', passphrase: 'p' }

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
  /** Server-side drop. */
  drop(): void {
    if (this.closed) return
    this.closed = true
    this.events.onClose?.(1006, 'dropped')
  }
  push(msg: unknown): void {
    this.events.onMessage(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  /** Accept the pending login, as OKX does. */
  acceptLogin(): void {
    this.push({ event: 'login', code: '0' })
  }
  ops(op: string): Array<Record<string, unknown>> {
    return this.sent
      .filter((s) => s.startsWith('{'))
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .filter((f) => f['op'] === op)
  }
}

function makeClient() {
  const sockets: Array<FakeSocket> = []
  const urls: Array<string> = []
  const client = new OkxPrivateWsClient({
    baseBackoffMs: 2,
    maxBackoffMs: 20,
    stableResetMs: 20,
    random: () => 1,
    wakeSource: { subscribe: () => () => {} },
    connect: async (url, events) => {
      urls.push(url)
      const socket = new FakeSocket(events)
      sockets.push(socket)
      return socket
    },
  })
  return { client, sockets, urls }
}

/** Connect and complete the login handshake on socket `index`. */
async function connected(index = 0) {
  const h = makeClient()
  const orders: Array<NormalizedOrderUpdate> = []
  const balances: Array<Array<NormalizedBalance>> = []
  h.client.connect(
    CREDS,
    '',
    false,
    (u) => orders.push(u),
    (b) => balances.push(b),
  )
  // The login frame is signed asynchronously; pushing OKX's acceptance before
  // it goes out would leave the client nothing to correlate the reply with.
  await waitFor(() => h.sockets[index]?.ops('login').length > 0)
  h.sockets[index].acceptLogin()
  await waitFor(() => h.sockets[index].ops('subscribe').length > 0)
  return { ...h, orders, balances }
}

describe('OkxPrivateWsClient — handshake', () => {
  it('signs a login and withholds the subscribe until OKX accepts it', async () => {
    const { client, sockets } = makeClient()
    client.connect(CREDS, '', false, () => {})
    await waitFor(() => sockets[0]?.ops('login').length > 0)

    const socket = sockets[0]
    const login = socket.ops('login')[0]
    expect(login).toBeDefined()
    const args = (login['args'] as Array<Record<string, string>>)[0]
    expect(args['apiKey']).toBe('k')
    expect(args['passphrase']).toBe('p')
    expect(args['sign']).toBeTruthy()
    expect(args['timestamp']).toBeTruthy()

    // Nothing may be subscribed while the login is unanswered.
    expect(socket.ops('subscribe').length).toBe(0)

    socket.acceptLogin()
    await waitFor(() => socket.ops('subscribe').length > 0)

    const sub = socket.ops('subscribe')[0]
    expect(sub).toBeDefined()
    expect(sub['args']).toEqual([
      { channel: 'orders', instType: 'SPOT' },
      { channel: 'balance_and_position' },
    ])

    client.destroy()
  })

  it('re-logs in with a fresh signature before resubscribing after a drop', async () => {
    const { client, sockets } = await connected()

    sockets[0].drop()
    await waitFor(
      () => sockets.length === 2 && sockets[1].ops('login').length > 0,
    )
    expect(sockets.length).toBe(2)

    const second = sockets[1]
    expect(second.ops('login').length).toBe(1)
    // Still gated on the new socket's own login.
    expect(second.ops('subscribe').length).toBe(0)

    second.acceptLogin()
    await waitFor(() => second.ops('subscribe').length > 0)
    expect(second.ops('subscribe').length).toBe(1)

    client.destroy()
  })

  it('backs off on a rejected login instead of hot-looping', async () => {
    const { client, sockets } = makeClient()
    client.connect(CREDS, '', false, () => {})
    await waitFor(() => sockets[0]?.ops('login').length > 0)

    sockets[0].push({ event: 'login', code: '60009', msg: 'Login failed.' })
    await waitFor(() => sockets.length >= 2)

    // Retried, but the rejected socket was closed rather than left live.
    expect(sockets.length).toBeGreaterThanOrEqual(2)
    expect(sockets[0].closed).toBe(true)
    // Hot-loop guard: a fixed window admits a handful of backed-off retries
    // and hundreds of hot-looping ones. Negative, so the sleep stays.
    const before = sockets.length
    await sleep(30)
    expect(sockets.length - before).toBeLessThan(10)

    client.destroy()
  })

  it('treats a bare error frame during login as a login failure', async () => {
    const { client, sockets } = makeClient()
    client.connect(CREDS, '', false, () => {})
    await waitFor(() => sockets[0]?.ops('login').length > 0)

    // Fails fast rather than waiting out the 10s login timeout.
    sockets[0].push({ event: 'error', code: '60006', msg: 'Timestamp expired' })
    await waitFor(() => sockets.length >= 2)

    expect(sockets.length).toBeGreaterThanOrEqual(2)

    client.destroy()
  })
})

describe('OkxPrivateWsClient — keepalive', () => {
  it('sends the raw ping frame and ignores the raw pong', async () => {
    const sockets: Array<FakeSocket> = []
    const client = new OkxPrivateWsClient({
      ping: { intervalMs: 5, frame: () => 'ping' },
      wakeSource: { subscribe: () => () => {} },
      connect: async (_url, events) => {
        const socket = new FakeSocket(events)
        sockets.push(socket)
        return socket
      },
    })
    client.connect(CREDS, '', false, () => {})
    await waitFor(() => sockets[0]?.ops('login').length > 0)
    sockets[0].acceptLogin()
    await waitFor(() => sockets[0].sent.filter((s) => s === 'ping').length > 1)

    expect(sockets[0].sent.filter((s) => s === 'ping').length).toBeGreaterThan(
      1,
    )
    // A raw pong must not fall through the JSON parser as an error.
    expect(() => sockets[0].push('pong')).not.toThrow()

    client.destroy()
  })
})

describe('OkxPrivateWsClient — endpoint selection', () => {
  it('uses the paper endpoint in paper mode', async () => {
    const { client, urls } = makeClient()
    client.connect(CREDS, '', true, () => {})
    await waitFor(() => urls.length > 0)

    expect(urls[0]).toContain('wspap.okx.com')

    client.destroy()
  })

  it('restarts onto the new endpoint when the mode changes', async () => {
    const { client, sockets, urls } = await connected()
    expect(urls[0]).toContain('wss://ws.okx.com')

    client.connect(CREDS, '', true, () => {})
    await waitFor(() => urls.length > 1 && sockets[0].closed)

    expect(urls[1]).toContain('wspap.okx.com')
    expect(sockets[0].closed).toBe(true)

    client.destroy()
  })

  it('does not restart when nothing about the endpoint changed', async () => {
    const { client, sockets } = await connected()

    client.connect(CREDS, '', false, () => {})
    await sleep(20)

    expect(sockets.length).toBe(1)
    expect(sockets[0].closed).toBe(false)

    client.destroy()
  })
})

describe('OkxPrivateWsClient — payload normalization', () => {
  it('normalizes an order update', async () => {
    const { client, sockets, orders } = await connected()

    sockets[0].push({
      arg: { channel: 'orders', instType: 'SPOT' },
      data: [
        {
          ordId: '123',
          instId: 'BTC-USDT',
          side: 'sell',
          ordType: 'limit',
          sz: '0.5',
          px: '64000',
          fillSz: '0.25',
          avgPx: '63990',
          state: 'partially_filled',
          fee: '-0.1',
          feeCcy: 'USDT',
          uTime: '1700000001000',
          cTime: '1700000000000',
        },
      ],
    })

    expect(orders).toEqual([
      {
        orderId: '123',
        pair: 'BTC-USDT',
        side: 'sell',
        type: 'limit',
        size: '0.5',
        price: '64000',
        fillSize: '0.25',
        avgPrice: '63990',
        status: 'partially_filled',
        fee: '-0.1',
        feeCcy: 'USDT',
        ts: 1700000001000,
        createdAt: 1700000000000,
      },
    ])

    client.destroy()
  })

  it('maps OKX order states onto the normalized set', async () => {
    const { client, sockets, orders } = await connected()
    const push = (state: string) =>
      sockets[0].push({
        arg: { channel: 'orders' },
        data: [{ ordId: 'o', instId: 'BTC-USDT', state }],
      })

    push('filled')
    push('canceled')
    push('partially_filled')
    push('live')

    expect(orders.map((o) => o.status)).toEqual([
      'filled',
      'cancelled',
      'partially_filled',
      'live',
    ])

    client.destroy()
  })

  it('emits balances and drops zero-balance currencies', async () => {
    const { client, sockets, balances } = await connected()

    sockets[0].push({
      arg: { channel: 'balance_and_position' },
      data: [
        {
          balData: [
            { ccy: 'USDT', cashBal: '100', availBal: '80', frozenBal: '20' },
            { ccy: 'ETH', cashBal: '0', availBal: '0', frozenBal: '0' },
          ],
        },
      ],
    })

    expect(balances).toEqual([
      [{ currency: 'USDT', available: '80', frozen: '20', total: '100' }],
    ])

    client.destroy()
  })
})

describe('OkxPrivateWsClient — teardown', () => {
  it('stops delivering and closes the socket on destroy', async () => {
    const { client, sockets, orders } = await connected()

    client.destroy()
    await waitFor(() => sockets[0].closed)

    expect(sockets[0].closed).toBe(true)

    sockets[0].push({
      arg: { channel: 'orders' },
      data: [{ ordId: 'late', instId: 'BTC-USDT', state: 'filled' }],
    })
    expect(orders).toEqual([])
  })

  it('does not reconnect after destroy, even mid-backoff', async () => {
    const { client, sockets } = await connected()

    // Drop the socket so a reconnect is pending, then tear down — the
    // pre-session client leaked an authenticated socket in exactly this
    // window: the queued timer reconnected and re-logged-in with nothing
    // holding a reference to ever stop it.
    sockets[0].drop()
    client.destroy()
    await sleep(40)

    expect(sockets.length).toBe(1)
  })

  it('does not reconnect after a drop with no subscriber left', async () => {
    const { client, sockets } = await connected()

    sockets[0].drop()
    await waitFor(() => sockets.length === 2 && sockets[1].sent.length > 0)
    // Still wanted, so it came back.
    expect(sockets.length).toBe(2)

    client.destroy()
    sockets[1].drop()
    await sleep(30)
    expect(sockets.length).toBe(2)
  })
})
