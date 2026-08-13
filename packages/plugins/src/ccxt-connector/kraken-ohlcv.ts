// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kraken's three OHLCV defects, patched onto the instance.
 *
 * All three are Kraken-only, none is expressible through `CcxtVenueConfig`,
 * and every one of them is silent — they produce plausible-looking candles
 * that are simply the wrong ones — so they are patched at the seam where they
 * happen, on a single exchange instance, rather than special-cased in shared
 * bridge code that the other thirteen venues also run through.
 *
 * Two were known from the venue matrix. The third (the descending cache, see
 * `newestAscending`) only showed up under a live socket, which is the argument
 * for probing every venue rather than reading its ccxt source.
 *
 * ── 1. `watchOHLCV`: the message hash omits the timeframe ─────────────────
 *
 * `pro/kraken.js:802` builds `getMessageHash('ohlcv', undefined, symbol)` →
 * `ohlcv@BTC/USD`, and passes that string as BOTH the message hash and the
 * subscribe hash. Two consequences, in the same instance:
 *
 *   - the second `watchOHLCV(symbol, otherTimeframe)` finds
 *     `client.subscriptions['ohlcv@BTC/USD']` already set, so its subscribe
 *     frame is NEVER SENT;
 *   - both callers await the same future, which `handleOHLCV` resolves with
 *     whichever interval the socket is actually carrying.
 *
 * So a 15m chart next to a 1h chart on the same pair silently renders 1h bars
 * labelled 15m. Upstream ccxt has no fix; the structural one is one exchange
 * instance per timeframe, which would mean one socket, one markets table and
 * one rate limiter per open chart.
 *
 * What this module does instead is make the symbol single-tenant: one
 * timeframe streams at a time, ownership is claimed on first watch and given
 * back through `unWatchOHLCV` (which the watch driver already calls on the last
 * release, once `has.unWatchOHLCV` says it can). A contender for a different
 * timeframe waits out a cooldown and then takes over with a clean close — the
 * wire unsubscribe, ccxt's subscription bookkeeping and the cached candle
 * arrays all cleared, so the resubscribe is a real one.
 *
 * That makes the ordinary case exact: the terminal streams one timeframe per
 * pair, and a timeframe switch releases before it acquires. The degraded case
 * — two panes, one pair, two timeframes — alternates on the cooldown instead of
 * showing one of them the other's data. Every path is also backstopped by a
 * post-resolution check that the candles handed back really are the requested
 * timeframe's, because a wrong-but-plausible candle is the failure this whole
 * module exists to prevent.
 *
 * ── 2. `fetchOHLCV`: `limit` keeps the OLDEST rows, not the newest ────────
 *
 * `/0/public/OHLC` takes no count parameter — it always returns its most recent
 * 720 bars — so ccxt applies `limit` client-side in `parseOHLCVs`, and
 * `filterBySinceLimit(..., tail = false)` slices from the FRONT. Asking Kraken
 * for 300 candles therefore returns bars 1..300 of 720: a snapshot that ends
 * roughly 420 bars in the past, which the live stream then appends to across a
 * gap. Every other venue in the fleet passes the limit to the venue, gets back
 * exactly that many rows, and never trips this.
 *
 * The patch asks ccxt for everything (no `limit`) and trims the tail here. It
 * also turns the bridge's `until` cursor into the only cursor Kraken has —
 * `since` — by walking back `limit` bar widths from it, which is what makes
 * pan-left work at all on a venue whose REST paging only runs forwards.
 */

import type { CcxtExchangeCtor, CcxtExchangeLike, CcxtOhlcvRow } from './types'

/**
 * How long a live timeframe holds the symbol against a contender.
 *
 * Only reachable when two subscriptions genuinely overlap: a timeframe switch
 * releases first (`unWatchOHLCV` clears ownership), so it never waits. Long
 * enough that two competing panes churn the socket at most every ten seconds,
 * short enough that the loser keeps marking stream health as live.
 */
export const TAKEOVER_COOLDOWN_MS = 10_000

/** How long a parked (non-owning) watch sleeps before re-checking. */
export const PARK_MS = 1_000

/** `/0/public/OHLC` never returns more than this, whatever you ask for. */
export const KRAKEN_MAX_OHLCV = 720

const INSTALLED = Symbol.for('pairlens.kraken.ohlcv-guard')

/** The ccxt internals this module reaches into, named rather than `any`. */
type KrakenInternals = CcxtExchangeLike & {
  [INSTALLED]?: boolean
  ohlcvs?: Record<string, Record<string, unknown>>
  clients?: Record<string, KrakenWsClientLike | undefined>
  requestId?: () => number
}

