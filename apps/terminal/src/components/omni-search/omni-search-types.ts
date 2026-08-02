// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'

export type OmniSearchCategory =
  | 'all'
  | 'pairs'
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
