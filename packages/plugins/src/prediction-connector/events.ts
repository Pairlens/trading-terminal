// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `market-data:events` and `market-data:discovery:search`, both built from the
 * same venue call.
 *
 * ccxt's `fetchEvents` returns the whole hierarchy — event → market → outcome —
 * and the two capabilities are two projections of it: the events browser wants
 * the tree, the pair picker wants a flat list of tradeable instruments. Running
 * one fetch and projecting twice is what keeps the two surfaces from
 * disagreeing about what is listed, and it is why every response feeds the
 * outcome key map on the way through: browsing IS how a mapped venue learns the
 * keys its chart will later be asked for.
 *
 * `fetchEvents` REQUIRES a scope. An unscoped call would page the venue's whole
 * universe, so ccxt throws `ArgumentsRequired` rather than trying; an empty
 * query therefore goes to the venue's own ranked listing (`browseEvents`)
 * instead of returning an error the user cannot act on.
 */

import {
  categoryFromTags,
  isCanonicalPredictionCategory,
  normalizePredictionCategory,
  predictionCategoryScope,
} from './categories'
import {
  marketChange24h,
  marketCreatedMs,
  marketRules,
  outcomeChange24h,
} from './derived'
import type {
  Instrument,
  InstrumentPage,
  PredictionEventSummary,
  PredictionEventsQuery,
  PredictionEventsResponse,
  PredictionMarketSummary,
  PredictionOutcomeSummary,
} from '@pairlens/shared/instrument-types'
import type { OutcomeResolver } from './outcomes'
import type { PredictionExchangeLike, PredictionVenueConfig } from './types'

/** Events pulled when the caller names no limit. */
const DEFAULT_EVENTS_LIMIT = 40

/** Instruments returned by one discovery search when the caller names none. */
const DEFAULT_SEARCH_LIMIT = 50

export type PredictionEventsContext = {
  venue: PredictionVenueConfig
  resolver: OutcomeResolver
}

/**
 * Ask the venue for events under the requested scope.
 *
 * A category and a free-text query are both scopes ccxt accepts, and both are
 * forwarded as-is. The third case — the empty browse the events pane opens on —
 * is not a scope at all, because `requireEventQuery` rejects a call carrying no
 * selector and no venue has a selector meaning "what is busy right now". Both
 * venues answer that from their own ranked listing instead, which is what
 * `browseEvents` is for.
 */
export async function fetchPredictionEvents(
  exchange: PredictionExchangeLike,
  ctx: PredictionEventsContext,
  query: PredictionEventsQuery,
): Promise<PredictionEventsResponse> {
  const limit = clampLimit(query.limit, DEFAULT_EVENTS_LIMIT)
  const text = query.query?.trim()
  const category = query.category?.trim()
  const eventId = query.eventId?.trim()

  let raw: Array<Record<string, unknown>>
  if (eventId) {
    // An id is a scope both venues accept, so this never reaches the browse
    // hook: `browseEvents` lists what is busy, which is the opposite of
    // "fetch exactly this one".
    if (typeof exchange.fetchEvents !== 'function') {
      throw new Error(
        `${ctx.venue.displayName} does not publish an event index`,
      )
    }
    raw = await exchange.fetchEvents(buildScope(ctx.venue, query, limit))
  } else if (
    !text &&
    !scopableCategory(ctx.venue, category) &&
    ctx.venue.browseEvents
  ) {
    raw = await ctx.venue.browseEvents(exchange, limit)
  } else {
    if (typeof exchange.fetchEvents !== 'function') {
      throw new Error(
        `${ctx.venue.displayName} does not publish an event index`,
      )
    }
    raw = await exchange.fetchEvents(buildScope(ctx.venue, query, limit))
  }

  // ONE walk. The projection registers every outcome it touches as it goes
  // (`toMarketSummary` needs the pair key anyway), so a separate pre-pass over
  // the same payload registered all of them a second time for nothing — and on
  // a browse that is several hundred redundant map writes.
  const events: Array<PredictionEventSummary> = []
  for (const entry of raw) {
    const summary = toEventSummary(entry, ctx)
    if (summary) events.push(summary)
  }
  // One persist for the whole browse rather than one per key.
  ctx.resolver.flush()
  return { market: ctx.venue.marketId, events, ts: Date.now() }
}

