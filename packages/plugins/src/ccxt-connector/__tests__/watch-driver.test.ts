// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Lifecycle suite for the ccxt watch driver.
 *
 * The native connectors get this coverage from `describePrivateWsLifecycle`,
 * which drives a `ReconnectingWsSession` over a fake socket. A ccxt Pro client
 * owns its own socket, so that seam does not exist here — the injectable
 * surface is the exchange itself. Everything below runs against a fake
 * exchange whose `watch*` promises are resolved and rejected by hand, with
 * millisecond-scale backoff knobs so the whole file finishes in well under a
 * second and no real timer policy is being asserted by stopwatch.
 */

import { describe, expect, it } from 'bun:test'
import { sleep, waitFor } from '../../test-utils/async'
import { CcxtStreamHub } from '../watch-driver'
import type { ExchangeHostLike } from '../watch-driver'
import type { CcxtExchangeLike, CcxtOhlcvRow, CcxtVenueConfig } from '../types'
import type {
  WakeListener,
  WakeSource,
} from '@pairlens/market-engine/wake-monitor'

// ── Fakes ────────────────────────────────────────────────────────────────

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

class ClosedByUser extends Error {
  constructor() {
    super('fake closedByUser')
    this.name = 'ExchangeClosedByUser'
  }
}

/** A ccxt exchange whose every watch call parks on a deferred we control. */
class FakeExchange {
  readonly id = 'fake'
  readonly has: Record<string, unknown> = {}
  readonly timeframes: Record<string, string> = {}
  readonly urls: Record<string, unknown> = {}
  readonly options: Record<string, unknown> = {}
  markets: Record<string, unknown> | undefined = { 'BTC/USDT': {} }
  closed = false
  /** Every watch call made on this instance, newest last. */
  readonly calls: Array<string> = []
  private pending: Array<Deferred<unknown>> = []

  private park<T>(label: string): Promise<T> {
    this.calls.push(label)
    const entry = deferred<unknown>()
    this.pending.push(entry)
    return entry.promise as Promise<T>
  }

  watchOHLCV = (symbol: string, timeframe?: string) =>
    this.park<Array<CcxtOhlcvRow>>(`ohlcv:${symbol}:${timeframe ?? ''}`)
  watchTicker = (symbol: string) =>
    this.park<Record<string, unknown>>(`ticker:${symbol}`)
  watchOrderBook = (symbol: string) =>
    this.park<{ bids: Array<Array<number>>; asks: Array<Array<number>> }>(
      `book:${symbol}`,
    )
  watchTrades = (symbol: string) =>
    this.park<Array<Record<string, unknown>>>(`trades:${symbol}`)
  fetchOHLCV = async () => []
  fetchTickers = async () => ({})
  setMarkets = () => this.markets
  loadMarkets = async () => this.markets
  market = () => ({})
  close = async () => {
    this.closed = true
    const parked = this.pending
    this.pending = []
    for (const entry of parked) entry.reject(new ClosedByUser())
  }

  /** Settle the oldest outstanding watch call. */
  settle(value: unknown): boolean {
    const entry = this.pending.shift()
    if (!entry) return false
    entry.resolve(value)
    return true
  }

  fail(error: unknown): boolean {
    const entry = this.pending.shift()
    if (!entry) return false
    entry.reject(error)
    return true
  }

  get parked(): number {
    return this.pending.length
  }
}

/** Host stub: hands out fake exchanges and counts how many were built. */
class FakeHost implements ExchangeHostLike {
  generation = 0
  built: Array<FakeExchange> = []
  destroyed = false
  private instance: FakeExchange | null = null
  /** Set to make `acquire()` reject, exercising the acquire-failure path. */
  failAcquire = false

  peek(): CcxtExchangeLike | null {
    return this.instance as unknown as CcxtExchangeLike | null
  }

  setCountry(): boolean {
    return false
  }

