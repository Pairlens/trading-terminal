// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Assistant conversations ────────────────────────────────────────────
//
// Chat threads live on the user's device by default. This is the shape they
// take ONLY once someone turns the `assistant` cloud-sync domain on, which
// is off until they say otherwise; nothing here is written for a user who
// never opts in.
//
// Full fidelity on purpose. The old server rows kept `role` plus a flattened
// string, so a synced thread came back stripped of its tool calls, research
// cards and order proposals. `messages` carries whole AI SDK UIMessages,
// typed here as unknown because @pairlens/shared must not depend on `ai`.

/** One thread, as it crosses the wire. `id`/`updatedAt` drive the merge. */
export type SyncedConversation = {
  id: string
  /** Null while the thread has not been named yet. */
  title: string | null
  createdAt: number
  /**
   * Last activity. The sync merge is per-conversation last-write-wins on
   * this field, so it must only move when the thread actually changes.
   */
  updatedAt: number
  /** Whole `UIMessage`s, in order. Opaque to the server. */
  messages: Array<unknown>
}

/** GET and PUT /api/assistant/conversations share this body. */
export type AssistantConversationsPayload = {
  conversations: Array<SyncedConversation>
}

// User config
export type UserConfig = {
  userId: string
  aiPersona: 'mentor' | 'balanced' | 'technical'
  tradingMode: 'paper' | 'live'
  preferences: Record<string, unknown>
}

// Risk state
export type RiskState = {
  userId: string
  dailyPnl: number
  dailyTradeCount: number
  maxDailyLoss: number
  maxPositionSize: number
  maxDailyTrades: number
  lastUpdated: number
}

// Signal types (extend existing SignalPayload)
export type SignalStatus = 'pending' | 'approved' | 'blocked' | 'watch'
export type Signal = {
  id: string
  userId: string
  market: string
  pairKey: string
  timeframe: string
  strategy: string
  direction: 'long' | 'short'
  confidence: number
  regime: string
  aiStatus: SignalStatus
  payload: Record<string, unknown>
  createdAt: number
}
export type SignalScope = {
  userId: string
  market?: string
  pairKey?: string
  timeframe?: string
}

// Plugin config (encrypted)
export type EncryptedPluginConfig = {
  pluginId: string
  encryptedData: string
  iv: string
  tag: string
  algorithm: string
  version: number
}

// Workspace/Chart state
export type WorkspaceLayout = {
  id: string
  name: string
  panels: Record<string, unknown>
  createdAt: number
  updatedAt: number
}
export type ChartState = {
  pairKey: string
  indicators: Array<Record<string, unknown>>
  drawings: Array<Record<string, unknown>>
  settings: Record<string, unknown>
}

// Trade journal
export type TradeJournalEntry = {
  id: string
  userId: string
  market: string
  pairKey: string
  side: 'buy' | 'sell'
  price: number
  quantity: number
  notes: string
  tags: Array<string>
  createdAt: number
}
export type TradeFilter = {
  userId: string
  market?: string
  pairKey?: string
  startDate?: number
  endDate?: number
}

// Plugin persisted state (enabled flag + config synced per plugin)
export type PluginPersistedState = {
  enabled: boolean
  config: Record<string, unknown>
}

// Watchlists
export type Watchlist = { id: string; name: string; symbols: Array<string> }
export type WatchlistsState = { activeListId: string; lists: Array<Watchlist> }
export const DEFAULT_WATCHLIST_ID = 'favorites'

// Sync status
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error'
export type PersistenceTier = 'local' | 'remote'