/**
 * The same fetch, projected to instrument rows for the pair picker.
 *
 * One row per OUTCOME, not per market: an outcome is what a chart charts and
 * what an order sizes, so 'Yes' and 'No' on the same question are two rows the
 * way two pairs on the same base asset are.
 */
export async function searchPredictionInstruments(
  exchange: PredictionExchangeLike,
  ctx: PredictionEventsContext,
  query: string,
  limit?: number,
): Promise<InstrumentPage> {
  const cap = clampLimit(limit, DEFAULT_SEARCH_LIMIT)
  const trimmed = query.trim()
  if (trimmed === '') return { items: [], total: 0, hasMore: false }

  const response = await fetchPredictionEvents(exchange, ctx, {
    query: trimmed,
    limit: cap,
  })

  const items: Array<Instrument> = []
  for (const event of response.events) {
    for (const market of event.markets) {
      for (const outcome of market.outcomes) {
        // Rank is the venue's own ordering, flattened. Both venues return
        // events by descending volume, so position in this walk already means
        // "how busy" — recomputing a score here would only disagree with the
        // events browser showing the same rows.
        items.push(
          toInstrument(ctx.venue, event, market, outcome, items.length + 1),
        )
      }
    }
  }
  const trimmedItems = items.slice(0, cap)
  return {
    items: trimmedItems,
    total: trimmedItems.length,
    hasMore: items.length > cap,
  }
}

// ── Projections ──────────────────────────────────────────────────────────

function buildScope(
  venue: PredictionVenueConfig,
  query: PredictionEventsQuery,
  limit: number,
): Record<string, unknown> {
  const scope: Record<string, unknown> = { limit }
  // An id short-circuits both venues' scope resolution, so nothing else is
  // sent with it: a `query` alongside it survives into ccxt's client-side
  // post-filter on Polymarket and can drop the very event that was asked for.
  const eventId = query.eventId?.trim()
  if (eventId) return { limit, eventId }
  const text = query.query?.trim()
  if (text) scope['query'] = text
  // A canonical id is not a venue word — neither venue has heard of
  // 'Geopolitics' or 'Tech & Science' — so it is translated back into the
  // venue's own vocabulary first. See `scopableCategory`.
  const scoped = scopableCategory(venue, query.category)
  if (scoped) {
    if (scoped.category) scope['category'] = scoped.category
    if (scoped.tags) scope['tags'] = scoped.tags
  }
  if (query.cursor) scope['cursor'] = query.cursor
  return scope
}

/**
 * The venue-side scope a category asks for, or null when there is none to send.
 *
 * Three cases, and the third is the one worth naming. A canonical id the venue
 * speaks translates ('Geopolitics' → Kalshi's 'World'). A string the taxonomy
 * does not own is a venue-native category and is forwarded verbatim, so a
 * category Kalshi lists tomorrow still scopes. And a canonical id the venue
 * has no word for — Esports on Kalshi, which files esports under Sports —
 * scopes to NOTHING rather than to itself: sending 'Esports' as a Kalshi
 * category resolves zero series, and ccxt answers a scope that resolved to
 * nothing with `ArgumentsRequired` rather than with an empty list. Unscoped,
 * the browse returns the venue's own board and the caller filters it.
 */
function scopableCategory(
  venue: PredictionVenueConfig,
  category: string | undefined,
): { category?: string; tags?: Array<string> } | null {
  const trimmed = category?.trim()
  if (!trimmed) return null
  const mapped = predictionCategoryScope(venue.exchangeId, trimmed)
  if (mapped) return mapped
  if (isCanonicalPredictionCategory(trimmed)) return null
  return { category: trimmed, tags: [trimmed] }
}

