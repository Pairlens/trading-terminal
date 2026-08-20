// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The event projection's category taxonomy, and the two gaps under it.
 *
 * Both gaps were visible on a fresh browser profile. Polymarket publishes no
 * `category` at all, so the discovery board's category rail rendered a single
 * "All" row and the words "This venue does not tag its events by category" —
 * while gamma was returning six tags per event the whole time. And Kalshi
 * keeps open interest inside its own payload rather than on the ccxt market
 * row, so a stat the venue does publish never reached a card footer.
 *
 * The tag arrays below are copied verbatim from live browses of
 * `https://gamma-api.polymarket.com/events?limit=100&closed=false&active=true
 * &order=volume24hr&ascending=false` on 2026-08-18 and 2026-08-20, flattened
 * to labels the way ccxt's `parseEvent` flattens them. They are the reason the
 * walk is rule-first rather than tag-first: gamma lists 'Politics' before
 * 'Elections' on half the election book, and the first tag is 'fomc',
 * 'Bitcoin', 'putin' or 'UK' about as often as it is a category. The Kalshi
 * category strings are its own closed list, read off
 * `search/tags_by_categories` on 2026-08-20.
 */
import { describe, expect, it } from 'bun:test'

import {
  PREDICTION_CATEGORY_RULES,
  categoryFromTags,
  normalizePredictionCategory,
  predictionCategoryScope,
} from '../categories'
import { fetchPredictionEvents } from '../events'
import { OutcomeKeyMap } from '../outcome-keys'
import { OutcomeResolver } from '../outcomes'
import { kalshiPredictionVenue } from '../venues/kalshi'
import { polymarketPredictionVenue } from '../venues/polymarket'
import { fakeExchange, memoryStorage } from './fake-exchange'

function resolver(): OutcomeResolver {
  return new OutcomeResolver(
    polymarketPredictionVenue,
    new OutcomeKeyMap('polymarket', memoryStorage()),
  )
}

describe('categoryFromTags', () => {
  it('reads the live gamma tag arrays the way a reader would', () => {
    const cases: Array<[Array<string>, string]> = [
      [['Esports', 'league of legends', 'Games', 'Sports'], 'Esports'],
      [['Sports', 'Games', 'MLB', 'baseball'], 'Sports'],
      [['Tennis', 'Sports', 'Games'], 'Sports'],
      [
        ['fomc', 'Economic Policy', 'Fed Rates', 'Jerome Powell', 'Politics'],
        'Economics',
      ],
      [['Finance', 'Monthly', 'Hit Price', 'Hide From New'], 'Financials'],
      [['Bitcoin', 'Monthly', 'Hit Price', 'Crypto', 'Recurring'], 'Crypto'],
      [['Ethereum', 'Monthly', 'Hit Price', 'Crypto Prices'], 'Crypto'],
      [
        ['United States', 'Elections', 'Politics', 'US Election', 'Earn 4%'],
        'Elections',
      ],
      [
        ['primary elections', 'Governor Primary', 'Florida Primary'],
        'Elections',
      ],
      [['France', 'Politics', 'Macron', '2025 Predictions'], 'Politics'],
      [
        ['putin', 'Geopolitics', 'Ukraine', 'Politics', 'Russia'],
        'Geopolitics',
      ],
      [['Culture', 'Politics', 'Tweet Markets'], 'Mentions'],
      [['Oil', 'Commodities', 'Weekly'], 'Commodities'],
      [['Oil', 'Iran', 'Politics', 'Geopolitics', 'shipping'], 'Geopolitics'],
      [['AI', 'OpenAI', 'Tech'], 'Tech & Science'],
      [['Wildfire', 'California'], 'Climate'],
    ]
    for (const [tags, expected] of cases) {
      expect(categoryFromTags(tags)).toBe(expected)
    }
  })

  it('reads a specific topic before the broad one it sits inside', () => {
    // The walk is rule-first, so tag ORDER cannot decide this. An election is
    // tagged 'Politics' too, an esports match is tagged 'Sports' too, and a
    // Fed decision is tagged 'Politics' too — in each pair the narrower chip
    // is the one a reader was reaching for, whichever tag gamma listed first.
    expect(categoryFromTags(['Politics', 'Elections'])).toBe('Elections')
    expect(categoryFromTags(['President', 'US Election', 'Politics'])).toBe(
      'Elections',
    )
    expect(categoryFromTags(['Sports', 'Games', 'Esports'])).toBe('Esports')
    expect(categoryFromTags(['Politics', 'Fed Rates'])).toBe('Economics')
    expect(categoryFromTags(['World Elections', 'Global Elections'])).toBe(
      'Elections',
    )
  })

  it('does not let a country tag pull a football match into a war', () => {
    // Sports sits at the top of the table for exactly this: a match between
    // two national sides carries country tags the Geopolitics rule claims.
    expect(categoryFromTags(['Sports', 'Games', 'Soccer', 'Russia'])).toBe(
      'Sports',
    )
  })

  it('refuses to invent one from a subject or an editorial tag', () => {
    // Measured: 'UK election called by...?' carries none of the topic tags.
    // Uncategorised on the rail beats filing it under 'pedophile'.
    expect(categoryFromTags(['UK', 'pedophile', 'Starmer', 'England'])).toBe('')
    expect(categoryFromTags(['Monthly', 'Hit Price', 'Recurring'])).toBe('')
    expect(categoryFromTags([])).toBe('')
    expect(categoryFromTags(undefined)).toBe('')
    expect(categoryFromTags('Crypto')).toBe('')
  })

  it('also reads a raw gamma tag object, in case the parser is skipped', () => {
    expect(
      categoryFromTags([
        { id: '21', label: 'Crypto', slug: 'crypto' },
        { id: '2', label: 'Politics', slug: 'politics' },
      ]),
    ).toBe('Crypto')
  })
})

