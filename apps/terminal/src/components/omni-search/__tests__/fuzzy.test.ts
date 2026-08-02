// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { fuzzyMatch, rankItems } from '../fuzzy'

describe('fuzzyMatch', () => {
  test('matches exact substring', () => {
    const m = fuzzyMatch('sett', 'Open settings')
    expect(m).not.toBeNull()
    expect(m!.ranges).toEqual([[5, 9]])
  })

  test('multi-word query matches across the label', () => {
    const m = fuzzyMatch('open settings', 'Open settings')
    expect(m).not.toBeNull()
    expect(m!.ranges).toEqual([
      [0, 4],
      [5, 13],
    ])
  })

  test('multi-word query is order-insensitive', () => {
    expect(fuzzyMatch('settings open', 'Open settings')).not.toBeNull()
  })

  test('fails when a token has no match', () => {
    expect(fuzzyMatch('open xyzzy', 'Open settings')).toBeNull()
  })

  test('subsequence matches word initials', () => {
    const m = fuzzyMatch('ws', 'Workspace Store')
    expect(m).not.toBeNull()
  })

  test('single-char query requires a substring hit', () => {
    // 'z' appears nowhere — no scattered-letter matches for 1-char tokens
    expect(fuzzyMatch('z', 'Open settings')).toBeNull()
    expect(fuzzyMatch('o', 'Open settings')).not.toBeNull()
  })

  test('prefix match outscores mid-string match', () => {
    const prefix = fuzzyMatch('set', 'Settings')!
    const mid = fuzzyMatch('set', 'Reset theme')!
    expect(prefix.score).toBeGreaterThan(mid.score)
  })

  test('word-boundary match outscores embedded match', () => {
    const boundary = fuzzyMatch('theme', 'Reset theme')!
    const embedded = fuzzyMatch('heme', 'Reset theme')!
    expect(boundary.score).toBeGreaterThan(embedded.score)
  })

  test('is case-insensitive', () => {
    expect(fuzzyMatch('BTC', 'btc-usdt')).not.toBeNull()
    expect(fuzzyMatch('btc', 'BTC-USDT')).not.toBeNull()
  })

  test('camelCase humps count as word boundaries', () => {
    const m = fuzzyMatch('od', 'OrderBook Depth')
    expect(m).not.toBeNull()
  })

  test('blank query returns null', () => {
    expect(fuzzyMatch('', 'anything')).toBeNull()
    expect(fuzzyMatch('   ', 'anything')).toBeNull()
  })

  test('merges overlapping ranges', () => {
    const m = fuzzyMatch('set settings', 'Settings')
    expect(m).not.toBeNull()
    for (const [start, end] of m!.ranges) {
      expect(end).toBeGreaterThan(start)
    }
    // Ranges must be disjoint and ordered
    for (let i = 1; i < m!.ranges.length; i++) {
      expect(m!.ranges[i][0]).toBeGreaterThanOrEqual(m!.ranges[i - 1][1])
    }
  })
})

describe('rankItems', () => {
  const items = [
    {
      name: 'Open settings',
      description: undefined,
      keywords: ['preferences'],
    },
    {
      name: 'Reset theme',
      description: 'Back to default',
      keywords: undefined,
    },
    { name: 'Sign out', description: undefined, keywords: ['logout'] },
  ]
  const accessors = {
    primary: (i: (typeof items)[number]) => i.name,
    secondary: (i: (typeof items)[number]) => i.description,
    keywords: (i: (typeof items)[number]) => i.keywords,
  }

  test('empty query returns nothing', () => {
    expect(rankItems('', items, accessors)).toEqual([])
  })

  test('filters non-matching items', () => {
    const ranked = rankItems('settings', items, accessors)
    expect(ranked.length).toBe(1)
    expect(ranked[0].item.name).toBe('Open settings')
    expect(ranked[0].ranges.length).toBeGreaterThan(0)
  })

  test('matches via keywords without producing ranges', () => {
    const ranked = rankItems('logout', items, accessors)
    expect(ranked.length).toBe(1)
    expect(ranked[0].item.name).toBe('Sign out')
    expect(ranked[0].ranges).toEqual([])
  })

  test('matches via description at reduced weight', () => {
    const ranked = rankItems('default', items, accessors)
    expect(ranked.length).toBe(1)
    expect(ranked[0].item.name).toBe('Reset theme')
  })

  test('sorts by score descending', () => {
    const ranked = rankItems('se', items, accessors)
    expect(ranked.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score)
    }
  })
})