function toEventSummary(
  raw: Record<string, unknown>,
  ctx: PredictionEventsContext,
): PredictionEventSummary | null {
  const id = str(raw['id']) || str(raw['event'])
  if (!id) return null
  const info = asRecord(raw['info'])
  const title = str(raw['title']) || id
  const markets: Array<PredictionMarketSummary> = []
  const rawMarkets = raw['markets']
  if (Array.isArray(rawMarkets)) {
    for (const entry of rawMarkets) {
      const market = toMarketSummary(entry as Record<string, unknown>, ctx)
      if (market) markets.push(market)
    }
  }
  return {
    id,
    market: ctx.venue.marketId,
    title,
    // The venue's own category first, read into the canonical list; Polymarket
    // publishes none, so its tags are read instead. Both land on the same
    // sixteen ids, which is what keeps one rail from carrying Kalshi's
    // 'Entertainment' beside Polymarket's 'Culture' — see `./categories`.
    ...opt(
      'category',
      normalizePredictionCategory(str(raw['category'])) ||
        categoryFromTags(raw['tags']),
    ),
    ...opt('imageUrl', str(raw['image'])),
    markets,
    // Kalshi maps event volume onto the unified field; Polymarket leaves it
    // undefined and keeps it on the gamma payload. Measured 2026-08-15.
    ...optNum('volume', raw['volume'] ?? info['volume']),
    ...optNum('liquidity', raw['liquidity'] ?? info['liquidity']),
    ...optNum('endMs', raw['end']),
  }
}

function toMarketSummary(
  raw: Record<string, unknown>,
  ctx: PredictionEventsContext,
): PredictionMarketSummary | null {
  const id = str(raw['id']) || str(raw['market'])
  if (!id) return null
  const info = asRecord(raw['info'])
  // One reading of the move per MARKET, signed per outcome below. Both venues
  // state it once, from the Yes side — see `marketChange24h`.
  const change = marketChange24h(info)
  const outcomes: Array<PredictionOutcomeSummary> = []
  const rawOutcomes = raw['outcomes']
  if (Array.isArray(rawOutcomes)) {
    const count = rawOutcomes.length
    for (const [index, entry] of rawOutcomes.entries()) {
      const row = entry as Record<string, unknown>
      const symbol = str(row['outcome'])
      if (!symbol) continue
      const pairKey = ctx.resolver.register({
        outcome: symbol,
        outcomeId: str(row['outcomeId']) || null,
      })
      const label = str(row['label']) || symbol
      outcomes.push({
        pairKey,
        label,
        ...optNum('price', row['price']),
        ...optNum('bid', row['bid']),
        ...optNum('ask', row['ask']),
        ...optNum('change24h', outcomeChange24h(change, label, index, count)),
      })
    }
  }
  const status = marketStatus(raw)
  return {
    id,
    title: marketTitle(raw, info, id),
    ...opt('shortTitle', marketShortTitle(info)),
    ...opt('imageUrl', str(info['icon']) || str(info['image'])),
    ...opt('rules', marketRules(info)),
    outcomes,
    // Neither venue populates the unified `volume`/`end` on a market row;
    // both keep them on the venue payload, and `expiry` is where ccxt puts
    // the resolution time. Measured against both live APIs 2026-08-15.
    ...optNum('volume', raw['volume'] ?? info['volume']),
    ...optNum('liquidity', raw['liquidity'] ?? info['liquidity']),
    // Kalshi keeps open interest on its own payload rather than on the ccxt
    // market row (`parseEventToMarkets` copies it into `info`), so the card
    // footers were dropping a stat the venue does publish.
    ...optNum('openInterest', raw['openInterest'] ?? info['openInterest']),
    ...optNum('endMs', raw['end'] ?? raw['expiry']),
    // ccxt sets `created: undefined` on a prediction market on both venues, so
    // this reads the venue payload — see `marketCreatedMs`.
    ...optNum('createdMs', marketCreatedMs(info)),
    ...(status !== undefined ? { status } : {}),
  }
}

/**
 * The market's question.
 *
 * Neither venue sets a unified `title` on a prediction market row — ccxt's
 * `parseMarket` builds the ccxt Market shape, which has no such field — so
 * without this the fallback was the id, and a Polymarket id is a 66-character
 * `0x…` condition hash. On a categorical event that hash was the ONLY thing
 * separating one candidate from the next.
 *
 * The question is the right label rather than the short group label:
 * `groupItemTitle` is "Donald Trump", which is meaningless in a pair picker
 * row or a watchlist, while `question` is "Will Donald Trump win the 2028
 * Republican presidential nomination?" and reads correctly everywhere. Kalshi
 * spells the same thing `title` inside its own payload. The short label is
 * kept as a fallback for a market that carries no question at all, and the id
 * is last resort.
 */
