// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { AssetClass } from '@pairlens/market-engine'
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'

export type OmniSearchCategory =
  | 'all'
  | 'pairs'
  | 'markets'
  | 'pages'
  | 'workspaces'
  | 'workflows'
  | 'notifications'
  | 'panes'
  | 'plugins'
  | 'actions'

/** Matched [start, end) character ranges in the result's main label. */
export type MatchRanges = Array<[number, number]>

export type PairResult = {
  type: 'pair'
  pair: PairEntry
  isWatched: boolean
}

/**
 * A venue the terminal can chart right now — one entry per ACTIVE market
 * connector plugin, so uninstalled or disabled connectors are absent by
 * construction rather than by an allow-list.
 */
export type MarketResult = {
  type: 'market'
  /** Connector market id ('okx') — the value `terminal.market` holds. */
  marketId: string
  label: string
  iconUrl?: string
  /** Primary asset class, used for the row's category chip. */
  assetClass?: AssetClass
  /** Already the active venue — selecting it is a no-op. */
  isActive: boolean
  /** This build cannot reach the venue — see MarketOption.desktopOnly. */
  desktopOnly: boolean
  matchRanges?: MatchRanges
}

export type PageResult = {
  type: 'page'
  id: string
  name: string
  icon: string
  path: string
  matchRanges?: MatchRanges
}

export type WorkspaceResult = {
  type: 'workspace'
  id: string
  name: string
  description?: string
  icon?: string
  matchRanges?: MatchRanges
}

export type PaneResult = {
  type: 'pane'
  paneType: string
  label: string
  icon: string
  category?: string
  matchRanges?: MatchRanges
}

export type PluginResult = {
  type: 'plugin'
  id: string
  name: string
  description?: string
  icon?: string
  enabled: boolean
  matchRanges?: MatchRanges
}

export type WorkflowResult = {
  type: 'workflow'
  id: string
  name: string
  description?: string
  matchRanges?: MatchRanges
}

export type NotificationResult = {
  type: 'notification'
  id: string
  name: string
  matchRanges?: MatchRanges
}

export type ActionResult = {
  type: 'action'
  id: string
  label: string
  icon: string
  shortcut?: string
  /** Hidden search aliases, e.g. ['logout'] for "Sign out". */
  keywords?: Array<string>
  matchRanges?: MatchRanges
  execute: () => void
}

export type OmniSearchResult =
  | PairResult
  | MarketResult
  | PageResult
  | WorkspaceResult
  | WorkflowResult
  | NotificationResult
  | PaneResult
  | PluginResult
  | ActionResult

export type ResultGroup = {
  category: OmniSearchCategory
  label: string
  results: Array<OmniSearchResult>
}
