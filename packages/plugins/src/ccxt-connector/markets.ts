// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Markets pipeline — the reason a ccxt chart can paint as fast as a native one.
 *
 * Every ccxt `watch*`/`fetch*` guards with `if (this.markets === undefined)
 * await this.loadMarkets()`, and `loadMarkets` is expensive in a way that lands
 * squarely on first paint: Binance issues up to six parallel `exchangeInfo`
 * calls and parses 3 680 markets (multi-MB, on the main thread), OKX four
 * `instruments` calls for 1 337. That is seconds of blank chart on a venue
 * switch, every switch.
 *
 * `setMarkets()` is synchronous, public, and makes `loadMarkets()` return
 * without touching the network (verified: `markets` and `markets_by_id` both
 * truthy short-circuits `loadMarketsHelper`). So the pipeline is:
 *
 *   cache hit   → setMarkets(trimmed) synchronously, subscribe immediately,
 *                 refresh in the background when older than TTL
 *   cache miss  → seed one synthetic market for the pair being subscribed so
 *                 the socket opens now, and swap in the real table when the
 *                 background load lands
 *
 * The synthetic seed is why a cold profile does not wait either. It is only
 * offered by venues whose market id is derivable from BASE/QUOTE with
 * certainty (Binance `BTCUSDT`, OKX `BTC-USDT`); everything else waits for the
 * real load. It carries no usable precision or limits, so the trading path
 * must await `whenReady()` before sizing an order — reads do not care.
 *
 * Trimming matters for the cache, not for correctness: `setMarkets` deep-extends
 * each entry over `safeMarketStructure()` and fills every absent flag, so the
 * stored rows only need what symbol resolution, precision, limits and order
 * placement actually read.
 */

import type { CcxtExchangeLike, CcxtMarketSeed } from './types'

/**
 * Bump when the trimmed shape changes — it is part of the cache key, so old
 * rows are ignored rather than migrated.
 */
const MARKETS_SCHEMA_VERSION = 1

/** Refresh a cached table older than this, in the background. */
export const MARKETS_TTL_MS = 24 * 60 * 60 * 1000

const DB_NAME = 'pairlens-ccxt'
const STORE_NAME = 'markets'

export type CachedMarkets = {
  savedAt: number
  markets: Array<CcxtMarketSeed>
}

/**
 * Async key/value store for cached market tables. Injectable so the CLI and
 * the tests run on an in-memory map with no IndexedDB in sight.
 */
export type MarketsStorage = {
  get: (key: string) => Promise<CachedMarkets | null>
  set: (key: string, value: CachedMarkets) => Promise<void>
}

/**
 * The fields `setMarkets` needs, and nothing else.
 *
 * - `id` / `symbol` / `base` / `quote` drive `markets_by_id`, `safeMarket` and
 *   `marketId`; `baseId`/`quoteId` because several venues build request
 *   payloads from them rather than splitting the symbol.
 * - `lowercaseId` is required by Binance (`watchOHLCVForSymbols` throws
 *   `ArgumentsRequired` without it) and by HTX.
 * - `spot: true` auto-fills contract/swap/future/option/index as false.
 * - `precision` is interpreted through `exchange.precisionMode` — tick sizes on
 *   thirteen venues, significant digits on Bitfinex. Stored verbatim; never
 *   reinterpreted here.
 * - `info` is the raw venue payload. Binance reads `info.orderTypes` in
 *   `createOrder` and throws `InvalidOrder` without it, so it is kept — but
 *   pruned to the keys the order path actually reads, because the untrimmed
 *   payload is most of the multi-MB download.
 */
const INFO_KEYS_KEPT = ['orderTypes', 'filters', 'status', 'permissions']