function marketTitle(
  raw: Record<string, unknown>,
  info: Record<string, unknown>,
  id: string,
): string {
  const title =
    str(raw['title']) ||
    str(info['question']) ||
    str(info['title']) ||
    str(info['groupItemTitle'])
  if (!title) return id
  return withStrike(title, str(info['yes_sub_title']))
}

/**
 * The market's short label within its event, or '' when the venue has none.
 *
 * This is the inverse of `marketTitle`: that one wants the longest readable
 * thing, because a pair picker row has to stand on its own. This one wants the
 * shortest thing that still tells two siblings apart, because it goes where a
 * ticker went — a marquee chip, the top-bar title, a watchlist row. On
 * "Democratic Presidential Nominee 2028" the question is 68 characters and
 * this is "Gavin Newsom".
 *
 * A binary event usually publishes neither field, and that is the correct
 * answer rather than a gap: there are no siblings to separate, so the event
 * heading already names the market and the display layer falls back to it.
 */
function marketShortTitle(info: Record<string, unknown>): string {
  return str(info['groupItemTitle']) || str(info['yes_sub_title'])
}

/**
 * Disambiguate scalar-market siblings that share a question.
 *
 * Kalshi's per-market `title` usually carries the strike ("… be above
 * 560,000?"), but not always: the markets under "U.S. oil production per day
 * in 2026" are all titled "How many oil barrels per day will the US produce
 * this year?" and only `yes_sub_title` ("Above 13.5M") separates them. Two
 * chart rows with identical names and different prices is the same defect as a
 * hex hash, just better disguised.
 *
 * Appended only when the title does not already say it, so the common case
 * ("… be above 560,000?" + "Above 560,000") does not read twice.
 */
function withStrike(title: string, strike: string): string {
  if (!strike) return title
  if (title.toLowerCase().includes(strike.toLowerCase())) return title
  return `${title} · ${strike}`
}

/**
 * `resolved` and `closed` are separate facts on both venues: a market stops
 * accepting orders when it closes and pays out when it resolves, and the gap
 * between the two is where a position pane still has something to show.
 */
function marketStatus(
  raw: Record<string, unknown>,
): 'open' | 'closed' | 'resolved' | undefined {
  if (raw['resolved'] === true) return 'resolved'
  if (raw['closed'] === true) return 'closed'
  if (raw['active'] === true) return 'open'
  return undefined
}

function toInstrument(
  venue: PredictionVenueConfig,
  event: PredictionEventSummary,
  market: PredictionMarketSummary,
  outcome: PredictionOutcomeSummary,
  rank: number,
): Instrument {
  // The label is always appended, never conditionally: on a binary market it
  // is the side being taken, and on a categorical one it IS the answer
  // ("Powell", "Warsh") — dropping it would render two dozen rows that all
  // read as the same question.
  const name = `${market.title} - ${outcome.label}`
  return {
    id: `${venue.marketId}:${outcome.pairKey}`,
    kind: 'prediction',
    market: venue.marketId,
    symbol: outcome.pairKey,
    name,
    base: venue.collateral,
    quote: venue.collateral,
    assetClass: 'prediction',
    // The token taxonomy ('defi', 'meme', …) has no prediction arm, and
    // guessing one from an event's own category would put "Fed decision" under
    // 'defi'. Left empty rather than approximated.
    categories: [],
    rank,
    featured: false,
    predictionMarketId: market.id,
    outcome: outcome.label,
    ...(market.shortTitle ? { shortTitle: market.shortTitle } : {}),
    eventId: event.id,
    eventTitle: event.title,
    ...(market.endMs !== undefined ? { endMs: market.endMs } : {}),
    ...(market.status !== undefined ? { status: market.status } : {}),
  }
}

// ── Utils ────────────────────────────────────────────────────────────────

function clampLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.min(Math.floor(value), 200)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function opt<TKey extends string>(
  key: TKey,
  value: string | undefined,
): Record<TKey, string> | Record<string, never> {
  return value ? ({ [key]: value } as Record<TKey, string>) : {}
}

function optNum<TKey extends string>(
  key: TKey,
  value: unknown,
): Record<TKey, number> | Record<string, never> {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN
  return Number.isFinite(parsed)
    ? ({ [key]: parsed } as Record<TKey, number>)
    : {}
}
