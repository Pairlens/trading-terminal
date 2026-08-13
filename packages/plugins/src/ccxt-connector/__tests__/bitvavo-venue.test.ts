// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitvavo needs two things asserted: the US refusal is typed the way the
 * terminal's region dialog detects it (by `name` and sentinel, never
 * `instanceof`), and the weekly bar it does not serve is folded from the daily
 * one rather than silently missing.
 */

import { describe, expect, it } from 'bun:test'
import { isGeoRestrictedError } from '@pairlens/market-engine/errors'
import {
  BITVAVO_HISTORY_FOLD,
  assertBitvavoRegionAllowed,
  bitvavoCcxtVenue,
  bitvavoLiveSource,
  bitvavoMarketConnectorManifest,
} from '../venues/bitvavo'

describe('bitvavo manifest parity', () => {
  const manifest = bitvavoMarketConnectorManifest

  it('keeps the native identity', () => {
    expect(manifest.id).toBe('bitvavo-market-connector')
    expect(manifest.name).toBe('Bitvavo Market Connector')
    expect(manifest.metadata?.['abbr']).toBe('BV')
    expect(manifest.metadata?.['gradient']).toBe('from-blue-500 to-indigo-600')
    expect(manifest.metadata?.['triggerOrders']).toBe(true)
    expect(manifest.metadata?.['requiresDesktop']).toBeUndefined()
  })

  it('declares no ticker snapshot, matching the native', () => {
    const ids = manifest.capabilities.map((c) => c.id)
    expect(ids).toContain('market-data:trades')
    expect(ids).not.toContain('market-data:ticker-snapshot')
  })

  it('is live-only: the venue has no testnet and ccxt no sandbox', () => {
    expect(bitvavoCcxtVenue.defaultMode).toBe('live')
  })
})

describe('bitvavo geo gate', () => {
  it('refuses the US with an error the region dialog can recognise', () => {
    let thrown: unknown
    try {
      assertBitvavoRegionAllowed('us')
    } catch (error) {
      thrown = error
    }
    expect(isGeoRestrictedError(thrown)).toBe(true)
    expect((thrown as Error).message).toBe(
      'Bitvavo is not available in your region (us)',
    )
  })

  it('lets every other region through, including an unset one', () => {
    expect(() => assertBitvavoRegionAllowed('')).not.toThrow()
    expect(() => assertBitvavoRegionAllowed('NL')).not.toThrow()
  })

  it('gates every capability, on both entry points', () => {
    expect(() =>
      bitvavoCcxtVenue.geoCheck?.('US', 'market-data:candles'),
    ).toThrow()
    expect(() => bitvavoCcxtVenue.geoCheck?.('US', 'trading:orders')).toThrow()
  })
})

describe('bitvavo timeframes', () => {
  it('streams everything it serves and folds only the weekly bar', () => {
    expect(bitvavoLiveSource('1h')).toEqual({ kind: 'passthrough' })
    expect(bitvavoLiveSource('4h')).toEqual({ kind: 'passthrough' })
    expect(bitvavoLiveSource('1w')).toEqual({ kind: 'fold', source: '1d' })
    expect(BITVAVO_HISTORY_FOLD).toEqual({ '1w': '1d' })
  })

  it('pages 1440 bars at a time with an exclusive cursor', () => {
    expect(bitvavoCcxtVenue.maxHistoryLimit).toBe(1440)
    const endTs = Date.UTC(2026, 7, 10)
    expect(bitvavoCcxtVenue.historyPageParams?.(endTs)).toEqual({
      until: endTs - 1,
    })
  })
})

describe('bitvavo market ids', () => {
  it('synthesizes the venue BASE-QUOTE id', () => {
    expect(bitvavoCcxtVenue.synthesizeMarket?.('BTC-EUR')).toMatchObject({
      id: 'BTC-EUR',
      symbol: 'BTC/EUR',
      quote: 'EUR',
    })
  })
})
