// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The last answer the expensive DEX Discovery reads gave, kept across reloads.
 *
 * Everything on that board comes from one provider on a ~25-request-a-minute
 * budget, paced to roughly one request every 1.2 seconds. React Query caches
 * the answers beautifully for as long as the tab lives, and loses every one of
 * them on reload — so a board that had been open for an hour reopened as cold
 * as a first visit, spending ten paced requests to redraw tiles it had already
 * drawn. This is the layer under that: a chain's ranked pools and the rail's
 * chain aggregates survive a reload, paint immediately, and revalidate behind
 * the reader rather than in front of them.
 *
 * Three rules keep it honest.
 *
 * It only ever holds SLOW-MOVING reads. A chain's top pools reorder over hours
 * and a chain's 24h volume over a day; both are worth showing a few minutes old
 * while a fresh copy is in flight. The swap tape is not, and is not cached
 * here: a fifteen-second tape restored from disk would draw an hour-old flow
 * chart as if it were live.
 *
 * A snapshot never outlives `DISCOVERY_SNAPSHOT_TTL_MS`. Past that it is not
 * served at all, because a 24h volume figure from yesterday is not a stale
 * reading of today's, it is a different number wearing today's label.
 *
 * And it is a paint, not an answer. Every snapshot is handed to React Query as
 * `initialData` with the timestamp it was written at, which is always older
 * than the query's own stale window, so the query refetches on mount every
 * time. The reader sees numbers instantly and the correct ones a moment later.
 */

/** One key for the whole store: a board holds a handful of entries, not rows. */
const STORAGE_KEY = 'pairlens:dex-discovery-cache'

/**
 * How old a snapshot may be and still be painted.
 *
 * Half an hour. Long enough to cover a reload, a restart, or a tab reopened
 * after lunch; short enough that nothing here is ever a different day's
 * trading. The query it seeds refetches immediately regardless.
 */
export const DISCOVERY_SNAPSHOT_TTL_MS = 30 * 60_000

/**
 * Entries kept. The board reads at most a listing and an aggregate row per
 * chain, so this covers browsing several chains and still bounds the blob.
 */
const MAX_ENTRIES = 12

/**
 * Ceiling on the serialized store.
 *
 * localStorage is a few megabytes for the WHOLE origin, shared with the
 * credential vault, the layout store and every workspace. A discovery cache
 * that grew without a bound would eventually throw someone's saved board away,
 * so the newest entries are kept and the rest dropped.
 */
const MAX_BYTES = 400_000

type Entry = { ts: number; data: unknown }

/**
 * The parsed store, loaded once.
 *
 * Reads happen inside `initialData` during render, so they have to be free.
 * Parsing four hundred kilobytes of JSON on every render of a pane that
 * re-renders on every listing refresh is not free; parsing it once on the first
 * read is.
 */
let entries: Map<string, Entry> | null = null
let flushHandle: ReturnType<typeof setTimeout> | null = null

function storage(): Storage | null {
  try {
    // Absent during SSR and in a locked-down browser profile. Either way the
    // board still works, it just opens cold.
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function load(): Map<string, Entry> {
  if (entries) return entries
  entries = new Map()
  const store = storage()
  if (!store) return entries
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return entries
    const parsed = JSON.parse(raw) as Record<string, Entry> | null
    if (!parsed || typeof parsed !== 'object') return entries
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && typeof entry.ts === 'number') entries.set(key, entry)
    }
  } catch {
    // Corrupt or written by an older shape. An unreadable cache is a cold
    // board, never a broken one.
    entries = new Map()
  }
  return entries
}

/**
 * Write the store out, newest entries first, trimmed to both caps.
 *
 * Debounced onto a timer because writes arrive in bursts: a board opening
 * settles a listing and an aggregate row within a second of each other, and
 * `JSON.stringify` over the whole store is the expensive half of this module.
 */
function scheduleFlush(): void {
  if (flushHandle !== null) return
  flushHandle = setTimeout(() => {
    flushHandle = null
    flush()
  }, 500)
}

function flush(): void {
  const store = storage()
  const map = load()
  if (!store) return

  const ordered = Array.from(map.entries()).sort((a, b) => b[1].ts - a[1].ts)
  let kept = ordered.slice(0, MAX_ENTRIES)

  for (;;) {
    const payload = JSON.stringify(Object.fromEntries(kept))
    if (payload.length <= MAX_BYTES || kept.length <= 1) {
      try {
        store.setItem(STORAGE_KEY, payload)
      } catch {
        // Quota, or a private-mode profile that refuses writes. Dropping the
        // cache is the correct failure: nothing here is the source of truth.
        try {
          store.removeItem(STORAGE_KEY)
        } catch {
          // Nothing left to try.
        }
      }
      // Keep memory and disk agreed, so a trimmed entry is not served from
      // memory for the rest of the session and then found missing on reload.
      entries = new Map(kept)
      return
    }
    kept = kept.slice(0, kept.length - 1)
  }
}

/**
 * The snapshot stored under `key`, or null when there is none or it is stale.
 *
 * The timestamp comes back with the data because the caller needs it: React
 * Query's `initialDataUpdatedAt` is what tells it the seed is old and a refetch
 * is due. Without it a snapshot would be treated as fresh and the board would
 * happily show half-hour-old volume with nothing in flight.
 */
export function readDiscoverySnapshot<T>(
  key: string,
  ttlMs: number = DISCOVERY_SNAPSHOT_TTL_MS,
): { data: T; ts: number } | null {
  const entry = load().get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > ttlMs) return null
  return { data: entry.data as T, ts: entry.ts }
}

/**
 * Record the freshest answer for `key`. Cheap; the disk write is debounced.
 *
 * `ts` is the caller's own measurement time, not ours, and it must be: a query
 * seeded FROM a snapshot re-offers that same data back here on its first
 * render, and stamping it with the clock would refresh its age without anything
 * having been measured. A snapshot that renews its own timestamp never expires,
 * which is how an offline board ends up presenting yesterday's ranking as
 * half an hour old, forever. Passing React Query's `dataUpdatedAt` through
 * keeps the age tied to the fetch that produced the numbers.
 */
export function writeDiscoverySnapshot(
  key: string,
  data: unknown,
  ts: number = Date.now(),
): void {
  if (data === undefined || data === null) return
  if (!Number.isFinite(ts) || ts <= 0) return
  const map = load()
  const existing = map.get(key)
  // Never move an entry backwards: two panes sharing a query can offer the
  // same data at different moments in the same tick.
  if (existing && existing.ts > ts) return
  map.set(key, { ts, data })
  trim(map)
  scheduleFlush()
}

/**
 * Hold the entry cap in memory, not only on disk.
 *
 * The disk write is debounced half a second and the byte cap needs a
 * `JSON.stringify` to measure at all, so both of those live in `flush`. The
 * COUNT cap cannot wait for either: a session that browses twenty chains would
 * otherwise carry twenty listings in memory and serve entries the next reload
 * is about to throw away, which is a cache that disagrees with itself across a
 * refresh.
 */
function trim(map: Map<string, Entry>): void {
  if (map.size <= MAX_ENTRIES) return
  const ordered = Array.from(map.entries()).sort((a, b) => b[1].ts - a[1].ts)
  for (const [key] of ordered.slice(MAX_ENTRIES)) map.delete(key)
}

/** Forget everything. Test seam, and the way a sign-out clears the board. */
export function clearDiscoverySnapshots(): void {
  entries = new Map()
  if (flushHandle !== null) {
    clearTimeout(flushHandle)
    flushHandle = null
  }
  const store = storage()
  try {
    store?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do: the in-memory map is already empty.
  }
}