  async acquire(): Promise<{
    exchange: CcxtExchangeLike
    generation: number
  }> {
    if (this.failAcquire) throw new Error('acquire failed')
    if (!this.instance) {
      this.instance = new FakeExchange()
      this.built.push(this.instance)
    }
    return {
      exchange: this.instance as unknown as CcxtExchangeLike,
      generation: this.generation,
    }
  }

  async close(): Promise<void> {
    const instance = this.instance
    this.instance = null
    this.generation++
    await instance?.close()
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    await this.close()
  }

  /** The exchange currently handed out, waiting until one exists. */
  async current(): Promise<FakeExchange> {
    await waitFor(() => this.instance !== null)
    if (!this.instance) throw new Error('no exchange built')
    return this.instance
  }
}

class FakeWakeSource implements WakeSource {
  private listeners = new Set<WakeListener>()
  subscribe(listener: WakeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  fire(): void {
    for (const listener of [...this.listeners]) {
      listener({ reason: 'resume', gapMs: 30_000 })
    }
  }
}

const VENUE: CcxtVenueConfig = {
  exchangeId: 'fake',
  marketId: 'fake',
  displayName: 'Fake',
  credentialKeys: [],
  defaultMode: 'paper',
  loadExchangeClass: async () => {
    throw new Error('not used')
  },
  maxHistoryLimit: 100,
}

type HubHarness = {
  hub: CcxtStreamHub
  host: FakeHost
  wake: FakeWakeSource
  scheduled: Array<{ delayMs: number; attempt: number }>
}

function makeHub(overrides: Record<string, unknown> = {}): HubHarness {
  const host = new FakeHost()
  const wake = new FakeWakeSource()
  const scheduled: Array<{ delayMs: number; attempt: number }> = []
  const hub = new CcxtStreamHub({
    venue: VENUE,
    host,
    wakeSource: wake,
    // Tiny but non-zero, and `random: () => 1` pins equal jitter to its
    // maximum so the reported delay is exactly the cap.
    baseBackoffMs: 2,
    maxBackoffMs: 20,
    stableResetMs: 20,
    gracePeriodMs: 20,
    livenessTimeoutMs: 0,
    random: () => 1,
    onReconnectScheduled: (delayMs, attempt) =>
      scheduled.push({ delayMs, attempt }),
    ...overrides,
  })
  return { hub, host, wake, scheduled }
}

const OHLCV_ROW: CcxtOhlcvRow = [1_700_000_000_000, 100, 110, 95, 105, 12]

// ── Tests ────────────────────────────────────────────────────────────────

describe('CcxtStreamHub — subscription lifecycle', () => {
  it('starts one watch loop per key and delivers parsed candles', async () => {
    const { hub, host } = makeHub()
    const seen: Array<unknown> = []
    hub.acquire(
      { channel: 'candles', pair: 'BTC-USDT', timeframe: '1h' },
      '',
      (d) => seen.push(d),
    )

    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    expect(exchange.calls[0]).toBe('ohlcv:BTC/USDT:1h')

    exchange.settle([OHLCV_ROW])
    await waitFor(() => seen.length > 0)
    expect(seen[0]).toEqual({
      type: 'update',
      candles: [
        {
          ts: 1_700_000_000_000,
          open: 100,
          high: 110,
          low: 95,
          close: 105,
          volume: 12,
        },
      ],
    })
    await hub.destroy()
  })

  it('refcounts a key: one loop, and release only stops it on the last callback', async () => {
    const { hub, host } = makeHub()
    const a: Array<unknown> = []
    const b: Array<unknown> = []
    const releaseA = hub.acquire(
      { channel: 'ticker', pair: 'BTC-USDT' },
      '',
      (d) => a.push(d),
    )
    const releaseB = hub.acquire(
      { channel: 'ticker', pair: 'BTC-USDT' },
      '',
      (d) => b.push(d),
    )

    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    expect(exchange.calls.length).toBe(1)

    exchange.settle({ last: 105, percentage: 5, timestamp: 1_700_000_000_000 })
    await waitFor(() => a.length > 0 && b.length > 0)

    releaseA()
    await waitFor(() => exchange.parked > 0)
    exchange.settle({ last: 106, percentage: 5, timestamp: 1_700_000_000_001 })
    await waitFor(() => b.length > 1)
    expect(a.length).toBe(1)
    expect(b.length).toBe(2)

    // Releasing twice is a no-op — a double teardown must not tear down a
    // subscription some other consumer re-acquired under the same key.
    releaseB()
    releaseB()
    await hub.destroy()
  })

  it('replays the buffered candles to a late joiner as a snapshot', async () => {
    const { hub, host } = makeHub()
    hub.acquire(
      { channel: 'candles', pair: 'BTC-USDT', timeframe: '1h' },
      '',
      () => {},
    )
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    exchange.settle([OHLCV_ROW])
    await sleep(5)

    const late: Array<unknown> = []
    hub.acquire(
      { channel: 'candles', pair: 'BTC-USDT', timeframe: '1h' },
      '',
      (d) => late.push(d),
    )
    // Synchronous replay — the pane must not stare at an empty chart until the
    // next frame arrives.
    expect(late).toEqual([
      {
        type: 'snapshot',
        candles: [
          {
            ts: 1_700_000_000_000,
            open: 100,
            high: 110,
            low: 95,
            close: 105,
            volume: 12,
          },
        ],
      },
    ])
    await hub.destroy()
  })

  it('drops a watch that resolves after its subscription was released', async () => {
    const { hub, host } = makeHub()
    const seen: Array<unknown> = []
    const release = hub.acquire(
      { channel: 'ticker', pair: 'BTC-USDT' },
      '',
      (d) => seen.push(d),
    )
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)

    release()
    exchange.settle({ last: 105, percentage: 5 })
    await sleep(20)
    expect(seen.length).toBe(0)
    await hub.destroy()
  })
})

