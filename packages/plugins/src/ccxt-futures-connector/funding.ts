// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `market-data:funding` — funding rates, open interest and the settled-rate
 * series, for every linear perpetual the venue lists.
 *
 * Public data throughout. Nothing here is ever handed a credential: a funding
 * rate is the same number for every account, and routing it through the authed
 * instance would sign hundreds of reads for no reason and put the pane behind
 * a sealed vault.
 *
 * The three venues disagree about almost everything except the unified shape
 * ccxt parses into, so each call site asks `exchange.has` first and degrades to
 * a named refusal rather than an empty list:
 *
 * - **Rates.** Binance and Kraken answer every contract in ONE call
 *   (`fetchFundingRates`); KuCoin declares `fetchFundingRates: false` and only
 *   serves one symbol per call, so a bounded `pairs` list is the only way to
 *   ask it anything.
 * - **The interval is not in the payload.** Binance's premium-index rows carry
 *   no period at all, and annualising a rate without one is the difference
 *   between 11% and 88% a year. So the venue's ordinary period is declared on
 *   the venue config, per-contract overrides are pulled from
 *   `fetchFundingIntervals` where the venue publishes them (Binance settles a
 *   handful of contracts every four hours instead of eight), and every entry
 *   says which of the two it got with `intervalKnown`.
 * - **A month of history takes several calls.** Every venue caps one history
 *   request, and Kraken settles hourly: thirty days is 720 stamps there and 90
 *   on the eight-hourly venues. A read that does not fit in one call pages
 *   forward with `since` (see `readHistory`), which is what lets the extremes
 *   rail rank a live rate inside the contract's own 30-day range.
 * - **Open interest.** KuCoin serves all symbols at once, Binance one per call,
 *   and Kraken publishes no `fetchOpenInterest` at all — but its ticker rows,
 *   which its `fetchFundingRates` already parses, carry `openInterest`. That is
 *   a venue quirk and it lives in `venues/kraken-futures.ts` behind
 *   `openInterestFallback`, not in a branch here.
 *
 * Everything is cached per venue for a short TTL. Funding moves at most once a
 * minute and open interest is a five-minute number, while four panes on one
 * board ask the same question at the same moment; the cache is what keeps that
 * one round trip instead of four.
 */

import { fromFuturesSymbol, toFuturesSymbol } from './futures-symbols'
import type {
  FundingHistoryPoint,
  FundingHistoryResponse,
  FundingRateEntry,
  FundingSnapshotResponse,
  OpenInterestEntry,
  OpenInterestResponse,
} from '@pairlens/shared/instrument-types'
import type {
  CcxtFuturesExchangeLike,
  CcxtFuturesVenueConfig,
} from './futures-types'

/** Funding rates are recomputed by the venue at most once a minute. */
const RATES_TTL_MS = 45_000
/** Open interest is a five-minute number on every venue in the fleet. */
const OI_TTL_MS = 120_000
/** A settled series only gains a point once per interval. */
const HISTORY_TTL_MS = 300_000

/** Contracts returned by one rates call when the caller names no cap. */
const DEFAULT_RATES_LIMIT = 500
/** Stamps returned by one history call when the caller names no limit. */
const DEFAULT_HISTORY_LIMIT = 100
/** Stamps ONE call may ask for. Every venue in the fleet honours this much. */
const MAX_HISTORY_LIMIT = 300
/**
 * Stamps a paged history read will return in total.
 *
 * Thirty days of HOURLY settlement is 720 stamps, which is Kraken; the eight-
 * hourly venues need 90 for the same window. The cap is that worst case plus
 * headroom, so a caller can ask for "a month" without knowing the venue's
 * clock and never pay for more than a month of it.
 */
const MAX_HISTORY_STAMPS = 800
/** How far back a paged read starts: the window the extremes rail ranks in. */
const HISTORY_WINDOW_MS = 30 * 24 * 3_600_000
/** Requests one paged read may make, whatever the venue answers. */
const MAX_HISTORY_PAGES = 4

