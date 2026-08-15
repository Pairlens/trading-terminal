// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Who wave 2 fans out to.
 *
 * The selector decides which venues get asked at query time, which is the only
 * way an asset class with no index presence surfaces at all: DEX tokens are
 * minted faster than any snapshot, prediction outcomes are born and resolved
 * the same day. A venue dropped from this list does not error — it silently
 * never appears in the picker.
 */

import { describe, expect, test } from 'bun:test'

import type { PluginInstance, PluginManifest } from '@pairlens/plugin-system'
import {
  getVenueScopedSearchPlugins,
  isPredictionSearchable,
} from '@/hooks/use-instrument-search'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'

function asPlugin(manifest: PluginManifest): PluginInstance {
  return { manifest } as PluginInstance
}

const bundled = (id: string): PluginInstance => {
  const found = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === id)
  if (!found) throw new Error(`bootstrap plugin '${id}' is no longer bundled`)
  return asPlugin(found.manifest)
}

function searchManifest(
  id: string,
  assetClass: string,
  markets: Array<string>,
): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    author: 'Test',
    description: 'Test',
    capabilities: [
      {
        id: 'market-data:discovery:search',
        singleton: false,
        markets,
        priority: 1,
        streaming: false,
      },
    ],
    metadata: { assetClass },
    config: {},
  }
}

describe('getVenueScopedSearchPlugins', () => {
  test('prediction venues join the DEX chains in the fan-out', () => {
    const selected = getVenueScopedSearchPlugins([
      bundled('jupiter-dex-connector'),
      bundled('kalshi-market-connector'),
      bundled('polymarket-market-connector'),
      bundled('binance-market-connector'),
      bundled('pairlens-core'),
    ])
    expect(selected.map((s) => s.market).sort()).toEqual([
      'jupiter',
      'kalshi',
      'polymarket',
    ])
  })

  test('each selection carries the venue market and its asset class', () => {
    const [kalshi] = getVenueScopedSearchPlugins([
      bundled('kalshi-market-connector'),
    ])
    expect(kalshi?.market).toBe('kalshi')
    // The class is what decides the query FORM: a prediction venue searches
    // prose and must not be handed a dashed pair key.
    expect(kalshi?.assetClass).toBe('prediction')
  })

  test('a wildcard search provider is a data source, not a venue', () => {
    expect(
      getVenueScopedSearchPlugins([
        asPlugin(searchManifest('wild', 'prediction', ['*'])),
      ]),
    ).toEqual([])
  })

  test('spot and equities venues stay out of the fan-out', () => {
    expect(
      getVenueScopedSearchPlugins([
        asPlugin(searchManifest('spot', 'crypto-spot', ['binance'])),
        asPlugin(searchManifest('broker', 'stocks', ['alpaca'])),
      ]),
    ).toEqual([])
  })
})

/**
 * The prediction arm costs a live `fetchEvents` against the venue, so it is
 * gated. The gate is also what keeps the shared cache key stable: spellings
 * that normalize alike must be ONE entry, or every variant re-runs the whole
 * fan-out — every DEX chain and the server deep search included.
 */
describe('isPredictionSearchable', () => {
  test('a pair address can never name an event', () => {
    for (const query of [
      'BTC-USDT',
      'btc usdt',
      'btc/usdt',
      'ETH-USDC',
      'sol-usdt',
    ]) {
      expect(isPredictionSearchable(query)).toBe(false)
    }
  })

  test('every spelling of one pair gets the same answer', () => {
    // The gate runs after separator normalization, so `btc usdt` and
    // `BTC-USDT` cannot land on different sides of it and split the cache.
    const spellings = ['btc usdt', 'btc/usdt', 'BTC-USDT', 'btc-usdt']
    const answers = new Set(spellings.map(isPredictionSearchable))
    expect(answers.size).toBe(1)
  })

  test('a token contract address can never name an event', () => {
    expect(
      isPredictionSearchable('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    ).toBe(false)
    expect(
      isPredictionSearchable('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    ).toBe(false)
  })

  test('prose goes through', () => {
    for (const query of [
      'will the fed cut rates',
      'presidential election winner',
      'fed rate cuts 2026',
    ]) {
      expect(isPredictionSearchable(query)).toBe(true)
    }
  })

  test('a single bare word goes through', () => {
    // "election" or "powell" is the most common way someone reaches for a
    // prediction market; excluding one-word queries to be tidy would cut it.
    for (const query of ['election', 'fed', 'powell', 'bitcoin']) {
      expect(isPredictionSearchable(query)).toBe(true)
    }
  })

  test('a query too short to mean anything is skipped', () => {
    expect(isPredictionSearchable('ab')).toBe(false)
    expect(isPredictionSearchable(' ')).toBe(false)
  })
})
