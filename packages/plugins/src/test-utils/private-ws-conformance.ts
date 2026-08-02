// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Lifecycle conformance for private (authenticated) WS clients.
 *
 * Every private client now delegates its connection lifecycle to
 * ReconnectingWsSession, so the behavior that matters is identical across
 * venues and worth asserting once rather than fourteen times: auth precedes
 * subscribe, a drop re-authenticates before resubscribing, a rejected auth
 * backs off instead of hot-looping, and teardown leaves nothing running.
 *
 * That last one is the reason this file exists. These sockets are
 * authenticated and they feed the realized-PnL path behind the daily-loss
 * guard, so a client that quietly stops delivering — or one that keeps
 * reconnecting after its credential slot is gone — is a risk-control bug, not
 * a cosmetic one.
 *
 * Wire-format specifics (payload normalization, venue quirks) stay in each
 * connector's own test file; this only covers the shared lifecycle.
 */

import { describe, expect, it } from 'bun:test'
import type {
  WsAdapterEvents,
  WsConnection,
} from '@pairlens/market-engine/ws-adapter'
import type { WsSessionOptions } from '@pairlens/market-engine/ws-session'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class FakePrivateSocket implements WsConnection {
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
  /** Frames sent so far, parsed as JSON (non-JSON frames skipped). */
  json(): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = []
    for (const s of this.sent) {
      try {
        out.push(JSON.parse(s) as Record<string, unknown>)
      } catch {
        // raw keepalive frames like "ping"
      }
    }
    return out
  }
}

/** Minimal client shape the conformance suite drives. */
export type PrivateWsClientLike = {
  connect: (
    credentials: never,
    country: string,
    paper: boolean,
    onOrderUpdate: (update: unknown) => void,
    onBalances?: (balances: unknown) => void,
  ) => void
  destroy: () => void
}

export type PrivateWsDriver = {
  /** Venue label used in test names. */
  name: string
  /** Build the client with the session options injected. */
  create: (options: Partial<WsSessionOptions>) => PrivateWsClientLike
  /** Credentials to hand to connect(). */
  credentials: unknown
  /**
   * Push the venue's auth-success frame. Omit for venues that carry their
   * credentials inside the subscribe frame (no separate auth round-trip).
   */
  acceptAuth?: (socket: FakePrivateSocket) => void
  /** Push the venue's auth-failure frame. Required when acceptAuth is set. */
  rejectAuth?: (socket: FakePrivateSocket) => void
  /** True once the auth frame has been sent on this socket. */
  sentAuth?: (socket: FakePrivateSocket) => boolean
  /** True once the channel subscribe has been sent on this socket. */
  sentSubscribe: (socket: FakePrivateSocket) => boolean
}

