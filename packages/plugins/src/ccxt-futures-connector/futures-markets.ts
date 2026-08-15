// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Markets pipeline for linear perpetuals.
 *
 * A sibling of the spot pipeline (`ccxt-connector/markets.ts`), not a
 * parameterization of it, for two reasons that are both about safety rather
 * than taste:
 *
 * 1. **The cache key must not collide.** See `futuresMarketsCacheKey` in
 *    `listings.ts` — the spot table is keyed by exchange id alone, and one
 *    venue whose spot and futures ids converge would overwrite the other's
 *    table. The perp key is a different NAMESPACE, not a different value in
 *    the same one.
 * 2. **The trim inverts.** `trimMarkets` keeps rows with `spot === true` and
 *    stamps `spot: true` on what it stores. Feeding it a futures table returns
 *    an EMPTY array — not an error, just a venue that appears to list nothing.
 *
 * What is NOT forked is the synthetic-seed machinery, because futures venues
 * declare no `synthesizeMarket`. A contract's venue id is not derivable from
 * BASE/QUOTE with certainty on two of the three venues (KuCoin says `XBTUSDTM`
 * for BTC, Kraken says `PF_XBTUSD`), and a stand-in that resolves to a contract
 * that does not exist is worse than a first load. So the state machine here is
 * the honest one: cached table or nothing, with the venue's own `loadMarkets`
 * covering the cold profile.
 *
 * The cache's key scheme, storage backends and discovery reads live one file
 * over in `listings.ts`, which imports no runtime module — see its header.
 */

import {
  MARKETS_TTL_MS,
  asLimits,
  asNumberRecord,
} from '../ccxt-connector/markets'
import {
  defaultFuturesMarketsStorage,
  futuresMarketsCacheKey,
} from './listings'
import type { CcxtExchangeLike } from '../ccxt-connector/types'
import type { CcxtFuturesMarketSeed } from './futures-types'
import type { CachedFuturesMarkets, FuturesMarketsStorage } from './listings'

export {
  CCXT_FUTURES_VENUE_IDS,
  defaultFuturesMarketsStorage,
  futuresMarketsCacheKey,
  memoryFuturesMarketsStorage,
  readCachedFuturesListings,
} from './listings'
export type {
  CachedFuturesListings,
  CachedFuturesMarkets,
  FuturesListingRow,
  FuturesMarketsStorage,
} from './listings'

/** Venue payload keys the order path reads; the rest is the multi-MB part. */
const INFO_KEYS_KEPT = ['orderTypes', 'filters', 'status', 'contractType']

/**
 * One market row → the trimmed perp seed, or null if it is not one.
 *
 * The filter is the v1 scope, stated once: `swap` (perpetual, so no expiry to
 * roll), `linear` (collateral is the quote asset, so notional is money and the
 * risk guard's arithmetic holds) and NOT `index`. Index rows are the trap —
 * Kraken publishes `IN_XBTUSD`/`RR_XBTUSD` reference series as markets, they
 * carry `contract: true`, they have no book and no order path, and their
 * `symbol` is the raw id, which would produce a nonsense pair key.
 */
export function trimFuturesMarket(
  market: Record<string, unknown>,
): CcxtFuturesMarketSeed | null {
  if (market['swap'] !== true) return null
  if (market['linear'] !== true) return null
  if (market['index'] === true) return null

  const id = market['id']
  const symbol = market['symbol']
  const base = market['base']
  const quote = market['quote']
  const settle = market['settle']
  if (
    typeof id !== 'string' ||
    typeof symbol !== 'string' ||
    typeof base !== 'string' ||
    typeof quote !== 'string' ||
    typeof settle !== 'string'
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
    settle,
    ...(typeof market['lowercaseId'] === 'string'
      ? { lowercaseId: market['lowercaseId'] }
      : { lowercaseId: id.toLowerCase() }),
    ...(typeof market['baseId'] === 'string'
      ? { baseId: market['baseId'] }
      : {}),
    ...(typeof market['quoteId'] === 'string'
      ? { quoteId: market['quoteId'] }
      : {}),
    ...(typeof market['settleId'] === 'string'
      ? { settleId: market['settleId'] }
      : {}),
    type: 'swap',
    spot: false,
    swap: true,
    future: false,
    option: false,
    margin: false,
    index: false,
    contract: true,
    linear: true,
    inverse: false,
    active: market['active'] !== false,
    ...(typeof market['contractSize'] === 'number'
      ? { contractSize: market['contractSize'] }
      : {}),
    precision: asNumberRecord(market['precision']),
    limits: asLimits(market['limits']),
    info,
  }
}

/** Trim a whole `exchange.markets` table down to the linear perps we cache. */
export function trimFuturesMarkets(
  markets: Record<string, unknown>,
): Array<CcxtFuturesMarketSeed> {
  const out: Array<CcxtFuturesMarketSeed> = []
  for (const value of Object.values(markets)) {
    if (!value || typeof value !== 'object') continue
    const trimmed = trimFuturesMarket(value as Record<string, unknown>)
    if (trimmed) out.push(trimmed)
  }
  return out
}

