// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Live connector conformance harness.
 *
 * Unlike the offline golden tests (which feed hand-written wire fixtures
 * through the parsers), this harness drives each connector's REAL WebSocket +
 * REST clients against the REAL exchange and asserts the normalized output
 * obeys the canonical contract (`@pairlens/market-engine/validation`). It is
 * the instrument that catches exchange contract drift and connector-specific
 * streaming bugs — e.g. a connector that backfills history but never streams a
 * forming-bar update (the "chart doesn't move" class of bug).
 *
 * Network-bound and time-bound, so it is OPT-IN: the test wrapper skips unless
 * `PAIRLENS_LIVE_CONNECTORS=1`. Run via `bun run test:connectors:live`.
 */

import {
  validateCandle,
  validateOrderbookSide,
  validateTicker,
} from '@pairlens/market-engine/validation'
import type {
  Candle,
  CandleUpdate,
  OrderbookUpdate,
  TickerUpdate,
} from '@pairlens/market-engine/types'

// ── Driver contract ──────────────────────────────────────────────────
// Connectors expose a WsClient class + standalone REST fns rather than a
// uniform MarketAdapter, so each connector supplies a small driver that
// adapts those into this shape. See drivers.ts.

export type WsClientLike = {
  subscribeCandles: (
    pair: string,
    timeframe: string,
    country: string,
    cb: (u: CandleUpdate) => void,
  ) => () => void
  subscribeTicker: (
    pair: string,
    country: string,
    cb: (u: TickerUpdate) => void,
  ) => () => void
  subscribeOrderbook: (
    pair: string,
    country: string,
    cb: (u: OrderbookUpdate) => void,
  ) => () => void
  destroy: () => void
}

export type LiveDriver = {
  name: string
  /** Exchange-appropriate spot pair (BTC-USDT or nearest equivalent). */
  pair: string
  timeframe: string
  country: string
  makeClient: () => WsClientLike
  fetchHistory: (
    pair: string,
    timeframe: string,
    limit: number,
    country: string,
  ) => Promise<Array<Candle>>
}

export type CheckResult = { ok: boolean; info: string }

export type ConnectorResults = {
  name: string
  restHistory: CheckResult
  tickerStream: CheckResult
  orderbookStream: CheckResult
  candleSnapshot: CheckResult
  candleFormingUpdate: CheckResult
}

// ── Tunables ─────────────────────────────────────────────────────────
const HISTORY_MIN = 20
const TICKER_TIMEOUT = 20_000
const BOOK_TIMEOUT = 20_000
// Forming-bar detection needs a couple of same-bucket ticks. BTC on 1m is
// liquid enough that this lands within seconds; the ceiling guards a stall.
const CANDLE_TIMEOUT = 40_000

const pass = (info: string): CheckResult => ({ ok: true, info })
const failed = (info: string): CheckResult => ({ ok: false, info })

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/**
 * Subscribe, accumulate updates, and resolve as soon as `predicate` is true
 * (or on timeout). Always tears the subscription down before resolving so a
 * connector's WS doesn't leak across checks.
 */
function collect<TUpdate>(
  subscribe: (cb: (u: TUpdate) => void) => () => void,
  predicate: (u: TUpdate, all: Array<TUpdate>) => boolean,
  timeoutMs: number,
): Promise<{ matched: TUpdate | null; all: Array<TUpdate> }> {
  return new Promise((resolve) => {
    const all: Array<TUpdate> = []
    let done = false
    let unsub: () => void = () => {}

    const finish = (matched: TUpdate | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        unsub()
      } catch {
        // ignore teardown errors
      }
      resolve({ matched, all })
    }

    const timer = setTimeout(() => finish(null), timeoutMs)

    try {
      unsub = subscribe((u) => {
        all.push(u)
        if (predicate(u, all)) finish(u)
      })
    } catch (e) {
      finish(null)
      void e
    }
  })
}

