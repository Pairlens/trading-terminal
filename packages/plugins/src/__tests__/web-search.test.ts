// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { fanOutWebSearch, readSearchRequest } from '../lib/web-search'
import { mapTavilyResults } from '../tavily-search'
import { mapExaResults } from '../exa-search'
import type { WebSearchResult } from '@pairlens/shared/plugin-types'

function result(url: string): WebSearchResult {
  return { url, title: url, excerpt: '', publishDate: null }
}

describe('readSearchRequest', () => {
  test('prefers focused queries, capped at 4', () => {
    const { queries, maxResults } = readSearchRequest({
      objective: 'long objective',
      search_queries: ['a', 'b', 'c', 'd', 'e'],
      max_results: 8,
    })
    expect(queries).toEqual(['a', 'b', 'c', 'd'])
    expect(maxResults).toBe(8)
  })

  test('falls back to the objective and default budget', () => {
    const { queries, maxResults } = readSearchRequest({
      objective: 'BTC catalysts',
    })
    expect(queries).toEqual(['BTC catalysts'])
    expect(maxResults).toBe(10)
  })

  test('ignores malformed queries and out-of-range budgets', () => {
    const { queries, maxResults } = readSearchRequest({
      objective: 'x',
      search_queries: [42, '', '  ', 'valid'] as Array<unknown>,
      max_results: 500,
    })
    expect(queries).toEqual(['valid'])
    expect(maxResults).toBe(20)
  })
})

describe('fanOutWebSearch', () => {
  test('merges parallel queries, dedupes by URL, caps the total', async () => {
    const { results } = await fanOutWebSearch(['q1', 'q2'], 3, async (q) =>
      q === 'q1'
        ? [result('https://a.com'), result('https://b.com')]
        : [
            result('https://b.com'),
            result('https://c.com'),
            result('https://d.com'),
          ],
    )
    expect(results.map((r) => r.url)).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ])
  })

  test('tolerates partial query failures', async () => {
    const { results } = await fanOutWebSearch(['ok', 'boom'], 10, async (q) => {
      if (q === 'boom') throw new Error('rate limited')
      return [result('https://a.com')]
    })
    expect(results.map((r) => r.url)).toEqual(['https://a.com'])
  })

  test('throws when every query fails (bad API key surfaces)', async () => {
    expect(
      fanOutWebSearch(['a', 'b'], 10, async () => {
        throw new Error('API error 401')
      }),
    ).rejects.toThrow('401')
  })

  test('returns empty for no queries', async () => {
    const { results } = await fanOutWebSearch([], 10, async () => {
      throw new Error('must not be called')
    })
    expect(results).toEqual([])
  })
})

describe('provider response mappers', () => {
  test('mapTavilyResults maps content → excerpt and published_date', () => {
    const mapped = mapTavilyResults({
      results: [
        {
          url: 'https://a.com',
          title: 'A',
          content: 'excerpt A',
          published_date: '2026-07-01',
        },
        { title: 'no url — dropped' },
      ],
    })
    expect(mapped).toEqual([
      {
        url: 'https://a.com',
        title: 'A',
        excerpt: 'excerpt A',
        publishDate: '2026-07-01',
      },
    ])
  })

  test('mapExaResults maps text → excerpt and null titles → url', () => {
    const mapped = mapExaResults({
      results: [
        {
          url: 'https://b.com',
          title: null,
          text: 'excerpt B',
          publishedDate: '2026-06-30',
        },
      ],
    })
    expect(mapped).toEqual([
      {
        url: 'https://b.com',
        title: 'https://b.com',
        excerpt: 'excerpt B',
        publishDate: '2026-06-30',
      },
    ])
  })

  test('mappers return empty for malformed payloads', () => {
    expect(mapTavilyResults(null)).toEqual([])
    expect(mapExaResults({ results: 'nope' })).toEqual([])
  })
})
