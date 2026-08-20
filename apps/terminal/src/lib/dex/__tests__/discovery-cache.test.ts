// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The snapshot cache is the only thing on the DEX Discovery board that can show
 * a number nobody measured this session, so its rules are the whole feature: how
 * old a snapshot may be, whose clock stamps it, and what happens when the store
 * is full or unreadable.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

// Minimal localStorage backing — the module reads it lazily and defensively.
const backing = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, String(v))
    },
    removeItem: (k: string) => {
      backing.delete(k)
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size
    },
  } as Storage
}

const {
  DISCOVERY_SNAPSHOT_TTL_MS,
  clearDiscoverySnapshots,
  readDiscoverySnapshot,
  writeDiscoverySnapshot,
} = await import('../discovery-cache')

beforeEach(() => {
  clearDiscoverySnapshots()
})

describe('readDiscoverySnapshot', () => {
  test('hands back what was written, with the timestamp it was measured at', () => {
    const ts = Date.now() - 60_000
    writeDiscoverySnapshot('listing:base', { pools: [1, 2, 3] }, ts)

    const seed = readDiscoverySnapshot<{ pools: Array<number> }>('listing:base')
    expect(seed?.data.pools).toEqual([1, 2, 3])
    // The timestamp is what tells React Query the seed is stale and a refetch
    // is due. Losing it is how a board shows half-hour-old volume with nothing
    // in flight.
    expect(seed?.ts).toBe(ts)
  })

  test('refuses a snapshot past the TTL rather than painting it', () => {
    writeDiscoverySnapshot(
      'listing:base',
      { pools: [] },
      Date.now() - DISCOVERY_SNAPSHOT_TTL_MS - 1,
    )
    expect(readDiscoverySnapshot('listing:base')).toBeNull()
  })

  test('is null for a key nobody wrote', () => {
    expect(readDiscoverySnapshot('listing:nothing')).toBeNull()
  })
})

describe('writeDiscoverySnapshot', () => {
  test('never moves an entry backwards in time', () => {
    // Two panes share one query, so the same data is offered here twice in a
    // tick — once by the pane that mounted first, once by the pane behind it.
    const fresh = Date.now()
    writeDiscoverySnapshot('listing:base', { v: 'new' }, fresh)
    writeDiscoverySnapshot('listing:base', { v: 'old' }, fresh - 10_000)

    const seed = readDiscoverySnapshot<{ v: string }>('listing:base')
    expect(seed?.data.v).toBe('new')
    expect(seed?.ts).toBe(fresh)
  })

  test('does not renew the age of a value it was seeded with', () => {
    // The immortality bug. A query seeded from a snapshot re-offers that same
    // data on its first render; stamping it with the clock each time would mean
    // an offline board never expires yesterday's ranking.
    const measured = Date.now() - DISCOVERY_SNAPSHOT_TTL_MS + 1_000
    writeDiscoverySnapshot('listing:base', { pools: [] }, measured)
    writeDiscoverySnapshot('listing:base', { pools: [] }, measured)

    expect(readDiscoverySnapshot('listing:base')?.ts).toBe(measured)
  })

  test('ignores an empty answer, so a seed survives a null read', () => {
    writeDiscoverySnapshot('listing:base', { pools: [1] })
    writeDiscoverySnapshot('listing:base', null)
    writeDiscoverySnapshot('listing:base', undefined)

    expect(
      readDiscoverySnapshot<{ pools: Array<number> }>('listing:base')?.data
        .pools,
    ).toEqual([1])
  })
})

describe('the caps', () => {
  test('keeps the newest entries and drops the rest', () => {
    const now = Date.now()
    // Well past the entry cap, written oldest first.
    for (let i = 0; i < 40; i += 1) {
      writeDiscoverySnapshot(`listing:chain${i}`, { i }, now - (40 - i) * 1_000)
    }

    // The newest survives, the oldest does not, and the store did not simply
    // stop accepting writes once it was full.
    expect(readDiscoverySnapshot('listing:chain39')).not.toBeNull()
    expect(readDiscoverySnapshot('listing:chain0')).toBeNull()
  })

  test('holds a whole DEX board: a row per chain and two listings per chain', () => {
    // The rail keeps one entry per chain rather than one per rail, so a
    // six-chain board carries six rows plus the page-1 and depth listings of
    // the chains it has visited. If the cap cannot hold that, the entries the
    // cache exists to seed are the ones it evicts.
    const now = Date.now()
    const chains = ['jupiter', 'ethereum', 'base', 'arbitrum', 'bsc', 'polygon']
    let step = 0
    for (const chain of chains) {
      writeDiscoverySnapshot(
        `dex-chain-stats:${chain}`,
        { chain },
        now + step++,
      )
    }
    for (const chain of chains.slice(0, 3)) {
      writeDiscoverySnapshot(
        `listing:${chain}:volume:1`,
        { chain },
        now + step++,
      )
      writeDiscoverySnapshot(
        `listing:${chain}:volume:3`,
        { chain },
        now + step++,
      )
    }

    for (const chain of chains) {
      expect(readDiscoverySnapshot(`dex-chain-stats:${chain}`)).not.toBeNull()
    }
    expect(readDiscoverySnapshot('listing:jupiter:volume:1')).not.toBeNull()
    expect(readDiscoverySnapshot('listing:base:volume:3')).not.toBeNull()
  })
})

describe('a store it cannot read', () => {
  test('opens cold instead of throwing', () => {
    localStorage.setItem('pairlens:dex-discovery-cache', '{not json')
    // The module parses lazily, so the corrupt value is only met on first read.
    clearDiscoverySnapshots()
    localStorage.setItem('pairlens:dex-discovery-cache', '{not json')

    expect(() => readDiscoverySnapshot('listing:base')).not.toThrow()
    expect(readDiscoverySnapshot('listing:base')).toBeNull()
  })
})
