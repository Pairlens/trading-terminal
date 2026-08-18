// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The discovery news row leads with a symbol and its live move. Everything
// that decides WHICH symbol, and what to say when there isn't one, is pure —
// and it is also the part that quietly goes wrong, because the provider
// namespaces crypto tickers and a raw compare against a watchlist of bases
// misses every crypto mention on the spot board.
import { describe, expect, test } from 'bun:test'

import type { NewsArticle } from '@pairlens/shared/instrument-types'
import {
  countWatchedMentions,
  isCryptoNewsTicker,
  isEquityNewsTicker,
  newsRowTag,
  newsTickerBase,
  topNewsTicker,
} from '@/components/news/news-shared'

function article(partial: Partial<NewsArticle> = {}): NewsArticle {
  return {
    title: 'Headline',
    url: 'https://example.test/a',
    timePublished: '2026-08-18T00:00:00.000Z',
    authors: [],
    summary: '',
    bannerImage: null,
    source: 'The Block',
    sourceDomain: 'theblock.co',
    topics: [],
    overallSentimentScore: 0,
    overallSentimentLabel: 'Neutral',
    tickerSentiment: [],
    ...partial,
  }
}

function ticker(symbol: string, relevanceScore: number) {
  return {
    ticker: symbol,
    relevanceScore,
    sentimentScore: 0,
    sentimentLabel: 'Neutral',
  }
}

describe('newsTickerBase', () => {
  test('strips the provider namespace', () => {
    expect(newsTickerBase('CRYPTO:BTC')).toBe('BTC')
    expect(newsTickerBase('FOREX:USD')).toBe('USD')
  })

  test('leaves a bare equity ticker alone, and normalizes case', () => {
    expect(newsTickerBase('AAPL')).toBe('AAPL')
    expect(newsTickerBase(' nvda ')).toBe('NVDA')
  })
})

describe('isCryptoNewsTicker / isEquityNewsTicker', () => {
  test('the namespace is what separates the two asset classes', () => {
    expect(isCryptoNewsTicker('CRYPTO:BTC')).toBe(true)
    expect(isCryptoNewsTicker('BTC')).toBe(false)
    expect(isEquityNewsTicker('AAPL')).toBe(true)
    expect(isEquityNewsTicker('CRYPTO:BTC')).toBe(false)
    // Forex is neither: no board on Discovery can price it.
    expect(isCryptoNewsTicker('FOREX:USD')).toBe(false)
    expect(isEquityNewsTicker('FOREX:USD')).toBe(false)
  })
})

describe('topNewsTicker', () => {
  test('picks the provider’s most relevant symbol, namespace kept', () => {
    expect(
      topNewsTicker(
        article({
          tickerSentiment: [
            ticker('CRYPTO:ETH', 0.2),
            ticker('CRYPTO:TAO', 0.91),
            ticker('CRYPTO:BTC', 0.4),
          ],
        }),
      ),
    ).toEqual({ raw: 'CRYPTO:TAO', base: 'TAO' })
  })

  test('a tie keeps the provider’s own ordering', () => {
    expect(
      topNewsTicker(
        article({
          tickerSentiment: [ticker('AAPL', 0.5), ticker('MSFT', 0.5)],
        }),
      ),
    ).toEqual({ raw: 'AAPL', base: 'AAPL' })
  })

  test('a story about nothing tradeable has no ticker', () => {
    expect(topNewsTicker(article())).toBeNull()
  })
})

