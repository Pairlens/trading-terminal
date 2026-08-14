// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_TRADE_SORT,
  nextTradeSort,
  normalizeTradeSort,
  sortTrades,
} from '../trade-tape-sort'
import type { Trade } from '@pairlens/market-engine/types'

let seq = 0
function print(partial: Partial<Trade> = {}): Trade {
  seq += 1
  return {
    id: `t${String(seq).padStart(3, '0')}`,
    price: 100,
    size: 1,
    side: 'buy',
    ts: 1_700_000_000_000,
    ...partial,
  } as Trade
}

/** The tape as the stream hook hands it over: newest print first. */
const tape = [
  print({ id: 'a', price: 105, size: 2, side: 'sell', ts: 5000 }),
  print({ id: 'b', price: 101, size: 9, side: 'buy', ts: 4000 }),
  print({ id: 'c', price: 103, size: 1, side: 'sell', ts: 3000 }),
  print({ id: 'd', price: 102, size: 4, side: 'buy', ts: 2000 }),
]

const ids = (trades: Array<Trade>) => trades.map((trade) => trade.id)

describe('sortTrades', () => {
  test('the default returns the buffer itself, not a copy', () => {
    // Identity matters: it is what lets the caller's useMemo hold still, and
    // it is the reason the common case costs nothing on a feed that reprints
    // its whole buffer ten times a second.
    expect(sortTrades(tape, DEFAULT_TRADE_SORT)).toBe(tape)
  })

  test('time ascending reverses the tape', () => {
    expect(ids(sortTrades(tape, { column: 'time', direction: 'asc' }))).toEqual(
      ['d', 'c', 'b', 'a'],
    )
  })

  test('price sorts both ways', () => {
    expect(
      ids(sortTrades(tape, { column: 'price', direction: 'desc' })),
    ).toEqual(['a', 'c', 'd', 'b'])
    expect(
      ids(sortTrades(tape, { column: 'price', direction: 'asc' })),
    ).toEqual(['b', 'd', 'c', 'a'])
  })

  test('size sorts on the raw quantity', () => {
    expect(
      ids(sortTrades(tape, { column: 'size', direction: 'desc' })),
    ).toEqual(['b', 'd', 'a', 'c'])
  })

  test('value sorts on price x size, not on either alone', () => {
    // b is the biggest size (9 x 101 = 909) and a is the highest price
    // (2 x 105 = 210); notional puts b first and d (4 x 102 = 408) second,
    // which neither single column would.
    expect(
      ids(sortTrades(tape, { column: 'value', direction: 'desc' })),
    ).toEqual(['b', 'd', 'a', 'c'])
  })

  test('side groups buys and sells', () => {
    expect(ids(sortTrades(tape, { column: 'side', direction: 'asc' }))).toEqual(
      ['b', 'd', 'a', 'c'],
    )
    expect(
      ids(sortTrades(tape, { column: 'side', direction: 'desc' })),
    ).toEqual(['a', 'c', 'b', 'd'])
  })

  test('does not mutate the input', () => {
    const before = ids(tape)
    sortTrades(tape, { column: 'price', direction: 'asc' })
    expect(ids(tape)).toEqual(before)
  })

  test('ties hold their order when the buffer is republished', () => {
    // The failure this guards: sorting by Side puts ~100 rows on one key, and
    // Array#sort is only stable WITHIN a call. Two flushes of the same prints
    // in different arrival order must still paint the same tape, or the block
    // reshuffles under the cursor every 100ms.
    const one = [
      print({ id: 'x', side: 'buy', ts: 10 }),
      print({ id: 'y', side: 'buy', ts: 20 }),
      print({ id: 'z', side: 'buy', ts: 10 }),
    ]
    const two = [one[2], one[0], one[1]]
    const sort = { column: 'side', direction: 'asc' } as const

    expect(ids(sortTrades(one, sort))).toEqual(ids(sortTrades(two, sort)))
    // Newest first inside the tie, then id — a total order, so equal
    // timestamps resolve too.
    expect(ids(sortTrades(one, sort))).toEqual(['y', 'x', 'z'])
  })
})

describe('nextTradeSort', () => {
  test('clicking the active column flips its direction', () => {
    expect(
      nextTradeSort({ column: 'size', direction: 'desc' }, 'size'),
    ).toEqual({ column: 'size', direction: 'asc' })
    expect(nextTradeSort({ column: 'size', direction: 'asc' }, 'size')).toEqual(
      {
        column: 'size',
        direction: 'desc',
      },
    )
  })

  test('a new column opens at the end a trader is asking about', () => {
    // "Show me the big prints", not the dust ones. Each starts from a sort on
    // some OTHER column, so what is being measured is the opening direction
    // and not the flip above.
    const elsewhere = { column: 'side', direction: 'desc' } as const
    for (const column of ['price', 'size', 'value', 'time'] as const) {
      expect(nextTradeSort(elsewhere, column).direction).toBe('desc')
    }
    expect(nextTradeSort(DEFAULT_TRADE_SORT, 'side').direction).toBe('asc')
  })
})

describe('normalizeTradeSort', () => {
  test('keeps a valid stored sort', () => {
    const stored = { column: 'value', direction: 'asc' } as const
    expect(normalizeTradeSort(stored)).toEqual(stored)
  })

  test('falls back on anything a past release could have left behind', () => {
    for (const stored of [
      null,
      undefined,
      'time',
      42,
      {},
      { column: 'notional', direction: 'asc' },
    ]) {
      expect(normalizeTradeSort(stored)).toEqual(DEFAULT_TRADE_SORT)
    }
  })

  test('an unknown direction settles on descending', () => {
    expect(
      normalizeTradeSort({ column: 'price', direction: 'sideways' }),
    ).toEqual({ column: 'price', direction: 'desc' })
  })
})
