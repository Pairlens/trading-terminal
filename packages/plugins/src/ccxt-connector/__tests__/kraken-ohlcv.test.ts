// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The three Kraken OHLCV defects, pinned.
 *
 * All of them are silent in production — they yield well-formed candles that
 * are simply the wrong ones, so nothing downstream can catch them: the runtime
 * validator sees valid numbers, the buffer sees ascending timestamps, and the
 * chart draws confidently. The only place they are observable is here, against
 * a fake exchange shaped like ccxt's — including its bugs, which is the point.
 */

import { describe, expect, it } from 'bun:test'
import { KRAKEN_MAX_OHLCV, installKrakenOhlcvGuard } from '../kraken-ohlcv'
import type { CcxtExchangeLike, CcxtOhlcvRow } from '../types'

const SYMBOL = 'BTC/USD'
const WS_URL = 'wss://ws.kraken.com/v2'

type Sent = Record<string, unknown>

/**
 * A Kraken-shaped fake: the ccxt internals the guard reaches into (`ohlcvs`,
 * `clients[url].subscriptions`, `resolve`, `send`) plus a `watchOHLCV` that
 * reproduces the defect rather than the documented behavior — a guard tested
 * against a correct exchange proves nothing.
 *
 * The model is exactly ccxt's: the subscribe frame goes out only while
 * `subscriptions['ohlcv@<symbol>']` is absent, so the socket ends up
 * "carrying" whichever interval claimed the symbol first, and every caller —
 * whatever timeframe it asked for — is answered from that one.
 */
class FakeKraken {
  readonly id = 'kraken'
  readonly has: Record<string, unknown> = {}
  readonly timeframes: Record<string, string> = {
    '1m': '1' as unknown as string,
    '15m': '15' as unknown as string,
    '1h': '60' as unknown as string,
  }
  readonly urls: Record<string, unknown> = {
    api: { ws: { publicV2: WS_URL } },
  }
  readonly options: Record<string, unknown> = {}
  markets: Record<string, unknown> | undefined = { [SYMBOL]: {} }
  /** ccxt's per-symbol, per-timeframe candle caches. */
  ohlcvs: Record<string, Record<string, unknown>> = {}
  readonly clients: Record<string, unknown>
  readonly sent: Array<Sent> = []
  readonly resolved: Array<string> = []
  readonly watchCalls: Array<string> = []
  /** Rows the next `fetchOHLCV` returns, before any guard trimming. */
  restRows: Array<CcxtOhlcvRow> = []
  readonly fetchCalls: Array<{
    since: number | undefined
    limit: number | undefined
    params: Record<string, unknown>
  }> = []
  private nextRequestId = 0

  constructor() {
    this.clients = {
      [WS_URL]: {
        subscriptions: {} as Record<string, unknown>,
        futures: {} as Record<string, unknown>,
        resolve: (_result: unknown, hash: string) => {
          this.resolved.push(hash)
          return _result
        },
        send: (message: unknown) => {
          this.sent.push(message as Sent)
          return Promise.resolve()
        },
      },
    }
  }

  get subscriptions(): Record<string, unknown> {
    return (this.clients[WS_URL] as { subscriptions: Record<string, unknown> })
      .subscriptions
  }

  requestId = () => ++this.nextRequestId

  /** What the venue would push for a given interval, once subscribed. */
  readonly feed: Record<string, Array<CcxtOhlcvRow>> = {}
  /** How many timestamps the next resolution reports as touched. */
  burst = 1
  /** The interval each symbol's single subscription is actually carrying. */
  private carrying: Record<string, string> = {}

  deliver(timeframe: string, rows: Array<CcxtOhlcvRow>): void {
    this.feed[timeframe] = rows
  }

  /** Put a subscription on the wire without going through the guard. */
  preSubscribe(symbol: string, timeframe: string): void {
    this.subscriptions[`ohlcv@${symbol}`] = true
    this.carrying[symbol] = timeframe
  }

  watchOHLCV = async (
    symbol: string,
    timeframe = '1m',
  ): Promise<Array<CcxtOhlcvRow>> => {
    this.watchCalls.push(`${symbol}:${timeframe}`)
    const hash = `ohlcv@${symbol}`
    if (!this.subscriptions[hash]) {
      // First claim wins: this is the only point a subscribe frame is sent.
      this.subscriptions[hash] = true
      this.carrying[symbol] = timeframe
    }
    const carried = this.carrying[symbol] ?? timeframe
    // The cache lands DESCENDING (handleOHLCV walks the frame backwards and
    // ArrayCacheByTimestamp never sorts), and the return value is the TAIL of
    // it — so ccxt hands back the oldest rows, newest last.
    const stored = [...(this.feed[carried] ?? [])].sort(
      (a, b) => Number(b[0]) - Number(a[0]),
    )
    this.ohlcvs[symbol] = { ...(this.ohlcvs[symbol] ?? {}), [carried]: stored }
    return stored.slice(-this.burst)
  }