/**
 * Symbols asked for at once on a venue that answers one per call.
 *
 * Four rather than "all of them": these are unauthenticated GETs against the
 * same throttle budget the chart's candle backfill uses, and a scanner that
 * queued twenty of them would push first paint behind its own sweep.
 */
const REQUEST_CONCURRENCY = 4

/** Symbols one open-interest request may name, whatever the caller asks. */
const MAX_OI_SYMBOLS = 24

/**
 * Contracts a venue that answers one per call will sweep from a `bases` hint.
 *
 * The hint exists so a scanner never has to GUESS a venue's pair key: it names
 * the ASSETS it cares about and the venue's own markets table resolves them to
 * contracts. The cap is what keeps that from becoming a hundred REST calls on a
 * board refresh.
 */
const MAX_BASE_SWEEP = 16

/** Which settlement leg wins when a venue lists one base twice. */
const QUOTE_PREFERENCE = ['USDT', 'USD', 'USDC']

export type FundingRatesRequest = {
  action: 'funding-rates'
  pairs?: Array<string>
  /**
   * Base assets to resolve against the venue's own markets table, for venues
   * that cannot sweep. Ignored by venues that answer every contract in one
   * call — they return everything and the caller ranks it.
   */
  bases?: Array<string>
  limit?: number
}

export type OpenInterestRequest = {
  action: 'open-interest'
  pairs: Array<string>
  history?: boolean
}

export type FundingHistoryRequest = {
  action: 'funding-history'
  pair: string
  limit?: number
}

export type FundingRequest =
  | FundingRatesRequest
  | OpenInterestRequest
  | FundingHistoryRequest

/** Parse an execute payload into a request, or explain what it is missing. */
export function parseFundingRequest(
  params: Record<string, unknown>,
): FundingRequest {
  const action = String(params['action'] ?? 'funding-rates')
  if (action === 'funding-rates') {
    return {
      action: 'funding-rates',
      ...(Array.isArray(params['pairs'])
        ? { pairs: params['pairs'].map((p) => String(p)) }
        : {}),
      ...(Array.isArray(params['bases'])
        ? { bases: params['bases'].map((b) => String(b)) }
        : {}),
      ...(typeof params['limit'] === 'number'
        ? { limit: params['limit'] }
        : {}),
    }
  }
  if (action === 'open-interest') {
    const pairs = Array.isArray(params['pairs'])
      ? params['pairs'].map((p) => String(p))
      : []
    return {
      action: 'open-interest',
      pairs,
      ...(params['history'] === true ? { history: true } : {}),
    }
  }
  if (action === 'funding-history') {
    const pair = String(params['pair'] ?? '')
    if (!pair) throw new Error("funding-history requires a 'pair'")
    return {
      action: 'funding-history',
      pair,
      ...(typeof params['limit'] === 'number'
        ? { limit: params['limit'] }
        : {}),
    }
  }
  throw new Error(`Unsupported funding action '${action}'`)
}

/**
 * Per-venue funding reads with a short-lived cache.
 *
 * One instance per plugin, so every pane on a board shares its entries. The
 * cache holds RESOLVED values only — a rejection is never cached, because the
 * common failure is a transient refusal and pinning it for a TTL would leave
 * the whole board looking broken long after the venue recovered.
 */
export class CcxtFundingProvider {
  private readonly rates = new Map<
    string,
    { at: number; value: FundingSnapshotResponse }
  >()
  private readonly openInterest = new Map<
    string,
    { at: number; value: OpenInterestResponse }
  >()
  private readonly history = new Map<
    string,
    { at: number; value: FundingHistoryResponse }
  >()
  /** Per-contract interval overrides, refreshed with the rates snapshot. */
  private intervals: Map<string, number> | null = null
  private intervalsAt = 0

  constructor(
    private readonly venue: CcxtFuturesVenueConfig,
    private readonly now: () => number = Date.now,
  ) {}

