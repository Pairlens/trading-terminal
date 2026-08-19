// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `resolveOutcome(pairKey)` — the one seam every channel and the order path go
 * through to turn a Pairlens pair key into the outcome symbol ccxt is called
 * with.
 *
 * Centralised rather than inlined per channel because a resolution miss must
 * fail the same way everywhere. A chart that quietly draws nothing and a ticket
 * that quietly rejects are the same bug seen from two panes, and the sentence
 * the user needs ("this market is not listed any more" vs "reload the events
 * browser") can only be written once.
 */

import { sanitizeOutcomeKey } from './outcome-keys'
import type { OutcomeKeyMap } from './outcome-keys'
import type { PredictionExchangeLike, PredictionVenueConfig } from './types'

/** How many events a cold-miss recovery search is allowed to pull. */
const RECOVERY_SEARCH_LIMIT = 10

/**
 * Word counts to try, in order, when recovering a cold key by search.
 *
 * A pair key is a sanitized `EVENTSLUG_MARKETSLUG:LABEL` handle, and the venue
 * search indexes EVENT TITLES — so only the leading, event-slug words can
 * match. Measured against Polymarket's gamma search 2026-08-15: the full
 * twelve-word query returned zero events for every key tried, while the first
 * two words resolved all six. Ascending order matters: a shorter query is a
 * superset of a longer one, so the first hit comes early (one request in
 * practice) and the ladder stops there. Precision is not at stake because
 * every result is re-checked against the EXACT key.
 */
const RECOVERY_PREFIX_WORDS = [2, 3, 4, 6]

/**
 * The ladder of queries to try for a cold key, shortest first.
 *
 * Pair keys come from ccxt handles (`EVENTSLUG_MARKETSLUG:LABEL` sanitized to
 * dashes), so their words are the words of the venue's own slugs. The full
 * query is included LAST rather than first: it is the most precise, but on a
 * title-matching search it is also the one most likely to match nothing,
 * because most of its words come from the market slug rather than the event
 * title.
 *
 * Empty for a key with no letter-bearing words — a bare token id, which is an
 * identifier and not searchable text.
 */
export function outcomeSearchQueries(pairKey: string): Array<string> {
  const words = searchWords(pairKey)
  if (words.length === 0) return []
  const queries: Array<string> = []
  for (const count of [...RECOVERY_PREFIX_WORDS, words.length]) {
    if (count > words.length) continue
    const query = words.slice(0, count).join(' ')
    if (!queries.includes(query)) queries.push(query)
  }
  return queries
}

/**
 * The letter-bearing words of a key, lowercased.
 *
 * Purely numeric segments (strikes, years, slug disambiguators) are dropped:
 * they are venue artifacts a title search does not index, and since every
 * result is re-checked against the exact key, a broader query only adds recall.
 */
function searchWords(pairKey: string): Array<string> {
  const words: Array<string> = []
  for (const part of sanitizeOutcomeKey(pairKey).split('-')) {
    if (part === '' || !/[A-Z]/.test(part)) continue
    words.push(part.toLowerCase())
  }
  return words
}

export type OutcomeRegistration = {
  /** ccxt's unified outcome handle. */
  outcome: string
  /** Venue-native id, preferred for resolution when the listing carried one. */
  outcomeId?: string | null
}

export class OutcomeResolver {
  constructor(
    private readonly venue: PredictionVenueConfig,
    private readonly keys: OutcomeKeyMap,
  ) {}

  /**
   * Record an outcome seen in a listing and return the pair key for it.
   *
   * Called from every discovery, search and events response — that continuous
   * feeding is what keeps `resolve` off the network for anything the user has
   * actually browsed to.
   */
  register(entry: OutcomeRegistration): string {
    if (this.venue.outcomeAddressing === 'passthrough') {
      // The ID form, not the handle. A listing row carries BOTH — Kalshi's
      // `outcomeId` is the raw ticker (`KXNHSALES-26AUG25-T560000`, and the
      // same plus `-NO`) while `outcome` is the unified handle
      // (`KXNHSALES_26AUG25_US_NEW_HOME_SALES_JULY_2026_ABOVE_560_000:YES`).
      // Sanitizing the handle destroys the `_` and `:` that make it a handle
      // without producing a valid ticker, so the key resolves as neither and
      // every row out of the events browser charts nothing. The ticker is
      // already uppercase-alphanumeric-and-dashes, so it survives sanitizing
      // unchanged and IS the pair key.
      return sanitizeOutcomeKey(entry.outcomeId || entry.outcome)
    }
    return this.keys.register(entry.outcome, entry.outcomeId)
  }

  /**
   * Persist whatever `register` accumulated.
   *
   * Registration only marks the map dirty; a bulk caller (an events browse, a
   * discovery search) calls this once at the end so several hundred keys cost
   * one write instead of several hundred.
   */
  flush(): void {
    this.keys.flush()
  }

  /** Cache-only resolution. Never fetches; null means "ask the network". */
  peek(pairKey: string): string | null {
    if (this.venue.outcomeAddressing === 'passthrough') {
      return sanitizeOutcomeKey(pairKey)
    }
    return this.keys.resolve(pairKey)
  }

  /**
   * The ccxt outcome symbol for a pair key.
   *
   * On a passthrough venue this is pure string work — a Kalshi ticker and its
   * `-NO` sibling are both id-form outcome symbols ccxt resolves on demand, so
   * there is nothing to look up and nothing to go stale.
   *
   * On a mapped venue a miss is recoverable and worth one search: a shared
   * link or a watchlist row from another device carries a key this profile has
   * never seen. The search runs through the venue's own scoped `fetchEvents`,
   * which caches everything it finds inside ccxt as a side effect, and the map
   * is re-checked against the EXACT key afterwards so a near match can never
   * be mistaken for the real one.
   */
  async resolve(
    exchange: PredictionExchangeLike,
    pairKey: string,
  ): Promise<string> {
    const cached = this.peek(pairKey)
    if (cached) return cached

    if (typeof exchange.fetchEvents === 'function') {
      for (const query of outcomeSearchQueries(pairKey)) {
        try {
          this.registerEvents(
            await exchange.fetchEvents({
              query,
              limit: RECOVERY_SEARCH_LIMIT,
            }),
          )
        } catch {
          // A zero-match search surfaces as a venue error on some paths; that
          // is a plain miss, so try the next rung rather than giving up.
        }
        this.flush()
        const recovered = this.peek(pairKey)
        if (recovered) return recovered
      }
    }

    throw new Error(
      `${this.venue.displayName} could not resolve '${pairKey}': the market may have resolved or been delisted; find it again in the events browser`,
    )
  }

  /**
   * Walk a `fetchEvents` result and register every outcome it mentions.
   *
   * Tolerant of shape on purpose: this runs against live venue payloads, and
   * an event with one malformed market should still contribute the outcomes
   * that parsed.
   */
  registerEvents(events: Array<Record<string, unknown>>): void {
    if (!Array.isArray(events)) return
    for (const event of events) {
      const markets = event?.['markets']
      if (!Array.isArray(markets)) continue
      for (const market of markets) {
        const outcomes = (market as Record<string, unknown>)?.['outcomes']
        if (!Array.isArray(outcomes)) continue
        for (const outcome of outcomes) {
          const row = outcome as Record<string, unknown>
          const symbol = row?.['outcome']
          if (typeof symbol !== 'string' || symbol === '') continue
          const id = row['outcomeId']
          this.register({
            outcome: symbol,
            outcomeId: typeof id === 'string' ? id : null,
          })
        }
      }
    }
  }
}
