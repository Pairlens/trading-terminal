// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Lifecycle suite for the ccxt watch driver.
 *
 * The deleted native connectors got this coverage from a shared harness that
 * drove a `ReconnectingWsSession` over a fake socket. A ccxt Pro client
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
  // Every symbol the suite subscribes must resolve here — the ticker fan
  // (correctly) excludes symbols absent from the market table.
  markets: Record<string, unknown> | undefined = {
    'BTC/USDT': {},
    'ETH/USDT': {},
    'SOL/USDT': {},
    'LIVE/USDT': {},
    ...Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`P${i}/USDT`, {}]),
    ),
  }
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
  watchTickers?: (
    symbols?: Array<string>,
  ) => Promise<Record<string, Record<string, unknown>>> = (symbols) =>
    this.park<Record<string, Record<string, unknown>>>(
      `tickers:${(symbols ?? []).join(',')}`,
    )
  /** ccxt's per-symbol ticker cache, swept by the fan after any resolution. */
  tickers?: Record<string, Record<string, unknown>>
  /** Every retired set handed to `unWatchTickers`, joined, newest last. */
  readonly unWatched: Array<string> = []
  unWatchTickers = async (symbols?: Array<string>) => {
    this.unWatched.push((symbols ?? []).join(','))
  }
  watchOrderBook = (symbol: string) =>
    this.park<{ bids: Array<Array<number>>; asks: Array<Array<number>> }>(
      `book:${symbol}`,
    )
  watchTrades = (symbol: string) =>
    this.park<Array<Record<string, unknown>>>(`trades:${symbol}`)
  fetchOHLCV = async () => []
  /** What REST `fetchTickers` answers — the fan's first-paint seed source. */
  restTickers: Record<string, Record<string, unknown>> = {}
  fetchTickers = async () => this.restTickers
  /** What REST `fetchOrderBook` answers — the book's first-paint seed. */
  restBook: {
    bids: Array<Array<number>>
    asks: Array<Array<number>>
    timestamp?: number
  } | null = null
  /** Deferred gate: when set, `fetchOrderBook` waits on it before answering. */
  restBookGate: Promise<void> | null = null
  fetchOrderBook = async (symbol: string, limit?: number) => {
    this.calls.push(`restbook:${symbol}:${limit ?? ''}`)
    if (this.restBookGate) await this.restBookGate
    if (!this.restBook) throw new Error('no rest book')
    return this.restBook
  }
  /** What REST `fetchTrades` answers — the tape's first-paint seed. */
  restTrades: Array<Record<string, unknown>> = []
  fetchTrades = async (symbol: string, _since?: number, limit?: number) => {
    this.calls.push(`resttrades:${symbol}:${limit ?? ''}`)
    return this.restTrades
  }
  /** What REST `fetchTicker` answers — the per-symbol ticker seed. */
  restTicker: Record<string, unknown> | null = null
  fetchTicker = async (symbol: string) => {
    this.calls.push(`resttick:${symbol}`)
    if (!this.restTicker) throw new Error('no rest ticker')
    return this.restTicker
  }
  /** Singular unwatch calls, for the suppression suite. */
  readonly unWatchedTickers: Array<string> = []
  unWatchTicker = async (symbol: string) => {
    this.unWatchedTickers.push(symbol)
  }
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
  /** Built exchanges get no `watchTickers`, exercising the fan fallback. */
  stripBatch = false
  /** Copied onto every built exchange's `restTickers` (the seed source). */
  seedTickers: Record<string, Record<string, unknown>> = {}
  /** Copied onto every built exchange's `restBook`. */
  seedBook: FakeExchange['restBook'] = null
  /** Copied onto every built exchange's `restBookGate`. */
  seedBookGate: Promise<void> | null = null
  /** Copied onto every built exchange's `restTrades`. */
  seedTrades: Array<Record<string, unknown>> = []
  /** Copied onto every built exchange's `restTicker`. */
  seedTicker: Record<string, unknown> | null = null

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
      if (this.stripBatch) this.instance.watchTickers = undefined
      this.instance.restTickers = this.seedTickers
      this.instance.restBook = this.seedBook
      this.instance.restBookGate = this.seedBookGate
      this.instance.restTrades = this.seedTrades
      this.instance.restTicker = this.seedTicker
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
    orphanRebuildSettleMs: 5,
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

