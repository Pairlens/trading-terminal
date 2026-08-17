// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { CapabilityId } from './plugin-types'

export type CapabilityMeta = {
  id: CapabilityId
  label: string
  domain: string
  domainLabel: string
  singleton: boolean
  description: string
}

export const CAPABILITY_META: Array<CapabilityMeta> = [
  // Market Data
  {
    id: 'market-data:candles',
    label: 'Candles',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description: 'Live OHLCV candle streams for charts and signals',
  },
  {
    id: 'market-data:ticker',
    label: 'Ticker',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description: 'Real-time last price and 24h change streams',
  },
  {
    id: 'market-data:ticker-snapshot',
    label: 'Ticker Snapshot',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description:
      'Bulk one-shot ticker quotes via REST, without opening streams',
  },
  {
    id: 'market-data:orderbook',
    label: 'Order Book',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description: 'Live order book depth streams',
  },
  {
    id: 'market-data:trades',
    label: 'Trades',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description: 'Live time-and-sales trade tape streams',
  },
  {
    id: 'market-data:history',
    label: 'History',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description: 'Historical candle backfill for charts',
  },
  {
    id: 'market-data:events',
    label: 'Events',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description: 'Browse prediction-market events and their outcomes',
  },
  {
    id: 'market-data:pool-stats',
    label: 'Pool Stats',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description: "AMM pool state, its swaps, and a chain's ranked pools",
  },
  {
    id: 'market-data:session',
    label: 'Session Calendar',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description:
      'Trading-day clock and calendar, including holidays and half days',
  },
  {
    id: 'market-data:funding',
    label: 'Funding',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description:
      'Perpetual funding rates, mark and index prices, and open interest',
  },
  {
    id: 'market-data:discovery',
    label: 'Discovery',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description: 'Browse available trading instruments',
  },
  {
    id: 'market-data:discovery:search',
    label: 'Search',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description: 'Search instruments by name or symbol',
  },
  {
    id: 'market-data:symbol-logo',
    label: 'Symbol Logo',
    domain: 'market-data',
    domainLabel: 'Market Data',
    singleton: false,
    description: 'Logo/icon images for trading symbols',
  },
  // AI
  {
    id: 'ai:inference',
    label: 'Inference',
    domain: 'ai',
    domainLabel: 'AI',
    singleton: false,
    description: 'LLM inference for co-pilot analysis',
  },
  {
    id: 'ai:web-search',
    label: 'Web Search',
    domain: 'ai',
    domainLabel: 'AI',
    singleton: false,
    description: 'Web search grounding for AI research reports',
  },
  // Trading
  {
    id: 'trading:orders',
    label: 'Orders',
    domain: 'trading',
    domainLabel: 'Trading',
    singleton: false,
    description: 'Place and manage orders on the connected venue',
  },
  {
    id: 'trading:balances',
    label: 'Balances',
    domain: 'trading',
    domainLabel: 'Trading',
    singleton: false,
    description: 'Fetch account asset balances from the connected exchange',
  },
  {
    id: 'trading:positions',
    label: 'Positions',
    domain: 'trading',
    domainLabel: 'Trading',
    singleton: false,
    description: 'Read open positions and settlements from the connected venue',
  },
  // Automation
  {
    id: 'workflow:step-types',
    label: 'Workflow Steps',
    domain: 'automation',
    domainLabel: 'Automation',
    singleton: false,
    description: 'Custom step types for automation workflows',
  },
  {
    id: 'notification:channel',
    label: 'Notification Channels',
    domain: 'automation',
    domainLabel: 'Automation',
    singleton: false,
    description: 'Delivery channels for alerts and notifications',
  },
  // Theme
  {
    id: 'theme:override',
    label: 'Theme',
    domain: 'theme',
    domainLabel: 'Theme',
    singleton: true,
    description: 'Custom terminal theme and styling overrides',
  },
  // Charting
  {
    id: 'chart:indicator',
    label: 'Custom Indicators',
    domain: 'charting',
    domainLabel: 'Charting',
    singleton: false,
    description:
      'Script-defined chart indicators run in the local Python runtime',
  },
  // Workspace Store
  {
    id: 'workspace-store:catalog',
    label: 'Store Catalog',
    domain: 'workspace-store',
    domainLabel: 'Workspace Store',
    singleton: false,
    description: 'Provide a browsable catalog of workspace templates',
  },
]

export const CAPABILITY_META_MAP: Record<CapabilityId, CapabilityMeta> =
  Object.fromEntries(CAPABILITY_META.map((m) => [m.id, m])) as Record<
    CapabilityId,
    CapabilityMeta
  >

export type CapabilityDomain = {
  id: string
  label: string
  capabilities: Array<CapabilityMeta>
}

export const CAPABILITY_DOMAINS: Array<CapabilityDomain> = (() => {
  const domainMap = new Map<string, CapabilityDomain>()
  for (const meta of CAPABILITY_META) {
    let domain = domainMap.get(meta.domain)
    if (!domain) {
      domain = { id: meta.domain, label: meta.domainLabel, capabilities: [] }
      domainMap.set(meta.domain, domain)
    }
    domain.capabilities.push(meta)
  }
  return Array.from(domainMap.values())
})()
