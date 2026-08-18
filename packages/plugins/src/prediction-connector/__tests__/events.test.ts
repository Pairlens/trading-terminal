// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The event projection's two gaps, pinned.
 *
 * Both were visible on a fresh browser profile. Polymarket publishes no
 * `category` at all, so the discovery board's category rail rendered a single
 * "All" row and the word "This venue does not tag its events by category" —
 * while gamma was returning six tags per event the whole time. And Kalshi
 * keeps open interest inside its own payload rather than on the ccxt market
 * row, so a stat the venue does publish never reached a card footer.
 *
 * The tag arrays below are copied verbatim from a live browse of
 * `https://gamma-api.polymarket.com/events?limit=40&closed=false&active=true
 * &order=volume24hr&ascending=false` on 2026-08-18, flattened to labels the
 * way ccxt's `parseEvent` flattens them. They are the reason the parser walks
 * for a KNOWN topic instead of taking `tags[0]`: the first tag is 'fomc',
 * 'Bitcoin', 'putin' or 'UK' about as often as it is a category.
 */
import { describe, expect, it } from 'bun:test'

import { categoryFromTags, fetchPredictionEvents } from '../events'
import { OutcomeKeyMap } from '../outcome-keys'
import { OutcomeResolver } from '../outcomes'
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
      [['Esports', 'league of legends', 'Games', 'Sports'], 'Sports'],
      [['Sports', 'Games', 'MLB', 'baseball'], 'Sports'],
      [['Tennis', 'Sports', 'Games'], 'Sports'],
      [
        ['fomc', 'Economic Policy', 'Fed Rates', 'Jerome Powell', 'Politics'],
        'Economics',
      ],
      [['Finance', 'Monthly', 'Hit Price', 'Hide From New'], 'Economics'],
      [['Bitcoin', 'Monthly', 'Hit Price', 'Crypto', 'Recurring'], 'Crypto'],
      [['Ethereum', 'Monthly', 'Hit Price', 'Crypto Prices'], 'Crypto'],
      [
        ['United States', 'Elections', 'Politics', 'US Election', 'Earn 4%'],
        'Politics',
      ],
      [
        ['primary elections', 'Governor Primary', 'Florida Primary'],
        'Politics',
      ],
      [['France', 'Politics', 'Macron', '2025 Predictions'], 'Politics'],
      [
        ['putin', 'Geopolitics', 'Ukraine', 'Politics', 'Russia'],
        'Geopolitics',
      ],
      [['Culture', 'Politics', 'Tweet Markets'], 'Culture'],
    ]
    for (const [tags, expected] of cases) {
      expect(categoryFromTags(tags)).toBe(expected)
    }
  })

  it('files an election under Politics even when the tag also says world', () => {
    // 'World Elections' matches the geopolitics rule too, and it is an
    // election. Rule order inside the list is what decides it.
    expect(categoryFromTags(['World Elections', 'Global Elections'])).toBe(
      'Politics',
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