describe('CcxtStreamHub — trades dedup', () => {
  const rawTrade = (id: string) => ({
    id,
    price: 100,
    amount: 1,
    side: 'buy',
    timestamp: 1_700_000_000_000,
  })

  it('drops already-delivered prints, so a reconnect snapshot cannot replay the tape', async () => {
    const { hub, host } = makeHub()
    const seen: Array<{ trades: Array<{ id: string }> }> = []
    hub.acquire({ channel: 'trades', pair: 'BTC-USDT' }, '', (d) =>
      seen.push(d as { trades: Array<{ id: string }> }),
    )
    const exchange = await host.current()
    await waitFor(() => exchange.parked > 0)
    exchange.settle([rawTrade('t1'), rawTrade('t2')])
    await waitFor(() => seen.length === 1)
    expect(seen[0]?.trades.map((t) => t.id)).toEqual(['t1', 't2'])

    // The venue replays t2 in its next frame (a snapshot after a reconnect
    // does exactly this) alongside a genuinely new print.
    await waitFor(() => exchange.parked > 0)
    exchange.settle([rawTrade('t2'), rawTrade('t3')])
    await waitFor(() => seen.length === 2)
    expect(seen[1]?.trades.map((t) => t.id)).toEqual(['t3'])
    await hub.destroy()
  })
})