  async handle(
    exchange: CcxtFuturesExchangeLike,
    request: FundingRequest,
  ): Promise<
    FundingSnapshotResponse | OpenInterestResponse | FundingHistoryResponse
  > {
    if (request.action === 'funding-rates') {
      return this.fundingRates(exchange, request)
    }
    if (request.action === 'open-interest') {
      return this.fetchOpenInterest(exchange, request)
    }
    return this.fundingHistory(exchange, request)
  }

  // ── Rates ──────────────────────────────────────────────────────────────

  private async fundingRates(
    exchange: CcxtFuturesExchangeLike,
    request: FundingRatesRequest,
  ): Promise<FundingSnapshotResponse> {
    const limit = clamp(request.limit, DEFAULT_RATES_LIMIT, 1000)
    const symbols = request.pairs?.map(toFuturesSymbol)
    const key = symbols
      ? symbols.slice().sort().join(',')
      : `*${request.bases ? `:${request.bases.join(',')}` : ''}`
    const hit = this.rates.get(key)
    if (hit && this.now() - hit.at < RATES_TTL_MS) return hit.value

    const rows = await this.readRates(exchange, symbols, request.bases)
    const overrides = await this.fundingIntervals(exchange)
    const entries: Array<FundingRateEntry> = []
    for (const row of rows) {
      const entry = this.toRateEntry(exchange, row, overrides)
      if (entry) entries.push(entry)
      if (entries.length >= limit) break
    }
    const value: FundingSnapshotResponse = {
      market: this.venue.marketId,
      entries,
      ts: this.now(),
    }
    this.rates.set(key, { at: this.now(), value })
    return value
  }

  private async readRates(
    exchange: CcxtFuturesExchangeLike,
    symbols: Array<string> | undefined,
    bases: Array<string> | undefined,
  ): Promise<Array<Record<string, unknown>>> {
    if (exchange.has['fetchFundingRates'] && exchange.fetchFundingRates) {
      // Symbols are passed through where the caller named them: on a venue
      // that answers everything anyway the filter is free, and on one that
      // requires a scope it is the difference between an answer and a throw.
      // `bases` is deliberately NOT applied here — a venue that sweeps should
      // return its whole universe, which is what the extremes rail scans.
      return asRows(await exchange.fetchFundingRates(symbols))
    }
    if (exchange.has['fetchFundingRate'] && exchange.fetchFundingRate) {
      const wanted =
        symbols && symbols.length > 0
          ? symbols
          : resolveBaseSymbols(exchange, bases ?? [])
      if (wanted.length === 0) {
        throw new Error(
          `${this.venue.displayName} serves one funding rate per request, so a contract list is required`,
        )
      }
      const fetchOne = exchange.fetchFundingRate.bind(exchange)
      return settledRows(
        await mapWithConcurrency(wanted, REQUEST_CONCURRENCY, (symbol) =>
          fetchOne(symbol),
        ),
      )
    }
    throw new Error(`${this.venue.displayName} publishes no funding rates`)
  }

  /**
   * Per-contract funding periods, where the venue publishes a table of them.
   *
   * Binance is the only one in the fleet that does, and its endpoint lists ONLY
   * the contracts that deviate from the venue's ordinary period — so an empty
   * answer is the normal answer and means "everything settles on the default",
   * not "the call failed". Failure is swallowed for the same reason: the period
   * falls back to the venue's declared one, which is right for all but a
   * handful of contracts, and refusing the whole snapshot over it would be a
   * worse trade.
   */
  private async fundingIntervals(
    exchange: CcxtFuturesExchangeLike,
  ): Promise<Map<string, number>> {
    if (this.intervals && this.now() - this.intervalsAt < RATES_TTL_MS) {
      return this.intervals
    }
    const out = new Map<string, number>()
    if (
      exchange.has['fetchFundingIntervals'] &&
      exchange.fetchFundingIntervals
    ) {
      try {
        for (const row of asRows(await exchange.fetchFundingIntervals())) {
          const symbol = str(row['symbol'])
          const hours = parseIntervalHours(row['interval'])
          if (symbol && hours) out.set(symbol, hours)
        }
      } catch {
        // See the header: the default period is the honest fallback.
      }
    }
    this.intervals = out
    this.intervalsAt = this.now()
    return out
  }

