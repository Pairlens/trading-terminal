// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Sorting and filtering a memecoin column.
 *
 * The rules worth pinning are the ones about ABSENCE. A row whose market cap
 * the feed never published is not a row known to clear a floor, and a row the
 * sort cannot measure is not the smallest one: both are unknowns, and a
 * filter or a sort that treats an unknown as a value is answering a question
 * it does not have the data for. Same rule the safety pane follows.
 */
import { describe, expect, it } from 'bun:test'

import {
  activeFilterCount,
  arrangeTokens,
  nextSort,
  passesFilters,
  pruneFilters,
} from '../board-prefs'
import type {
  LaunchpadFlow,
  LaunchpadToken,
} from '@pairlens/shared/instrument-types'

const NOW = Date.parse('2026-08-23T12:00:00.000Z')

function flow(over: Partial<LaunchpadFlow> = {}): LaunchpadFlow {
  return {
    buys: 10,
    sells: 5,
    buyVolumeUsd: 0,
    sellVolumeUsd: 0,
    volumeUsd: 1_000,
    traders: null,
    priceChangePercent: 1,
    ...over,
  }
}

function token(over: Partial<LaunchpadToken> = {}): LaunchpadToken {
  return {
    chain: 'solana',
    address: 'mint',
    symbol: 'MEME',
    name: 'Meme',
    iconUrl: null,
    decimals: null,
    priceUsd: 1,
    marketCapUsd: 100_000,
    fdvUsd: null,
    liquidityUsd: 20_000,
    holders: 40,
    launchpad: 'pump.fun',
    createdAt: new Date(NOW - 30 * 60_000).toISOString(),
    graduatedAt: null,
    curveProgress: 0.5,
    organicScore: null,
    verified: false,
    audit: null,
    flow: { m5: flow() },
    socials: { twitter: null, telegram: null, website: null },
    stage: 'new',
    source: 'jupiter',
    ...over,
  }
}

describe('passesFilters', () => {
  it('passes everything when nothing is set', () => {
    expect(passesFilters(token(), 'new', undefined, NOW)).toBe(true)
    expect(passesFilters(token(), 'new', {}, NOW)).toBe(true)
  })

  it('treats an unknown as a failure, never as a pass', () => {
    const unknown = token({ marketCapUsd: null, fdvUsd: null })
    expect(passesFilters(unknown, 'new', { minMcap: 1 }, NOW)).toBe(false)
    // And the same for a ceiling: "not known to be under" is not "under".
    expect(passesFilters(unknown, 'new', { maxMcap: 1e12 }, NOW)).toBe(false)
  })

  it('reads market cap the way the row does, FDV included', () => {
    const fdvOnly = token({ marketCapUsd: null, fdvUsd: 250_000 })
    expect(passesFilters(fdvOnly, 'new', { minMcap: 200_000 }, NOW)).toBe(true)
  })

  it('bounds the curve on the stored 0..1, not on percent', () => {
    const row = token({ curveProgress: 0.93 })
    expect(passesFilters(row, 'graduating', { minCurve: 0.9 }, NOW)).toBe(true)
    expect(passesFilters(row, 'graduating', { maxCurve: 0.9 }, NOW)).toBe(false)
  })

  it('measures age from the mint, and from the migration once graduated', () => {
    const row = token({
      createdAt: new Date(NOW - 6 * 60 * 60_000).toISOString(),
      graduatedAt: new Date(NOW - 10 * 60_000).toISOString(),
    })
    expect(passesFilters(row, 'new', { maxAgeMinutes: 60 }, NOW)).toBe(false)
    expect(passesFilters(row, 'graduated', { maxAgeMinutes: 60 }, NOW)).toBe(
      true,
    )
  })

  it('counts trades in the window that column reads', () => {
    // A launch is read at five minutes and a large cap at twenty-four hours,
    // so the same bound means different things per column, on purpose.
    const row = token({
      flow: {
        m5: flow({ buys: 2, sells: 1 }),
        h24: flow({ buys: 900, sells: 700 }),
      },
    })
    expect(passesFilters(row, 'new', { minTrades: 100 }, NOW)).toBe(false)
    expect(passesFilters(row, 'legendary', { minTrades: 100 }, NOW)).toBe(true)
  })
})

