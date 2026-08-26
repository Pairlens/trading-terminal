// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pair picker's own half of the cross-class rule. `crossClassVenuesFor`
 * answers "whose tape"; this answers "under which name", and the two have to
 * agree or the picker offers a row the venue list cannot serve.
 */
import { describe, expect, test } from 'bun:test'

import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import {
  catalogClassOf,
  crossClassPairFor,
} from '@/components/pair-picker/pair-picker-data'

const entry = (symbol: string, extra?: Partial<PairEntry>): PairEntry => ({
  id: symbol,
  symbol,
  name: symbol,
  base: symbol.split('-')[0],
  quote: symbol.split('-')[1] ?? '',
  categories: [],
  rank: 1,
  ...extra,
})

const CATALOG = new Map<string, PairEntry>([
  [
    'BTC-USDT-USDT',
    entry('BTC-USDT-USDT', {
      name: 'Bitcoin Perpetual',
      assetClass: 'crypto-perp',
      rank: 1,
    }),
  ],
])

describe('crossClassPairFor', () => {
  test('a spot pair offers its perpetual, named as the catalog names it', () => {
    const found = crossClassPairFor({ cls: 'spot', id: 'BTC-USDT' }, CATALOG)

    expect(found?.cls).toBe('perp')
    expect(found?.entry.symbol).toBe('BTC-USDT-USDT')
    // The catalog's row, not a synthesized one: it carries the real name.
    expect(found?.entry.name).toBe('Bitcoin Perpetual')
  })

  test('and a contract offers the spot pair back', () => {
    const found = crossClassPairFor(
      { cls: 'perp', id: 'BTC-USDT-USDT' },
      CATALOG,
    )

    expect(found?.cls).toBe('spot')
    expect(found?.entry.symbol).toBe('BTC-USDT')
  })

  /**
   * The case the catalog cannot answer: no discovery provider serves perps in
   * a standalone build, so the row is derived or it does not exist at all.
   */
  test('a pair the catalog has never seen is still offered, built from the key', () => {
    const found = crossClassPairFor({ cls: 'spot', id: 'SOL-USDC' }, new Map())

    expect(found?.entry.symbol).toBe('SOL-USDC-USDC')
    expect(found?.entry.assetClass).toBe('crypto-perp')
    // Split by the settle rule, not on the first dash, which would have read
    // the quote as 'USDC-USDC'.
    expect(found?.entry.base).toBe('SOL')
    expect(found?.entry.quote).toBe('USDC')
  })

  test('a stock has no contract to offer', () => {
    expect(crossClassPairFor({ cls: 'stocks', id: 'AAPL' }, CATALOG)).toBeNull()
  })

  test('a token is its chain, so there is nothing on the other side', () => {
    expect(
      crossClassPairFor(
        { cls: 'dex', id: '0XDAC17F958D2EE523A2206206994597C13D831EC7-USDC' },
        CATALOG,
      ),
    ).toBeNull()
  })

  // Dash-joined like a perp key and not one. `splitPairAssets` only calls a
  // third segment a settle leg when it repeats the quote, which is what keeps
  // an event ticker out of this.
  test('a prediction ticker is not mistaken for a spot pair with a contract', () => {
    expect(
      crossClassPairFor({ cls: 'spot', id: 'KXBTCD-26AUG15-T53' }, CATALOG),
    ).toBeNull()
  })
})

/**
 * The narrowing the pair switcher's shortlist runs on. It compared the route's
 * `'spot'` against the catalog's `'crypto'` raw, matched nothing, and fell
 * through to an unnarrowed list: a crypto chart opened its popular list on
 * AAPL, MSFT and NVDA.
 */
describe('catalogClassOf', () => {
  test('the route dialect and the catalog dialect land on the same id', () => {
    expect(catalogClassOf('BTC-USDT', 'spot')).toBe('crypto')
    expect(catalogClassOf('BTC-USDT', 'crypto')).toBe('crypto')
    expect(catalogClassOf('BTC-USDT', 'crypto-spot')).toBe('crypto')
  })

  test('a contract is its own class, not the spot pair it tracks', () => {
    expect(catalogClassOf('BTC-USDT-USDT', 'perp')).toBe('crypto-perp')
    expect(catalogClassOf('BTC-USDT-USDT', 'crypto-perp')).toBe('crypto-perp')
  })

  test('a memecoin is filed as dex, which is how the catalog files one', () => {
    expect(catalogClassOf('SOME-MINT-USDC', 'memecoin')).toBe('dex')
    expect(catalogClassOf('SOME-MINT-USDC', 'dex')).toBe('dex')
  })

  test('with nothing to go on, the symbol shape answers', () => {
    expect(catalogClassOf('AAPL')).toBe('stocks')
    expect(catalogClassOf('BTC-USDT')).toBe('crypto')
    expect(catalogClassOf('BTC-USDT-USDT')).toBe('crypto-perp')
  })
})
