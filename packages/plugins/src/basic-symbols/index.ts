// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { queryInstruments } from '../catalog'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const basicSymbolsManifest: PluginManifest = {
  id: 'basic-symbols',
  name: 'Basic Trading Symbols',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Hardcoded catalog of common crypto trading pairs for offline browsing',
  icon: '/logo512.png',
  metadata: { family: 'core' },
  capabilities: [
    {
      id: 'market-data:discovery',
      singleton: false,
      markets: ['*'],
      priority: 99,
      streaming: false,
    },
    {
      id: 'market-data:discovery:search',
      singleton: false,
      markets: ['*'],
      priority: 99,
      streaming: false,
    },
  ],
  config: {},
}

export function createBasicSymbolsPlugin(
  manifest: PluginManifest,
): PluginInstance {
  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const { capability, params: p } = params
    const market = String(p['market'] ?? 'crypto')

    if (capability === 'market-data:discovery') {
      return queryInstruments(market, p)
    }

    if (capability === 'market-data:discovery:search') {
      const query = String(p['query'] ?? '').toLowerCase()
      if (!query) return { items: [], total: 0, hasMore: false }
      return queryInstruments(market, { ...p, q: query })
    }

    throw new Error(`basic-symbols: unsupported capability '${capability}'`)
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,
  }
}