describe('CcxtStreamHub — reconnect policy', () => {
  it('backs off with equal jitter instead of hot-looping on repeated failure', async () => {
    const { hub, host, scheduled } = makeHub()
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    const exchange = await host.current()

    // Fail every watch as soon as it parks, for a fixed window.
    const deadline = Date.now() + 60
    while (Date.now() < deadline) {
      exchange.fail(new Error('boom'))
      await sleep(1)
    }

    // Without pacing this loop would re-enter as fast as the event loop
    // allows — hundreds of attempts in 60ms against a venue that is down.
    expect(scheduled.length).toBeGreaterThan(0)
    expect(scheduled.length).toBeLessThan(20)

    // base 2ms, cap min(2·2^attempt, 20), equal jitter with random()===1
    // collapses `cap/2 + rand·cap/2` onto `cap`.
    expect(scheduled[0]).toEqual({ delayMs: 2, attempt: 0 })
    if (scheduled[1]) expect(scheduled[1]).toEqual({ delayMs: 4, attempt: 1 })
    if (scheduled[2]) expect(scheduled[2]).toEqual({ delayMs: 8, attempt: 2 })
    const capped = scheduled.filter((s) => s.attempt >= 4)
    for (const entry of capped) expect(entry.delayMs).toBeLessThanOrEqual(20)
    await hub.destroy()
  })

  it('backs off when the exchange itself cannot be built', async () => {
    const { hub, host, scheduled } = makeHub()
    host.failAcquire = true
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})

    await waitFor(() => scheduled.length >= 2)
    expect(scheduled[0]?.attempt).toBe(0)
    expect(scheduled.length).toBeLessThan(60)
    await hub.destroy()
  })

  it('re-enters immediately after a close we asked for, with no backoff', async () => {
    const { hub, host, scheduled } = makeHub()
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    const first = await host.current()
    await waitFor(() => first.calls.length > 0)

    await host.close()
    // A new exchange, a new watch, and nothing was scheduled: an intentional
    // restart is the mechanism working, not a fault to pace.
    await waitFor(() => host.built.length === 2)
    const second = host.built[1]
    expect(second).toBeDefined()
    await waitFor(() => (second?.calls.length ?? 0) > 0)
    expect(scheduled.length).toBe(0)
    await hub.destroy()
  })

  it('a wake event resets the attempt counter and forces a reconnect', async () => {
    const { hub, host, wake, scheduled } = makeHub()
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)

    // Climb the backoff ladder first so the reset is observable.
    for (let i = 0; i < 3; i++) {
      exchange.fail(new Error('boom'))
      await sleep(6)
    }
    const beforeWake = scheduled.length
    expect(beforeWake).toBeGreaterThanOrEqual(2)

    wake.fire()
    await waitFor(() => host.built.length >= 2)
    expect(exchange.closed).toBe(true)

    // The next failure after the wake starts from attempt 0 again — the
    // backoff we were sitting in was measured against a clock that stopped.
    const reconnected = await host.current()
    await waitFor(() => reconnected.calls.length > 0)
    reconnected.fail(new Error('boom'))
    await waitFor(() => scheduled.length > beforeWake)
    expect(scheduled[scheduled.length - 1]?.attempt).toBe(0)
    await hub.destroy()
  })

  it('the silence watchdog closes the exchange so the loops re-enter', async () => {
    const { hub, host } = makeHub({ livenessTimeoutMs: 10 })
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    const first = await host.current()
    await waitFor(() => first.calls.length > 0)

    // Nothing is ever delivered — ccxt cannot tell us the socket is dead in a
    // browser, so the only thing that recovers this is our own watchdog.
    await waitFor(() => host.built.length >= 2, 4000)
    expect(first.closed).toBe(true)
    await hub.destroy()
  })

  it('does not restart a socket that is still delivering', async () => {
    const { hub, host } = makeHub({ livenessTimeoutMs: 60 })
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    const exchange = await host.current()

    const deadline = Date.now() + 200
    while (Date.now() < deadline) {
      if (exchange.parked > 0) exchange.settle({ last: 105, percentage: 1 })
      await sleep(10)
    }
    expect(host.built.length).toBe(1)
    await hub.destroy()
  })
})