  private toRateEntry(
    exchange: CcxtFuturesExchangeLike,
    row: Record<string, unknown>,
    overrides: Map<string, number>,
  ): FundingRateEntry | null {
    const symbol = str(row['symbol'])
    const rate = num(row['fundingRate'])
    if (!symbol || rate === null) return null
    const market = marketOf(exchange, symbol)
    // A row for something that is not a linear perp is dropped rather than
    // rendered: Kraken's ticker feed carries its index and reference series,
    // which have a funding-shaped payload and no contract behind them.
    if (market && market['swap'] !== true) return null

    const pair = fromFuturesSymbol(symbol)
    const [base = '', quote = ''] = pair.split('-')
    const declared =
      overrides.get(symbol) ?? parseIntervalHours(row['interval'])
    return {
      pair,
      base: str(market?.['base']) || base,
      quote: str(market?.['quote']) || quote,
      fundingRate: rate,
      intervalHours: declared ?? this.defaultIntervalHours(),
      intervalKnown: declared !== null && declared !== undefined,
      ...optNum('nextFundingMs', row['fundingTimestamp']),
      ...optNum('markPrice', row['markPrice']),
      ...optNum('indexPrice', row['indexPrice']),
      ...optNum('predictedRate', row['nextFundingRate']),
      ...optNum('ts', row['timestamp']),
    }
  }

  private defaultIntervalHours(): number {
    return this.venue.fundingIntervalHours ?? 8
  }

  // ── Open interest ──────────────────────────────────────────────────────

  private async fetchOpenInterest(
    exchange: CcxtFuturesExchangeLike,
    request: OpenInterestRequest,
  ): Promise<OpenInterestResponse> {
    const symbols = request.pairs.slice(0, MAX_OI_SYMBOLS).map(toFuturesSymbol)
    const key = `${request.history ? 'h' : 'c'}:${symbols.slice().sort().join(',')}`
    const hit = this.openInterest.get(key)
    if (hit && this.now() - hit.at < OI_TTL_MS) return hit.value

    const rows = await this.readOpenInterest(exchange, symbols)
    if (rows === null) {
      const value: OpenInterestResponse = {
        market: this.venue.marketId,
        entries: [],
        supported: false,
        ts: this.now(),
      }
      this.openInterest.set(key, { at: this.now(), value })
      return value
    }

    const entries: Array<OpenInterestEntry> = []
    for (const row of rows) {
      const entry = toOpenInterestEntry(row, exchange)
      if (entry) entries.push(entry)
    }
    if (request.history) {
      await this.attachChange(exchange, entries)
    }
    const value: OpenInterestResponse = {
      market: this.venue.marketId,
      entries,
      supported: true,
      ts: this.now(),
    }
    this.openInterest.set(key, { at: this.now(), value })
    return value
  }

  /** Rows, or null when the venue publishes no open interest at all. */
  private async readOpenInterest(
    exchange: CcxtFuturesExchangeLike,
    symbols: Array<string>,
  ): Promise<Array<Record<string, unknown>> | null> {
    if (this.venue.openInterestFallback) {
      return this.venue.openInterestFallback(exchange, symbols)
    }
    if (exchange.has['fetchOpenInterests'] && exchange.fetchOpenInterests) {
      const all = asRows(await exchange.fetchOpenInterests(symbols))
      const wanted = new Set(symbols)
      return all.filter((row) => wanted.has(str(row['symbol'])))
    }
    if (exchange.has['fetchOpenInterest'] && exchange.fetchOpenInterest) {
      const fetchOne = exchange.fetchOpenInterest.bind(exchange)
      return settledRows(
        await mapWithConcurrency(symbols, REQUEST_CONCURRENCY, (symbol) =>
          fetchOne(symbol),
        ),
      )
    }
    return null
  }