describe('normalizePredictionCategory', () => {
  it('reads every Kalshi category into the canonical list', () => {
    // The full set Kalshi publishes, taken from its own
    // `search/tags_by_categories` plus the two legacy values still carried by
    // live events ('World', 'Health'). Measured 2026-08-20.
    const cases: Array<[string, string]> = [
      ['Politics', 'Politics'],
      ['Elections', 'Elections'],
      ['Economics', 'Economics'],
      ['Financials', 'Financials'],
      ['Commodities', 'Commodities'],
      ['Companies', 'Companies'],
      ['Crypto', 'Crypto'],
      ['Sports', 'Sports'],
      ['Mentions', 'Mentions'],
      ['Entertainment', 'Culture'],
      ['Social', 'Culture'],
      ['Science and Technology', 'Tech & Science'],
      ['Climate and Weather', 'Climate'],
      ['Transportation', 'Transport'],
      ['World', 'Geopolitics'],
      ['Health', 'Health'],
    ]
    for (const [raw, expected] of cases) {
      expect(normalizePredictionCategory(raw)).toBe(expected)
    }
  })

  it('keeps a category the taxonomy has not absorbed yet', () => {
    // A venue that lists something new should show it on the rail that day,
    // not vanish off the board until this table catches up.
    expect(normalizePredictionCategory('Underwater Basket Weaving')).toBe(
      'Underwater Basket Weaving',
    )
    expect(normalizePredictionCategory('  ')).toBe('')
  })
})

describe('predictionCategoryScope', () => {
  it('translates a canonical id into each venue own vocabulary', () => {
    expect(predictionCategoryScope('kalshi', 'Geopolitics')).toEqual({
      category: 'World',
    })
    expect(predictionCategoryScope('kalshi', 'Tech & Science')).toEqual({
      category: 'Science and Technology',
    })
    // A gamma SLUG, and not the label lowercased: the tag labelled 'Culture'
    // is `pop-culture`, and ccxt slugifies whatever it is handed.
    expect(predictionCategoryScope('polymarket', 'Culture')).toEqual({
      tags: ['pop-culture'],
    })
    // Case-insensitive: the chip carries whatever the event said.
    expect(predictionCategoryScope('kalshi', 'crypto')).toEqual({
      category: 'Crypto',
    })
  })

  it('refuses a scope the venue has no word for', () => {
    // Kalshi files esports under Sports, so there is no category to send —
    // and a scope that resolves to no series makes ccxt throw rather than
    // return an empty list.
    expect(predictionCategoryScope('kalshi', 'Esports')).toBeNull()
    expect(predictionCategoryScope('kalshi', 'Not A Category')).toBeNull()
  })
})

