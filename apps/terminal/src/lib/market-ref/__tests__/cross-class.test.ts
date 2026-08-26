// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { sameAssetInClass } from '@/lib/market-ref/cross-class'

describe('sameAssetInClass', () => {
  test('a spot pair becomes the linear contract that settles in its quote', () => {
    expect(sameAssetInClass('BTC-USDT', 'spot', 'perp')).toBe('BTC-USDT-USDT')
    expect(sameAssetInClass('BTC-USD', 'spot', 'perp')).toBe('BTC-USD-USD')
  })

  test('and the contract drops the settle leg on the way back', () => {
    expect(sameAssetInClass('BTC-USDT-USDT', 'perp', 'spot')).toBe('BTC-USDT')
    // Kraken's dollar-settled contract tracks the dollar spot pair.
    expect(sameAssetInClass('BTC-USD-USD', 'perp', 'spot')).toBe('BTC-USD')
  })

  test('a key arriving in another spelling still normalizes', () => {
    expect(sameAssetInClass('btc/usdt', 'spot', 'perp')).toBe('BTC-USDT-USDT')
  })

  test('a stock has no quote leg for a contract to settle in', () => {
    expect(sameAssetInClass('AAPL', 'stocks', 'perp')).toBeNull()
    expect(sameAssetInClass('AAPL', 'spot', 'perp')).toBeNull()
    expect(sameAssetInClass('BTC-USDT', 'spot', 'stocks')).toBeNull()
  })

  test('venue-bound classes name their venue, so they never translate', () => {
    expect(
      sameAssetInClass(
        '0XDAC17F958D2EE523A2206206994597C13D831EC7-USDC',
        'dex',
        'spot',
      ),
    ).toBeNull()
    expect(sameAssetInClass('BTC-USDT', 'spot', 'dex')).toBeNull()
    expect(
      sameAssetInClass('KXBTCD-26AUG15-T53', 'prediction', 'spot'),
    ).toBeNull()
    expect(sameAssetInClass('BTC-USDT', 'spot', 'memecoin')).toBeNull()
  })

  test('the same class is the same string', () => {
    expect(sameAssetInClass('BTC-USDT', 'spot', 'spot')).toBe('BTC-USDT')
  })
})