  /**
   * Trailing 24h change, per symbol, from the venue's own OI series.
   *
   * A second call per symbol, which is why it is opt-in. Anything that fails or
   * comes back too short leaves `change24h` absent — a change bar nobody can
   * source is worse than no bar, because it is indistinguishable from a real
   * one.
   */
  private async attachChange(
    exchange: CcxtFuturesExchangeLike,
    entries: Array<OpenInterestEntry>,
  ): Promise<void> {
    if (
      !exchange.has['fetchOpenInterestHistory'] ||
      !exchange.fetchOpenInterestHistory
    ) {
      return
    }
    const fetchHistory = exchange.fetchOpenInterestHistory.bind(exchange)
    // 25 hourly buckets: the oldest is a shade over 24h back, so the first and
    // last samples bracket the window even when the venue drops a bucket.
    const since = this.now() - 25 * 3_600_000
    const changes = await mapWithConcurrency(
      entries,
      REQUEST_CONCURRENCY,
      async (entry) => {
        const rows = asRows(
          await fetchHistory(toFuturesSymbol(entry.pair), '1h', since, 25),
        )
        return { pair: entry.pair, change: changeOverSeries(rows) }
      },
    )
    const byPair = new Map<string, number>()
    for (const result of changes) {
      if (result.status !== 'fulfilled') continue
      if (result.value.change === null) continue
      byPair.set(result.value.pair, result.value.change)
    }
    for (const entry of entries) {
      const change = byPair.get(entry.pair)
      if (change !== undefined) entry.change24h = change
    }
  }

  // ── History ────────────────────────────────────────────────────────────

  private async fundingHistory(
    exchange: CcxtFuturesExchangeLike,
    request: FundingHistoryRequest,
  ): Promise<FundingHistoryResponse> {
    const limit = clamp(
      request.limit,
      DEFAULT_HISTORY_LIMIT,
      MAX_HISTORY_STAMPS,
    )
    const symbol = toFuturesSymbol(request.pair)
    const key = `${symbol}:${limit}`
    const hit = this.history.get(key)
    if (hit && this.now() - hit.at < HISTORY_TTL_MS) return hit.value

    if (
      !exchange.has['fetchFundingRateHistory'] ||
      !exchange.fetchFundingRateHistory
    ) {
      throw new Error(
        `${this.venue.displayName} publishes no funding history for ${request.pair}`,
      )
    }
    const points = await this.readHistory(
      exchange.fetchFundingRateHistory.bind(exchange),
      symbol,
      limit,
    )
    const overrides = await this.fundingIntervals(exchange)
    const value: FundingHistoryResponse = {
      market: this.venue.marketId,
      pair: fromFuturesSymbol(symbol),
      points,
      intervalHours: overrides.get(symbol) ?? this.defaultIntervalHours(),
      ts: this.now(),
    }
    this.history.set(key, { at: this.now(), value })
    return value
  }

