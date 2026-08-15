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
  Vote,
} from 'lucide-react'
import { registerToken } from '@pairlens/market-engine/token-directory'
import type { LucideIcon } from 'lucide-react'

import type { Instrument } from '@pairlens/shared/instrument-types'
import { registerPredictionOutcome } from '@/stores/prediction-directory-store'

export type AssetClassFilter =
  | 'all'
  | 'crypto'
  | 'stocks'
  | 'prediction'
  | 'crypto-perp'

export interface AssetClassTab {
  id: AssetClassFilter
  label: string
  icon: LucideIcon
}

// The id IS the instrument `assetClass` the discovery filter is called with
// (except 'all'), so 'prediction' is singular even though the tab reads
// "Predictions" — a plural id would filter for a class no instrument carries.
// 'crypto-perp' is spelled the connectors' way for exactly the same reason.
export const ASSET_CLASSES: Array<AssetClassTab> = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'crypto', label: 'Crypto', icon: Bitcoin },
  { id: 'crypto-perp', label: 'Futures', icon: Layers },
  { id: 'stocks', label: 'Stocks', icon: TrendingUp },
  { id: 'prediction', label: 'Predictions', icon: Vote },
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
  /**
   * Unique row identity. Distinct from `symbol` because two assets can share
   * a ticker (a wave-1 CEX pair and an appended on-chain token) — React keys
   * and cmdk values must not collide when both render.
   */
  id: string
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
  /**
   * Token-arm identity (kind === 'token' rows only). Selection pins exactly
   * this chain+address via the token directory — symbol re-resolution after
   * display is forbidden (see-what-you-trade).
   */
  chain?: string
  address?: string
  decimals?: number
  /**
   * Prediction-arm identity (kind === 'prediction' rows only). An outcome is
   * `venue + marketId + outcome`, none of which the pair key carries, so
   * selection pins exactly this triple into the prediction directory before
   * navigating — same see-what-you-trade rule as the token arm.
   */
  predictionMarketId?: string
  outcome?: string
  eventId?: string
  eventTitle?: string
  endMs?: number
  /** Venue the outcome lives on. Prediction rows only; keys are per-venue. */
  market?: string
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
    id: inst.id || inst.symbol,
    symbol: inst.symbol,
    name: inst.name,
    base: inst.base,
    quote: inst.quote,
    assetClass: inst.assetClass,
    categories: inst.categories as Array<PairCategory>,
    rank: inst.rank,
    featured: inst.featured,
    ...(inst.kind === 'token'
      ? { chain: inst.chain, address: inst.address, decimals: inst.decimals }
      : {}),
    ...(inst.kind === 'prediction'
      ? {
          predictionMarketId: inst.predictionMarketId,
          outcome: inst.outcome,
          market: inst.market,
          ...(inst.eventId ? { eventId: inst.eventId } : {}),
          ...(inst.eventTitle ? { eventTitle: inst.eventTitle } : {}),
          ...(typeof inst.endMs === 'number' ? { endMs: inst.endMs } : {}),
        }
      : {}),
  }
}

/** True for rows that name a prediction-market outcome. */
export function isPredictionEntry(entry: PairEntry): boolean {
  return Boolean(entry.predictionMarketId && entry.outcome)
}

/**
 * The question alone, without the outcome the connector appends to `name`.
 *
 * Connectors build `name` as `"<question> - <outcome>"` because a categorical
 * market's rows would otherwise all read identically. A row that shows both
 * lines separately has to undo exactly that join, and only that one — a name
 * that does not end in its own outcome is left alone rather than trimmed on a
 * guess.
 */
export function predictionQuestionOf(entry: {
  name: string
  outcome?: string
}): string {
  const suffix = ` - ${entry.outcome}`
  return entry.outcome && entry.name.endsWith(suffix)
    ? entry.name.slice(0, -suffix.length)
    : entry.name
}

/**
 * Pin a selected row's exact identity before navigation, so downstream
 * resolution uses what the user SAW rather than a fresh symbol match.
 *
 * Two arms, one rule: a token pins chain+address into the token directory
 * (pool lookups, swaps), a prediction outcome pins venue+market+outcome and
 * its question into the prediction directory (watchlist and recents display,
 * ticket labelling). Every other row kind is a no-op.
 */
export function pinSelectedEntry(entry: PairEntry): void {
  if (entry.chain && entry.address) {
    registerToken({
      network: entry.chain,
      symbol: entry.base,
      address: entry.address,
      ...(typeof entry.decimals === 'number'
        ? { decimals: entry.decimals }
        : {}),
      name: entry.name,
    })
    return
  }
  if (entry.predictionMarketId && entry.outcome && entry.market) {
    registerPredictionOutcome(entry.symbol, {
      market: entry.market,
      predictionMarketId: entry.predictionMarketId,
      outcome: entry.outcome,
      name: entry.name,
      ...(entry.eventTitle ? { eventTitle: entry.eventTitle } : {}),
      ...(entry.eventId ? { eventId: entry.eventId } : {}),
      ...(typeof entry.endMs === 'number' ? { endMs: entry.endMs } : {}),
    })
  }
}
