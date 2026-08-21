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
  Gem,
} from 'lucide-react'
import { registerToken } from '@pairlens/market-engine/token-directory'
import type { LucideIcon } from 'lucide-react'

import type { Instrument } from '@pairlens/shared/instrument-types'
import type {
  InstrumentClass,
  InstrumentRef,
} from '@pairlens/shared/market-ref'
import {
  lookupPredictionEvent,
  lookupPredictionOutcome,
  registerPredictionOutcome,
} from '@/stores/prediction-directory-store'
import { stripOutcomeSuffix } from '@/lib/predictions/event-labels'
import {
  lookupDisplayToken,
  registerDisplayToken,
} from '@/stores/token-directory-store'

export type AssetClassFilter =
  | 'all'
  | 'crypto'
  | 'stocks'
  | 'prediction'
  | 'crypto-perp'
  | 'dex'
  | 'nft'

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
  { id: 'dex', label: 'DEX', icon: Flame },
  { id: 'stocks', label: 'Stocks', icon: TrendingUp },
  { id: 'prediction', label: 'Predictions', icon: Vote },
  { id: 'nft', label: 'NFTs', icon: Gem },
]

/**
 * The chip a Discovery section opens on. Instrument classes and the scanner's
 * filter ids are two vocabularies for the same thing — `spot` instruments are
 * catalogued as `crypto` — so the translation lives here, next to the ids it
 * has to agree with, rather than at each call site.
 */
export const ASSET_CLASS_FILTER_FOR: Record<InstrumentClass, AssetClassFilter> =
  {
    spot: 'crypto',
    perp: 'crypto-perp',
    dex: 'dex',
    stocks: 'stocks',
    prediction: 'prediction',
    nft: 'nft',
  }

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
  /** The market's short label within its event — what a ticker slot renders. */
  shortTitle?: string
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
          ...(inst.shortTitle ? { shortTitle: inst.shortTitle } : {}),
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
  return stripOutcomeSuffix(entry.name, entry.outcome ?? '')
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
    // Two directories, two questions. The connector-side one answers
    // "symbol → address" for pool resolution and lives in memory; this one
    // answers "address → what the user saw" for a watchlist row and persists,
    // because the row it labels persists.
    registerToken({
      network: entry.chain,
      symbol: entry.base,
      address: entry.address,
      ...(typeof entry.decimals === 'number'
        ? { decimals: entry.decimals }
        : {}),
      name: entry.name,
    })
    registerDisplayToken({
      chain: entry.chain,
      address: entry.address,
      symbol: entry.base,
      name: entry.name,
      ...(typeof entry.decimals === 'number'
        ? { decimals: entry.decimals }
        : {}),
    })
    return
  }
  if (entry.predictionMarketId && entry.outcome && entry.market) {
    registerPredictionOutcome(entry.symbol, {
      market: entry.market,
      predictionMarketId: entry.predictionMarketId,
      outcome: entry.outcome,
      name: entry.name,
      ...(entry.shortTitle ? { shortTitle: entry.shortTitle } : {}),
      ...(entry.eventTitle ? { eventTitle: entry.eventTitle } : {}),
      ...(entry.eventId ? { eventId: entry.eventId } : {}),
      ...(typeof entry.endMs === 'number' ? { endMs: entry.endMs } : {}),
    })
  }
}

/**
 * A row for a pair key the catalog does not have.
 *
 * Long-tail tokens, symbols past the first discovery page, and anything a
 * standalone build never fetched. A picker that silently drops what you were
 * just looking at is worse than one that renders it from its own key.
 */
export function synthesizeEntry(symbol: string): PairEntry {
  const idx = symbol.indexOf('-')
  const base = idx === -1 ? symbol : symbol.slice(0, idx)
  const quote = idx === -1 ? '' : symbol.slice(idx + 1)
  return {
    id: symbol,
    symbol,
    name: base,
    base,
    quote,
    categories: [],
    rank: Number.MAX_SAFE_INTEGER,
  }
}

/**
 * The row a stored ref names.
 *
 * Three sources, in order: the instrument catalog (symbol-keyed, so it can
 * only answer for the symbol-shaped arms), the persisted directories for the
 * venue-bound arms, and finally the key itself. The directories are what stop
 * a watchlist's token and prediction rows from vanishing out of these lists
 * once entries are stored by address rather than by ticker.
 */
export function pairEntryForRef(
  ref: InstrumentRef,
  bySymbol: Map<string, PairEntry>,
): PairEntry | null {
  if (ref.cls === 'dex') {
    if (!ref.market) return null
    const [address, quote] = splitDexId(ref.id)
    const pinned = lookupDisplayToken(ref.market, address)
    if (!pinned) return null
    return {
      id: `${ref.market}:${address}`,
      symbol: ref.id,
      name: pinned.name ?? pinned.symbol,
      base: pinned.symbol,
      quote,
      assetClass: 'dex',
      categories: [],
      rank: Number.MAX_SAFE_INTEGER,
      chain: ref.market,
      address,
      ...(typeof pinned.decimals === 'number'
        ? { decimals: pinned.decimals }
        : {}),
    }
  }

  if (ref.cls === 'prediction') {
    // A prediction ref names an EVENT, so the event map answers first. The
    // outcome map is the fallback for a ref that still names one leg: an alert
    // on a single side, a position row's own link.
    const event = lookupPredictionEvent(ref.id)
    if (event) {
      return {
        id: `${event.market}:${ref.id}`,
        symbol: ref.id,
        name: event.title,
        base: ref.id,
        quote: '',
        assetClass: 'prediction',
        categories: [],
        rank: Number.MAX_SAFE_INTEGER,
        predictionMarketId: event.eventId,
        outcome: event.leader?.label ?? '',
        market: event.market,
        eventTitle: event.title,
        eventId: event.eventId,
        ...(typeof event.endMs === 'number' ? { endMs: event.endMs } : {}),
      }
    }
    const pinned = lookupPredictionOutcome(ref.id)
    if (!pinned) return null
    return {
      id: `${pinned.market}:${ref.id}`,
      symbol: ref.id,
      name: pinned.name,
      base: ref.id,
      quote: '',
      assetClass: 'prediction',
      categories: [],
      rank: Number.MAX_SAFE_INTEGER,
      predictionMarketId: pinned.predictionMarketId,
      outcome: pinned.outcome,
      market: pinned.market,
      ...(pinned.shortTitle ? { shortTitle: pinned.shortTitle } : {}),
      ...(pinned.eventTitle ? { eventTitle: pinned.eventTitle } : {}),
      ...(pinned.eventId ? { eventId: pinned.eventId } : {}),
      ...(typeof pinned.endMs === 'number' ? { endMs: pinned.endMs } : {}),
    }
  }

  return bySymbol.get(ref.id) ?? synthesizeEntry(ref.id)
}

/** `0x532f…-WETH` → `['0x532f…', 'WETH']`. The base is the address. */
function splitDexId(id: string): [string, string] {
  const at = id.lastIndexOf('-')
  return at === -1 ? [id, ''] : [id.slice(0, at), id.slice(at + 1)]
}