export function trimMarket(
  market: Record<string, unknown>,
): CcxtMarketSeed | null {
  const id = market['id']
  const symbol = market['symbol']
  const base = market['base']
  const quote = market['quote']
  if (
    typeof id !== 'string' ||
    typeof symbol !== 'string' ||
    typeof base !== 'string' ||
    typeof quote !== 'string'
  ) {
    return null
  }

  const rawInfo = market['info']
  const info: Record<string, unknown> = {}
  if (rawInfo && typeof rawInfo === 'object') {
    for (const key of INFO_KEYS_KEPT) {
      const value = (rawInfo as Record<string, unknown>)[key]
      if (value !== undefined) info[key] = value
    }
  }

  return {
    id,
    symbol,
    base,
    quote,
    ...(typeof market['lowercaseId'] === 'string'
      ? { lowercaseId: market['lowercaseId'] }
      : { lowercaseId: id.toLowerCase() }),
    ...(typeof market['baseId'] === 'string'
      ? { baseId: market['baseId'] }
      : {}),
    ...(typeof market['quoteId'] === 'string'
      ? { quoteId: market['quoteId'] }
      : {}),
    type: 'spot',
    spot: true,
    active: market['active'] !== false,
    precision: asNumberRecord(market['precision']),
    limits: asLimits(market['limits']),
    info,
  }
}

/** Trim a whole `exchange.markets` table down to the spot rows we cache. */
export function trimMarkets(
  markets: Record<string, unknown>,
): Array<CcxtMarketSeed> {
  const out: Array<CcxtMarketSeed> = []
  for (const value of Object.values(markets)) {
    if (!value || typeof value !== 'object') continue
    const market = value as Record<string, unknown>
    if (market['spot'] !== true) continue
    const trimmed = trimMarket(market)
    if (trimmed) out.push(trimmed)
  }
  return out
}

/**
 * Per-venue markets cache with a synchronous hot path.
 *
 * `primeSync` is the one that matters: it is called from `subscribe`, which
 * must not await, so the cached table is read into memory once (asynchronously,
 * on the first touch) and applied synchronously from then on.
 */
export class CcxtMarketsProvider {
  private cached: CachedMarkets | null = null
  private loading: Promise<CachedMarkets | null> | null = null
  private ready: Promise<void> | null = null
  /** The instance the in-flight `ready` refresh was started for. */
  private refreshingFor: CcxtExchangeLike | null = null
  /** The instance the current table was applied to — a rebuild needs its own. */
  private appliedTo: CcxtExchangeLike | null = null
  /** True while `appliedTo` holds stand-in markets rather than the real table. */
  private synthetic = false
  private seeds = new Map<string, CcxtMarketSeed>()

  constructor(
    private readonly exchangeId: string,
    private readonly storage: MarketsStorage = defaultMarketsStorage(),
    private readonly ttlMs: number = MARKETS_TTL_MS,
  ) {
    // Start the storage read at construction, not at first use: the first
    // `primeSync` of a session otherwise always misses the in-memory copy and
    // pays a forced network load for a table that is sitting in IndexedDB.
    // Construction happens at plugin-load time, so the read overlaps the
    // venue's exchange-class import instead of racing it.
    void this.prefetch()
  }

  private get key(): string {
    return `${this.exchangeId}:v${MARKETS_SCHEMA_VERSION}`
  }

  /** In-memory table, if the cache has already been read. */
  peek(): CachedMarkets | null {
    return this.cached
  }

  /** Warm the in-memory copy from storage. Safe to call repeatedly. */
  async prefetch(): Promise<CachedMarkets | null> {
    if (this.cached) return this.cached
    if (!this.loading) {
      this.loading = this.storage
        .get(this.key)
        .catch(() => null)
        .then((value) => {
          if (value && value.markets.length > 0) this.cached = value
          return this.cached
        })
    }
    return this.loading
  }

