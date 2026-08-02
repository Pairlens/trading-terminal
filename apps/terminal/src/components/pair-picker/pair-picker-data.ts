// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Bitcoin,
  Brain,
  Flame,
  Gamepad2,
  Landmark,
  Layers,
  LayoutGrid,
  Server,
  Star,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Instrument } from '@pairlens/shared/instrument-types'

export type AssetClassFilter = 'all' | 'crypto' | 'stocks'

export interface AssetClassTab {
  id: AssetClassFilter
  label: string
  icon: LucideIcon
}

export const ASSET_CLASSES: Array<AssetClassTab> = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'crypto', label: 'Crypto', icon: Bitcoin },
  { id: 'stocks', label: 'Stocks', icon: TrendingUp },
]

export type PairCategory =
  | 'layer1'
  | 'defi'
  | 'meme'
  | 'ai'
  | 'gaming'
  | 'infrastructure'

export type Regime = 'Trend' | 'Range' | 'High Volatility' | 'Balanced' | 'Chop'

export interface PairEntry {
  symbol: string
  name: string
  base: string
  quote: string
  assetClass?: string
  categories: Array<PairCategory>
  regime?: Regime
  signalBias?: string
  rank: number
  featured?: boolean
}

export interface CategoryTab {
  id: PairCategory | 'all' | 'watchlists'
  label: string
  icon: LucideIcon
}

export const CATEGORIES: Array<CategoryTab> = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'watchlists', label: 'Watchlists', icon: Star },
  { id: 'layer1', label: 'Layer 1', icon: Layers },
  { id: 'defi', label: 'DeFi', icon: Landmark },
  { id: 'meme', label: 'Meme', icon: Flame },
  { id: 'ai', label: 'AI', icon: Brain },
  { id: 'gaming', label: 'Gaming', icon: Gamepad2 },
  { id: 'infrastructure', label: 'Infra', icon: Server },
]

export const REGIME_STYLES: Record<
  Regime,
  { border: string; bg: string; text: string }
> = {
  Trend: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  Range: {
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/10',
    text: 'text-blue-700 dark:text-blue-300',
  },
  'High Volatility': {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-300',
  },
  Balanced: {
    border: 'border-violet-500/30',
    bg: 'bg-violet-500/10',
    text: 'text-violet-700 dark:text-violet-300',
  },
  Chop: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/10',
    text: 'text-rose-700 dark:text-rose-300',
  },
}

export function instrumentToPairEntry(inst: Instrument): PairEntry {
  return {
    symbol: inst.symbol,
    name: inst.name,
    base: inst.base,
    quote: inst.quote,
    assetClass: inst.assetClass,
    categories: inst.categories as Array<PairCategory>,
    rank: inst.rank,
    featured: inst.featured,
  }
}
