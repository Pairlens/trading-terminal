// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Ticker recovery and headline matching.
 *
 * The failure that matters is a FALSE match. A wrong headline next to a
 * probability move is the pane asserting a cause that never existed, which is
 * strictly worse than the empty column an unmatched question gets.
 */
import { describe, expect, test } from 'bun:test'

import { headlineDuring, newsTickerFor } from '../news-match'
import type { NewsArticle } from '@pairlens/shared/instrument-types'

function article(title: string, timePublished: string): NewsArticle {
  return {
    title,
    url: `https://example.test/${title}`,
    timePublished,
    authors: [],
    summary: '',
    bannerImage: null,
    source: 'Test Wire',
    sourceDomain: 'example.test',
    topics: [],
    overallSentimentScore: 0,
    overallSentimentLabel: 'Neutral',
    tickerSentiment: [],
  }
}

describe('newsTickerFor', () => {
  test('recovers a ticker from the plain name', () => {
    expect(newsTickerFor('Bitcoin above $70k on Aug 31?')).toBe('BTC')
    expect(newsTickerFor('Tesla deliveries above 500k in Q3?')).toBe('TSLA')
  })

  test('answers with the subject, not with whichever alias is listed first', () => {
    // The question is about Ethereum; Bitcoin is the yardstick.
    expect(newsTickerFor('Will Ethereum flip Bitcoin by 2027?')).toBe('ETH')
    expect(newsTickerFor('Will Bitcoin outperform Ethereum in 2027?')).toBe(
      'BTC',
    )
  })

  test('recovers a ticker written as a ticker', () => {
    expect(newsTickerFor('BTC above 70k?')).toBe('BTC')
  })

  test('answers null for a question that names no instrument', () => {
    expect(
      newsTickerFor('Will the Fed cut rates at the September FOMC meeting?'),
    ).toBeNull()
    expect(
      newsTickerFor('Who will win the 2028 Democratic nomination?'),
    ).toBeNull()
    expect(newsTickerFor('')).toBeNull()
  })

  test('does not match a ticker buried inside another word', () => {
    // "SOL" inside "SOLD" or "consolidate" would hang a Solana headline off a
    // question that has nothing to do with it.
    expect(
      newsTickerFor('Will the bill be consolidated before June?'),
    ).toBeNull()
    expect(newsTickerFor('Will the house be SOLD by December?')).toBeNull()
  })
})

describe('headlineDuring', () => {
  const articles = [
    article('early', '2026-08-10T09:00:00Z'),
    article('during-first', '2026-08-14T10:00:00Z'),
    article('during-last', '2026-08-14T16:00:00Z'),
    article('after', '2026-08-16T09:00:00Z'),
  ]
  const start = Date.parse('2026-08-14T00:00:00Z')
  const end = Date.parse('2026-08-15T00:00:00Z')

  test('takes the last headline published inside the window', () => {
    expect(headlineDuring(articles, start, end)?.title).toBe('during-last')
  })

  test('never reaches outside the window', () => {
    const quiet = Date.parse('2026-08-12T00:00:00Z')
    expect(headlineDuring(articles, quiet, quiet + 3_600_000)).toBeNull()
  })

  test('includes both boundaries, so a one-bar window can still match', () => {
    const exact = Date.parse('2026-08-14T16:00:00Z')
    expect(headlineDuring(articles, exact, exact)?.title).toBe('during-last')
  })

  test('ignores an unparseable timestamp rather than treating it as now', () => {
    const broken = [article('broken', 'not a date')]
    expect(headlineDuring(broken, start, end)).toBeNull()
  })

  test('is null for an empty feed', () => {
    expect(headlineDuring([], start, end)).toBeNull()
  })
})