describe('arrangeTokens', () => {
  const rows = [
    token({ address: 'a', symbol: 'AAA', marketCapUsd: 300 }),
    token({ address: 'b', symbol: 'CCC', marketCapUsd: 100 }),
    token({ address: 'c', symbol: 'BBB', marketCapUsd: 200 }),
  ]

  it('keeps the feed order when nothing is sorted', () => {
    const out = arrangeTokens(rows, 'new', undefined, NOW)
    expect(out.map((r) => r.address)).toEqual(['a', 'b', 'c'])
  })

  it('never mutates the array it was handed', () => {
    // The rows come straight out of the React Query cache; sorting in place
    // would reorder the cached answer for every other reader of it.
    const input = [...rows]
    arrangeTokens(input, 'new', { sort: { key: 'mcap', dir: 'asc' } }, NOW)
    expect(input.map((r) => r.address)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by market cap in both directions', () => {
    const desc = arrangeTokens(
      rows,
      'new',
      { sort: { key: 'mcap', dir: 'desc' } },
      NOW,
    )
    expect(desc.map((r) => r.address)).toEqual(['a', 'c', 'b'])
    const asc = arrangeTokens(
      rows,
      'new',
      { sort: { key: 'mcap', dir: 'asc' } },
      NOW,
    )
    expect(asc.map((r) => r.address)).toEqual(['b', 'c', 'a'])
  })

  it('sinks unmeasurable rows in BOTH directions', () => {
    const withGap = [
      ...rows,
      token({ address: 'd', marketCapUsd: null, fdvUsd: null }),
    ]
    for (const dir of ['asc', 'desc'] as const) {
      const out = arrangeTokens(
        withGap,
        'new',
        { sort: { key: 'mcap', dir } },
        NOW,
      )
      expect(out[out.length - 1]?.address).toBe('d')
    }
  })

  it('sorts the flow column by NET trades', () => {
    // Total activity would rank a row being dumped above one being bought,
    // which is the opposite of what somebody sorting this column wants.
    const flows = [
      token({
        address: 'dumped',
        flow: { m5: flow({ buys: 20, sells: 480 }) },
      }),
      token({
        address: 'bought',
        flow: { m5: flow({ buys: 300, sells: 10 }) },
      }),
    ]
    const out = arrangeTokens(
      flows,
      'new',
      { sort: { key: 'flow', dir: 'desc' } },
      NOW,
    )
    expect(out[0]?.address).toBe('bought')
  })

  it('sorts Legendary flow by traded volume instead', () => {
    const flows = [
      token({ address: 'quiet', flow: { h24: flow({ volumeUsd: 10 }) } }),
      token({ address: 'busy', flow: { h24: flow({ volumeUsd: 1_000 }) } }),
    ]
    const out = arrangeTokens(
      flows,
      'legendary',
      { sort: { key: 'flow', dir: 'desc' } },
      NOW,
    )
    expect(out[0]?.address).toBe('busy')
  })

  it('filters before it sorts', () => {
    const out = arrangeTokens(
      rows,
      'new',
      { sort: { key: 'mcap', dir: 'asc' }, filters: { minMcap: 150 } },
      NOW,
    )
    expect(out.map((r) => r.address)).toEqual(['c', 'a'])
  })
})

describe('nextSort', () => {
  it('cycles descending, ascending, then back to the feed order', () => {
    // Three states, not two: a two-state toggle strands a reader who only
    // wanted a look, because nothing on the header says "put it back".
    let sort = nextSort(null, 'mcap')
    expect(sort).toEqual({ key: 'mcap', dir: 'desc' })
    sort = nextSort(sort, 'mcap')
    expect(sort).toEqual({ key: 'mcap', dir: 'asc' })
    expect(nextSort(sort, 'mcap')).toBeNull()
  })

  it('starts a different column at descending', () => {
    expect(nextSort({ key: 'mcap', dir: 'asc' }, 'token')).toEqual({
      key: 'token',
      dir: 'desc',
    })
  })
})

describe('pruneFilters and activeFilterCount', () => {
  it('drops everything that is not a real bound', () => {
    const pruned = pruneFilters({
      minMcap: 1_000,
      maxMcap: undefined,
      minHolders: Number.NaN,
    } as never)
    expect(pruned).toEqual({ minMcap: 1_000 })
    expect(activeFilterCount(pruned)).toBe(1)
    expect(activeFilterCount(undefined)).toBe(0)
  })
})
