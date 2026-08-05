// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { ReconnectingWsSession } from '../ws-session'
import type { WsSessionOptions } from '../ws-session'
import type { WsAdapterEvents, WsConnection } from '../ws-adapter'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Poll until cond() holds, bailing after timeoutMs so a genuine failure still
 * lands on the assertion that follows. Positive expectations wait for their
 * event like this — fixed sleeps sized to the tiny test backoffs flake on
 * loaded CI runners. Negative assertions (nothing must happen during the
 * window) keep fixed sleeps, where a stall only makes them stricter.
 */
const waitFor = async (cond: () => boolean, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs
  while (!cond() && Date.now() < deadline) await sleep(2)
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
    // Mirror browser semantics: close() eventually fires onclose.
    setTimeout(() => this.events.onClose?.(1000, 'client closed'), 0)
  }
  /** Simulate a server-side drop. */
  drop(): void {
    if (this.closed) return
    this.closed = true
    this.events.onClose?.(1006, 'dropped')
  }
}

type Harness = {
  session: ReconnectingWsSession
  sockets: Array<FakeSocket>
  connectAttempts: () => number
  /** Simulate a host resume / network restoration. */
  wake: () => void
}

function makeSession(
  overrides: Partial<WsSessionOptions> & { failConnects?: number } = {},
): Harness {
  const sockets: Array<FakeSocket> = []
  let attempts = 0
  let failsLeft = overrides.failConnects ?? 0
  const wakeListeners = new Set<
    (e: { reason: 'resume'; gapMs: number }) => void
  >()

  const session = new ReconnectingWsSession({
    url: () => 'wss://fake.example/ws',
    onMessage: () => {},
    gracePeriodMs: 10,
    baseBackoffMs: 2,
    maxBackoffMs: 40,
    stableResetMs: 20,
    random: () => 1, // deterministic jitter: delay === cap
    // Never attach to the process-wide monitor from a test.
    wakeSource: {
      subscribe: (listener) => {
        wakeListeners.add(listener)
        return () => wakeListeners.delete(listener)
      },
    },
    connect: async (_url, events) => {
      attempts++
      if (failsLeft > 0) {
        failsLeft--
        throw new Error('connect refused')
      }
      const socket = new FakeSocket(events)
      sockets.push(socket)
      return socket
    },
    ...overrides,
  })

  return {
    session,
    sockets,
    connectAttempts: () => attempts,
    wake: () => {
      for (const listener of wakeListeners) {
        listener({ reason: 'resume', gapMs: 30_000 })
      }
    },
  }
}

function candleSpec(log: Array<string>, key: string) {
  return {
    state: { key },
    subscribe: (s: { key: string }) => log.push(`sub:${s.key}`),
    unsubscribe: (s: { key: string }) => log.push(`unsub:${s.key}`),
    revive: (s: { key: string }) => log.push(`revive:${s.key}`),
  }
}

describe('ReconnectingWsSession — subscriptions', () => {
  it('sends the wire subscribe once per key and unsubscribes after the last release', async () => {
    const log: Array<string> = []
    const { session } = makeSession()

    const release1 = session.acquire(
      'candles:BTC',
      candleSpec(log, 'BTC'),
      () => {},
    )
    await sleep(5)
    const release2 = session.acquire(
      'candles:BTC',
      candleSpec(log, 'BTC-second'),
      () => {},
    )
    await sleep(5)

    // First acquire: pre-open send (no-op at wire level) + on-open resubscribe.
    // Second acquire on a live key must NOT resend.
    expect(log.filter((l) => l.startsWith('sub:BTC')).length).toBe(2)
    expect(log).not.toContain('sub:BTC-second')

    release1()
    expect(log).not.toContain('unsub:BTC')

    release2()
    expect(log).toContain('unsub:BTC')

    session.destroy()
  })

  it('both callbacks on a shared key receive emitted payloads', async () => {
    const { session } = makeSession()
    const seen: Array<string> = []

    session.acquire('t:BTC', candleSpec([], 'BTC'), () => seen.push('a'))
    session.acquire('t:BTC', candleSpec([], 'BTC'), () => seen.push('b'))
    await sleep(5)

    session.emit('t:BTC', { last: 1 })
    expect(seen).toEqual(['a', 'b'])

    session.destroy()
  })

  it('exposes shared state to later subscribers via getState', async () => {
    const { session } = makeSession()
    const state = { buffer: [1, 2, 3] }

    expect(session.getState('k')).toBeUndefined()
    session.acquire(
      'k',
      { state, subscribe: () => {}, unsubscribe: () => {} },
      () => {},
    )
    expect(session.getState<typeof state>('k')).toBe(state)

    session.destroy()
  })

  it('releasing one callback keeps the stream alive for the other', async () => {
    const { session } = makeSession()
    const seen: Array<string> = []

    const release1 = session.acquire('t:BTC', candleSpec([], 'BTC'), () =>
      seen.push('a'),
    )
    session.acquire('t:BTC', candleSpec([], 'BTC'), () => seen.push('b'))
    await sleep(5)

    release1()
    session.emit('t:BTC', { last: 1 })
    expect(seen).toEqual(['b'])

    session.destroy()
  })
})