/**
 * Per-venue perp markets cache with a synchronous hot path.
 *
 * `primeSync` runs inside `subscribe`, which cannot await, so the persisted
 * table is read into memory once (asynchronously, from construction) and
 * applied synchronously from then on. With no synthetic seeds there are only
 * two answers: the real table is in place, or the caller has to wait — and the
 * only caller that has to wait is a cold profile's very first subscribe, where
 * ccxt's own `loadMarkets` guard covers it.
 */
export class CcxtFuturesMarketsProvider {
  private cached: CachedFuturesMarkets | null = null
  private loading: Promise<CachedFuturesMarkets | null> | null = null
  private ready: Promise<void> | null = null
  /** The instance the in-flight refresh was started for. */
  private refreshingFor: CcxtExchangeLike | null = null
  /** The instance the current table was applied to — a rebuild needs its own. */
  private appliedTo: CcxtExchangeLike | null = null

  constructor(
    private readonly exchangeId: string,
    private readonly storage: FuturesMarketsStorage = defaultFuturesMarketsStorage(),
    private readonly ttlMs: number = MARKETS_TTL_MS,
  ) {
    // Start the read at construction, not at first use: construction happens at
    // plugin-load time, so it overlaps the venue's exchange-class import rather
    // than racing the first subscribe.
    void this.prefetch()
  }

  private get key(): string {
    return futuresMarketsCacheKey(this.exchangeId)
  }

  /** In-memory table, if the cache has already been read. */
  peek(): CachedFuturesMarkets | null {
    return this.cached
  }

  /** Warm the in-memory copy from storage. Safe to call repeatedly. */
  async prefetch(): Promise<CachedFuturesMarkets | null> {
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
   * Apply the cached table to `exchange` if there is one, and make sure a real
   * table is on its way either way.
   *
   * The background work is fire-and-forget AND explicitly caught: this runs
   * inside `subscribe`, so a venue that refuses the caller's region answers the
   * market load with a 451 and there is nobody left to hand the rejection to.
   * The AWAITED path (`whenReady`) keeps its rejection, which is where callers
   * classify it.
   */
  primeSync(exchange: CcxtExchangeLike): 'cache' | 'none' {
    if (this.appliedTo === exchange) return 'cache'

    const cached = this.cached
    if (cached && cached.markets.length > 0) {
      exchange.setMarkets(cached.markets)
      this.appliedTo = exchange
      if (Date.now() - cached.savedAt > this.ttlMs) {
        void this.refresh(exchange).catch(() => {})
      }
      return 'cache'
    }

    void this.prefetch()
      .then((stored) => {
        if (stored && stored.markets.length > 0) {
          this.applyPrefetched(exchange, stored)
        } else {
          void this.refresh(exchange).catch(() => {})
        }
      })
      .catch(() => {})
    return 'none'
  }

  /**
   * The storage read resolved after `primeSync` had already run. Apply it
   * unless a completed refresh got there first, or the instance was retired by
   * a rebuild — applying to a retired instance is harmless for the exchange but
   * would mislabel `appliedTo`.
   */
  private applyPrefetched(
    exchange: CcxtExchangeLike,
    stored: CachedFuturesMarkets,
  ): void {
    if (this.appliedTo === exchange) return
    if (this.appliedTo !== null) return
    exchange.setMarkets(stored.markets)
    this.appliedTo = exchange
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
   * Resolves once `exchange` holds a real market table. The trading path must
   * await this: without it `safeMarket` invents a symbol from the raw venue id
   * and an order would be sized against precision that is not the venue's.
   */
  async whenReady(exchange: CcxtExchangeLike): Promise<void> {
    if (this.appliedTo === exchange) return
    const cached = this.cached ?? (await this.prefetch())
    if (cached && cached.markets.length > 0) {
      exchange.setMarkets(cached.markets)
      this.appliedTo = exchange
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
   * instance's promise would resolve without ever loading the new one.
   *
   * The release runs in a `.finally` on the OUTER promise rather than inside
   * the body: a `loadMarkets` that throws synchronously (a venue that refuses
   * the region before it ever fetches) would settle the body before `this.ready`
   * had been assigned, so the ownership comparison could never hold, the slot
   * would stay pinned and every later refresh would be handed back the same
   * cached rejection — permanently, for the life of the plugin.
   */
  private refresh(exchange: CcxtExchangeLike): Promise<void> {
    if (this.ready && this.refreshingFor === exchange) return this.ready
    this.refreshingFor = exchange
    const run: Promise<void> = this.load(exchange).finally(() => {
      // Only the load that still owns the slot clears it — a superseded load
      // finishing late must not free a slot another run holds.
      if (this.refreshingFor === exchange && this.ready === run) {
        this.refreshingFor = null
      }
    })
    this.ready = run
    return run
  }

  private async load(exchange: CcxtExchangeLike): Promise<void> {
    await exchange.loadMarkets(true)
    const markets = exchange.markets
    if (!markets) return
    if (this.refreshingFor === exchange) this.appliedTo = exchange
    const trimmed = trimFuturesMarkets(markets)
    if (trimmed.length === 0) return
    const value: CachedFuturesMarkets = {
      savedAt: Date.now(),
      markets: trimmed,
    }
    this.cached = value
    await this.storage.set(this.key, value).catch(() => {})
  }
}
