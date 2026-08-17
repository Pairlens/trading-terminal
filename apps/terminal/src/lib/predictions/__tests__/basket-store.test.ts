// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The basket's arithmetic and its one structural rule.
 *
 * The dangerous number here is the best case. Legs of a race are mutually
 * exclusive, so their payouts do not add — a ticket that summed them would
 * advertise a return that cannot happen, on the one screen where the reader is
 * about to commit money.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import {
  MAX_BASKET_LEGS,
  basketEventKey,
  basketMath,
  useBasketStore,
} from '../basket-store'
import type { BasketLeg } from '../basket-store'

function leg(pairKey: string, stake: string): BasketLeg {
  return { pairKey, market: 'polymarket', label: pairKey, stake }
}

const PRICES: Record<string, number> = {
  NEWSOM: 0.34,
  SHAPIRO: 0.14,
  AOC: 0.11,
}

const priceOf = (key: string) => PRICES[key] ?? null

describe('basketMath', () => {
  test('floors contracts and charges what the order actually spends', () => {
    // $60 at 34¢ buys 176 contracts and costs $59.84, not $60.
    const math = basketMath([leg('NEWSOM', '60')], priceOf)
    expect(math.contracts['NEWSOM']).toBe(176)
    expect(math.totalStake).toBeCloseTo(59.84, 6)
  })

  test('best case is the largest leg, never the sum', () => {
    const math = basketMath(
      [leg('NEWSOM', '60'), leg('SHAPIRO', '25'), leg('AOC', '15')],
      priceOf,
    )
    // 176 / 178 / 136 contracts — one of them pays, so the best case is 178.
    expect(math.bestPayout).toBe(178)
    expect(math.bestPayout).toBeLessThan(176 + 178 + 136)
    expect(math.bestProfit).toBeCloseTo(178 - math.totalStake, 6)
  })

  test('coverage is the share of the field the legs hold', () => {
    const math = basketMath(
      [leg('NEWSOM', '60'), leg('SHAPIRO', '25'), leg('AOC', '15')],
      priceOf,
    )
    expect(math.coverage).toBeCloseTo(0.59, 10)
  })

  test('marks a leg it cannot price, and leaves it out of every total', () => {
    const math = basketMath([leg('NEWSOM', '60'), leg('GHOST', '40')], priceOf)
    expect(math.unusable).toEqual(['GHOST'])
    expect(math.totalStake).toBeCloseTo(59.84, 6)
    expect(math.contracts['GHOST']).toBeUndefined()
  })

  test('marks a stake too small to buy one contract', () => {
    // 20¢ against a 34¢ contract is not an order, it is a rounding error.
    expect(basketMath([leg('NEWSOM', '0.2')], priceOf).unusable).toEqual([
      'NEWSOM',
    ])
  })

  test('marks nonsense in the stake field rather than treating it as zero', () => {
    expect(basketMath([leg('NEWSOM', '')], priceOf).unusable).toEqual([
      'NEWSOM',
    ])
    expect(basketMath([leg('NEWSOM', '-5')], priceOf).unusable).toEqual([
      'NEWSOM',
    ])
    expect(basketMath([leg('NEWSOM', 'abc')], priceOf).unusable).toEqual([
      'NEWSOM',
    ])
  })

  test('is empty and harmless with no legs', () => {
    const math = basketMath([], priceOf)
    expect(math.totalStake).toBe(0)
    expect(math.bestPayout).toBe(0)
    expect(math.coverage).toBe(0)
  })
})

describe('useBasketStore', () => {
  beforeEach(() => {
    useBasketStore.getState().clear()
  })

  test('staging from a second event replaces the basket', () => {
    const { add } = useBasketStore.getState()
    add(basketEventKey('polymarket', 'dem-2028'), leg('NEWSOM', '60'))
    add(basketEventKey('polymarket', 'dem-2028'), leg('SHAPIRO', '25'))
    expect(useBasketStore.getState().legs).toHaveLength(2)

    add(basketEventKey('kalshi', 'cpi'), leg('CPI-YES', '10'))
    expect(useBasketStore.getState().legs.map((l) => l.pairKey)).toEqual([
      'CPI-YES',
    ])
    expect(useBasketStore.getState().eventKey).toBe('kalshi:cpi')
  })

  test('staging the same outcome twice is a no-op, not a duplicate order', () => {
    const key = basketEventKey('polymarket', 'dem-2028')
    useBasketStore.getState().add(key, leg('NEWSOM', '60'))
    useBasketStore.getState().add(key, leg('NEWSOM', '99'))
    expect(useBasketStore.getState().legs).toEqual([leg('NEWSOM', '60')])
  })

  test('caps the basket', () => {
    const key = basketEventKey('polymarket', 'race')
    for (let i = 0; i < MAX_BASKET_LEGS + 5; i++) {
      useBasketStore.getState().add(key, leg(`R${i}`, '10'))
    }
    expect(useBasketStore.getState().legs).toHaveLength(MAX_BASKET_LEGS)
  })

  test('emptying the basket forgets the event', () => {
    const key = basketEventKey('polymarket', 'dem-2028')
    useBasketStore.getState().add(key, leg('NEWSOM', '60'))
    useBasketStore.getState().remove('NEWSOM')
    expect(useBasketStore.getState().eventKey).toBeNull()
  })

  test('editing one stake leaves the others alone', () => {
    const key = basketEventKey('polymarket', 'dem-2028')
    useBasketStore.getState().add(key, leg('NEWSOM', '60'))
    useBasketStore.getState().add(key, leg('SHAPIRO', '25'))
    useBasketStore.getState().setStake('NEWSOM', '80')
    expect(useBasketStore.getState().legs.map((l) => l.stake)).toEqual([
      '80',
      '25',
    ])
  })
})