describe('event projection', () => {
  const eventWith = (extra: Record<string, unknown>) => ({
    id: 'e1',
    event: 'e1',
    title: 'Fed decision in September?',
    markets: [
      {
        id: '0xcond',
        market: 'FED:YES',
        outcomes: [{ outcome: 'FED:YES', outcomeId: '1', label: 'Yes' }],
        info: { question: 'Will the Fed cut?' },
      },
    ],
    ...extra,
  })

  it('derives the category from tags when the venue publishes none', async () => {
    const exchange = fakeExchange({
      fetchEvents: async () => [
        eventWith({ tags: ['fomc', 'Economic Policy', 'Politics'] }),
      ],
    })

    const response = await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: resolver() },
      { query: 'fed' },
    )

    expect(response.events[0]?.category).toBe('Economics')
  })

  it('keeps the venue category when there is one', async () => {
    // Kalshi publishes real categories; a derived guess must never overwrite
    // what a venue states about its own event.
    const exchange = fakeExchange({
      fetchEvents: async () => [
        eventWith({ category: 'Financials', tags: ['Crypto'] }),
      ],
    })

    const response = await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: resolver() },
      { query: 'fed' },
    )

    expect(response.events[0]?.category).toBe('Financials')
  })

  it('leaves the key off entirely when nothing names a topic', async () => {
    const exchange = fakeExchange({
      fetchEvents: async () => [eventWith({ tags: ['Starmer', 'England'] })],
    })

    const response = await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: resolver() },
      { query: 'uk' },
    )

    expect(response.events[0]).not.toHaveProperty('category')
  })

  it('sends the venue its own category word, not the canonical one', async () => {
    // The chip carries 'Geopolitics' because that is what the rail rendered.
    // Kalshi has never heard of it: its word is 'World', and a category that
    // resolves to no series makes ccxt throw rather than return an empty list.
    const scopes: Array<Record<string, unknown>> = []
    const exchange = fakeExchange({
      fetchEvents: async (params) => {
        scopes.push(params ?? {})
        return []
      },
    })

    await fetchPredictionEvents(
      exchange,
      { venue: kalshiPredictionVenue, resolver: resolver() },
      { category: 'Geopolitics', limit: 12 },
    )

    expect(scopes[0]).toEqual({ limit: 12, category: 'World' })
  })

  it('browses when the venue has no word for the category', async () => {
    // Kalshi files esports under Sports, so there is nothing to scope to. The
    // cold-open browse runs instead and the caller filters what it loaded,
    // which beats an `ArgumentsRequired` throw from a scope that resolved to
    // no series.
    let browsed = 0
    const exchange = fakeExchange({
      fetchEvents: async () => {
        throw new Error('fetchEvents must not be reached')
      },
    })

    await fetchPredictionEvents(
      exchange,
      {
        venue: {
          ...kalshiPredictionVenue,
          browseEvents: async () => {
            browsed++
            return []
          },
        },
        resolver: resolver(),
      },
      { category: 'Esports', limit: 12 },
    )

    expect(browsed).toBe(1)
  })

  it('carries open interest off the venue payload onto the market', async () => {
    const exchange = fakeExchange({
      fetchEvents: async () => [
        {
          id: 'e2',
          event: 'e2',
          title: 'CPI above 3.0% in August',
          markets: [
            {
              id: 'KXCPI-26AUG',
              market: 'KXCPI:YES',
              outcomes: [],
              info: { title: 'CPI above 3.0%?', openInterest: 41_208 },
            },
          ],
        },
      ],
    })

    const response = await fetchPredictionEvents(
      exchange,
      { venue: polymarketPredictionVenue, resolver: resolver() },
      { query: 'cpi' },
    )

    expect(response.events[0]?.markets[0]?.openInterest).toBe(41_208)
  })
})

describe('the taxonomy table itself', () => {
  it('sends Polymarket slugs, never labels', () => {
    // gamma matches `tag_slug` only in slug form and ccxt slugifies whatever
    // it is handed, so a capitalised label here silently queries a tag that
    // does not exist. Slug shape is lowercase, digits and hyphens.
    for (const rule of PREDICTION_CATEGORY_RULES) {
      for (const tag of rule.scope['polymarket']?.tags ?? []) {
        expect(tag).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      }
    }
  })

  it('sends Kalshi one of its own sixteen category strings', () => {
    // Kalshi resolves a category through its /series listing, so anything not
    // on this list resolves to no series — and ccxt answers that with a throw,
    // not an empty board. Read off `search/tags_by_categories` plus the two
    // legacy values live events still carry, 2026-08-20.
    const KALSHI_CATEGORIES = new Set([
      'Climate and Weather',
      'Commodities',
      'Companies',
      'Crypto',
      'Economics',
      'Elections',
      'Entertainment',
      'Financials',
      'Health',
      'Mentions',
      'Politics',
      'Science and Technology',
      'Social',
      'Sports',
      'Transportation',
      'World',
    ])
    for (const rule of PREDICTION_CATEGORY_RULES) {
      const category = rule.scope['kalshi']?.category
      if (category === undefined) continue
      expect(KALSHI_CATEGORIES).toContain(category)
    }
  })

  it('gives every rule an id no other rule matches first', () => {
    // A rule whose own id is claimed by a rule above it can never be reached
    // by `normalizePredictionCategory`, which is how a venue category would
    // land on the wrong chip.
    for (const rule of PREDICTION_CATEGORY_RULES) {
      expect(normalizePredictionCategory(rule.id)).toBe(rule.id)
    }
  })
})