describe('ReconnectingWsSession — connection lifecycle', () => {
  it('opens a single socket for concurrent acquires (connect gate)', async () => {
    const { session, connectAttempts } = makeSession()

    session.acquire('a', candleSpec([], 'a'), () => {})
    session.acquire('b', candleSpec([], 'b'), () => {})
    session.acquire('c', candleSpec([], 'c'), () => {})
    await waitFor(() => session.isOpen)

    expect(connectAttempts()).toBe(1)
    expect(session.isOpen).toBe(true)

    session.destroy()
  })

  it('revives and resubscribes every key on reconnect after a drop', async () => {
    const log: Array<string> = []
    const { session, sockets } = makeSession()

    session.acquire('candles:BTC', candleSpec(log, 'BTC'), () => {})
    session.acquire('book:BTC', candleSpec(log, 'bookBTC'), () => {})
    await sleep(5)
    log.length = 0

    sockets[0].drop()
    await waitFor(() => sockets.length === 2 && session.isOpen)

    expect(session.isOpen).toBe(true)
    expect(sockets.length).toBe(2)
    // Revive runs before resubscribe, per key.
    expect(log).toEqual([
      'revive:BTC',
      'sub:BTC',
      'revive:bookBTC',
      'sub:bookBTC',
    ])

    session.destroy()
  })

  it('retries failed connects with growing backoff and eventually connects', async () => {
    const { session, connectAttempts } = makeSession({ failConnects: 2 })

    session.acquire('a', candleSpec([], 'a'), () => {})
    // attempt 1 fails -> retry after 2ms; attempt 2 fails -> retry after 4ms; attempt 3 opens
    await waitFor(() => connectAttempts() === 3 && session.isOpen)

    expect(connectAttempts()).toBe(3)
    expect(session.isOpen).toBe(true)

    session.destroy()
  })

  it('closes the socket after the grace period once the last key releases', async () => {
    const { session, sockets } = makeSession()

    const release = session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(5)
    expect(session.isOpen).toBe(true)

    release()
    expect(session.isOpen).toBe(true) // still within grace period
    await waitFor(() => !session.isOpen && sockets[0].closed)

    expect(session.isOpen).toBe(false)
    expect(sockets[0].closed).toBe(true)

    session.destroy()
  })

  it('a re-acquire during the grace period keeps the socket open', async () => {
    const { session, sockets, connectAttempts } = makeSession()

    const release = session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(5)
    release()
    session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(20)

    expect(session.isOpen).toBe(true)
    expect(sockets[0].closed).toBe(false)
    expect(connectAttempts()).toBe(1)

    session.destroy()
  })

  it('does not reconnect after destroy', async () => {
    const { session, sockets, connectAttempts } = makeSession()

    session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(5)

    session.destroy()
    sockets[0].drop()
    await sleep(20)

    expect(connectAttempts()).toBe(1)
    expect(session.isOpen).toBe(false)
  })

  it('send() is silently dropped while disconnected and delivered while open', async () => {
    const { session, sockets } = makeSession()

    session.send('too early') // no socket yet — must not throw
    session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(5)

    session.send('hello')
    expect(sockets[0].sent).toContain('hello')
    expect(sockets[0].sent).not.toContain('too early')

    session.destroy()
  })

  it('sends the application-level ping while connected', async () => {
    const { session, sockets } = makeSession({
      ping: { intervalMs: 5, frame: () => '{"method":"ping"}' },
    })

    session.acquire('a', candleSpec([], 'a'), () => {})
    await waitFor(
      () =>
        (sockets[0]?.sent.filter((f) => f.includes('ping')).length ?? 0) >= 2,
    )

    const pings = sockets[0].sent.filter((s) => s.includes('ping'))
    expect(pings.length).toBeGreaterThanOrEqual(2)

    session.destroy()
  })

  it('supports async url() and retries when the bootstrap rejects', async () => {
    let urlCalls = 0
    const { session, connectAttempts } = makeSession({
      url: async () => {
        urlCalls++
        if (urlCalls === 1) throw new Error('token bootstrap failed')
        return 'wss://bootstrapped.example/ws'
      },
    })

    session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(20) // first attempt fails at url(), retry connects

    expect(urlCalls).toBe(2)
    expect(connectAttempts()).toBe(1) // connect only reached once url resolved
    expect(session.isOpen).toBe(true)

    session.destroy()
  })

  it('restart() force-reconnects while subscriptions remain', async () => {
    const log: Array<string> = []
    const { session, sockets } = makeSession()

    session.acquire('candles:BTC', candleSpec(log, 'BTC'), () => {})
    await sleep(5)

    session.restart()
    await sleep(20)

    expect(sockets.length).toBe(2)
    expect(session.isOpen).toBe(true)

    session.destroy()
  })
})

