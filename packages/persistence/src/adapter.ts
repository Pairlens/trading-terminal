// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  ChartState,
  EncryptedPluginConfig,
  PersistenceTier,
  PluginPersistedState,
  RiskState,
  Signal,
  SignalScope,
  SignalStatus,
  SyncStatus,
  TradeFilter,
  TradeJournalEntry,
  Unsubscribe,
  UserConfig,
  WatchlistsState,
  WorkflowDSL,
  WorkspaceLayout,
} from './types'

export interface PersistenceAdapter {
  // User configuration
  getUserConfig: (userId: string) => Promise<UserConfig | null>
  updateUserConfig: (
    userId: string,
    patch: Partial<UserConfig>,
  ) => Promise<void>
  subscribeUserConfig: (
    userId: string,
    cb: (config: UserConfig) => void,
  ) => Unsubscribe

  // Risk state
  getRiskState: (userId: string) => Promise<RiskState | null>
  updateRiskState: (userId: string, patch: Partial<RiskState>) => Promise<void>
  subscribeRiskState: (
    userId: string,
    cb: (state: RiskState) => void,
  ) => Unsubscribe

  // Signals
  appendSignal: (signal: Signal) => Promise<void>
  getSignals: (scope: SignalScope, limit?: number) => Promise<Array<Signal>>
  updateSignalStatus: (signalId: string, status: SignalStatus) => Promise<void>
  subscribeSignals: (
    scope: SignalScope,
    cb: (signal: Signal) => void,
  ) => Unsubscribe

  // Plugin configuration (legacy encrypted)
  getPluginConfig: (
    userId: string,
    pluginId: string,
  ) => Promise<EncryptedPluginConfig | null>
  setPluginConfig: (
    userId: string,
    pluginId: string,
    config: EncryptedPluginConfig,
  ) => Promise<void>

  // Plugin state (plaintext — encryption handled server-side)
  getPluginStates: () => Promise<Record<string, PluginPersistedState>>
  setPluginState: (
    pluginId: string,
    state: PluginPersistedState,
  ) => Promise<void>
  removePluginState: (pluginId: string) => Promise<void>

  // Workspace state
  getWorkspace: (userId: string, id: string) => Promise<WorkspaceLayout | null>
  setWorkspace: (
    userId: string,
    id: string,
    layout: WorkspaceLayout,
  ) => Promise<void>
  getChartState: (userId: string, pairKey: string) => Promise<ChartState | null>
  setChartState: (
    userId: string,
    pairKey: string,
    state: ChartState,
  ) => Promise<void>

  // Trade journal
  appendTradeEntry: (entry: TradeJournalEntry) => Promise<void>
  getTradeEntries: (filter: TradeFilter) => Promise<Array<TradeJournalEntry>>

  // Watchlists
  getWatchlists: (userId: string) => Promise<WatchlistsState | null>
  setWatchlists: (userId: string, state: WatchlistsState) => Promise<void>
  subscribeWatchlists: (
    userId: string,
    cb: (state: WatchlistsState) => void,
  ) => Unsubscribe

  // Workflows
  getWorkflows: (userId: string) => Promise<Array<WorkflowDSL>>
  setWorkflow: (userId: string, workflow: WorkflowDSL) => Promise<void>
  deleteWorkflow: (userId: string, workflowId: string) => Promise<void>

  // Connection status
  readonly syncStatus: SyncStatus
  readonly tier: PersistenceTier
}
