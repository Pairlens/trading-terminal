// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { paneRequirements, rankPanes } from '../pane-picker'
import type { PanePickerEntry } from '../pane-picker'
import type { PaneDefinition } from '../types'

function entry(
  type: string,
  label: string,
  description = '',
  extra: Partial<PanePickerEntry> = {},
): PanePickerEntry {
  return {
    type,
    def: { type, labelKey: `panes.${type}`, icon: 'X' },
    label,
    description,
    categoryLabel: 'Charting',
    sourceLabel: 'Pairlens Core',
    ...extra,
  }
}

const CATALOG: Array<PanePickerEntry> = [
  entry('orderbook', 'Order Book', 'Live bids and asks'),
  entry('trades', 'Trades', 'The live tape, trade by trade'),
  entry('funding-matrix', 'Funding Matrix', 'Funding across every venue'),
  entry('funding-belt', 'Funding Belt', 'Countdown to the next stamp'),
  entry('pair-dossier', 'Pair Dossier', 'Range, volume and book depth'),
  entry('nft-book', 'NFT Book', 'Two-sided ladder for a collection', {
    categoryLabel: 'Trading',
    sourceLabel: 'Pairlens NFTs',
  }),
]

describe('rankPanes', () => {
  test('an empty query keeps the authored order', () => {
    expect(rankPanes(CATALOG, '   ')).toEqual(CATALOG)
  })

  test('a name match outranks a description match', () => {
    // "book" is in Order Book's name and in Pair Dossier's description.
    const hits = rankPanes(CATALOG, 'book').map((e) => e.type)
    expect(hits[0]).toBe('orderbook')
    expect(hits).toContain('pair-dossier')
    expect(hits.indexOf('orderbook')).toBeLessThan(hits.indexOf('pair-dossier'))
  })

  test('a prefix outranks a match in the middle of a word', () => {
    const hits = rankPanes(
      [entry('a', 'Trade Entry'), entry('b', 'On-chain Trades')],
      'trade',
    ).map((e) => e.type)
    expect(hits[0]).toBe('a')
  })

  test('every token has to match: two words narrow rather than widen', () => {
    const hits = rankPanes(CATALOG, 'funding matrix').map((e) => e.type)
    expect(hits).toEqual(['funding-matrix'])
  })

  test('the pane type is searchable, so a saved layout name finds it', () => {
    expect(rankPanes(CATALOG, 'nft-book').map((e) => e.type)).toEqual([
      'nft-book',
    ])
  })

  test('the owning plugin is searchable', () => {
    expect(rankPanes(CATALOG, 'pairlens nfts').map((e) => e.type)).toEqual([
      'nft-book',
    ])
  })

  test('a query nothing matches returns nothing, not everything', () => {
    expect(rankPanes(CATALOG, 'zzzz')).toEqual([])
  })
})

describe('paneRequirements', () => {
  const def = (partial: Partial<PaneDefinition>): PaneDefinition => ({
    type: 't',
    labelKey: 'panes.t',
    icon: 'X',
    ...partial,
  })

  test('reads the workspace slots by name', () => {
    expect(
      paneRequirements(
        def({ requires: ['workspace:active-pair', 'workspace:active-wallet'] }),
      ),
    ).toEqual([{ kind: 'pair' }, { kind: 'wallet' }])
  })

  test('anything else in requires is a capability, not silence', () => {
    expect(
      paneRequirements(def({ requires: ['market-data:funding'] })),
    ).toEqual([{ kind: 'capability', capability: 'market-data:funding' }])
  })

  test('desktop, singleton and tier are facts the manifest already carries', () => {
    expect(
      paneRequirements(
        def({
          requiresDesktop: true,
          singleton: true,
          requiredAccessLevel: 'pro',
        }),
      ),
    ).toEqual([
      { kind: 'desktop' },
      { kind: 'singleton' },
      { kind: 'access', level: 'pro' },
    ])
  })

  test('a panel that needs nothing says nothing', () => {
    expect(paneRequirements(def({}))).toEqual([])
  })
})
