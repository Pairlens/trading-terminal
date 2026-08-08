// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  LOAD_AHEAD,
  feedCounter,
  filterNewsArticles,
  shouldLoadOlder,
  slideIndexFromScroll,
} from '../lib/news-reader-feed'
import type { NewsArticle } from '@pairlens/shared/instrument-types'

function article(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    title: 'SK Hynix approves chip plant investment',
    url: `https://example.com/${overrides.title ?? 'a'}`,
    timePublished: '2026-08-08T10:00:00Z',
    authors: [],
    summary: 'The board signed off on two new fabrication plants.',
    bannerImage: null,
    source: 'Reuters',
    sourceDomain: 'reuters.com',
    topics: [],
    overallSentimentScore: 0.41,
    overallSentimentLabel: 'Bullish',
    tickerSentiment: [],
    ...overrides,
  }
}

describe('filterNewsArticles', () => {
  const feed = [
    article({ title: 'Bitcoin ETF inflows accelerate', source: 'Reuters' }),
    article({ title: 'Chip demand holds', summary: 'Solana validators grew' }),
    article({
      title: 'Quiet session',
      source: 'Bloomberg',
      tickerSentiment: [
        {
          ticker: 'CRYPTO:ETH',
          relevanceScore: 0.5,
          sentimentScore: 0.1,
          sentimentLabel: 'Neutral',
        },
      ],
    }),
  ]

  test('an empty query returns the very same array', () => {
    expect(filterNewsArticles(feed, '')).toBe(feed)
    expect(filterNewsArticles(feed, '   ')).toBe(feed)
  })

  test('matches title, summary, source and ticker, case-insensitively', () => {
    expect(filterNewsArticles(feed, 'bitcoin')).toHaveLength(1)
    expect(filterNewsArticles(feed, 'SOLANA')).toHaveLength(1)
    expect(filterNewsArticles(feed, 'bloomberg')).toHaveLength(1)
    expect(filterNewsArticles(feed, 'eth')).toHaveLength(1)
  })

  test('no match is an empty feed, not the whole feed', () => {
    expect(filterNewsArticles(feed, 'zzzz')).toEqual([])
  })
})

describe('slideIndexFromScroll', () => {
  test('rounds to the nearest slide, so the counter flips mid-drag', () => {
    expect(slideIndexFromScroll(0, 874)).toBe(0)
    expect(slideIndexFromScroll(400, 874)).toBe(0)
    expect(slideIndexFromScroll(500, 874)).toBe(1)
    expect(slideIndexFromScroll(874, 874)).toBe(1)
    expect(slideIndexFromScroll(874 * 8, 874)).toBe(8)
  })

  test('an unmeasured feed is slide zero, never NaN', () => {
    expect(slideIndexFromScroll(120, 0)).toBe(0)
    expect(slideIndexFromScroll(-40, 874)).toBe(0)
  })
})

describe('feedCounter', () => {
  test('reads 1-based, and marks a feed with more pages behind it', () => {
    expect(feedCounter(8, 50, true)).toBe('9 / 50+')
    expect(feedCounter(8, 50, false)).toBe('9 / 50')
  })

  test('the status slide holds at the last story instead of overcounting', () => {
    expect(feedCounter(50, 50, false)).toBe('50 / 50')
  })

  test('an empty feed reads 0 / 0', () => {
    expect(feedCounter(0, 0, true)).toBe('0 / 0')
  })
})

describe('shouldLoadOlder', () => {
  const base = {
    activeIndex: 0,
    loaded: 50,
    hasMore: true,
    isLoadingMore: false,
    searching: false,
  }

  test('pages once the reader is within LOAD_AHEAD of the end', () => {
    expect(shouldLoadOlder({ ...base, activeIndex: 50 - LOAD_AHEAD })).toBe(
      true,
    )
    expect(shouldLoadOlder({ ...base, activeIndex: 50 - LOAD_AHEAD - 1 })).toBe(
      false,
    )
  })

  test('never pages while searching, exhausted, or already fetching', () => {
    const near = { ...base, activeIndex: 49 }
    expect(shouldLoadOlder({ ...near, searching: true })).toBe(false)
    expect(shouldLoadOlder({ ...near, hasMore: false })).toBe(false)
    expect(shouldLoadOlder({ ...near, isLoadingMore: true })).toBe(false)
  })
})
