// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The three-segment pair key, pinned.
 *
 * Everything in the futures runtime rests on this mapping being reversible and
 * on the settlement leg surviving every hop. Two of the assertions below are
 * regressions waiting to happen rather than tautologies: the spot mapper's
 * single-dash `replace`, and the spot normalizer's habit of throwing the settle
 * leg away.
 */

import { describe, expect, it } from 'bun:test'
import { fromCcxtSymbol, toCcxtSymbol } from '../../ccxt-connector/parser'
import {
  fromFuturesSymbol,
  futuresPairSegments,
  normalizeFuturesPair,
  toFuturesSymbol,
} from '../futures-symbols'

describe('toFuturesSymbol', () => {
  it('maps a three-segment key onto the ccxt perp symbol', () => {
    expect(toFuturesSymbol('BTC-USDT-USDT')).toBe('BTC/USDT:USDT')
    expect(toFuturesSymbol('BTC-USD-USD')).toBe('BTC/USD:USD')
    expect(toFuturesSymbol('btc-usdt-usdt')).toBe('BTC/USDT:USDT')
  })

  it('is not what the spot mapper produces — replace() rewrites one dash', () => {
    // The whole reason this module exists. `String.replace` with a string
    // pattern rewrites only the FIRST match, so the spot mapper turns a perp
    // key into a symbol no venue resolves, and it fails as a BadSymbol several
    // layers from the mistake.
    expect(toCcxtSymbol('BTC-USDT-USDT')).toBe('BTC/USDT-USDT')
    expect(toFuturesSymbol('BTC-USDT-USDT')).not.toBe(
      toCcxtSymbol('BTC-USDT-USDT'),
    )
  })

  it('leaves a two-segment key as a spot symbol rather than inventing a settle', () => {
    expect(toFuturesSymbol('BTC-USDT')).toBe('BTC/USDT')
  })

  it('accepts a ccxt symbol as input, so a paste normalizes', () => {
    expect(toFuturesSymbol('BTC/USDT:USDT')).toBe('BTC/USDT:USDT')
  })
})

describe('fromFuturesSymbol', () => {
  it('preserves the settlement leg', () => {
    expect(fromFuturesSymbol('BTC/USDT:USDT')).toBe('BTC-USDT-USDT')
    expect(fromFuturesSymbol('ETH/USD:USD')).toBe('ETH-USD-USD')
  })

  it('is not what the spot normalizer produces — it drops the settle leg', () => {
    // A perp fill mapped through the spot normalizer lands in the SPOT pair's
    // position-ledger slot, which is keyed by pair alone.
    expect(fromCcxtSymbol('BTC/USDT:USDT')).toBe('BTC-USDT')
    expect(fromFuturesSymbol('BTC/USDT:USDT')).not.toBe(
      fromCcxtSymbol('BTC/USDT:USDT'),
    )
  })

  it('round-trips with toFuturesSymbol in both directions', () => {
    for (const pair of ['BTC-USDT-USDT', 'SOL-USD-USD', 'DOGE-USDT-USDT']) {
      expect(fromFuturesSymbol(toFuturesSymbol(pair))).toBe(pair)
    }
    for (const symbol of ['BTC/USDT:USDT', 'SOL/USD:USD']) {
      expect(toFuturesSymbol(fromFuturesSymbol(symbol))).toBe(symbol)
    }
  })
})

describe('segment discrimination', () => {
  it('counts segments, which is how spot and perp are told apart', () => {
    expect(futuresPairSegments('BTC-USDT')).toEqual(['BTC', 'USDT'])
    expect(futuresPairSegments('BTC-USDT-USDT')).toEqual([
      'BTC',
      'USDT',
      'USDT',
    ])
    expect(futuresPairSegments('BTC/USDT:USDT')).toHaveLength(3)
  })

  it('drops empty segments rather than counting a stray dash as one', () => {
    expect(futuresPairSegments('BTC-USDT-')).toEqual(['BTC', 'USDT'])
    expect(futuresPairSegments('BTC--USDT')).toEqual(['BTC', 'USDT'])
  })

  it('normalizes case and every separator a venue or a URL might carry', () => {
    expect(normalizeFuturesPair(' btc/usdt:usdt ')).toBe('BTC-USDT-USDT')
    expect(normalizeFuturesPair('btc_usdt')).toBe('BTC-USDT')
  })
})
