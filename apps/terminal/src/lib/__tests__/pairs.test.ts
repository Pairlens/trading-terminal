// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { isPerpPairKey, normalizePairKey, splitPairAssets } from '../pairs'

const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7'
const WSOL = 'So11111111111111111111111111111111111111112'

describe('normalizePairKey', () => {
  test('canonicalises separators and case', () => {
    expect(normalizePairKey('btc/usdt')).toBe('BTC-USDT')
    expect(normalizePairKey(' eth_usd ')).toBe('ETH-USD')
    expect(normalizePairKey('BTC-USDT')).toBe('BTC-USDT')
  })

  // Every stream hook runs its pair key through here. Upper-casing the base
  // leg of a DEX key stopped it matching `isTokenAddress`, which sent the pool
  // resolvers down their search-by-name path for a token the user had already
  // identified by address.
  test('leaves a token address in the base leg alone', () => {
    expect(normalizePairKey(`${USDT}-usdc`)).toBe(`${USDT}-USDC`)
    expect(normalizePairKey(`${WSOL}-usdc`)).toBe(`${WSOL}-USDC`)
  })

  test('lower-cases a checksummed EVM address, as the routing layer does', () => {
    const checksummed = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
    expect(normalizePairKey(`${checksummed}-USDC`)).toBe(`${USDT}-USDC`)
  })

  test('still canonicalises the separator on an address key', () => {
    expect(normalizePairKey(`${USDT}/usdc`)).toBe(`${USDT}-USDC`)
  })

  test('a bare address normalises to itself', () => {
    expect(normalizePairKey(WSOL)).toBe(WSOL)
  })

  // A prediction outcome key is dash-joined and case-carrying, and nothing in
  // it is an address: it must keep normalising exactly as it did.
  test('leaves prediction and perp keys on the old path', () => {
    expect(normalizePairKey('kxbtcd-26aug15-t53')).toBe('KXBTCD-26AUG15-T53')
    expect(normalizePairKey('btc-usdt-usdt')).toBe('BTC-USDT-USDT')
  })
})

describe('splitPairAssets', () => {
  test('reads both legs straight off a crypto key', () => {
    expect(splitPairAssets('BTC-USDT')).toEqual({
      base: 'BTC',
      quote: 'USDT',
    })
  })

  // A stock instrument's key is the bare ticker, shared with the App Server
  // catalog. The quote can only come from the venue.
  test('quotes a bare equity ticker in USD', () => {
    expect(splitPairAssets('AAPL', { equity: true })).toEqual({
      base: 'AAPL',
      quote: 'USD',
    })
  })

  test('keeps the crypto default for a bare non-equity key', () => {
    expect(splitPairAssets('BTC')).toEqual({ base: 'BTC', quote: 'USDT' })
  })

  // 'AAPL-USD' reaches the ticket too (the connector's own pair form), and
  // must not be overridden by the equity default.
  test('an explicit quote always wins over the fallback', () => {
    expect(splitPairAssets('AAPL-USD', { equity: true }).quote).toBe('USD')
    expect(splitPairAssets('BTC-EUR', { equity: false }).quote).toBe('EUR')
  })

  test('a perpetual key carries a third leg: the settle currency', () => {
    expect(splitPairAssets('BTC-USDT-USDT')).toEqual({
      base: 'BTC',
      quote: 'USDT',
      settle: 'USDT',
    })
    // Kraken's linear perps are USD-settled, so quote and settle agree there
    // too but for a different reason. Both still have to survive the split.
    expect(splitPairAssets('BTC-USD-USD')).toEqual({
      base: 'BTC',
      quote: 'USD',
      settle: 'USD',
    })
  })

  test('a spot key has no settle leg at all, not an empty one', () => {
    // Callers branch on presence. An empty string would read as a perp whose
    // settle currency could not be priced, which is a different bug.
    expect(splitPairAssets('BTC-USDT').settle).toBeUndefined()
    expect(splitPairAssets('AAPL', { equity: true }).settle).toBeUndefined()
  })

  test('a third segment that does not repeat the quote is not a settle leg', () => {
    // Prediction outcome keys are dash-joined too, and "any third segment is
    // the settle currency" routed a Kalshi ticker onto a futures venue. Every
    // v1 futures venue lists LINEAR contracts, where settle IS the quote, so
    // the repeat is the discriminator.
    expect(splitPairAssets('KXBTCD-26AUG15-T53').settle).toBeUndefined()
    // Inverse contracts share this shape and are out of scope until a venue
    // ships one; when that happens this test learns their shape rather than
    // loosening back to a segment count.
    expect(splitPairAssets('BTC-USD-BTC').settle).toBeUndefined()
  })
})

/**
 * The segment count IS the type tag for the whole perp surface: the risk
 * guard's contract-pricing branch, the mobile route sync's venue choice, and
 * the position ledger staying uncorrupted all hang off it.
 */
describe('isPerpPairKey', () => {
  test('three segments is a perpetual, two or one is not', () => {
    expect(isPerpPairKey('BTC-USDT-USDT')).toBe(true)
    expect(isPerpPairKey('BTC-USDT')).toBe(false)
    expect(isPerpPairKey('AAPL')).toBe(false)
  })

  test('it normalises first, so a route-cased key is still recognised', () => {
    expect(isPerpPairKey('btc/usdt/usdt')).toBe(true)
    expect(isPerpPairKey(' eth_usdt_usdt ')).toBe(true)
  })

  test('a prediction outcome key is never a perpetual, whatever its shape', () => {
    // The regression this exists for: a Kalshi ticker has three dash-joined
    // segments and its NO side has four, and reading either as a contract sent
    // the route correction to a futures venue that has never heard of it.
    expect(isPerpPairKey('KXBTCD-26AUG15-T53')).toBe(false)
    expect(isPerpPairKey('KXBTCD-26AUG15-T53-NO')).toBe(false)
    expect(isPerpPairKey('KXPRESPARTY-28-DEM')).toBe(false)
  })

  test('four segments is not a perpetual either', () => {
    expect(isPerpPairKey('BTC-USDT-USDT-USDT')).toBe(false)
  })
})
