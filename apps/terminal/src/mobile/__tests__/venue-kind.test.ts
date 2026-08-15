// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The middle word in "venue · what it trades · what you may do".
 *
 * The ordering inside `venueKindFor` is the whole test. Polymarket signs
 * orders with an EVM key and therefore declares a `walletChain`, so a
 * wallet-first derivation files an event exchange next to Jupiter and labels
 * it "on-chain". `walletChain` answers what UNLOCKS trading, never what the
 * venue IS.
 */

import { describe, expect, test } from 'bun:test'

import { VENUE_KIND_KEY, venueKindFor, venueKindOf } from '../lib/venue-kind'
import type { MarketAdapterInfo } from '@pairlens/market-engine/adapter'

function info(over: Partial<MarketAdapterInfo>): MarketAdapterInfo {
  return {
    marketId: 'test',
    displayName: 'Test',
    assetClasses: ['crypto-spot'],
    capabilities: ['read'],
    credentialSchema: [],
    supportedTimeframes: ['1h'],
    ...over,
  }
}

describe('venueKindFor', () => {
  test('a prediction venue reads as prediction even holding a wallet chain', () => {
    expect(
      venueKindFor(
        info({
          marketId: 'polymarket',
          assetClasses: ['prediction'],
          walletChain: 'ethereum',
        }),
      ),
    ).toBe('prediction')
  })

  test('a key-based prediction venue reads the same', () => {
    expect(
      venueKindFor(info({ marketId: 'kalshi', assetClasses: ['prediction'] })),
    ).toBe('prediction')
  })

  test('a perp venue is futures, not the spot fallback', () => {
    // Every futures venue IS a centralized exchange, so the `cex` fallback
    // would happily claim it and the phone would read "Binance Futures spot".
    expect(
      venueKindFor(
        info({ marketId: 'binance-futures', assetClasses: ['crypto-perp'] }),
      ),
    ).toBe('futures')
  })

  test('the existing three kinds are unchanged', () => {
    expect(venueKindFor(info({ assetClasses: ['stocks'] }))).toBe('equities')
    expect(
      venueKindFor(info({ assetClasses: ['dex'], walletChain: 'solana' })),
    ).toBe('dex')
    expect(venueKindFor(info({}))).toBe('cex')
    expect(venueKindFor(undefined)).toBe('cex')
  })

  test('every kind has a static i18n key', () => {
    for (const key of Object.values(VENUE_KIND_KEY)) {
      expect(key.startsWith('mobile.pickers.')).toBe(true)
    }
  })

  test('the market-id form agrees with the adapter form', () => {
    const adapters = [
      info({ marketId: 'kalshi', assetClasses: ['prediction'] }),
    ]
    expect(venueKindOf('kalshi', adapters)).toBe('prediction')
    expect(venueKindOf('binance', adapters)).toBe('cex')
  })
})