describe('ReconnectingWsSession — liveness watchdog', () => {
  it('restarts a socket that goes silent, without waiting on its close event', async () => {
    const { session, sockets } = makeSession({ livenessTimeoutMs: 20 })

    session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(5)
    expect(sockets.length).toBe(1)

    // The half-open case: never drops, never closes, just stops delivering.
    await waitFor(() => sockets.length >= 2 && sockets[0].closed, 5000)

    // The replacement is silent too (the fake never delivers), so the watchdog
    // keeps recycling — what matters is that it recycled at all.
    expect(sockets.length).toBeGreaterThanOrEqual(2)
    expect(sockets[0].closed).toBe(true)

    session.destroy()
  })

  it('keeps a socket that is still delivering data', async () => {
    let deliver: (() => void) | null = null
    const { session, sockets } = makeSession({
      livenessTimeoutMs: 30,
      connect: async (_url, events) => {
        const socket = new FakeSocket(events)
        deliver = () => events.onMessage('{"tick":1}')
        return socket
      },
    })

    session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(5)

    // Inbound traffic every 10ms against a 30ms silence budget.
    for (let i = 0; i < 8; i++) {
      deliver?.()
      await sleep(10)
    }

    expect(sockets.length).toBe(0) // custom connect: nothing pushed to `sockets`
    expect(session.isOpen).toBe(true)

    session.destroy()
  })

  it('stays disarmed when the venue guarantees no inbound heartbeat', async () => {
    const { session, sockets } = makeSession()

    session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(80)

    // No ping and no explicit timeout: a quiet market must not be mistaken
    // for a dead socket.
    expect(sockets.length).toBe(1)

    session.destroy()
  })

  it('derives the timeout from the ping interval when not set explicitly', async () => {
    // ping every 20ms → derived timeout is floored at 45s, so a short test
    // window must NOT trip the watchdog.
    const { session, sockets } = makeSession({
      ping: { intervalMs: 20, frame: () => 'ping' },
    })

    session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(80)

    expect(sockets.length).toBe(1)

    session.destroy()
  })
})

describe('ReconnectingWsSession — suspend/resume', () => {
  it('reconnects an open-but-suspect socket on resume', async () => {
    const { session, sockets, wake } = makeSession()

    session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(5)
    expect(sockets.length).toBe(1)

    wake()
    await waitFor(() => sockets.length === 2 && session.isOpen)

    expect(sockets.length).toBe(2)
    expect(session.isOpen).toBe(true)

    session.destroy()
  })

  it('resubscribes every key on the socket the resume produced', async () => {
    const log: Array<string> = []
    const { session, wake } = makeSession()

    session.acquire('candles:BTC', candleSpec(log, 'BTC'), () => {})
    await sleep(5)
    log.length = 0

    wake()
    await waitFor(() => log.includes('revive:BTC') && log.includes('sub:BTC'))

    expect(log).toContain('revive:BTC')
    expect(log).toContain('sub:BTC')

    session.destroy()
  })

  it('short-circuits a long backoff instead of waiting it out', async () => {
    // random()=>1 makes delay === cap, so the retries land at 40/80/160ms:
    // three failures leave the 4th attempt ~160ms out at t≈120.
    const { session, connectAttempts, wake } = makeSession({
      failConnects: 3,
      baseBackoffMs: 40,
      maxBackoffMs: 10_000,
    })

    session.acquire('a', candleSpec([], 'a'), () => {})
    // Three attempts burned (t≈0/40/120); the 4th is not due until ~280ms.
    await waitFor(() => connectAttempts() === 3)
    const attemptsBeforeWake = connectAttempts()
    expect(session.isOpen).toBe(false)

    wake()
    // Bounded well below the ~160ms the pending backoff still had to run —
    // only the wake short-circuit (counter reset to base delay) connects
    // this fast.
    await waitFor(() => session.isOpen, 100)

    expect(connectAttempts()).toBeGreaterThan(attemptsBeforeWake)
    expect(session.isOpen).toBe(true)

    session.destroy()
  })

  it('ignores a resume while nothing is subscribed', async () => {
    const { session, connectAttempts, wake } = makeSession()

    wake()
    await sleep(20)

    expect(connectAttempts()).toBe(0)

    session.destroy()
  })
})

