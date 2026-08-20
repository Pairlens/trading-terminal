// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One taxonomy for prediction events, and the two directions it is read in.
 *
 * The venues do not agree on what a category is. Kalshi publishes a real one
 * per event out of a closed list of sixteen ('Elections', 'Science and
 * Technology', 'Climate and Weather', 'Entertainment', 'World', ...).
 * Polymarket publishes none at all: a gamma event carries a `tags[]` array,
 * which ccxt's `parseEvent` flattens to tag LABELS, and that array is a
 * folksonomy of thousands of strings mixing topics ('Crypto'), subjects
 * ('Jerome Powell'), leagues ('MLS') and editorial markers ('Hide From New').
 *
 * Left alone the two produce one mongrel rail: Kalshi's 'Entertainment' beside
 * Polymarket's 'Culture' naming the same thing, and 'World' beside
 * 'Geopolitics' splitting one topic in two. So this table is the canonical
 * list, and both venues are read INTO it — a venue category through
 * `normalizePredictionCategory`, a tag array through `categoryFromTags`.
 *
 * It is also read the other way. A category chip does not only filter what is
 * already loaded: the events browser can send it back as a venue-side scope,
 * and no venue has ever heard of 'Geopolitics' or 'Tech & Science'. `scope` is
 * what each canonical id means in each venue's own vocabulary, which is what
 * keeps picking a category narrowing at the source instead of returning
 * nothing.
 *
 * Two properties are deliberate.
 *
 * **The list is a priority order, and it is read rule-first.** A tag array is
 * walked once per rule rather than once per tag, so the most specific topic
 * present wins wherever an event carries several — an election is tagged
 * 'Politics' too, an esports match is tagged 'Sports' too, and a Fed decision
 * is tagged 'Politics' too. Taking the first matching TAG instead, which is
 * what this did when it only knew seven topics, filed most of Polymarket's
 * election book under Politics purely because gamma happened to list that tag
 * earlier. Sports and Esports sit at the top for the opposite reason: their
 * tags are unambiguous, and a football match between two countries carries
 * country tags that the Geopolitics rule would otherwise claim.
 *
 * **Nothing is ever invented.** A tag array that lands on no rule leaves the
 * event uncategorised, which puts it under Trending rather than filing "UK
 * election called by…?" under whichever subject tag happened to be first.
 */

export type PredictionCategoryRule = {
  /** Canonical id. Also the label the rail renders and the filter value. */
  id: string
  /** Matches a venue category string, or one tag out of a tag array. */
  match: RegExp
  /**
   * What this id means in each venue's own scope vocabulary, keyed by ccxt
   * exchange id.
   *
   * Kalshi scopes by `category` (declared in its `eventScopeParams`) and
   * resolves it through the /series listing, so the value must be one of the
   * sixteen strings it actually publishes.
   *
   * Polymarket scopes by `tags`, and these are gamma SLUGS rather than labels.
   * ccxt slugifies whatever it is handed (`tagToSlug`), and gamma's slugs are
   * not always the label lowercased: the tag labelled 'Culture' has the slug
   * `pop-culture`, so passing the label would have queried a tag that does not
   * exist and returned an empty board. Several tags to one id are unioned, one
   * gamma listing each. Every slug here was checked against gamma on
   * 2026-08-20; `mentions` and `transportation` are NOT tags (hence
   * `tweets-markets` and `shipping`), and `aviation` exists but is empty.
   *
   * A venue with no entry cannot be scoped to this category and falls back to
   * filtering the browse it already loaded.
   */
  scope: Record<string, { category?: string; tags?: Array<string> }>
}

/**
 * The canonical categories, in match-priority order.
 *
 * Widened from the original seven (Crypto, Sports, Geopolitics, Economics,
 * Politics, Culture, Science) after walking both venues' live vocabularies on
 * 2026-08-20: Kalshi's `search/tags_by_categories` for its authoritative list,
 * a thousand open Kalshi events and a hundred Polymarket ones for what a
 * browse actually contains. Every id below is carried by real listings on at
 * least one venue, and the counts that justified the new ones are on the rules.
 */
export const PREDICTION_CATEGORY_RULES: ReadonlyArray<PredictionCategoryRule> =
  [
    {
      // Thirteen of a hundred browsed Polymarket events. Kalshi has no
      // separate category for it, so a Kalshi esports market stays under
      // Sports: that is the venue's own filing rather than a guess made here.
      id: 'Esports',
      match:
        /esport|league of legends|\bdota\b|counter[- ]?strike|\bcs2\b|valorant|overwatch|rocket league|starcraft|\bchess\b/i,
      scope: { polymarket: { tags: ['esports'] } },
    },
    {
      // `\bsport`, not `sport`: 'Transport' and 'transportation' contain the
      // word and were landing on this chip.
      id: 'Sports',
      match:
        /\bsport|soccer|football|basketball|baseball|tennis|hockey|golf|olympic|cricket|boxing|racing|\bmlb\b|\bnfl\b|\bnba\b|\bnhl\b|\bufc\b|\bmls\b|\bepl\b|\bwnba\b|\batp\b|\bf1\b|formula 1|league|\bgames\b/i,
      scope: {
        kalshi: { category: 'Sports' },
        polymarket: { tags: ['sports'] },
      },
    },
    {
      // 'Will X say Y' — both venues run a real book on it, Kalshi as a
      // category of its own and Polymarket as 'Tweet Markets'.
      id: 'Mentions',
      match: /mention|tweet market|soundbite/i,
      scope: {
        kalshi: { category: 'Mentions' },
        polymarket: { tags: ['tweets-markets'] },
      },
    },
    {
      // Kalshi's single largest category by open events — 499 of a
      // thousand-event walk — and its own top-level nav item. Polymarket tags
      // elections five different ways. Folding all of it into Politics, which
      // is what happened before, buried half of Kalshi's board under one chip.
      id: 'Elections',
      match:
        /election|primar(?:y|ies)|caucus|ballot|nominee|nomination|referendum|\bpoll\b|\bpolls\b/i,
      scope: {
        kalshi: { category: 'Elections' },
        polymarket: { tags: ['elections'] },
      },
    },
    {
      id: 'Crypto',
      match:
        /crypto|bitcoin|\bbtc\b|ethereum|\beth\b|solana|altcoin|memecoin|stablecoin|\bnft\b|defi|token/i,
      scope: {
        kalshi: { category: 'Crypto' },
        polymarket: { tags: ['crypto'] },
      },
    },
    {
      // Out of Tech & Science, where a weather market had no business being:
      // Kalshi runs 354 series of daily temperature, hurricanes and rainfall,
      // and not one of them is a science question.
      id: 'Climate',
      match:
        /climate|weather|temperature|hurricane|wildfire|snow|rainfall|drought|heatwave|storm|tornado|earthquake|natural disaster|global warming/i,
      scope: {
        kalshi: { category: 'Climate and Weather' },
        polymarket: { tags: ['climate'] },
      },
    },
    {
      id: 'Health',
      match:
        /health|medic|\bdrug\b|vaccine|pandemic|outbreak|\bcovid\b|influenza|\bfda\b|disease|hospital/i,
      scope: {
        kalshi: { category: 'Health' },
        polymarket: { tags: ['health'] },
      },
    },
    {
      // Above Commodities and Transport on purpose: "Strait of Hormuz traffic
      // returns to normal by…?" is tagged 'Oil' and 'shipping', and it is a
      // war question.
      id: 'Geopolitics',
      match:
        /geopolit|\bwar\b|warfare|ukraine|russia|israel|gaza|iran|\bnato\b|middle east|conflict|ceasefire|sanction|\bworld\b|global|foreign affairs|international affairs|military|invasion|hostage/i,
      // Kalshi files these under 'World'.
      scope: {
        kalshi: { category: 'World' },
        polymarket: { tags: ['geopolitics', 'world'] },
      },
    },
    {
      id: 'Commodities',
      match:
        /commodit|\boil\b|\bgas\b|energy|\bgold\b|silver|copper|metals|wheat|corn|fertilizer/i,
      scope: {
        kalshi: { category: 'Commodities' },
        polymarket: { tags: ['commodities'] },
      },
    },
    {
      id: 'Transport',
      match:
        /transport|aviation|airline|\bflight\b|\btsa\b|shipping|maritime|freight|\brail\b|traffic/i,
      scope: {
        kalshi: { category: 'Transportation' },
        polymarket: { tags: ['shipping'] },
      },
    },
    {
      // The macro print, as distinct from the market that reacts to it. Kalshi
      // draws the same line and keeps 744 series on this side of it.
      id: 'Economics',
      match:
        /econom|\bfed\b|fomc|inflation|\bcpi\b|\bppi\b|\bgdp\b|interest rate|monetary|central bank|recession|unemploy|\bjobs\b|tariff|housing|payroll|social security/i,
      scope: {
        kalshi: { category: 'Economics' },
        polymarket: { tags: ['economy'] },
      },
    },
    {
      id: 'Financials',
      match:
        /financ|\bstocks?\b|equit|\bindex\b|\bindices\b|\bs&p\b|nasdaq|\bdow\b|\betf\b|bond|yield|treasur|\bipo\b|earnings|market cap/i,
      scope: {
        kalshi: { category: 'Financials' },
        polymarket: { tags: ['finance'] },
      },
    },
    {
      id: 'Companies',
      match:
        /compan|\bbusiness\b|corporate|\bceo\b|layoff|merger|acquisition|bankrupt|startup/i,
      scope: {
        kalshi: { category: 'Companies' },
        polymarket: { tags: ['business'] },
      },
    },
    {
      // Kalshi merges the two into 'Science and Technology' and so does this,
      // rather than splitting a venue category on a guess about its title.
      id: 'Tech & Science',
      match:
        /science|scientific|\bspace\b|\bai\b|artificial intelligence|openai|\bllm\b|technolog|\btech\b|software|semiconductor|nasa|spacex|rocket|satellite|physics|research/i,
      scope: {
        kalshi: { category: 'Science and Technology' },
        polymarket: { tags: ['tech', 'science', 'space'] },
      },
    },
    {
      // Kalshi's 'Entertainment' and 'Social' both land here: awards, charts,
      // streamers, and the rest of what people do when they are not voting.
      id: 'Culture',
      match:
        /culture|entertain|celebrit|music|movie|\bfilm\b|television|\btv\b|award|oscar|grammy|emmy|fashion|royal|streamer|social|viral|box office|metacritic/i,
      scope: {
        kalshi: { category: 'Entertainment' },
        polymarket: { tags: ['pop-culture'] },
      },
    },
    {
      // Last: the broadest of the political rules, and the one every election,
      // war and rate decision would otherwise fall into.
      id: 'Politics',
      match:
        /politic|senate|congress|president|parliament|governor|impeach|white house|supreme court|legislat|prime minister|government|legal cases/i,
      scope: {
        kalshi: { category: 'Politics' },
        polymarket: { tags: ['politics'] },
      },
    },
  ]

/** Canonical ids — what the terminal draws icons and translated labels for. */
export const PREDICTION_CATEGORY_IDS: ReadonlyArray<string> =
  PREDICTION_CATEGORY_RULES.map((rule) => rule.id)

/**
 * Kalshi's own category strings, mapped by hand where a keyword would be wrong.
 *
 * Everything here also matches its rule, so the table is a shortcut for the
 * common case rather than the only path — except 'Social', which names a topic
 * no keyword should claim ('social security' is Economics) and which Kalshi
 * uses for streamers, restaurants and internet ephemera.
 */
const VENUE_CATEGORY_ALIASES: Record<string, string> = {
  entertainment: 'Culture',
  social: 'Culture',
  world: 'Geopolitics',
  'science and technology': 'Tech & Science',
  'climate and weather': 'Climate',
  transportation: 'Transport',
}

/**
 * A venue's own category string, read into the canonical list.
 *
 * An unrecognised value comes back trimmed rather than dropped: a venue that
 * lists a new category should appear on the rail the day it does, not vanish
 * off the board until this table catches up.
 */
export function normalizePredictionCategory(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const alias = VENUE_CATEGORY_ALIASES[trimmed.toLowerCase()]
  if (alias) return alias
  for (const rule of PREDICTION_CATEGORY_RULES) {
    if (rule.match.test(trimmed)) return rule.id
  }
  return trimmed
}

/**
 * The most specific topic a tag array names, or '' when it names none.
 *
 * Rule-first, not tag-first — see the priority note at the top of this file.
 * Exported for the fixture test, which pins it against tag arrays copied off
 * the live gamma listing rather than invented ones.
 */
export function categoryFromTags(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const tags: Array<string> = []
  for (const entry of value) {
    // ccxt hands over strings; a raw gamma payload that skipped the parser
    // would hand over `{ label, slug }`, and reading both costs one line.
    const tag =
      typeof entry === 'string'
        ? entry
        : str(readRecord(entry)['label']) || str(readRecord(entry)['slug'])
    if (tag) tags.push(tag)
  }
  if (tags.length === 0) return ''
  for (const rule of PREDICTION_CATEGORY_RULES) {
    for (const tag of tags) {
      if (rule.match.test(tag)) return rule.id
    }
  }
  return ''
}

/**
 * The venue-side scope one canonical category means, or null when the venue
 * has no word for it.
 *
 * Null is a real answer rather than a failure: Kalshi files esports under
 * Sports, and a scope that resolved to no series makes ccxt throw
 * `ArgumentsRequired` rather than return an empty list.
 */
export function predictionCategoryScope(
  exchangeId: string,
  category: string,
): { category?: string; tags?: Array<string> } | null {
  const wanted = category.trim().toLowerCase()
  if (!wanted) return null
  for (const rule of PREDICTION_CATEGORY_RULES) {
    if (rule.id.toLowerCase() !== wanted) continue
    return rule.scope[exchangeId] ?? null
  }
  return null
}

/** Whether an id is one this table owns, as opposed to a venue-native string. */
export function isCanonicalPredictionCategory(category: string): boolean {
  const wanted = category.trim().toLowerCase()
  if (!wanted) return false
  return PREDICTION_CATEGORY_RULES.some(
    (rule) => rule.id.toLowerCase() === wanted,
  )
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}