  watchTicker = async () => ({})
  watchOrderBook = async () => ({ bids: [], asks: [] })
  watchTrades = async () => []

  fetchOHLCV = async (
    _symbol: string,
    _timeframe?: string,
    since?: number,
    limit?: number,
    params: Record<string, unknown> = {},
  ): Promise<Array<CcxtOhlcvRow>> => {
    this.fetchCalls.push({ since, limit, params })
    return this.restRows
  }

  fetchTickers = async () => ({})
  setMarkets = () => this.markets
  loadMarkets = async () => this.markets
  market = () => ({})
  close = async () => undefined
}

function guarded(options?: {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}): FakeKraken {
  const fake = new FakeKraken()
  installKrakenOhlcvGuard(fake as unknown as CcxtExchangeLike, {
    ...(options?.now ? { now: options.now } : {}),
    sleep: options?.sleep ?? (async () => {}),
    takeoverCooldownMs: 10_000,
    parkMs: 0,
  })
  return fake
}

function row(ts: number): CcxtOhlcvRow {
  return [ts, 1, 2, 0.5, 1.5, 10]
}

describe('kraken watchOHLCV: the cache is stored newest-first', () => {
  it('returns the NEWEST bar, ascending — ccxt`s tail slice returns the oldest', async () => {
    const ex = guarded()
    const base = 1_700_000_000_000
    ex.deliver('1h', [row(base), row(base + 3_600_000), row(base + 7_200_000)])

    const rows = await ex.watchOHLCV(SYMBOL, '1h')

    // Unguarded, this is `[base]`: the live bar would sit frozen until the
    // next rollover while update frames kept arriving.
    expect(rows.map((r) => r[0])).toEqual([base + 7_200_000])
  })

  it('keeps a multi-bar burst in chart order', async () => {
    const ex = guarded()
    const base = 1_700_000_000_000
    ex.deliver('1h', [row(base), row(base + 3_600_000), row(base + 7_200_000)])
    // A burst resolution reports every timestamp it touched.
    ex.burst = 3

    const rows = await ex.watchOHLCV(SYMBOL, '1h')

    expect(rows.map((r) => r[0])).toEqual([
      base,
      base + 3_600_000,
      base + 7_200_000,
    ])
  })
})