async function checkRestHistory(d: LiveDriver): Promise<CheckResult> {
  try {
    const candles = await d.fetchHistory(d.pair, d.timeframe, 100, d.country)
    if (!candles || candles.length < HISTORY_MIN) {
      return failed(
        `only ${candles?.length ?? 0} candles (need ≥${HISTORY_MIN})`,
      )
    }
    for (const c of candles) {
      const v = validateCandle(c)
      if (!v.ok) return failed(`invalid candle: ${v.errors[0]}`)
    }
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].ts <= candles[i - 1].ts) {
        return failed(`non-ascending ts at index ${i}`)
      }
    }
    return pass(`${candles.length} candles`)
  } catch (e) {
    return failed(errMsg(e))
  }
}

async function checkTicker(
  client: WsClientLike,
  d: LiveDriver,
): Promise<CheckResult> {
  const { matched } = await collect<TickerUpdate>(
    (cb) => client.subscribeTicker(d.pair, d.country, cb),
    (u) => u?.type === 'ticker' && u.ticker?.last > 0,
    TICKER_TIMEOUT,
  )
  if (!matched) return failed('no ticker within timeout')
  const v = validateTicker(matched.ticker)
  if (!v.ok) return failed(`invalid ticker: ${v.errors[0]}`)
  return pass(`last=${matched.ticker.last}`)
}

async function checkOrderbook(
  client: WsClientLike,
  d: LiveDriver,
): Promise<CheckResult> {
  const { matched } = await collect<OrderbookUpdate>(
    (cb) => client.subscribeOrderbook(d.pair, d.country, cb),
    (u) => (u?.bids?.length ?? 0) > 0 && (u?.asks?.length ?? 0) > 0,
    BOOK_TIMEOUT,
  )
  if (!matched) return failed('no orderbook within timeout')
  const vb = validateOrderbookSide(matched.bids, 'bids')
  if (!vb.ok) return failed(`bids: ${vb.errors[0]}`)
  const va = validateOrderbookSide(matched.asks, 'asks')
  if (!va.ok) return failed(`asks: ${va.errors[0]}`)
  const bestBid = matched.bids[0][0]
  const bestAsk = matched.asks[0][0]
  if (bestBid >= bestAsk) {
    return failed(`crossed book: bid ${bestBid} ≥ ask ${bestAsk}`)
  }
  return pass(`bid=${bestBid} ask=${bestAsk}`)
}

/**
 * Verify the candle stream both backfills a snapshot AND streams a live
 * forming-bar update — a same-bucket re-emission of the latest candle. A
 * connector that only emits on candle close (or with a mis-aligned/seconds ts)
 * fails the forming check, which is exactly the "indicators move but the price
 * chart is frozen" symptom.
 */
async function checkCandles(
  client: WsClientLike,
  d: LiveDriver,
): Promise<{ snapshot: CheckResult; forming: CheckResult }> {
  let snapshotCandle: Candle | null = null
  let formingCandle: Candle | null = null
  let anyUpdate = false
  // ts → number of times we've seen a candle for that bucket. Seeing the same
  // bucket ≥2× means the bar is updating in place (forming).
  const seen = new Map<number, number>()

  await collect<CandleUpdate>(
    (cb) => client.subscribeCandles(d.pair, d.timeframe, d.country, cb),
    (u) => {
      if (!u?.candles?.length) return false
      const last = u.candles[u.candles.length - 1]
      if (u.type === 'snapshot') {
        snapshotCandle = last
        seen.set(last.ts, (seen.get(last.ts) ?? 0) + 1)
        return false
      }
      // type === 'update'
      anyUpdate = true
      const n = (seen.get(last.ts) ?? 0) + 1
      seen.set(last.ts, n)
      if (n >= 2) formingCandle = last
      return formingCandle != null
    },
    CANDLE_TIMEOUT,
  )

  const snapshot: CheckResult = snapshotCandle
    ? validateCandle(snapshotCandle).ok
      ? pass(`last ts=${(snapshotCandle as Candle).ts}`)
      : failed(
          `invalid snapshot candle: ${validateCandle(snapshotCandle).errors[0]}`,
        )
    : failed('no snapshot within timeout')

  let forming: CheckResult
  if (formingCandle) {
    forming = validateCandle(formingCandle).ok
      ? pass(`forming ts=${(formingCandle as Candle).ts}`)
      : failed(
          `invalid forming candle: ${validateCandle(formingCandle).errors[0]}`,
        )
  } else if (anyUpdate) {
    forming = failed(
      'emits updates but no forming-bar (close-only / mis-aligned ts?)',
    )
  } else {
    forming = failed('no candle updates within timeout')
  }

  return { snapshot, forming }
}

