// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pair-key contract for prediction outcomes.
 *
 * A Pairlens pair key travels through a URL (`/pair/$pair`), a watchlist row
 * and a workspace file, so it has to be uppercase and route-safe. ccxt's
 * outcome symbols are neither: the unified handle is
 * `EVENTSLUG_MARKETSLUG:LABEL` and the id form on Polymarket is a 77-digit
 * CLOB token id. Two venues, two answers:
 *
 * - **Kalshi is passthrough.** A raw ticker (`KXBTCD-26AUG15-T53`) and that
 *   ticker plus `-NO` are both accepted by `kalshi.fetchOutcome` as id-form
 *   outcome symbols, and both are already uppercase-alphanumeric-and-dashes.
 *   Nothing is stored and nothing can go stale.
 * - **Polymarket is mapped.** Sanitizing the handle (`_` and `:` → `-`) is
 *   lossy — `A_B:C` and `A:B_C` sanitize alike — so the reverse direction has
 *   to be remembered rather than computed. Every discovery, search and events
 *   response feeds the map, which persists so a reload, a shared link or a
 *   saved watchlist row still resolves. A cold miss is recoverable (the
 *   venue's own search), which is why a miss returns null rather than throwing
 *   here.
 *
 * Persistence is best-effort by design: the map is a cache of public listing
 * data, so a private-mode browser or a CLI process that cannot reach
 * localStorage runs on the in-memory copy and re-earns entries as it browses.
 */

const STORAGE_PREFIX = 'pairlens:prediction-outcomes:'

/**
 * Cap on persisted entries per venue. Polymarket lists tens of thousands of
 * outcomes and a browse session touches a few hundred; without a cap an
 * events browser walking categories would grow the row without bound.
 * Eviction is oldest-first by insertion order, which for this access pattern
 * is "the events page you scrolled past twenty minutes ago".
 */
const MAX_ENTRIES = 4_000

/**
 * A pair key: uppercase, and free of the two characters ccxt's handle grammar
 * uses as separators.
 *
 * Idempotent, so a key that has already been through here survives a second
 * pass unchanged — which matters because the terminal normalizes pair keys
 * again on its own route boundary.
 */
export function sanitizeOutcomeKey(raw: string): string {
  return raw.trim().replace(/[_:]/g, '-').toUpperCase()
}

type StorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function defaultStorage(): StorageLike | null {
  try {
    const candidate = (globalThis as { localStorage?: StorageLike })
      .localStorage
    if (!candidate || typeof candidate.getItem !== 'function') return null
    return candidate
  } catch {
    // Access to localStorage throws outright in some sandboxed frames.
    return null
  }
}

/**
 * Pair key ↔ ccxt outcome symbol, per venue.
 *
 * The stored value is what ccxt should be CALLED with, which is not always the
 * unified handle: Polymarket resolves a bare CLOB token id in one request and
 * a handle only through a bulk load, so the token id is preferred when the
 * listing carried one.
 */
export class OutcomeKeyMap {
  private readonly storageKey: string
  private readonly storage: StorageLike | null
  private readonly entries = new Map<string, string>()
  private loaded = false
  private dirty = false
  private flushQueued = false

  constructor(marketId: string, storage?: StorageLike | null) {
    this.storageKey = `${STORAGE_PREFIX}${marketId}`
    this.storage = storage === undefined ? defaultStorage() : storage
  }

  /** Number of known keys. Visible so tests can assert eviction. */
  get size(): number {
    this.load()
    return this.entries.size
  }

  /**
   * Record an outcome and return the pair key that now addresses it.
   *
   * `outcomeId` wins when present because it is the cheap resolution path on
   * both mapped venues; the handle is kept only when there is nothing else.
   */
  register(outcomeSymbol: string, outcomeId?: string | null): string {
    const target =
      outcomeId !== undefined && outcomeId !== null && outcomeId !== ''
        ? outcomeId
        : outcomeSymbol
    const key = sanitizeOutcomeKey(outcomeSymbol)
    if (key === '') return key
    this.load()
    // Re-insert so a re-seen key moves to the young end of the eviction order.
    if (this.entries.get(key) === target) {
      this.entries.delete(key)
      this.entries.set(key, target)
      return key
    }
    this.entries.set(key, target)
    this.dirty = true
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
    this.scheduleFlush()
    return key
  }

  /**
   * Write the map out now, if anything changed.
   *
   * Callers that register in bulk (an events browse, a discovery search) call
   * this once at the end. Registration itself only marks the map dirty and
   * queues a microtask, because a single browse registers several hundred keys
   * and persisting per key meant several hundred `JSON.stringify` passes over a
   * map of up to 4000 entries, each followed by a synchronous `setItem` — on
   * the main thread, in the middle of a scroll.
   */
  flush(): void {
    this.flushQueued = false
    this.persist()
  }

  /**
   * Backstop for callers that register outside a bulk walk: coalesce to one
   * write at the end of the current task rather than leaving the change
   * unpersisted until the next bulk call.
   */
  private scheduleFlush(): void {
    if (this.flushQueued || !this.storage) return
    this.flushQueued = true
    queueMicrotask(() => {
      if (this.flushQueued) this.flush()
    })
  }

  /** The ccxt outcome symbol for a pair key, or null when unknown. */
  resolve(pairKey: string): string | null {
    this.load()
    return this.entries.get(sanitizeOutcomeKey(pairKey)) ?? null
  }

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    if (!this.storage) return
    try {
      const raw = this.storage.getItem(this.storageKey)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return
      for (const [key, value] of Object.entries(
        parsed as Record<string, unknown>,
      )) {
        if (typeof value === 'string' && value !== '') {
          this.entries.set(key, value)
        }
      }
    } catch {
      // Corrupt or unreadable cache: start empty rather than fail a lookup.
    }
  }

  private persist(): void {
    if (!this.storage || !this.dirty) return
    this.dirty = false
    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify(Object.fromEntries(this.entries)),
      )
    } catch {
      // Quota or a private-mode refusal — the in-memory copy still serves
      // this session.
    }
  }
}