  /**
   * Settled stamps, ascending, paged forward when one call cannot cover the
   * window.
   *
   * Every venue caps a single history call, and the caps are nowhere near a
   * month on an hourly clock: Kraken settles 720 times in thirty days and
   * serves a few hundred per request. So a request that fits in one call still
   * makes exactly one — the belt asks for the last 200 stamps and pays for
   * nothing else — and a request that does not walks forward from the start of
   * the window with `since`.
   *
   * Three things end the walk, and all three are real answers rather than
   * failures: enough stamps, a short page (the venue has no more), or a page
   * that added nothing new. That last one is the guard that matters — a venue
   * which ignores `since` would otherwise return its most recent page forever,
   * and the loop would spend its whole page budget re-reading it.
   */
  private async readHistory(
    fetchPage: (
      symbol?: string,
      since?: number,
      limit?: number,
    ) => Promise<unknown>,
    symbol: string,
    limit: number,
  ): Promise<Array<FundingHistoryPoint>> {
    const perCall = Math.min(limit, MAX_HISTORY_LIMIT)
    const byStamp = new Map<number, number>()

    if (limit <= MAX_HISTORY_LIMIT) {
      collectPoints(
        asRows(await fetchPage(symbol, undefined, perCall)),
        byStamp,
      )
    } else {
      let since = this.now() - HISTORY_WINDOW_MS
      for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
        const rows = asRows(await fetchPage(symbol, since, perCall))
        const before = byStamp.size
        const newest = collectPoints(rows, byStamp)
        if (rows.length < perCall) break
        if (byStamp.size === before || newest === null) break
        if (byStamp.size >= limit) break
        since = newest + 1
      }
    }

    const points: Array<FundingHistoryPoint> = []
    for (const [ts, rate] of byStamp) points.push({ ts, rate })
    points.sort((a, b) => a.ts - b.ts)
    // The most recent `limit` stamps: a venue that overshoots the window is
    // answering a longer history than the caller asked to rank against.
    return points.length > limit ? points.slice(points.length - limit) : points
  }
}

/**
 * Usable stamps into `into`, keyed by time; returns the newest stamp seen.
 *
 * Keyed rather than pushed because a paged read overlaps at the seam: the
 * venues are inclusive about `since` to varying degrees, and a duplicated
 * stamp would be counted twice by the percentile the rail computes.
 */
function collectPoints(
  rows: Array<Record<string, unknown>>,
  into: Map<number, number>,
): number | null {
  let newest: number | null = null
  for (const row of rows) {
    const ts = num(row['timestamp'])
    const rate = num(row['fundingRate'])
    if (ts === null || rate === null) continue
    into.set(ts, rate)
    if (newest === null || ts > newest) newest = ts
  }
  return newest
}

// ── Row mapping ──────────────────────────────────────────────────────────

function toOpenInterestEntry(
  row: Record<string, unknown>,
  exchange: CcxtFuturesExchangeLike,
): OpenInterestEntry | null {
  const symbol = str(row['symbol'])
  if (!symbol) return null
  const amount = num(row['openInterestAmount'])
  const value = num(row['openInterestValue'])
  if (amount === null && value === null) return null
  const pair = fromFuturesSymbol(symbol)
  const [base = ''] = pair.split('-')
  // The contract size travels WITH the count, because only the venue's own
  // market row knows it — a caller pricing 8,053,960 KuCoin contracts at the
  // mark without it reports a thousand times the real open interest.
  const contractSize = num(marketOf(exchange, symbol)?.['contractSize'])
  return {
    pair,
    base,
    ...(amount !== null ? { amount } : {}),
    ...(contractSize !== null && contractSize > 0 ? { contractSize } : {}),
    ...(value !== null ? { value } : {}),
    ...optNum('ts', row['timestamp']),
  }
}

/**
 * Fractional change between the ends of an open-interest series.
 *
 * Null unless both ends are usable: a series with one sample, or one whose
 * oldest sample is zero, has no change to report — and dividing by it would
 * publish `Infinity` as a percentage.
 */
export function changeOverSeries(
  rows: Array<Record<string, unknown>>,
): number | null {
  const values: Array<number> = []
  for (const row of rows) {
    const amount =
      num(row['openInterestAmount']) ?? num(row['openInterestValue'])
    if (amount !== null) values.push(amount)
  }
  if (values.length < 2) return null
  const first = values[0]
  const last = values[values.length - 1]
  if (!(first > 0)) return null
  return (last - first) / first
}

/**
 * Base assets → this venue's own contract symbols, one per asset.
 *
 * The alternative was for the caller to build `BASE-USDT-USDT` and hope, which
 * is exactly the guess the futures markets pipeline refuses to make anywhere
 * else: a venue names its contracts, and a symbol nobody lists comes back as a
 * BadSymbol several layers from the mistake. The caller's order is its ranking,
 * so it survives into the sweep and the cap trims from the bottom.
 */
