// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Assistant chat history is deliberately absent. Threads are stored on the
// user's own device (apps/terminal/src/stores/assistant-conversations-store.ts)
// and there is no server-side shape for them on purpose.

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
