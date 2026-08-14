// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Idle TTL fill: keep the local venue market tables fresh enough that the
 * instrument index can answer "which venues list this pair" without the App
 * Server. NOT a crawler — it rides the venues' existing
 * `market-data:ticker-snapshot` path, whose implementation already does
 * acquire → whenReady (loads/refreshes the market table) → touchIdle through
 * the venue's own exchange host. A second exchange instance would share
 * nothing and race the throttler the live panes depend on, so no exchange is
 * ever constructed here.
 *
 * Discipline: at most a couple of venues per run, stalest first; venues the
 * geo gate or platform gate refuses are skipped for the session; a venue
 * with live subscriptions was freshened by its own subscribe path already
 * (primeSync refreshes stale tables opportunistically). Run in the leader
 * window only — N windows would fetch N copies.
 */
import {
  MARKETS_TTL_MS,
  readCachedVenueListings,
} from '@pairlens/plugins/ccxt-connector'
import {
  isGeoRestrictedError,
  isPlatformRestrictedError,
} from '@pairlens/market-engine/errors'
import { isCorsConstrained } from '@pairlens/market-engine/platform'
import { rebuildLocalInstrumentIndex } from './local-index'
import type { PluginInstance } from '@pairlens/plugin-system/types'
import { getCountrySetting } from '@/lib/region-settings'

type ManagerLike = {
  getActivePlugins: () => Array<PluginInstance>
  execute: (
    capability: never,
    params: Record<string, unknown>,
  ) => Promise<unknown>
}

const INITIAL_DELAY_MS = 25_000
const INTERVAL_MS = 30 * 60_000
const MAX_VENUES_PER_RUN = 2

/** Venue connector plugins that can refresh their table via ticker-snapshot. */
function fillCandidates(
  plugins: Array<PluginInstance>,
): Array<{ plugin: PluginInstance; market: string }> {
  const out: Array<{ plugin: PluginInstance; market: string }> = []
  for (const plugin of plugins) {
    const caps = plugin.manifest.capabilities
    if (!caps.some((c) => c.id === 'market-data:ticker-snapshot')) continue
    // The venue id is the non-wildcard candles market — same rule the
    // market-data provider uses to identify a venue connector.
    const venueCap = caps.find(
      (c) => c.id === 'market-data:candles' && !c.markets.includes('*'),
    )
    const market = venueCap?.markets[0]
    if (!market) continue
    if (
      plugin.manifest.metadata?.['requiresDesktop'] === true &&
      isCorsConstrained()
    ) {
      continue
    }
    out.push({ plugin, market })
  }
  return out
}

export function startInstrumentIndexFill(manager: ManagerLike): () => void {
  let disposed = false
  /** Venues refused by the geo/platform gates — skip for the session. */
  const refused = new Set<string>()

  async function run(): Promise<void> {
    if (disposed) return
    try {
      const tables = await readCachedVenueListings()
      const savedAt = new Map(tables.map((t) => [t.venue, t.savedAt]))
      const now = Date.now()

      const stale = fillCandidates(manager.getActivePlugins())
        .filter(({ market }) => !refused.has(market))
        .filter(({ market }) => {
          const saved = savedAt.get(market)
          return saved === undefined || now - saved >= MARKETS_TTL_MS
        })
        // Missing tables (savedAt undefined → 0) first, then oldest.
        .sort(
          (a, b) => (savedAt.get(a.market) ?? 0) - (savedAt.get(b.market) ?? 0),
        )

      let refreshed = 0
      for (const { plugin, market } of stale) {
        if (disposed || refreshed >= MAX_VENUES_PER_RUN) break
        try {
          await plugin.execute({
            capability: 'market-data:ticker-snapshot',
            params: {},
            context: {
              pair: '',
              market,
              timeframe: '',
              mode: 'paper' as const,
              country: getCountrySetting(),
            },
          })
          refreshed++
        } catch (err) {
          if (isGeoRestrictedError(err) || isPlatformRestrictedError(err)) {
            refused.add(market)
          }
          // Transient venue errors just wait for the next run.
        }
      }

      if (refreshed > 0 && !disposed) {
        await rebuildLocalInstrumentIndex(manager)
      }
    } catch {
      // A background job surfaces nothing; the picker degrades to whatever
      // the index already holds.
    }
  }

  const initial = setTimeout(() => void run(), INITIAL_DELAY_MS)
  const interval = setInterval(() => void run(), INTERVAL_MS)
  return () => {
    disposed = true
    clearTimeout(initial)
    clearInterval(interval)
  }
}