export function resolveBaseSymbols(
  exchange: CcxtFuturesExchangeLike,
  bases: Array<string>,
): Array<string> {
  if (bases.length === 0) return []
  const wanted = new Set(bases.map((b) => b.toUpperCase()))
  const best = new Map<string, { symbol: string; rank: number }>()
  for (const [symbol, raw] of Object.entries(exchange.markets ?? {})) {
    if (!raw || typeof raw !== 'object') continue
    const market = raw as Record<string, unknown>
    if (market['swap'] !== true || market['linear'] !== true) continue
    if (market['active'] === false) continue
    const base = str(market['base']).toUpperCase()
    if (!wanted.has(base)) continue
    const rank = quoteRank(str(market['quote']).toUpperCase())
    const existing = best.get(base)
    if (existing && existing.rank <= rank) continue
    best.set(base, { symbol, rank })
  }
  const out: Array<string> = []
  for (const base of bases) {
    const hit = best.get(base.toUpperCase())
    if (hit) out.push(hit.symbol)
    if (out.length >= MAX_BASE_SWEEP) break
  }
  return out
}

function quoteRank(quote: string): number {
  const index = QUOTE_PREFERENCE.indexOf(quote)
  return index === -1 ? QUOTE_PREFERENCE.length : index
}

/**
 * `'8h'` → `8`. Null for anything that is not a whole-hour period.
 *
 * ccxt spells the period as a duration string on the venues that report one at
 * all, and the only values in the fleet are whole hours. A minute-scale period
 * would annualise to something the panes cannot render honestly, so it is
 * refused here rather than rounded to zero hours and divided by.
 */
export function parseIntervalHours(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null
  }
  if (typeof value !== 'string') return null
  const match = /^(\d+(?:\.\d+)?)h$/i.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  return Number.isFinite(hours) && hours > 0 ? hours : null
}

// ── Utils ────────────────────────────────────────────────────────────────

/**
 * Run `task` over `items` with at most `limit` in flight, never rejecting.
 *
 * `Promise.allSettled` on the whole list is the wrong shape here: these are
 * unauthenticated GETs sharing the chart's throttle budget, and firing twenty
 * at once pushes first paint behind the sweep. Results keep the input order so
 * a caller can pair them back up positionally.
 */
async function mapWithConcurrency<TIn, TOut>(
  items: Array<TIn>,
  limit: number,
  task: (item: TIn) => Promise<TOut>,
): Promise<Array<PromiseSettledResult<TOut>>> {
  const results = new Array<PromiseSettledResult<TOut>>(items.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = cursor++
        if (index >= items.length) return
        try {
          results[index] = {
            status: 'fulfilled',
            value: await task(items[index]),
          }
        } catch (reason) {
          results[index] = { status: 'rejected', reason }
        }
      }
    },
  )
  await Promise.all(workers)
  return results
}

/** The fulfilled rows of a settled batch; a venue's refusal drops its row. */
function settledRows(
  settled: Array<PromiseSettledResult<Record<string, unknown>>>,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) out.push(result.value)
  }
  return out
}

/** ccxt returns a symbol-keyed dict from the plural fetchers, a list elsewhere. */
function asRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, Record<string, unknown>>)
  }
  return []
}

function marketOf(
  exchange: CcxtFuturesExchangeLike,
  symbol: string,
): Record<string, unknown> | null {
  const market = exchange.markets?.[symbol]
  return market && typeof market === 'object'
    ? (market as Record<string, unknown>)
    : null
}

function clamp(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.min(Math.floor(value), max)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function optNum<TKey extends string>(
  key: TKey,
  value: unknown,
): Record<TKey, number> | Record<string, never> {
  const parsed = num(value)
  return parsed === null ? {} : ({ [key]: parsed } as Record<TKey, number>)
}