  /**
   * Seed `exchange` so no ccxt call blocks on a network `loadMarkets`.
   *
   * Returns 'cache' when the real table is in place, 'synthetic' when only
   * stand-ins are, and 'none' when neither was possible (the caller then has to
   * await `whenReady`). Always kicks off whatever background work is needed to
   * reach a real table.
   *
   * The background loads are fire-and-forget AND explicitly `.catch`ed. Not
   * defensive noise: `primeSync` runs inside `subscribe`, which cannot await,
   * so a venue that refuses the caller's region answers the market load with a
   * 451 and there is nobody left to hand the rejection to. Unhandled, it
   * reaches the terminal as a console error — or, in the Tauri webview, an
   * overlay — for a condition the geo gate has already reported properly. The
   * AWAITED path (`whenReady`) keeps its rejection, which is where callers
   * classify it.
   *
   * Ordering matters here: a second synthetic seed arriving after the
   * background load resolved must NOT `setMarkets` over the real table, which
   * is why `synthetic` is tracked explicitly rather than inferred from
   * `exchange.markets === undefined`.
   */
  primeSync(
    exchange: CcxtExchangeLike,
    seed: CcxtMarketSeed | null,
  ): 'cache' | 'synthetic' | 'none' {
    // Only THIS instance's real table counts — `exchange.markets !== undefined`
    // alone would let a fresh instance carrying a stand-in inherit another
    // instance's 'real' flag after a mid-load rebuild.
    if (this.appliedTo === exchange && !this.synthetic) return 'cache'

    const cached = this.cached
    if (cached && cached.markets.length > 0) {
      exchange.setMarkets(cached.markets)
      this.appliedTo = exchange
      this.synthetic = false
      this.seeds.clear()
      if (Date.now() - cached.savedAt > this.ttlMs) {
        void this.refresh(exchange).catch(() => {})
      }
      return 'cache'
    }

    // No in-memory table yet. The persisted-vs-network decision waits for the
    // storage read this class kicked off at construction — refreshing here
    // unconditionally is what made the cache-hit path unreachable on every
    // session's first subscribe. The synthetic seed below keeps this call
    // synchronous either way.
    void this.prefetch()
      .then((stored) => {
        if (stored && stored.markets.length > 0) {
          this.applyPrefetched(exchange, stored)
        } else {
          void this.refresh(exchange).catch(() => {})
        }
      })
      .catch(() => {})

    if (seed) {
      if (this.appliedTo !== exchange) {
        this.seeds.clear()
        this.appliedTo = exchange
      }
      this.synthetic = true
      if (!this.seeds.has(seed.symbol)) {
        this.seeds.set(seed.symbol, seed)
        exchange.setMarkets([...this.seeds.values()])
      }
      return 'synthetic'
    }
    return 'none'
  }

  /**
   * A storage read resolved after `primeSync` had already seeded (or skipped)
   * this instance. Swap the persisted table in unless the instance has moved
   * on: a real table (a completed refresh, or an earlier arrival of this same
   * callback) must not be clobbered, and an instance retired by a rebuild is
   * not ours to touch — applying to it would be harmless for the exchange but
   * would mislabel `appliedTo`.
   */
  private applyPrefetched(
    exchange: CcxtExchangeLike,
    stored: CachedMarkets,
  ): void {
    if (this.appliedTo === exchange && !this.synthetic) return
    if (this.appliedTo !== null && this.appliedTo !== exchange) return
    exchange.setMarkets(stored.markets)
    this.appliedTo = exchange
    this.synthetic = false
    this.seeds.clear()
    if (Date.now() - stored.savedAt > this.ttlMs) {
      void this.refresh(exchange).catch(() => {})
    }
  }

  /** True when `exchange` can resolve `symbol` right now. */
  hasSymbol(exchange: CcxtExchangeLike, symbol: string): boolean {
    const markets = exchange.markets
    return markets !== undefined && markets[symbol] !== undefined
  }

  /**
   * Resolves once `exchange` holds a REAL (non-synthetic) market table.
   * The trading path and the bulk ticker snapshot must await this — a
   * stand-in table would make `safeMarket` invent symbols for every row it
   * cannot resolve. The candle/ticker/book read path does not.
   *
   * The persisted cache satisfies this even over a synthetic seed: the cached
   * rows ARE a real table (trimmed precision/limits included), and falling
   * through to a network reload here was the second half of the cold-start
   * cache bypass. A stale-but-present table is applied and refreshed in the
   * background, same as `primeSync`.
   */
  async whenReady(exchange: CcxtExchangeLike): Promise<void> {
    if (this.appliedTo === exchange && !this.synthetic) return
    const cached = this.cached ?? (await this.prefetch())
    if (cached && cached.markets.length > 0) {
      if (this.appliedTo !== exchange || this.synthetic) {
        exchange.setMarkets(cached.markets)
        this.appliedTo = exchange
        this.synthetic = false
        this.seeds.clear()
      }
      if (Date.now() - cached.savedAt > this.ttlMs) {
        void this.refresh(exchange).catch(() => {})
      }
      return
    }
    await this.refresh(exchange)
  }