describe('CcxtStreamHub — teardown', () => {
  it('closes the exchange after the grace period once the last key is released', async () => {
    const { hub, host } = makeHub()
    const release = hub.acquire(
      { channel: 'ticker', pair: 'BTC-USDT' },
      '',
      () => {},
    )
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)

    release()
    // Warm for the grace window: a venue flip releases every key and a short
    // grace would force a full handshake on the way back.
    expect(exchange.closed).toBe(false)
    await waitFor(() => exchange.closed, 500)
    expect(exchange.closed).toBe(true)
    await hub.destroy()
  })

  it('keeps the exchange warm when a key is re-acquired inside the grace window', async () => {
    const { hub, host } = makeHub({ gracePeriodMs: 80 })
    const release = hub.acquire(
      { channel: 'ticker', pair: 'BTC-USDT' },
      '',
      () => {},
    )
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    release()
    await sleep(10)
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    await sleep(120)
    expect(exchange.closed).toBe(false)
    expect(host.built.length).toBe(1)
    await hub.destroy()
  })

  it('destroy closes the exchange and stops every loop', async () => {
    const { hub, host, scheduled } = makeHub()
    hub.acquire(
      { channel: 'candles', pair: 'BTC-USDT', timeframe: '1h' },
      '',
      () => {},
    )
    hub.acquire({ channel: 'trades', pair: 'BTC-USDT' }, '', () => {})
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length >= 2)

    await hub.destroy()
    expect(host.destroyed).toBe(true)
    expect(exchange.closed).toBe(true)

    const after = host.built.length
    const scheduledAfter = scheduled.length
    await sleep(40)
    // No resurrection: the rejections destroy() caused must not be read as
    // "reconnect me".
    expect(host.built.length).toBe(after)
    expect(scheduled.length).toBe(scheduledAfter)
  })

  it('does not reconnect when torn down mid-backoff', async () => {
    const { hub, host } = makeHub({ baseBackoffMs: 60, maxBackoffMs: 60 })
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    exchange.fail(new Error('boom'))
    await sleep(5)

    await hub.destroy()
    const built = host.built.length
    await sleep(120)
    expect(host.built.length).toBe(built)
  })
})