describe('CcxtStreamHub — orphaned channels', () => {
  it('rebuilds the exchange after enough releases with no wire unsubscribe', async () => {
    const { hub, host } = makeHub()
    // A key that stays live for the whole test — the rebuild only pays off
    // while someone is still listening.
    hub.acquire({ channel: 'ticker', pair: 'LIVE-USDT' }, '', () => {})
    const first = await host.current()
    expect(first.has['unWatchTicker']).toBeUndefined()

    // Visit and leave pairs on a venue with no unWatch* — every release
    // orphans its channel on the socket.
    for (let i = 0; i < 12; i++) {
      const release = hub.acquire(
        { channel: 'ticker', pair: `P${i}-USDT` },
        '',
        () => {},
      )
      release()
    }

    // The twelfth orphan crosses the threshold: the instance is discarded and
    // the surviving key re-enters against a fresh one.
    await waitFor(() => host.built.length === 2)
    expect(host.generation).toBe(1)
    await hub.destroy()
  })

  it('does not rebuild when the venue can unsubscribe on the wire', async () => {
    const { hub, host } = makeHub()
    hub.acquire({ channel: 'ticker', pair: 'LIVE-USDT' }, '', () => {})
    const exchange = await host.current()
    exchange.has['unWatchTicker'] = true

    for (let i = 0; i < 20; i++) {
      const release = hub.acquire(
        { channel: 'ticker', pair: `P${i}-USDT` },
        '',
        () => {},
      )
      release()
    }

    await sleep(10)
    expect(host.built.length).toBe(1)
    expect(host.generation).toBe(0)
    await hub.destroy()
  })

  it('defers the threshold rebuild off the switch path', async () => {
    const { hub, host } = makeHub({ orphanRebuildSettleMs: 40 })
    hub.acquire({ channel: 'ticker', pair: 'LIVE-USDT' }, '', () => {})
    await host.current()

    for (let i = 0; i < 12; i++) {
      const release = hub.acquire(
        { channel: 'ticker', pair: `P${i}-USDT` },
        '',
        () => {},
      )
      release()
    }

    // Threshold crossed mid-switch — the new pair's streams must not be torn
    // down while they are still handshaking.
    await sleep(15)
    expect(host.built.length).toBe(1)
    // Once the switch settles, the rebuild sheds the channels.
    await waitFor(() => host.built.length === 2)
    expect(host.generation).toBe(1)
    await hub.destroy()
  })

  it('skips the deferred rebuild when another rebuild already shed the channels', async () => {
    const { hub, host } = makeHub({ orphanRebuildSettleMs: 30 })
    hub.acquire({ channel: 'ticker', pair: 'LIVE-USDT' }, '', () => {})
    await host.current()
    for (let i = 0; i < 12; i++) {
      const release = hub.acquire(
        { channel: 'ticker', pair: `P${i}-USDT` },
        '',
        () => {},
      )
      release()
    }
    // A wake/region rebuild lands inside the settle window: the channels are
    // already gone with the old instance.
    await host.close()
    await waitFor(() => host.built.length === 2)
    await sleep(50)
    // The deferred rebuild saw the generation move and stood down.
    expect(host.built.length).toBe(2)
    expect(host.generation).toBe(1)
    await hub.destroy()
  })

  it('leaves an all-released hub to the grace close, not a rebuild', async () => {
    const { hub, host } = makeHub({ gracePeriodMs: 15 })
    for (let i = 0; i < 15; i++) {
      const release = hub.acquire(
        { channel: 'ticker', pair: `P${i}-USDT` },
        '',
        () => {},
      )
      release()
    }
    // Nothing is listening: the threshold path must not fire a rebuild —
    // the grace timer closes the host on its own.
    expect(host.built.length).toBe(1)
    await waitFor(() => host.generation === 1)
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

// ── Ticker fan (batchTickers venues) ─────────────────────────────────────

const BATCH_VENUE: CcxtVenueConfig = { ...VENUE, batchTickers: true }

/** Fan harness: batched venue, near-instant retire delay. */
function makeFanHub(overrides: Record<string, unknown> = {}): HubHarness {
  return makeHub({ venue: BATCH_VENUE, fanRetireDelayMs: 5, ...overrides })
}

const TICKER_FRAME = (last: number) => ({
  last,
  timestamp: 1_700_000_000_000,
})

describe('CcxtStreamHub — ticker fan', () => {
  it('multiplexes every ticker through one watchTickers call and routes by symbol', async () => {
    const { hub, host } = makeFanHub()
    const btc: Array<unknown> = []
    const eth: Array<unknown> = []
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', (d) => btc.push(d))
    hub.acquire({ channel: 'ticker', pair: 'ETH-USDT' }, '', (d) => eth.push(d))
    hub.acquire({ channel: 'ticker', pair: 'SOL-USDT' }, '', () => {})

    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    // One batched call for the whole synchronous flush — not one per pair,
    // and no singular watchTicker calls at all.
    expect(exchange.calls).toEqual(['tickers:BTC/USDT,ETH/USDT,SOL/USDT'])

    exchange.settle({ 'ETH/USDT': TICKER_FRAME(2_000) })
    await waitFor(() => eth.length > 0)
    expect(btc.length).toBe(0)
    const update = eth[0] as { type: string; ticker: { last: number } }
    expect(update.type).toBe('ticker')
    expect(update.ticker.last).toBe(2_000)

    // The loop re-enters with the same set: same batched call again.
    await waitFor(() => exchange.calls.length >= 2)
    expect(exchange.calls[1]).toBe('tickers:BTC/USDT,ETH/USDT,SOL/USDT')
    await hub.destroy()
  })

  it('seeds first paint over REST — a chip never waits on a quiet stream', async () => {
    const { hub, host } = makeFanHub()
    host.seedTickers = { 'BTC/USDT': TICKER_FRAME(60_000) }
    const btc: Array<unknown> = []
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', (d) => btc.push(d))

    // No watch frame is ever settled — the REST seed alone paints the chip.
    await waitFor(() => btc.length > 0)
    expect((btc[0] as { ticker: { last: number } }).ticker.last).toBe(60_000)

    // A late joiner on the seeded key replays the seeded frame.
    const replayed: Array<unknown> = []
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', (d) =>
      replayed.push(d),
    )
    expect(replayed.length).toBe(1)
    await hub.destroy()
  })

  it('sweeps the ticker cache on each resolution, so a batched burst starves nobody', async () => {
    const { hub, host } = makeFanHub()
    const btc: Array<unknown> = []
    const eth: Array<unknown> = []
    const sol: Array<unknown> = []
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', (d) => btc.push(d))
    hub.acquire({ channel: 'ticker', pair: 'ETH-USDT' }, '', (d) => eth.push(d))
    hub.acquire({ channel: 'ticker', pair: 'SOL-USDT' }, '', (d) => sol.push(d))
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)

    // A burst arrived on the socket: only SOL's frame resolved the parked
    // future; BTC and ETH landed in the cache alone.
    exchange.tickers = {
      'BTC/USDT': TICKER_FRAME(60_000),
      'ETH/USDT': TICKER_FRAME(2_000),
    }
    exchange.settle({ 'SOL/USDT': TICKER_FRAME(150) })
    await waitFor(() => sol.length > 0)
    await waitFor(() => btc.length > 0 && eth.length > 0)
    expect((btc[0] as { ticker: { last: number } }).ticker.last).toBe(60_000)

    // Unchanged cache entries (same object identity) are not re-delivered on
    // the next resolution; a REPLACED entry is.
    exchange.tickers['ETH/USDT'] = TICKER_FRAME(2_001)
    exchange.settle({ 'SOL/USDT': TICKER_FRAME(151) })
    await waitFor(() => sol.length >= 2 && eth.length >= 2)
    expect(btc.length).toBe(1)
    expect((eth[1] as { ticker: { last: number } }).ticker.last).toBe(2_001)
    await hub.destroy()
  })

  it('a late joiner resubscribes the widened set and retires the old one', async () => {
    const { hub, host } = makeFanHub()
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    expect(exchange.calls[0]).toBe('tickers:BTC/USDT')

    hub.acquire({ channel: 'ticker', pair: 'ETH-USDT' }, '', () => {})
    await waitFor(() => exchange.calls.includes('tickers:BTC/USDT,ETH/USDT'))
    // New SUBSCRIBE first, then the superseded set is unsubscribed.
    await waitFor(() => exchange.unWatched.length > 0)
    expect(exchange.unWatched).toEqual(['BTC/USDT'])
    await hub.destroy()
  })

  it('a release shrinks the set and retires the superseded subscription', async () => {
    const { hub, host } = makeFanHub()
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    const releaseEth = hub.acquire(
      { channel: 'ticker', pair: 'ETH-USDT' },
      '',
      () => {},
    )
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    expect(exchange.calls[0]).toBe('tickers:BTC/USDT,ETH/USDT')

    releaseEth()
    await waitFor(() => exchange.calls.includes('tickers:BTC/USDT'))
    await waitFor(() => exchange.unWatched.length > 0)
    expect(exchange.unWatched).toEqual(['BTC/USDT,ETH/USDT'])
    await hub.destroy()
  })

  it('survives a forced reconnect: the fresh instance gets the full set again', async () => {
    const { hub, host, wake } = makeFanHub()
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    hub.acquire({ channel: 'ticker', pair: 'ETH-USDT' }, '', () => {})
    const first = await host.current()
    await waitFor(() => first.calls.length > 0)

    wake.fire()
    await waitFor(() => host.built.length === 2)
    const second = host.built[1]
    await waitFor(() => second.calls.length > 0)
    expect(second.calls[0]).toBe('tickers:BTC/USDT,ETH/USDT')
    await hub.destroy()
  })

  it('excludes a pair the venue does not list, instead of poisoning the batch', async () => {
    const { hub, host } = makeFanHub()
    const btc: Array<unknown> = []
    const alien: Array<unknown> = []
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', (d) => btc.push(d))
    // Not in the fake's market table — `watchTickers` would throw on it and
    // take every other chip down with it.
    hub.acquire({ channel: 'ticker', pair: 'ALIEN-XXX' }, '', (d) =>
      alien.push(d),
    )

    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    expect(exchange.calls[0]).toBe('tickers:BTC/USDT')

    exchange.settle({ 'BTC/USDT': TICKER_FRAME(60_000) })
    await waitFor(() => btc.length > 0)
    expect(alien.length).toBe(0)
    await hub.destroy()
  })

  it('an unresolvable joiner does not retire the live subscription', async () => {
    const { hub, host } = makeFanHub()
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)

    // The epoch bumps, but the RESOLVABLE set is unchanged — unsubscribing
    // the "retired" set would tear down the live streams.
    hub.acquire({ channel: 'ticker', pair: 'ALIEN-XXX' }, '', () => {})
    await sleep(60)
    expect(exchange.unWatched).toEqual([])
    await hub.destroy()
  })

  it('falls back to per-symbol loops when the class lacks watchTickers', async () => {
    const { hub, host } = makeFanHub()
    host.stripBatch = true
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    hub.acquire({ channel: 'ticker', pair: 'ETH-USDT' }, '', () => {})

    const exchange = await host.current()
    await waitFor(() => exchange.calls.length >= 2)
    expect([...exchange.calls].sort()).toEqual([
      'ticker:BTC/USDT',
      'ticker:ETH/USDT',
    ])
    // Later tickers go straight down the per-symbol path too.
    hub.acquire({ channel: 'ticker', pair: 'SOL-USDT' }, '', () => {})
    await waitFor(() => exchange.calls.includes('ticker:SOL/USDT'))
    await hub.destroy()
  })
})

// ── Order-book first-paint seed (seedOrderBook venues) ───────────────────

const SEED_BOOK_VENUE: CcxtVenueConfig = {
  ...VENUE,
  seedOrderBook: true,
  orderbookDepth: 500,
}

describe('CcxtStreamHub — order-book seed', () => {
  it('paints the book from REST before the stream has delivered anything', async () => {
    const { hub, host } = makeHub({ venue: SEED_BOOK_VENUE })
    host.seedBook = {
      bids: [[100, 1]],
      asks: [[101, 2]],
      timestamp: 1_700_000_000_000,
    }
    const frames: Array<unknown> = []
    hub.acquire({ channel: 'orderbook', pair: 'BTC-USDT' }, '', (d) =>
      frames.push(d),
    )

    // The watch call is parked and never settled — REST alone paints.
    await waitFor(() => frames.length > 0)
    expect(frames[0]).toEqual({
      type: 'snapshot',
      bids: [[100, 1]],
      asks: [[101, 2]],
      ts: 1_700_000_000_000,
    })
    const exchange = await host.current()
    // The seed asked for the venue's configured depth.
    expect(exchange.calls).toContain('restbook:BTC/USDT:500')
    await hub.destroy()
  })

  it('a live frame that wins the race is never overwritten by the stale seed', async () => {
    const { hub, host } = makeHub({ venue: SEED_BOOK_VENUE })
    let releaseGate = () => {}
    host.seedBookGate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    host.seedBook = { bids: [[1, 1]], asks: [[2, 2]] }
    const frames: Array<unknown> = []
    hub.acquire({ channel: 'orderbook', pair: 'BTC-USDT' }, '', (d) =>
      frames.push(d),
    )
    const exchange = await host.current()
    await waitFor(() => exchange.parked > 0)

    // The stream's synced snapshot lands while the REST seed is in flight.
    exchange.settle({
      bids: [[100, 5]],
      asks: [[101, 6]],
      timestamp: 1_700_000_000_500,
    })
    await waitFor(() => frames.length > 0)
    releaseGate()
    await sleep(10)
    // Only the live frames — the seed saw `cached` set and stood down.
    expect(frames.length).toBeGreaterThan(0)
    for (const frame of frames) {
      expect((frame as { bids: Array<Array<number>> }).bids[0]).toEqual([
        100, 5,
      ])
    }
    await hub.destroy()
  })

  it('a venue without the flag never fetches a REST book', async () => {
    const { hub, host } = makeHub()
    host.seedBook = { bids: [[1, 1]], asks: [[2, 2]] }
    hub.acquire({ channel: 'orderbook', pair: 'BTC-USDT' }, '', () => {})
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    await sleep(10)
    expect(exchange.calls.some((c) => c.startsWith('restbook:'))).toBe(false)
    await hub.destroy()
  })
})

// ── Trades first-paint seed (seedTrades venues) ──────────────────────────

const SEED_TRADES_VENUE: CcxtVenueConfig = { ...VENUE, seedTrades: true }

describe('CcxtStreamHub — trades seed', () => {
  const rawTrade = (id: string) => ({
    id,
    price: 100,
    amount: 1,
    side: 'buy',
    timestamp: 1_700_000_000_000,
  })

  it('fills the tape from REST and the stream overlap dedupes to nothing', async () => {
    const { hub, host } = makeHub({ venue: SEED_TRADES_VENUE })
    host.seedTrades = [rawTrade('t1'), rawTrade('t2')]
    const seen: Array<{ trades: Array<{ id: string }> }> = []
    hub.acquire({ channel: 'trades', pair: 'BTC-USDT' }, '', (d) =>
      seen.push(d as { trades: Array<{ id: string }> }),
    )

    // The parked watch is never settled — REST alone fills the tape.
    await waitFor(() => seen.length === 1)
    expect(seen[0]?.trades.map((t) => t.id)).toEqual(['t1', 't2'])
    const exchange = await host.current()
    expect(exchange.calls).toContain('resttrades:BTC/USDT:100')

    // The stream's first frame replays a seeded print next to a new one:
    // only the new one comes through.
    await waitFor(() => exchange.parked > 0)
    exchange.settle([rawTrade('t2'), rawTrade('t3')])
    await waitFor(() => seen.length === 2)
    expect(seen[1]?.trades.map((t) => t.id)).toEqual(['t3'])
    await hub.destroy()
  })

  it('a venue without the flag never fetches REST trades', async () => {
    const { hub, host } = makeHub()
    host.seedTrades = [rawTrade('t1')]
    hub.acquire({ channel: 'trades', pair: 'BTC-USDT' }, '', () => {})
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    await sleep(10)
    expect(exchange.calls.some((c) => c.startsWith('resttrades:'))).toBe(false)
    await hub.destroy()
  })

  it('a delayed seed waits, then fills — the serial-throttler venue shape', async () => {
    const { hub, host } = makeHub({
      venue: { ...VENUE, seedTrades: true, seedTradesDelayMs: 30 },
    })
    host.seedTrades = [rawTrade('t1')]
    const seen: Array<unknown> = []
    hub.acquire({ channel: 'trades', pair: 'BTC-USDT' }, '', (d) =>
      seen.push(d),
    )
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    // Inside the hold-back window nothing has hit REST — the chart backfill
    // owns the queue's first slot on the real venue.
    await sleep(10)
    expect(exchange.calls.some((c) => c.startsWith('resttrades:'))).toBe(false)
    await waitFor(() => seen.length === 1)
    expect(exchange.calls).toContain('resttrades:BTC/USDT:100')
    await hub.destroy()
  })

  it('a delayed seed stands down when live prints beat the delay', async () => {
    const { hub, host } = makeHub({
      venue: { ...VENUE, seedTrades: true, seedTradesDelayMs: 20 },
    })
    host.seedTrades = [rawTrade('t1')]
    const seen: Array<{ trades: Array<{ id: string }> }> = []
    hub.acquire({ channel: 'trades', pair: 'BTC-USDT' }, '', (d) =>
      seen.push(d as { trades: Array<{ id: string }> }),
    )
    const exchange = await host.current()
    await waitFor(() => exchange.parked > 0)
    exchange.settle([rawTrade('live1')])
    await waitFor(() => seen.length === 1)
    await sleep(40)
    // The tape was already flowing when the delay elapsed — no REST call.
    expect(exchange.calls.some((c) => c.startsWith('resttrades:'))).toBe(false)
    expect(seen.map((s) => s.trades.map((t) => t.id))).toEqual([['live1']])
    await hub.destroy()
  })
})

// ── Ticker first-paint seed (seedTicker venues) ──────────────────────────

const SEED_TICKER_VENUE: CcxtVenueConfig = { ...VENUE, seedTicker: true }

describe('CcxtStreamHub — ticker seed', () => {
  it('paints the first frame from REST and the stream supersedes it', async () => {
    const { hub, host } = makeHub({ venue: SEED_TICKER_VENUE })
    host.seedTicker = { last: 101, timestamp: 1_700_000_000_000 }
    const frames: Array<{ ticker: { last: number } }> = []
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', (d) =>
      frames.push(d as { ticker: { last: number } }),
    )

    // The parked watch is never settled yet — REST alone paints the header.
    await waitFor(() => frames.length === 1)
    expect(frames[0]?.ticker.last).toBe(101)
    const exchange = await host.current()
    expect(exchange.calls).toContain('resttick:BTC/USDT')

    await waitFor(() => exchange.parked > 0)
    exchange.settle({ last: 102, timestamp: 1_700_000_000_500 })
    await waitFor(() => frames.length === 2)
    expect(frames[1]?.ticker.last).toBe(102)
    await hub.destroy()
  })

  it('a stream frame that wins the race stands the seed down', async () => {
    const { hub, host } = makeHub({ venue: SEED_TICKER_VENUE })
    // No REST answer prepared: a fetch would throw, but the point is the
    // guard — once `cached` is set the seed must deliver nothing.
    const frames: Array<{ ticker: { last: number } }> = []
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', (d) =>
      frames.push(d as { ticker: { last: number } }),
    )
    const exchange = await host.current()
    await waitFor(() => exchange.parked > 0)
    exchange.settle({ last: 200, timestamp: 1_700_000_000_000 })
    await waitFor(() => frames.length === 1)
    await sleep(10)
    expect(frames.map((f) => f.ticker.last)).toEqual([200])
    await hub.destroy()
  })

  it('a venue seed hook replaces the unified fetchTicker', async () => {
    const calls: Array<string> = []
    const { hub, host } = makeHub({
      venue: {
        ...VENUE,
        seedTicker: true,
        seedTickerFetch: async (
          _exchange: CcxtExchangeLike,
          symbol: string,
        ) => {
          calls.push(symbol)
          return { last: 55, timestamp: 1_700_000_000_000 }
        },
      },
    })
    host.seedTicker = { last: 101, timestamp: 1_700_000_000_000 }
    const frames: Array<{ ticker: { last: number } }> = []
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', (d) =>
      frames.push(d as { ticker: { last: number } }),
    )
    await waitFor(() => frames.length === 1)
    // The hook answered — the unified endpoint was never touched.
    expect(frames[0]?.ticker.last).toBe(55)
    expect(calls).toEqual(['BTC/USDT'])
    const exchange = await host.current()
    expect(exchange.calls.some((c) => c.startsWith('resttick:'))).toBe(false)
    await hub.destroy()
  })

  it('a venue without the flag never fetches a REST ticker', async () => {
    const { hub, host } = makeHub()
    host.seedTicker = { last: 101, timestamp: 1_700_000_000_000 }
    hub.acquire({ channel: 'ticker', pair: 'BTC-USDT' }, '', () => {})
    const exchange = await host.current()
    await waitFor(() => exchange.calls.length > 0)
    await sleep(10)
    expect(exchange.calls.some((c) => c.startsWith('resttick:'))).toBe(false)
    await hub.destroy()
  })
})

// ── Unwatch suppression (suppressUnwatch venues) ─────────────────────────

describe('CcxtStreamHub — unwatch suppression', () => {
  it('never calls the venue unWatch and orphan-counts instead', async () => {
    const { hub, host } = makeHub({
      venue: { ...VENUE, suppressUnwatch: true },
    })
    hub.acquire({ channel: 'ticker', pair: 'LIVE-USDT' }, '', () => {})
    const exchange = await host.current()
    // The venue HAS a working-looking unWatch — the flag must win anyway.
    exchange.has['unWatchTicker'] = true

    for (let i = 0; i < 12; i++) {
      const release = hub.acquire(
        { channel: 'ticker', pair: `P${i}-USDT` },
        '',
        () => {},
      )
      release()
    }

    expect(exchange.unWatchedTickers).toEqual([])
    // The releases were counted as orphans: the threshold rebuild fires.
    await waitFor(() => host.built.length === 2)
    await hub.destroy()
  })
})