describe('ReconnectingWsSession — release cancels pending work', () => {
  it('a reconnect queued before the last release never opens a socket', async () => {
    const { session, sockets, connectAttempts } = makeSession({
      baseBackoffMs: 10,
    })

    const release = session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(5)

    // Drop so a retry is queued, then release before it fires. Without the
    // guard this opened a connection with zero subscriptions and left it open
    // forever — nothing runs maybeDisconnect again to close it.
    sockets[0].drop()
    release()
    await sleep(40)

    expect(connectAttempts()).toBe(1)
    expect(session.isOpen).toBe(false)

    session.destroy()
  })

  it('re-acquiring after that still connects', async () => {
    const { session, sockets, connectAttempts } = makeSession({
      baseBackoffMs: 10,
    })

    const release = session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(5)
    sockets[0].drop()
    release()
    await sleep(20)

    session.acquire('a', candleSpec([], 'a'), () => {})
    await waitFor(() => session.isOpen)

    expect(connectAttempts()).toBe(2)
    expect(session.isOpen).toBe(true)

    session.destroy()
  })
})

describe('ReconnectingWsSession — authenticate gate', () => {
  it('no subscribe frame goes out until authenticate resolves', async () => {
    const log: Array<string> = []
    let releaseAuth: (() => void) | null = null
    const { session } = makeSession({
      authenticate: () =>
        new Promise<void>((resolve) => {
          releaseAuth = resolve
        }),
    })

    session.acquire('orders', candleSpec(log, 'orders'), () => {})
    await sleep(15)

    // Only the pre-open acquire push (a wire no-op); the post-open resubscribe
    // must still be pending behind the login.
    expect(log.filter((l) => l === 'sub:orders').length).toBe(1)

    releaseAuth?.()
    await waitFor(() => log.filter((l) => l === 'sub:orders').length === 2)
    expect(log.filter((l) => l === 'sub:orders').length).toBe(2)

    session.destroy()
  })

  it('re-authenticates on every reconnect, before resubscribing', async () => {
    const order: Array<string> = []
    const { session, sockets } = makeSession({
      authenticate: async () => {
        order.push('auth')
      },
    })

    session.acquire(
      'orders',
      {
        state: { key: 'orders' },
        subscribe: () => order.push('sub'),
        unsubscribe: () => {},
      },
      () => {},
    )
    await sleep(10)
    order.length = 0

    sockets[0].drop()
    await waitFor(() => order.length >= 2)

    expect(order).toEqual(['auth', 'sub'])

    session.destroy()
  })

  it('a rejected login retires the socket and backs off instead of hot-looping', async () => {
    let attempts = 0
    const { session, sockets, connectAttempts } = makeSession({
      baseBackoffMs: 10,
      authenticate: async () => {
        attempts++
        throw new Error('login failed: bad key')
      },
    })

    session.acquire('orders', candleSpec([], 'orders'), () => {})
    await waitFor(() => attempts >= 2)

    // Retried with backoff, not spun. Each failed login closed its socket, so
    // no half-authenticated connection is left live. Hot-loop guard: a fixed
    // window admits only a few backoff retries; a spin creates hundreds.
    const before = connectAttempts()
    await sleep(60)
    expect(connectAttempts() - before).toBeLessThan(8)
    expect(session.isOpen).toBe(false)
    for (const socket of sockets) expect(socket.closed).toBe(true)

    session.destroy()
  })

  it('surfaces a login failure through onConnectError', async () => {
    const errors: Array<string> = []
    const { session } = makeSession({
      baseBackoffMs: 50,
      authenticate: async () => {
        throw new Error('login timeout')
      },
      onConnectError: (err) => errors.push((err as Error).message),
    })

    session.acquire('orders', candleSpec([], 'orders'), () => {})
    await waitFor(() => errors.length > 0)

    expect(errors[0]).toBe('login timeout')

    session.destroy()
  })

  it('does not subscribe when the socket was retired mid-login', async () => {
    const log: Array<string> = []
    let releaseAuth: (() => void) | null = null
    const { session } = makeSession({
      authenticate: () =>
        new Promise<void>((resolve) => {
          releaseAuth = resolve
        }),
    })

    session.acquire('orders', candleSpec(log, 'orders'), () => {})
    await sleep(10)
    log.length = 0

    // Region change / watchdog fires while the login round-trip is in flight.
    session.restart()
    releaseAuth?.()
    await sleep(5)

    // The retired generation must not resubscribe; the fresh socket's own
    // login drives that instead.
    expect(log).not.toContain('sub:orders')

    session.destroy()
  })

  it('discards a socket whose close fired before connect() resolved', async () => {
    const log: Array<string> = []
    const created: Array<FakeSocket> = []
    let openFirstConnect: (() => void) | null = null

    const { session } = makeSession({
      connect: async (_url, events) => {
        const socket = new FakeSocket(events)
        created.push(socket)
        // Hold the first connect open so the close can land inside it.
        if (created.length === 1) {
          await new Promise<void>((resolve) => {
            openFirstConnect = resolve
          })
        }
        return socket
      },
    })

    session.acquire('orders', candleSpec(log, 'orders'), () => {})
    await waitFor(() => created.length === 1)

    // The transport reports the close before it ever handed the socket back.
    created[0].events.onClose?.(1006, 'dropped')
    openFirstConnect?.()

    // Adopting it would leave `ws` pointing at a dead socket with no further
    // close coming — invisible until the liveness watchdog eventually noticed.
    await waitFor(() => created.length === 2 && session.isOpen)
    expect(created[0].closed).toBe(true)
    expect(session.isOpen).toBe(true)

    session.destroy()
  })

  it('does not resubscribe on a socket that closed mid-login', async () => {
    const log: Array<string> = []
    let releaseAuth: (() => void) | null = null
    const { session, sockets } = makeSession({
      authenticate: () =>
        new Promise<void>((resolve) => {
          releaseAuth = resolve
        }),
    })

    session.acquire('orders', candleSpec(log, 'orders'), () => {})
    await waitFor(() => sockets.length === 1)
    log.length = 0

    // The venue drops the socket while its login is still unanswered, then the
    // login resolves anyway. That generation is dead: its resubscribe would go
    // to a socket nobody is listening to.
    sockets[0].drop()
    releaseAuth?.()
    await sleep(5)

    expect(log).not.toContain('sub:orders')

    session.destroy()
  })

  // A venue settles authenticate() on its own terms — an ack, or a timeout
  // measured in seconds. Waiting for that after the socket is already gone
  // pins `connecting`, and ensureConnected() refuses every reconnect while it
  // is set, so the feed stays dark for the venue's whole auth timeout. The
  // login has to be something the session can walk away from.
  it('reconnects without waiting out a login that never answers', async () => {
    const log: Array<string> = []
    let logins = 0
    const { session, sockets } = makeSession({
      // Models a venue whose login settles only on an ack that is never
      // coming — bitfinex's is a 10s timeout — so the ONLY way this test can
      // pass is by abandoning it rather than outliving it.
      authenticate: () => {
        logins++
        return new Promise<void>(() => {})
      },
    })

    session.acquire('orders', candleSpec(log, 'orders'), () => {})
    await waitFor(() => sockets.length === 1 && logins === 1)

    // The watchdog gives up on the silent socket mid-login.
    session.restart()

    await waitFor(() => sockets.length === 2)
    expect(sockets.length).toBe(2)
    expect(logins).toBe(2)

    session.destroy()
  })

  // (destroy() releases parked logins too, but there is nothing to assert on:
  // after teardown nothing reconnects either way, so a test would pass with or
  // without it. It stays in the code because an unsettleable promise would
  // otherwise pin that connect frame for the life of the process.)

  // The login round-trip is the one window where `connecting` stays true long
  // enough for a close to land inside it. Everything that wants a reconnect
  // there — the drop itself, or a watchdog restart() — is refused by
  // ensureConnected() because an attempt is already in flight, and the
  // reconnect timer has already cleared itself by then. Without a re-arm the
  // session is left with no socket AND no pending retry, which on a private
  // venue means orders and balances silently stop for good.
  it('reconnects after a drop that lands during the login round-trip', async () => {
    const log: Array<string> = []
    let releaseAuth: (() => void) | null = null
    const { session, sockets } = makeSession({
      authenticate: () =>
        new Promise<void>((resolve) => {
          releaseAuth = resolve
        }),
    })

    session.acquire('orders', candleSpec(log, 'orders'), () => {})
    await waitFor(() => sockets.length === 1)

    // The venue drops the socket before it ever answered the login.
    sockets[0].drop()
    // Let the backoff fire while the login is still pending — that attempt is
    // the one that gets swallowed.
    await sleep(30)
    releaseAuth?.()

    await waitFor(() => sockets.length === 2)
    expect(sockets.length).toBe(2)

    session.destroy()
  })

  it('reconnects after a watchdog restart during the login round-trip', async () => {
    const log: Array<string> = []
    let releaseAuth: (() => void) | null = null
    const { session, sockets } = makeSession({
      authenticate: () =>
        new Promise<void>((resolve) => {
          releaseAuth = resolve
        }),
    })

    session.acquire('orders', candleSpec(log, 'orders'), () => {})
    await waitFor(() => sockets.length === 1)

    session.restart()
    await sleep(30)
    releaseAuth?.()

    await waitFor(() => sockets.length === 2)
    expect(sockets.length).toBe(2)

    session.destroy()
  })
})

