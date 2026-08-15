// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Starter watchlists — a terminal that has never persisted a watchlist opens
 * with two curated lists (Top Crypto, Top Equities) so the pane shows live
 * markets instead of an empty state.
 *
 * They are ordinary lists: renameable, reorderable and deletable. Deleting one
 * writes the watchlists state, and seeding only ever runs when nothing is
 * persisted, so a removed starter never comes back.
 *
 * Symbols come from the bundled instrument catalog
 * (`packages/plugins/src/catalog.ts`) — anything listed here must exist there
 * or the row silently drops out of the pane.
 */
import { formatInstrumentRef } from '@pairlens/shared/market-ref'
import type { Watchlist } from '@pairlens/persistence'

import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'
import { emitWrite } from '@/lib/sync/sync-channel'

const ASSET_CLASS_MAP_KEY = 'pair-picker.assetClassMap'

export const TOP_CRYPTO_WATCHLIST_ID = 'starter-top-crypto'
export const TOP_EQUITIES_WATCHLIST_ID = 'starter-top-equities'

type StarterWatchlist = Watchlist & { assetClass: 'crypto' | 'stocks' }

const STARTER_WATCHLISTS: Array<StarterWatchlist> = [
  {
    id: TOP_CRYPTO_WATCHLIST_ID,
    name: 'Top Crypto',
    assetClass: 'crypto',
    symbols: [
      'BTC-USDT',
      'ETH-USDT',
      'SOL-USDT',
      'XRP-USDT',
      'BNB-USDT',
      'DOGE-USDT',
      'ADA-USDT',
      'AVAX-USDT',
    ],
  },
  {
    id: TOP_EQUITIES_WATCHLIST_ID,
    name: 'Top Equities',
    assetClass: 'stocks',
    // Bare tickers, the form both instrument catalogs serve for stocks. The
    // Alpaca connector accepts either, but a watchlist row only renders when
    // discovery resolves the symbol exactly.
    symbols: ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'SPY'],
  },
]

/**
 * Fresh copies of the starter lists, safe to hand to the store.
 *
 * Seeded as qualified refs rather than bare symbols, so a first-run list is
 * already in the format everything reads. Both starters are symbol-shaped
 * arms (spot and stocks), so the class above is all the qualification they
 * need; a token starter would have to carry its chain and address.
 */
export function createStarterLists(): Array<Watchlist> {
  return STARTER_WATCHLISTS.map(({ id, name, symbols, assetClass }) => ({
    id,
    name,
    symbols: symbols.map((symbol) =>
      formatInstrumentRef({
        cls: assetClass === 'stocks' ? 'stocks' : 'spot',
        id: symbol,
      }),
    ),
  }))
}

/**
 * Record each starter symbol's asset class, exactly as the pair pickers do
 * when a symbol is added by hand. Without it the terminal cannot tell
 * AAPL from a crypto pair and would try to chart it on a crypto venue.
 * Existing entries win — the map is the user's own routing history.
 */
export function seedStarterAssetClasses(): void {
  if (typeof localStorage === 'undefined') return
  const storageKey = `${STORAGE_PREFIX}${ASSET_CLASS_MAP_KEY}`
  try {
    const raw = localStorage.getItem(storageKey)
    const next = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    for (const list of STARTER_WATCHLISTS) {
      for (const symbol of list.symbols) {
        next[symbol] ??= list.assetClass
      }
    }
    localStorage.setItem(storageKey, JSON.stringify(next))
    emitWrite(ASSET_CLASS_MAP_KEY, next)
  } catch {
    // Storage unavailable (quota, private browsing): the lists still work,
    // stock rows just stay on the sticky venue until opened from a picker.
  }
}
