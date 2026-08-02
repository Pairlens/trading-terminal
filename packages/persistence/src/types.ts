// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Wire-format persistence types are owned by @pairlens/shared/persistence-types
// (app-server types its REST payloads from the same source). Re-exported here
// so persistence adapters and their consumers keep a single import surface.
export type {
  AIMessageScope,
  AIMessage,
  UserConfig,
  RiskState,
  SignalStatus,
  Signal,
  SignalScope,
  EncryptedPluginConfig,
  WorkspaceLayout,
  ChartState,
  TradeJournalEntry,
  TradeFilter,
  PluginPersistedState,
  Watchlist,
  WatchlistsState,
  SyncStatus,
  PersistenceTier,
} from '@pairlens/shared/persistence-types'
export { DEFAULT_WATCHLIST_ID } from '@pairlens/shared/persistence-types'

export type { WorkflowDSL } from '@pairlens/workflow-engine/types'

// Persistence-local types (not part of the wire format)
export type Unsubscribe = () => void
