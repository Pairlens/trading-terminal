// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The local instrument index: an in-memory reverse index over the curated
 * catalog and the locally cached ccxt venue market tables. Every keystroke
 * in a picker reads this synchronously — network waves may only append or
 * annotate afterwards, never reorder what is already under the cursor.
 *
 * Precedence when sources disagree about a venue's listings:
 * live local data (the venue's own cached table) > server snapshot > nothing.
 * A venue absent from every source is "unknown", never "not listed".
 */
import {
  INSTRUMENTS_INDEX_SCHEMA_VERSION,
  instrumentIdentityKey,
} from '@pairlens/shared/instrument-types'
import {
  readCachedVenueListings,
  readCcxtKv,
} from '@pairlens/plugins/ccxt-connector'
import type {
  Instrument,
  InstrumentPage,
  InstrumentsIndexSnapshot,
} from '@pairlens/shared/instrument-types'

/** Minimal structural view of the plugin manager the index needs. */
type DiscoveryExecutor = {
  execute: (
    capability: never,
    params: Record<string, unknown>,
  ) => Promise<unknown>
}

export type IndexedInstrument = {
  inst: Instrument
  identity: string
  symbolLower: string
  baseLower: string
  nameLower: string
  /** venue marketId → venue-native market id, from LOCAL tables. */
  venues: Record<string, string>
  /** venue marketId → venue-native id, from the server snapshot only. */
  snapshotVenues: Record<string, string>
  curated: boolean
}

export type LocalInstrumentIndex = {
  builtAt: number
  entries: Array<IndexedInstrument>
  bySymbol: Map<string, IndexedInstrument>
  /** Which venues contributed a LOCAL table, and how fresh it was. */
  venueSavedAt: Record<string, number>
  /** Age of the merged server snapshot (ms epoch), if one was merged. */
  snapshotBuiltAt: number | null
}

export const INSTRUMENTS_SNAPSHOT_KV_KEY = `instruments-index:v${INSTRUMENTS_INDEX_SCHEMA_VERSION}`

let index: LocalInstrumentIndex | null = null
let version = 0
let building: Promise<void> | null = null
const listeners = new Set<() => void>()

export function getLocalInstrumentIndex(): LocalInstrumentIndex | null {
  return index
}

export function getLocalIndexVersion(): number {
  return version
}

export function subscribeLocalIndex(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publish(next: LocalInstrumentIndex): void {
  index = next
  version++
  for (const listener of listeners) listener()
}

/** Build once; concurrent callers share the in-flight build. */
export function ensureLocalInstrumentIndex(
  manager: DiscoveryExecutor,
): Promise<void> {
  if (index) return Promise.resolve()
  return rebuildLocalInstrumentIndex(manager)
}

export function rebuildLocalInstrumentIndex(
  manager: DiscoveryExecutor,
): Promise<void> {
  if (building) return building
  building = (async () => {
    try {
      const [catalog, venueTables, snapshot] = await Promise.all([
        fetchCatalog(manager),
        readCachedVenueListings().catch(() => []),
        readSnapshot(),
      ])
      publish(buildIndex(catalog, venueTables, snapshot))
    } finally {
      building = null
    }
  })()
  return building
}

async function fetchCatalog(
  manager: DiscoveryExecutor,
): Promise<Array<Instrument>> {
  try {
    const page = (await manager.execute('market-data:discovery' as never, {
      limit: 10_000,
    })) as InstrumentPage
    return Array.isArray(page?.items) ? page.items : []
  } catch {
    return []
  }
}

async function readSnapshot(): Promise<InstrumentsIndexSnapshot | null> {
  try {
    const raw = (await readCcxtKv(
      INSTRUMENTS_SNAPSHOT_KV_KEY,
    )) as InstrumentsIndexSnapshot | null
    // Unknown schema version → discard, never migrate.
    if (!raw || raw.schemaVersion !== INSTRUMENTS_INDEX_SCHEMA_VERSION) {
      return null
    }
    return raw
  } catch {
    return null
  }
}

function buildIndex(
  catalog: Array<Instrument>,
  venueTables: Awaited<ReturnType<typeof readCachedVenueListings>>,
  snapshot: InstrumentsIndexSnapshot | null,
): LocalInstrumentIndex {
  const bySymbol = new Map<string, IndexedInstrument>()
  const entries: Array<IndexedInstrument> = []

  function add(inst: Instrument, curated: boolean): IndexedInstrument {
    const entry: IndexedInstrument = {
      inst,
      identity: instrumentIdentityKey(inst),
      symbolLower: inst.symbol.toLowerCase(),
      baseLower: inst.base.toLowerCase(),
      nameLower: inst.name.toLowerCase(),
      venues: {},
      snapshotVenues: {},
      curated,
    }
    entries.push(entry)
    bySymbol.set(inst.symbol, entry)
    return entry
  }

  for (const inst of catalog) {
    // Catalog ids arrive market-stamped ('okx:BTC-USDT'); the index row is
    // market-neutral — the venue map is the routing information.
    if (bySymbol.has(inst.symbol)) continue
    add({ ...inst, id: inst.symbol, market: '' }, true)
  }

  // Server snapshot first (lower precedence), local tables after so a
  // venue's own table always overrides the snapshot for that venue.
  if (snapshot) {
    for (const row of snapshot.pairs) {
      let entry = bySymbol.get(row.symbol)
      if (!entry) {
        entry = add(
          {
            id: row.symbol,
            kind: 'cex-pair',
            market: '',
            symbol: row.symbol,
            name: row.base,
            base: row.base,
            quote: row.quote,
            assetClass: 'crypto',
            categories: [],
            rank: 1_000_000,
            featured: false,
          },
          false,
        )
      }
      if (entry.inst.kind !== 'cex-pair') continue
      Object.assign(entry.snapshotVenues, row.venues)
    }
  }

  const venueSavedAt: Record<string, number> = {}
  for (const table of venueTables) {
    venueSavedAt[table.venue] = table.savedAt
    for (const row of table.listings) {
      let entry = bySymbol.get(row.symbol)
      if (!entry) {
        entry = add(
          {
            id: row.symbol,
            kind: 'cex-pair',
            market: '',
            symbol: row.symbol,
            name: row.base,
            base: row.base,
            quote: row.quote,
            assetClass: 'crypto',
            categories: [],
            rank: 1_000_000,
            featured: false,
          },
          false,
        )
      }
      if (entry.inst.kind !== 'cex-pair') continue
      entry.venues[table.venue] = row.marketId
      // The local table is authoritative for its venue: drop any snapshot
      // claim so the merged view never double-counts or contradicts it.
      delete entry.snapshotVenues[table.venue]
    }
  }

  return {
    builtAt: Date.now(),
    entries,
    bySymbol,
    venueSavedAt,
    snapshotBuiltAt: snapshot?.builtAt ?? null,
  }
}

// ── Search ───────────────────────────────────────────────────────────────

export type LocalSearchResult = {
  /** Ranked copies whose `rank` is the display position — consumers that
   * sort by rank preserve this order exactly. */
  items: Array<Instrument>
  total: number
}

const EMPTY_RESULT: LocalSearchResult = { items: [], total: 0 }

/**
 * Tier-first ranking: exact symbol/base match > base or symbol prefix >
 * name prefix > substring. Within a tier: curated rank, then venue-listing
 * count, then symbol. This is what makes "PE" → PEPE feel right; a bare
 * `includes()` cannot.
 */
export function searchLocalInstruments(
  rawQuery: string,
  limit = 50,
): LocalSearchResult {
  const current = index
  if (!current) return EMPTY_RESULT
  const q = rawQuery.trim().toLowerCase()
  if (q.length === 0) return EMPTY_RESULT

  const tiers: [
    Array<IndexedInstrument>,
    Array<IndexedInstrument>,
    Array<IndexedInstrument>,
    Array<IndexedInstrument>,
  ] = [[], [], [], []]

  for (const entry of current.entries) {
    if (entry.symbolLower === q || entry.baseLower === q) tiers[0].push(entry)
    else if (entry.baseLower.startsWith(q) || entry.symbolLower.startsWith(q))
      tiers[1].push(entry)
    else if (entry.nameLower.startsWith(q)) tiers[2].push(entry)
    else if (entry.symbolLower.includes(q) || entry.nameLower.includes(q))
      tiers[3].push(entry)
  }

  let total = 0
  const picked: Array<IndexedInstrument> = []
  for (const tier of tiers) {
    tier.sort(compareWithinTier)
    total += tier.length
    for (const entry of tier) {
      if (picked.length < limit) picked.push(entry)
    }
  }

  const items = picked.map((entry, i) => ({ ...entry.inst, rank: i }))
  return { items, total }
}

function compareWithinTier(a: IndexedInstrument, b: IndexedInstrument): number {
  if (a.curated !== b.curated) return a.curated ? -1 : 1
  if (a.curated) {
    if (a.inst.rank !== b.inst.rank) return a.inst.rank - b.inst.rank
  }
  const aVenues = venueCount(a)
  const bVenues = venueCount(b)
  if (aVenues !== bVenues) return bVenues - aVenues
  return a.inst.symbol < b.inst.symbol
    ? -1
    : a.inst.symbol > b.inst.symbol
      ? 1
      : 0
}

function venueCount(entry: IndexedInstrument): number {
  return (
    Object.keys(entry.venues).length + Object.keys(entry.snapshotVenues).length
  )
}

// ── Listings lookup (badges, routing hints) ──────────────────────────────

export type SymbolListings = {
  /** Venues whose own local table lists the pair — the strongest claim. */
  local: Array<string>
  /** Venues only the server snapshot claims — "listed", weaker freshness. */
  snapshot: Array<string>
}

/**
 * Which venues list this pair, by evidence strength. `null` means the index
 * has no entry — unknown, never "not listed". Negative claims must come from
 * a venue's own published table, and only for venues present in `local`.
 */
export function getSymbolListings(symbol: string): SymbolListings | null {
  const entry = index?.bySymbol.get(symbol)
  if (!entry) return null
  return {
    local: Object.keys(entry.venues),
    snapshot: Object.keys(entry.snapshotVenues),
  }
}
