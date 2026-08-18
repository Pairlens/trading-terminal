// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The READ half of the perp markets cache: its key scheme, its storage
 * backends, and the listing rows discovery reads out of it.
 *
 * Split out of `futures-markets.ts` for the bundle graph, not for tidiness. The
 * terminal's instrument index and its contract-size map want "which perps does
 * each venue list" and nothing else — but importing that through the connector
 * barrel drags the whole futures RUNTIME (the CEX shell, the exchange host, the
 * watch driver, the private stream, ccxt's REST helpers) into the main chunk,
 * which is exactly the code a deployment that excludes the `cex-futures` family
 * ships zero of. Nothing here may import a runtime module; the separability
 * test in `__tests__` fails if one appears.
 */

import { readCcxtKv, writeCcxtKv } from '../ccxt-connector/markets'
import { fromFuturesSymbol } from './futures-symbols'
import type { CcxtFuturesMarketSeed } from './futures-types'

/**
 * Bump when the trimmed shape changes — it is part of the key, so old rows are
 * ignored rather than migrated.
 */
const FUTURES_MARKETS_SCHEMA_VERSION = 1

/**
 * Namespaced away from the spot table's `${exchangeId}:v2`.
 *
 * The spot key is the exchange id ALONE. Binance spot and Binance USD-M are
 * different ccxt ids (`binance` / `binanceusdm`) so they happen not to collide
 * today, but KuCoin's futures class answers to `kucoinfutures` while sharing
 * every REST helper with `kucoin`, and one venue whose ids converge would
 * overwrite a 3 680-row spot table with a perp one.
 */
export function futuresMarketsCacheKey(exchangeId: string): string {
  return `${exchangeId}:swap:v${FUTURES_MARKETS_SCHEMA_VERSION}`
}

export type CachedFuturesMarkets = {
  savedAt: number
  markets: Array<CcxtFuturesMarketSeed>
}

export type FuturesMarketsStorage = {
  get: (key: string) => Promise<CachedFuturesMarkets | null>
  set: (key: string, value: CachedFuturesMarkets) => Promise<void>
}

/** In-memory fallback — tests and any environment without IndexedDB. */
export function memoryFuturesMarketsStorage(): FuturesMarketsStorage {
  const map = new Map<string, CachedFuturesMarkets>()
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value)
    },
  }
}

/**
 * The shared `pairlens-ccxt` IndexedDB store, through the generic KV the spot
 * module already exposes. Same database, same object store, its own key
 * namespace — a second database would mean a second upgrade transaction to
 * block on in a multi-tab app, for no isolation that the key does not already
 * provide. Degrades to an in-memory map with no IndexedDB, which is what makes
 * this the CLI's storage too.
 */
export function defaultFuturesMarketsStorage(): FuturesMarketsStorage {
  return {
    get: async (key) => {
      const value = await readCcxtKv(key)
      return isCachedFuturesMarkets(value) ? value : null
    },
    set: async (key, value) => {
      await writeCcxtKv(key, value)
    },
  }
}

function isCachedFuturesMarkets(value: unknown): value is CachedFuturesMarkets {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record['savedAt'] === 'number' && Array.isArray(record['markets'])
  )
}

/**
 * Every bundled futures venue, by ccxt exchange id — which is also the cache
 * key prefix. Pairlens market ids differ (`binance-futures`), so the two are
 * mapped rather than assumed equal, unlike the spot fleet.
 */
export const CCXT_FUTURES_VENUE_IDS: ReadonlyArray<{
  /** ccxt exchange id, and the cache key prefix. */
  exchangeId: string
  /** Pairlens market id. */
  marketId: string
}> = [
  { exchangeId: 'binanceusdm', marketId: 'binance-futures' },
  // Same ccxt class as the spot venues — the `:swap:` namespace in the cache
  // key is what keeps these rows from colliding with spot's `bybit`/`okx`.
  { exchangeId: 'bybit', marketId: 'bybit-futures' },
  { exchangeId: 'okx', marketId: 'okx-futures' },
  { exchangeId: 'kucoinfutures', marketId: 'kucoin-futures' },
  { exchangeId: 'krakenfutures', marketId: 'kraken-futures' },
]

export type FuturesListingRow = {
  /** Three-segment pair key, `BASE-QUOTE-SETTLE`. */
  symbol: string
  base: string
  quote: string
  settle: string
  /** Venue-native contract id (ccxt `market.id`) — identity without parsing. */
  marketId: string
  /** Base units per contract, where the venue publishes one. */
  contractSize?: number
}

export type CachedFuturesListings = {
  /** Pairlens market id (`binance-futures`), not the ccxt exchange id. */
  venue: string
  /** Epoch ms the venue's table was last persisted. */
  savedAt: number
  listings: Array<FuturesListingRow>
}

/**
 * Read the locally cached perp tables and trim them to listing rows.
 *
 * Purely a cache read: never constructs an exchange, never fetches. A venue
 * with no cached table is simply absent — absence means "unknown", not "lists
 * nothing". The spot `readCachedVenueListings` cannot serve this: it reads the
 * spot key and emits two-segment symbols.
 */
export async function readCachedFuturesListings(
  venues: ReadonlyArray<{
    exchangeId: string
    marketId: string
  }> = CCXT_FUTURES_VENUE_IDS,
  storage: FuturesMarketsStorage = defaultFuturesMarketsStorage(),
): Promise<Array<CachedFuturesListings>> {
  const out: Array<CachedFuturesListings> = []
  await Promise.all(
    venues.map(async ({ exchangeId, marketId }) => {
      try {
        const cached = await storage.get(futuresMarketsCacheKey(exchangeId))
        if (!cached || cached.markets.length === 0) return
        const listings: Array<FuturesListingRow> = []
        for (const seed of cached.markets) {
          if (seed.active === false) continue
          if (!seed.base || !seed.quote || !seed.settle) continue
          listings.push({
            symbol: fromFuturesSymbol(seed.symbol),
            base: seed.base,
            quote: seed.quote,
            settle: seed.settle,
            marketId: seed.id,
            ...(typeof seed.contractSize === 'number'
              ? { contractSize: seed.contractSize }
              : {}),
          })
        }
        out.push({ venue: marketId, savedAt: cached.savedAt, listings })
      } catch {
        // Unreadable rows degrade to "unknown" for that venue.
      }
    }),
  )
  return out
}