  /**
   * Pull the venue's market table and cache the trimmed copy.
   *
   * Deduped PER INSTANCE: several subscriptions racing on a cold profile share
   * one load, but a rebuilt instance must get its own — sharing the retired
   * instance's promise would resolve without ever loading the new one, and the
   * completion below would then mark the new instance's stand-in table as real
   * forever. `loadMarkets(true)` is a FORCED reload — a synthetic seed already
   * made `markets` truthy, and ccxt's own guard would otherwise short-circuit
   * to a no-op and leave the stand-in table in place.
   */
  private refresh(exchange: CcxtExchangeLike): Promise<void> {
    if (this.ready && this.refreshingFor === exchange) return this.ready
    this.refreshingFor = exchange
    // Initialized before the IIFE so the `finally` can compare against it —
    // the body only reaches the comparison after its first await, by which
    // point the assignment below has run.
    let run: Promise<void> | null = null
    run = (async () => {
      try {
        await exchange.loadMarkets(true)
        const markets = exchange.markets
        if (!markets) return
        // A load superseded by a rebuilt instance's own refresh still caches
        // its (current) table below, but the applied-state flags belong to the
        // load that owns the slot — adopting a retired instance here is what
        // used to mark the live instance's stand-in table as real.
        if (this.refreshingFor === exchange) {
          this.appliedTo = exchange
          this.synthetic = false
          this.seeds.clear()
        }
        const trimmed = trimMarkets(markets)
        if (trimmed.length === 0) return
        const value: CachedMarkets = { savedAt: Date.now(), markets: trimmed }
        this.cached = value
        await this.storage.set(this.key, value).catch(() => {})
      } finally {
        // Only the load that still owns the slot clears it — a superseded
        // load finishing late must not free a slot another instance holds.
        if (this.refreshingFor === exchange && this.ready === run) {
          this.refreshingFor = null
        }
      }
    })()
    this.ready = run
    return run
  }
}

// ── Storage backends ─────────────────────────────────────────────────────

/** In-memory fallback — the CLI, tests, and any environment without IDB. */
export function memoryMarketsStorage(): MarketsStorage {
  const map = new Map<string, CachedMarkets>()
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value)
    },
  }
}

/**
 * IndexedDB, because a trimmed Binance table is ~1 MB of structured data and
 * localStorage would both blow its quota and cost a synchronous JSON parse on
 * the main thread at exactly the moment we are trying to paint.
 */
export function indexedDbMarketsStorage(): MarketsStorage {
  let dbPromise: Promise<IDBDatabase> | null = null

  function open(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME)
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }
    return dbPromise
  }

  return {
    get: async (key) => {
      const db = await open()
      return new Promise<CachedMarkets | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const request = tx.objectStore(STORE_NAME).get(key)
        request.onsuccess = () =>
          resolve((request.result as CachedMarkets | undefined) ?? null)
        request.onerror = () => reject(request.error)
      })
    },
    set: async (key, value) => {
      const db = await open()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
  }
}

/** IndexedDB where it exists, an in-memory map everywhere else. */
export function defaultMarketsStorage(): MarketsStorage {
  if (typeof indexedDB === 'undefined') return memoryMarketsStorage()
  try {
    return indexedDbMarketsStorage()
  } catch {
    return memoryMarketsStorage()
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function asNumberRecord(value: unknown): { amount?: number; price?: number } {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  const out: { amount?: number; price?: number } = {}
  if (typeof record['amount'] === 'number') out.amount = record['amount']
  if (typeof record['price'] === 'number') out.price = record['price']
  return out
}

function asLimits(
  value: unknown,
): Record<string, { min?: number; max?: number }> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, { min?: number; max?: number }> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue
    const bounds = entry as Record<string, unknown>
    const trimmed: { min?: number; max?: number } = {}
    if (typeof bounds['min'] === 'number') trimmed.min = bounds['min']
    if (typeof bounds['max'] === 'number') trimmed.max = bounds['max']
    out[key] = trimmed
  }
  return out
}