describe('newsRowTag', () => {
  const moves: Record<string, number> = { TAO: 18.9, ONDO: 5.8 }
  // The spot board's rule: price crypto symbols only.
  const changeFor = (ref: { raw: string; base: string }) =>
    isCryptoNewsTicker(ref.raw) ? (moves[ref.base] ?? null) : null

  test('a priced symbol wins, and carries its move', () => {
    expect(
      newsRowTag(
        article({ tickerSentiment: [ticker('CRYPTO:TAO', 0.9)] }),
        changeFor,
      ),
    ).toEqual({ label: 'TAO', changePct: 18.9 })
  })

  test('a macro print is labelled MACRO rather than picking one victim', () => {
    // It names a ticker AND it is macro: no single symbol would be honest
    // about a CPI print, so the macro label wins over the unpriced symbol.
    expect(
      newsRowTag(
        article({
          topics: [{ topic: 'economy_macro', relevanceScore: 1 }],
          tickerSentiment: [ticker('FOREX:USD', 0.8)],
        }),
        changeFor,
      ),
    ).toEqual({ label: 'MACRO', changePct: null })
  })

  test('macro does not override a symbol the board can actually price', () => {
    expect(
      newsRowTag(
        article({
          topics: [{ topic: 'economy_macro', relevanceScore: 1 }],
          tickerSentiment: [ticker('CRYPTO:ONDO', 0.7)],
        }),
        changeFor,
      ),
    ).toEqual({ label: 'ONDO', changePct: 5.8 })
  })

  test('an unpriced symbol still names itself', () => {
    expect(
      newsRowTag(
        article({ tickerSentiment: [ticker('CRYPTO:XYZ', 0.6)] }),
        changeFor,
      ),
    ).toEqual({ label: 'XYZ', changePct: null })
  })

  test('with nothing else, the publisher is the tag', () => {
    expect(newsRowTag(article(), changeFor)).toEqual({
      label: 'The Block',
      changePct: null,
    })
  })

  test('a non-finite quote is treated as no quote', () => {
    expect(
      newsRowTag(
        article({ tickerSentiment: [ticker('BTC', 1)] }),
        () => Number.NaN,
      ),
    ).toEqual({ label: 'BTC', changePct: null })
  })

  test('an equity ticker never borrows a crypto percentage', () => {
    // CFG is Citizens Financial Group on the wire and Centrifuge in a crypto
    // snapshot. The bare symbol is the equity, so the spot board's lookup
    // refuses it and the row leads with the name alone.
    const cfgMoves: Record<string, number> = { CFG: -7.4 }
    expect(
      newsRowTag(article({ tickerSentiment: [ticker('CFG', 0.9)] }), (ref) =>
        isCryptoNewsTicker(ref.raw) ? (cfgMoves[ref.base] ?? null) : null,
      ),
    ).toEqual({ label: 'CFG', changePct: null })
    // Namespaced, the same symbol IS the token, and the move belongs.
    expect(
      newsRowTag(
        article({ tickerSentiment: [ticker('CRYPTO:CFG', 0.9)] }),
        (ref) =>
          isCryptoNewsTicker(ref.raw) ? (cfgMoves[ref.base] ?? null) : null,
      ),
    ).toEqual({ label: 'CFG', changePct: -7.4 })
  })
})

describe('countWatchedMentions', () => {
  const watched = new Set(['BTC', 'ETH', 'SOL'])

  test('counts the reader’s own symbols, namespace and all', () => {
    expect(
      countWatchedMentions(
        article({
          tickerSentiment: [
            ticker('CRYPTO:BTC', 0.4),
            ticker('CRYPTO:ETH', 0.3),
            ticker('CRYPTO:DOGE', 0.2),
          ],
        }),
        watched,
      ),
    ).toBe(2)
  })

  test('one asset named twice is one mention', () => {
    expect(
      countWatchedMentions(
        article({
          tickerSentiment: [ticker('CRYPTO:BTC', 0.4), ticker('BTC', 0.1)],
        }),
        watched,
      ),
    ).toBe(1)
  })

  test('an empty watchlist can never be mentioned', () => {
    expect(
      countWatchedMentions(
        article({ tickerSentiment: [ticker('CRYPTO:BTC', 1)] }),
        new Set(),
      ),
    ).toBe(0)
  })
})