describe('ReconnectingWsSession — retired sockets', () => {
  it('ignores a late close from a socket that restart() already replaced', async () => {
    const { session, sockets, connectAttempts } = makeSession()

    session.acquire('a', candleSpec([], 'a'), () => {})
    await sleep(5)

    session.restart()
    await waitFor(() => connectAttempts() === 2 && session.isOpen)
    expect(connectAttempts()).toBe(2)
    expect(session.isOpen).toBe(true)

    // The dead socket finally notices it is gone, long after replacement.
    sockets[0].drop()
    await sleep(20)

    // Must not tear down the live socket, and must not queue a third connect.
    expect(connectAttempts()).toBe(2)
    expect(session.isOpen).toBe(true)

    session.destroy()
  })
})

describe('ReconnectingWsSession — backoff policy', () => {
  // These assert the delay the session ASKS for, never the delay the runtime
  // delivers. Timing the gaps with Date.now() measures the event loop instead
  // of the policy: a loaded machine stretches a 10ms timer to 20ms and reorders
  // which of two gaps looks longer, so the old stopwatch versions failed on CI
  // while the arithmetic under test was perfect.
  it('backoff delay grows exponentially and is capped', async () => {
    const delays: Array<number> = []
    const { session } = makeSession({
      failConnects: 6,
      baseBackoffMs: 4,
      maxBackoffMs: 16,
      onReconnectScheduled: (delayMs) => delays.push(delayMs),
    })

    session.acquire('a', candleSpec([], 'a'), () => {})
    await waitFor(() => delays.length >= 4)

    // random() => 1 makes delay === cap: 4, 8, then pinned at maxBackoffMs.
    expect(delays.slice(0, 4)).toEqual([4, 8, 16, 16])

    session.destroy()
  })

  it('resets the backoff counter only after a stable connection', async () => {
    const attempts: Array<number> = []
    const { session, sockets } = makeSession({
      baseBackoffMs: 10,
      stableResetMs: 15,
      onReconnectScheduled: (_delayMs, attempt) => attempts.push(attempt),
    })

    session.acquire('a', candleSpec([], 'a'), () => {})
    await waitFor(() => sockets.length === 1)

    // Unstable drop: this retry is attempt 0, and the counter grows to 1.
    sockets[0].drop()
    await waitFor(() => attempts.length === 1 && session.isOpen)

    // Hold the connection past stableResetMs so the counter is reset...
    await sleep(30)
    expect(session.isOpen).toBe(true)

    // ...and the next drop must therefore ask for attempt 0 again, not 1.
    sockets[1].drop()
    await waitFor(() => attempts.length === 2)
    expect(attempts).toEqual([0, 0])

    session.destroy()
  })
})