type KrakenWsClientLike = {
  subscriptions: Record<string, unknown>
  futures: Record<string, unknown>
  resolve: (result: unknown, messageHash: string) => unknown
  send: (message: unknown) => unknown
}

type Ownership = { timeframe: string; claimedAt: number }

export type KrakenGuardOptions = {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  takeoverCooldownMs?: number
  parkMs?: number
}

/**
 * Wrap `ccxt.pro.kraken` so every instance carries the guard.
 *
 * Applied at the class rather than through `applyUrls` on purpose: the guard
 * has to be in place before the first `watchOHLCV`, and tying it to the
 * constructor means no future call site can build a Kraken instance without it.
 */
export function withKrakenOhlcvGuard(
  Base: CcxtExchangeCtor,
  options: KrakenGuardOptions = {},
): CcxtExchangeCtor {
  function KrakenGuarded(config: Record<string, unknown>): CcxtExchangeLike {
    const exchange = new Base(config)
    installKrakenOhlcvGuard(exchange, options)
    return exchange
  }
  return KrakenGuarded as unknown as CcxtExchangeCtor
}

/** Patch `watchOHLCV` / `fetchOHLCV` on one instance. Idempotent. */
export function installKrakenOhlcvGuard(
  exchange: CcxtExchangeLike,
  options: KrakenGuardOptions = {},
): void {
  const target = exchange as KrakenInternals
  if (target[INSTALLED]) return
  target[INSTALLED] = true

  const now = options.now ?? Date.now
  const sleep = options.sleep ?? defaultSleep
  const cooldownMs = options.takeoverCooldownMs ?? TAKEOVER_COOLDOWN_MS
  const parkMs = options.parkMs ?? PARK_MS
  /** symbol → the timeframe currently allowed to stream it. */
  const owners = new Map<string, Ownership>()

  const watchOriginal = exchange.watchOHLCV.bind(exchange)
  const fetchOriginal = exchange.fetchOHLCV.bind(exchange)

  exchange.watchOHLCV = async (
    symbol: string,
    timeframe = '1m',
    since?: number,
    limit?: number,
    params: Record<string, unknown> = {},
  ): Promise<Array<CcxtOhlcvRow>> => {
    const owner = owners.get(symbol)
    if (owner && owner.timeframe !== timeframe) {
      if (now() - owner.claimedAt < cooldownMs) {
        // Someone else's interval is on the wire. Park rather than subscribe:
        // the shared message hash would hand us their candles.
        await sleep(parkMs)
        return []
      }
      releaseKrakenOhlcv(target, symbol, owner.timeframe)
      owners.delete(symbol)
    }
    if (owners.get(symbol)?.timeframe !== timeframe) {
      owners.set(symbol, { timeframe, claimedAt: now() })
    }

    const rows = await watchOriginal(symbol, timeframe, since, limit, params)

    // Ownership can change while the watch is in flight, and a resolution can
    // arrive for an interval we did not ask for. Either way the rows belong to
    // another chart — drop them rather than draw them.
    if (owners.get(symbol)?.timeframe !== timeframe) return []
    const cache = ohlcvCache(target, symbol, timeframe)
    if (!cache) return []
    return newestAscending(cache, Math.max(rows.length, 1))
  }

  // The watch driver only calls `unWatch*` when `has` advertises it, and
  // upstream Kraken declares none. This one is ours: it is how a released
  // subscription hands the symbol back.
  exchange.has['unWatchOHLCV'] = true
  exchange.unWatchOHLCV = async (
    symbol: string,
    timeframe?: string,
  ): Promise<unknown> => {
    const owner = owners.get(symbol)
    if (!owner) return undefined
    if (timeframe !== undefined && owner.timeframe !== timeframe)
      return undefined
    owners.delete(symbol)
    releaseKrakenOhlcv(target, symbol, owner.timeframe)
    return undefined
  }

  exchange.fetchOHLCV = async (
    symbol: string,
    timeframe = '1m',
    since?: number,
    limit?: number,
    params: Record<string, unknown> = {},
  ): Promise<Array<CcxtOhlcvRow>> => {
    const want = Math.min(limit ?? KRAKEN_MAX_OHLCV, KRAKEN_MAX_OHLCV)
    const { until, rest } = takeUntil(params)

    let effectiveSince = since
    if (effectiveSince === undefined && until !== undefined) {
      // Kraken pages FORWARDS from `since` only. A window that ends at the
      // cursor is the closest thing to a pan-left page it can serve, and one
      // page is 720 bars wide at most.
      const width = timeframeWidthMs(target, timeframe)
      if (width > 0) effectiveSince = until - want * width
    }

    // `limit` is deliberately not forwarded: ccxt would keep the OLDEST rows.
    const rows = await fetchOriginal(
      symbol,
      timeframe,
      effectiveSince,
      undefined,
      rest,
    )
    const bounded =
      until === undefined ? rows : rows.filter((row) => rowTs(row) < until)
    return bounded.slice(-want)
  }
}