/** Run every check for one connector and return a populated results row. */
export async function runConnectorChecks(
  d: LiveDriver,
): Promise<ConnectorResults> {
  const restHistory = await checkRestHistory(d)

  // Fresh client per stream check keeps WS state isolated and avoids one
  // connector's reconnect churn bleeding into the next assertion.
  const tickerClient = d.makeClient()
  let tickerStream: CheckResult
  try {
    tickerStream = await checkTicker(tickerClient, d)
  } finally {
    tickerClient.destroy()
  }

  const bookClient = d.makeClient()
  let orderbookStream: CheckResult
  try {
    orderbookStream = await checkOrderbook(bookClient, d)
  } finally {
    bookClient.destroy()
  }

  const candleClient = d.makeClient()
  let candleSnapshot: CheckResult
  let candleFormingUpdate: CheckResult
  try {
    const r = await checkCandles(candleClient, d)
    candleSnapshot = r.snapshot
    candleFormingUpdate = r.forming
  } finally {
    candleClient.destroy()
  }

  return {
    name: d.name,
    restHistory,
    tickerStream,
    orderbookStream,
    candleSnapshot,
    candleFormingUpdate,
  }
}

const CHECK_COLUMNS: Array<{ key: keyof ConnectorResults; label: string }> = [
  { key: 'restHistory', label: 'REST hist' },
  { key: 'tickerStream', label: 'ticker' },
  { key: 'orderbookStream', label: 'book' },
  { key: 'candleSnapshot', label: 'candle snap' },
  { key: 'candleFormingUpdate', label: 'forming bar' },
]

/** Render a greppable per-connector pass/fail matrix for the nightly run. */
export function formatMatrix(rows: Array<ConnectorResults>): string {
  const nameW = Math.max(9, ...rows.map((r) => r.name.length))
  const header =
    'connector'.padEnd(nameW) +
    '  ' +
    CHECK_COLUMNS.map((c) => c.label.padEnd(12)).join('')
  const lines = [header, '-'.repeat(header.length)]

  for (const r of rows) {
    const cells = CHECK_COLUMNS.map((c) => {
      const res = r[c.key] as CheckResult
      return (res.ok ? 'PASS' : 'FAIL').padEnd(12)
    }).join('')
    lines.push(r.name.padEnd(nameW) + '  ' + cells)
  }

  // Detail lines for any failures so the nightly log explains itself.
  const failures: Array<string> = []
  for (const r of rows) {
    for (const c of CHECK_COLUMNS) {
      const res = r[c.key] as CheckResult
      if (!res.ok) failures.push(`  ✗ ${r.name} / ${c.label}: ${res.info}`)
    }
  }
  if (failures.length) {
    lines.push('', 'failures:', ...failures)
  }

  return lines.join('\n')
}

/** All check results across a row, flattened — for assertion convenience. */
export function rowFailures(r: ConnectorResults): Array<string> {
  const out: Array<string> = []
  for (const c of CHECK_COLUMNS) {
    const res = r[c.key] as CheckResult
    if (!res.ok) out.push(`${c.label}: ${res.info}`)
  }
  return out
}
