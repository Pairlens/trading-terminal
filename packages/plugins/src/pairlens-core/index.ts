// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { getCoreStepTypes } from '@pairlens/workflow-engine/core-steps'
import { queryInstruments } from '../catalog'
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const pairlensCoreManifest: PluginManifest = {
  id: 'pairlens-core',
  name: 'Pairlens Core',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Core trading terminal — charts, order books, trade entry, market discovery, and watchlists',
  homepage: 'https://pairlens.finance',
  icon: 'https://pairlens.finance/favicon.svg',
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
    {
      id: 'workflow:step-types',
      singleton: false,
      markets: ['*'],
      priority: 0,
      streaming: false,
    },
  ],
  config: {},
  contributes: {
    panels: [
      {
        id: 'chart',
        label: 'Chart',
        labelKey: 'panes.chart',
        descriptionKey: 'paneDescriptions.chart',
        icon: 'CandlestickChart',
        category: 'charting',
        minHeight: 200,
        singleton: true,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'data-log',
        label: 'Data Log',
        labelKey: 'panes.dataLog',
        descriptionKey: 'paneDescriptions.dataLog',
        icon: 'ScrollText',
        category: 'charting',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'depth',
        label: 'Market Depth',
        labelKey: 'panes.marketDepth',
        descriptionKey: 'paneDescriptions.marketDepth',
        icon: 'Layers',
        category: 'charting',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'orderbook',
        label: 'Order Book',
        labelKey: 'panes.orderBook',
        descriptionKey: 'paneDescriptions.orderBook',
        icon: 'BookOpen',
        category: 'charting',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'pair-info',
        label: 'Pair Info',
        labelKey: 'panes.pairInfo',
        descriptionKey: 'paneDescriptions.pairInfo',
        icon: 'Info',
        category: 'charting',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'trade-entry',
        label: 'Trade Entry',
        labelKey: 'panes.trade',
        descriptionKey: 'paneDescriptions.trade',
        icon: 'ArrowUpDown',
        category: 'trading',
        minHeight: 180,
        singleton: true,
        fitContent: true,
        requires: ['workspace:active-pair', 'workspace:active-wallet'],
      },
      {
        id: 'positions',
        label: 'Positions',
        labelKey: 'panes.positions',
        descriptionKey: 'paneDescriptions.positions',
        icon: 'Layers',
        category: 'trading',
        minHeight: 100,
        requires: ['workspace:active-wallet'],
      },
      {
        id: 'portfolio',
        label: 'Portfolio',
        labelKey: 'panes.portfolio',
        descriptionKey: 'paneDescriptions.portfolio',
        icon: 'PieChart',
        category: 'trading',
        singleton: true,
        minHeight: 200,
        requires: ['workspace:active-wallet'],
      },
      {
        id: 'risk',
        label: 'Risk',
        labelKey: 'panes.risk',
        descriptionKey: 'paneDescriptions.risk',
        icon: 'ShieldCheck',
        category: 'trading',
        minHeight: 32,
        singleton: true,
        compact: true,
        fitContent: true,
      },
      {
        id: 'markets',
        label: 'Markets',
        labelKey: 'panes.markets',
        descriptionKey: 'paneDescriptions.markets',
        icon: 'LayoutGrid',
        category: 'discovery',
        singleton: true,
      },
      {
        id: 'watchlist',
        label: 'Watchlist',
        labelKey: 'panes.watchlist',
        descriptionKey: 'paneDescriptions.watchlist',
        icon: 'Star',
        category: 'discovery',
      },
      {
        id: 'liquidity-heatmap',
        label: 'Liquidity Heatmap',
        labelKey: 'panes.liquidityHeatmap',
        descriptionKey: 'paneDescriptions.liquidityHeatmap',
        icon: 'Flame',
        category: 'charting',
        minHeight: 150,
        singleton: true,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'recent-tickers',
        label: 'Recent Tickers',
        labelKey: 'panes.recentTickers',
        descriptionKey: 'paneDescriptions.recentTickers',
        icon: 'History',
        category: 'discovery',
        singleton: true,
      },
      {
        id: 'web',
        label: 'Web',
        labelKey: 'panes.web',
        descriptionKey: 'paneDescriptions.web',
        icon: 'Globe',
        category: 'discovery',
        minHeight: 100,
      },
    ],
  },
}

export function createPairlensCorePlugin(
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

    if (capability === 'workflow:step-types') {
      return getCoreStepTypes()
    }

    throw new Error(`pairlens-core: unsupported capability '${capability}'`)
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,
  }
}