/**
 * Give the symbol back: unsubscribe on the wire, clear ccxt's per-client
 * bookkeeping so the next subscribe is really sent, and drop the cached
 * candles so a stale interval cannot satisfy the post-resolution check.
 *
 * Every step is best-effort. This runs on teardown paths where the socket may
 * already be gone, and a throw here would surface as a spurious stream error.
 */
export function releaseKrakenOhlcv(
  exchange: CcxtExchangeLike,
  symbol: string,
  timeframe: string,
): void {
  const target = exchange as KrakenInternals
  const client = krakenPublicClient(target)
  const messageHash = `ohlcv@${symbol}`

  if (client) {
    try {
      // Anyone still awaiting the shared future gets an empty frame instead of
      // hanging until the socket dies; the wrapper drops it on the ownership
      // check and re-enters.
      client.resolve([], messageHash)
      delete client.subscriptions[messageHash]
      const interval = exchange.timeframes[timeframe]
      if (interval !== undefined) {
        void Promise.resolve(
          client.send({
            method: 'unsubscribe',
            params: { channel: 'ohlc', symbol: [symbol], interval },
            ...(target.requestId ? { req_id: target.requestId() } : {}),
          }),
        ).catch(() => {})
      }
    } catch {
      // A closing socket is the common case here, not an error worth raising.
    }
  }

  if (target.ohlcvs) delete target.ohlcvs[symbol]
}

/** ccxt's candle cache for this exact interval, or null if it holds another. */
function ohlcvCache(
  exchange: KrakenInternals,
  symbol: string,
  timeframe: string,
): Array<CcxtOhlcvRow> | null {
  const cache = exchange.ohlcvs?.[symbol]?.[timeframe]
  return Array.isArray(cache) ? (cache as Array<CcxtOhlcvRow>) : null
}

/**
 * The `n` newest rows of the cache, oldest-first.
 *
 * Third Kraken defect, and the subtlest: `handleOHLCV` walks the frame
 * BACKWARDS (`data[length - i - 1]`, `pro/kraken.js:634`) while
 * `ArrayCacheByTimestamp.append` preserves insertion order and never sorts, so
 * the subscribe burst lands DESCENDING. `watchOHLCV` then returns
 * `filterBySinceLimit(..., tail = true)` — the LAST n entries — which on a
 * descending array are the OLDEST bars in the cache.
 *
 * Measured live: a fresh 1m subscription resolved
 * `[00:35, 00:34, … 00:21]`, newest first. Every forming-bar tick until the
 * next bar rollover then returns 00:21 again, so the chart's live bar sits
 * frozen for up to a full timeframe — an hour on the 1h chart — while
 * `update` frames keep arriving and keep saying nothing.
 *
 * Reading the tail off a sorted copy is correct whichever order the cache is
 * in, so this stays right if upstream ever fixes the traversal. The copy is
 * bounded by `options.OHLCVLimit` (1000) and the array is nearly sorted, which
 * is the cheap case for the engine's sort.
 */
function newestAscending(
  cache: Array<CcxtOhlcvRow>,
  n: number,
): Array<CcxtOhlcvRow> {
  const sorted = [...cache].sort((a, b) => rowTs(a) - rowTs(b))
  return sorted.slice(-n)
}

function krakenPublicClient(
  exchange: KrakenInternals,
): KrakenWsClientLike | null {
  const api = exchange.urls['api'] as Record<string, unknown> | undefined
  const ws = api?.['ws'] as Record<string, unknown> | undefined
  const url = ws?.['publicV2']
  if (typeof url !== 'string') return null
  return exchange.clients?.[url] ?? null
}

/** ccxt's timeframe values are MINUTES on Kraken, not duration strings. */
function timeframeWidthMs(
  exchange: CcxtExchangeLike,
  timeframe: string,
): number {
  const minutes = Number(exchange.timeframes[timeframe])
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0
}

/** Pull `until` out of the params — Kraken's REST rejects nothing but ignores it. */
function takeUntil(params: Record<string, unknown>): {
  until: number | undefined
  rest: Record<string, unknown>
} {
  const raw = params['until']
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { until: undefined, rest: params }
  }
  const rest = { ...params }
  delete rest['until']
  return { until: raw, rest }
}

function rowTs(row: CcxtOhlcvRow): number {
  const ts = Number(row[0])
  return Number.isFinite(ts) ? ts : 0
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