describe('kraken watchOHLCV: one timeframe per symbol', () => {
  it('streams the first timeframe to claim a symbol', async () => {
    const ex = guarded()
    ex.deliver('1h', [row(1_700_000_000_000)])
    const rows = await ex.watchOHLCV(SYMBOL, '1h')
    expect(rows).toHaveLength(1)
    expect(ex.watchCalls).toEqual([`${SYMBOL}:1h`])
  })

  it('parks a second timeframe rather than handing it the first one`s candles', async () => {
    const ex = guarded()
    ex.deliver('1h', [row(1_700_000_000_000)])
    await ex.watchOHLCV(SYMBOL, '1h')

    // The unguarded call would return the 1h rows here — the exact production
    // bug: a 15m chart drawing hourly bars.
    const rows = await ex.watchOHLCV(SYMBOL, '15m')
    expect(rows).toEqual([])
    expect(ex.watchCalls).toEqual([`${SYMBOL}:1h`])
  })

  it('hands the symbol over once the cooldown has passed, with a clean close', async () => {
    let clock = 0
    const ex = guarded({ now: () => clock })
    ex.deliver('1h', [row(1_700_000_000_000)])
    await ex.watchOHLCV(SYMBOL, '1h')

    clock += 11_000
    ex.deliver('15m', [row(1_700_000_900_000)])
    const rows = await ex.watchOHLCV(SYMBOL, '15m')

    expect(rows).toHaveLength(1)
    expect(ex.watchCalls).toEqual([`${SYMBOL}:1h`, `${SYMBOL}:15m`])
    // The takeover must clear ccxt's bookkeeping, or the resubscribe is a no-op.
    expect(ex.resolved).toContain(`ohlcv@${SYMBOL}`)
    expect(ex.sent[0]).toMatchObject({
      method: 'unsubscribe',
      params: { channel: 'ohlc', symbol: [SYMBOL], interval: '60' },
    })
  })

  it('releases the symbol through unWatchOHLCV so a switch never waits', async () => {
    const ex = guarded()
    ex.deliver('1h', [row(1_700_000_000_000)])
    await ex.watchOHLCV(SYMBOL, '1h')

    // The watch driver only calls this because the guard advertises it.
    expect(ex.has['unWatchOHLCV']).toBe(true)
    await (
      ex as unknown as {
        unWatchOHLCV: (s: string, tf?: string) => Promise<unknown>
      }
    ).unWatchOHLCV(SYMBOL, '1h')

    expect(ex.subscriptions[`ohlcv@${SYMBOL}`]).toBeUndefined()
    expect(ex.ohlcvs[SYMBOL]).toBeUndefined()

    ex.deliver('15m', [row(1_700_000_900_000)])
    const rows = await ex.watchOHLCV(SYMBOL, '15m')
    expect(rows).toHaveLength(1)
    expect(ex.watchCalls).toEqual([`${SYMBOL}:1h`, `${SYMBOL}:15m`])
  })

  it('drops a resolution that carries an interval we did not ask for', async () => {
    const ex = guarded()
    ex.deliver('15m', [row(1_700_000_900_000)])
    // A socket left carrying 15m — a reconnect that raced the guard, or ccxt
    // resolving the shared future from a frame we never subscribed to. The
    // ownership check cannot see this; the cache check can.
    ex.preSubscribe(SYMBOL, '15m')
    const rows = await ex.watchOHLCV(SYMBOL, '1h')
    expect(rows).toEqual([])
  })

  it('leaves a different symbol alone — the collision is per symbol', async () => {
    const ex = guarded()
    ex.deliver('1h', [row(1_700_000_000_000)])
    ex.deliver('15m', [row(1_700_000_900_000)])
    await ex.watchOHLCV(SYMBOL, '1h')
    const rows = await ex.watchOHLCV('ETH/USD', '15m')
    expect(rows).toHaveLength(1)
  })
})

describe('kraken fetchOHLCV: the limit slices from the wrong end', () => {
  it('returns the NEWEST rows, not ccxt`s oldest-first slice', async () => {
    const ex = guarded()
    ex.restRows = [
      row(1_000_000_000_000),
      row(1_000_000_060_000),
      row(1_000_000_120_000),
    ]

    const rows = await ex.fetchOHLCV(SYMBOL, '1m', undefined, 2)

    expect(rows.map((r) => r[0])).toEqual([
      1_000_000_060_000, 1_000_000_120_000,
    ])
    // ccxt must not be given the limit: it would keep rows 1..2 instead.
    expect(ex.fetchCalls[0]?.limit).toBeUndefined()
  })

  it('turns the `until` cursor into the `since` window Kraken understands', async () => {
    const ex = guarded()
    const until = 1_700_000_000_000
    ex.restRows = []

    await ex.fetchOHLCV(SYMBOL, '1h', undefined, 100, { until })

    const call = ex.fetchCalls[0]
    // 100 hourly bars back from the cursor.
    expect(call?.since).toBe(until - 100 * 3_600_000)
    // `until` is stripped: Kraken's OHLC endpoint has no such parameter.
    expect(call?.params['until']).toBeUndefined()
  })

  it('filters out the boundary bar so a page cannot latch `exhausted`', async () => {
    const ex = guarded()
    const until = 1_700_000_000_000
    ex.restRows = [row(until - 3_600_000), row(until), row(until + 3_600_000)]

    const rows = await ex.fetchOHLCV(SYMBOL, '1h', undefined, 10, { until })

    expect(rows.map((r) => r[0])).toEqual([until - 3_600_000])
  })

  it('clamps a request to the 720 rows the endpoint can ever return', async () => {
    const ex = guarded()
    ex.restRows = Array.from({ length: 900 }, (_, i) =>
      row(1_700_000_000_000 + i * 60_000),
    )
    const rows = await ex.fetchOHLCV(SYMBOL, '1m', undefined, 5000)
    expect(rows).toHaveLength(KRAKEN_MAX_OHLCV)
  })
})

describe('kraken guard installation', () => {
  it('is idempotent — a second install must not double-wrap', async () => {
    const ex = guarded()
    installKrakenOhlcvGuard(ex as unknown as CcxtExchangeLike)
    ex.deliver('1h', [row(1_700_000_000_000)])
    const rows = await ex.watchOHLCV(SYMBOL, '1h')
    expect(rows).toHaveLength(1)
    expect(ex.watchCalls).toHaveLength(1)
  })
})