export function describePrivateWsLifecycle(driver: PrivateWsDriver): void {
  function harness(overrides: Partial<WsSessionOptions> = {}) {
    const sockets: Array<FakePrivateSocket> = []
    const client = driver.create({
      baseBackoffMs: 2,
      maxBackoffMs: 20,
      stableResetMs: 20,
      random: () => 1,
      // Never attach to the process-wide monitor from a test.
      wakeSource: { subscribe: () => () => {} },
      connect: async (_url, events) => {
        const socket = new FakePrivateSocket(events)
        sockets.push(socket)
        return socket
      },
      ...overrides,
    })
    return { client, sockets }
  }

  function start(h: ReturnType<typeof harness>) {
    h.client.connect(
      driver.credentials as never,
      '',
      false,
      () => {},
      () => {},
    )
  }

  describe(`${driver.name} private WS — lifecycle`, () => {
    it('connects and subscribes', async () => {
      const h = harness()
      start(h)
      await sleep(5)

      expect(h.sockets.length).toBe(1)
      driver.acceptAuth?.(h.sockets[0])
      await sleep(5)

      expect(driver.sentSubscribe(h.sockets[0])).toBe(true)
      h.client.destroy()
    })

    if (driver.acceptAuth && driver.sentAuth) {
      it('authenticates before it subscribes', async () => {
        const h = harness()
        start(h)
        await sleep(5)

        expect(driver.sentAuth!(h.sockets[0])).toBe(true)
        // The gate must hold the subscribe until the venue accepts the key.
        expect(driver.sentSubscribe(h.sockets[0])).toBe(false)

        driver.acceptAuth!(h.sockets[0])
        await sleep(5)
        expect(driver.sentSubscribe(h.sockets[0])).toBe(true)

        h.client.destroy()
      })

      it('re-authenticates before resubscribing after a drop', async () => {
        const h = harness()
        start(h)
        await sleep(5)
        driver.acceptAuth!(h.sockets[0])
        await sleep(5)

        h.sockets[0].drop()
        await sleep(20)
        expect(h.sockets.length).toBe(2)

        expect(driver.sentAuth!(h.sockets[1])).toBe(true)
        expect(driver.sentSubscribe(h.sockets[1])).toBe(false)

        driver.acceptAuth!(h.sockets[1])
        await sleep(5)
        expect(driver.sentSubscribe(h.sockets[1])).toBe(true)

        h.client.destroy()
      })

      if (driver.rejectAuth) {
        it('backs off on a rejected auth instead of hot-looping', async () => {
          const h = harness()
          start(h)
          await sleep(5)

          driver.rejectAuth!(h.sockets[0])
          await sleep(40)

          expect(h.sockets.length).toBeGreaterThanOrEqual(2)
          // The rejected socket must be closed, not left half-authenticated.
          expect(h.sockets[0].closed).toBe(true)
          expect(h.sockets.length).toBeLessThan(12)

          h.client.destroy()
        })
      }
    }

    it('reconnects and resubscribes after a drop', async () => {
      const h = harness()
      start(h)
      await sleep(5)
      driver.acceptAuth?.(h.sockets[0])
      await sleep(5)

      h.sockets[0].drop()
      await sleep(20)

      expect(h.sockets.length).toBe(2)
      driver.acceptAuth?.(h.sockets[1])
      await sleep(5)
      expect(driver.sentSubscribe(h.sockets[1])).toBe(true)

      h.client.destroy()
    })

    it('restarts a socket that goes silent', async () => {
      // Short liveness budget: the fake never delivers, so the watchdog is
      // the only thing that can notice this socket is dead.
      const h = harness({ livenessTimeoutMs: 20 })
      start(h)
      await sleep(5)
      driver.acceptAuth?.(h.sockets[0])
      await sleep(60)

      expect(h.sockets.length).toBeGreaterThanOrEqual(2)
      expect(h.sockets[0].closed).toBe(true)

      h.client.destroy()
    })

    it('reconnects on resume', async () => {
      // Holder object, not a bare `let` — assigning inside the callback would
      // leave TS narrowing the outer binding to null at the call site.
      const wake: { fire: (() => void) | null } = { fire: null }
      const h = harness({
        wakeSource: {
          subscribe: (listener) => {
            wake.fire = () => listener({ reason: 'resume', gapMs: 30_000 })
            return () => {
              wake.fire = null
            }
          },
        },
      })
      start(h)
      await sleep(5)
      driver.acceptAuth?.(h.sockets[0])
      await sleep(5)

      wake.fire?.()
      await sleep(20)

      expect(h.sockets.length).toBe(2)
      h.client.destroy()
    })

    it('closes the socket and stops reconnecting on destroy', async () => {
      const h = harness()
      start(h)
      await sleep(5)
      driver.acceptAuth?.(h.sockets[0])
      await sleep(5)

      h.client.destroy()
      await sleep(10)
      expect(h.sockets[0].closed).toBe(true)

      h.sockets[0].drop()
      await sleep(30)
      expect(h.sockets.length).toBe(1)
    })

    it('does not reconnect when torn down mid-backoff', async () => {
      // The window the pre-session clients leaked in: a retry was already
      // queued, the slot went away, and the orphaned timer reconnected an
      // authenticated socket nothing held a reference to.
      const h = harness()
      start(h)
      await sleep(5)
      driver.acceptAuth?.(h.sockets[0])
      await sleep(5)

      h.sockets[0].drop()
      h.client.destroy()
      await sleep(40)

      expect(h.sockets.length).toBe(1)
    })
  })
}
