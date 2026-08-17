// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The three DEX data providers, and the ordering they only have if nobody
 * renumbers a priority by hand.
 *
 * `market-data:pool-stats` is resolved by priority and the numbers live in three
 * separate manifests, so a tie or an inversion is a one-character mistake with a
 * silent symptom: the wrong provider answers, and in a browser the wrong one is
 * the CORS-blocked one. The reserve supplement does NOT depend on this ordering
 * (it calls its plugin directly), which is exactly why the ordering needs a test
 * rather than a pane that would visibly break.
 */
import { describe, expect, it } from 'bun:test'

import { BOOTSTRAP_PLUGINS } from '../plugins/bootstrap-bundle'
import type { PluginManifest } from '@pairlens/plugin-system/types'

import { pluginBrand } from '@/components/plugins/plugin-brand'

const PROVIDER_IDS = [
  'geckoterminal-data-provider',
  'dexpaprika-data-provider',
  'dexscreener-data-provider',
]

function manifestOf(id: string): PluginManifest {
  const entry = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === id)
  if (!entry) throw new Error(`${id} is not in the bootstrap bundle`)
  return entry.manifest
}

const poolStatsPriority = (manifest: PluginManifest): number | null =>
  manifest.capabilities.find((c) => c.id === 'market-data:pool-stats')
    ?.priority ?? null

describe('DEX data providers', () => {
  it('all three ship in the bootstrap bundle', () => {
    for (const id of PROVIDER_IDS) {
      expect(manifestOf(id).id, id).toBe(id)
    }
  })

  it('answers pool state in a strict order, with no ties', () => {
    const priorities = PROVIDER_IDS.map((id) =>
      poolStatsPriority(manifestOf(id)),
    )
    // GeckoTerminal, then DexPaprika, then DexScreener. Distinct, so the
    // resolver never has to break a tie by declaration order.
    expect(priorities).toEqual([5, 6, 7])
    expect(new Set(priorities).size).toBe(priorities.length)
  })

  it('files every provider under the dex family', () => {
    // Load-bearing for the deployment kill-switch: dropping `dex` has to drop
    // the providers with the connectors.
    for (const id of PROVIDER_IDS) {
      expect(manifestOf(id).metadata?.['family'], id).toBe('dex')
    }
  })

  it('gives each provider a brand mark, so a store card is never blank', () => {
    for (const id of PROVIDER_IDS) {
      const brand = pluginBrand(id, manifestOf(id).name)
      expect(brand.mono.length, id).toBeGreaterThan(0)
      // Not the derived-initials fallback: these are named integrations.
      expect(brand.tint, id).toBeTruthy()
    }
  })
})

describe('dexscreener-data-provider', () => {
  const manifest = manifestOf('dexscreener-data-provider')

  it('declares pool state and nothing else', () => {
    // No candles, no ticker: DexScreener publishes no OHLCV, and a declaration
    // it cannot serve would win a resolution and blank the chart.
    expect(manifest.capabilities.map((c) => c.id)).toEqual([
      'market-data:pool-stats',
    ])
  })

  it('is a wildcard data source rather than a venue', () => {
    // A venue fan-out addresses plugins by their own market id; a wildcard
    // provider answers for whatever chain it is asked about.
    expect(manifest.capabilities[0].markets).toEqual(['*'])
  })

  it('needs no credentials, which is what lets a browser use it', () => {
    expect(manifest.config).toEqual({})
    expect(manifest.credentials).toBeUndefined()
  })

  it('does not claim it can trade', () => {
    const trading = manifest.capabilities.filter((c) =>
      c.id.startsWith('trading:'),
    )
    expect(trading).toEqual([])
  })
})
