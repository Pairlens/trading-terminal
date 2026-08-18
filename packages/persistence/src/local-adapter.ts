// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { PersistenceAdapter } from './adapter'
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

// Minimal inline EventEmitter that works in both browser and Node/Bun
type Listener<T> = (value: T) => void

class MiniEmitter<TEventMap extends Record<string, unknown>> {
  private listeners: Partial<{
    [K in keyof TEventMap]: Set<Listener<TEventMap[K]>>
  }> = {}

  on<TKey extends keyof TEventMap>(
    event: TKey,
    listener: Listener<TEventMap[TKey]>,
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set()
    }
    this.listeners[event]!.add(listener)
    return () => this.off(event, listener)
  }

  off<TKey extends keyof TEventMap>(
    event: TKey,
    listener: Listener<TEventMap[TKey]>,
  ): void {
    this.listeners[event]?.delete(listener)
  }

  emit<TKey extends keyof TEventMap>(
    event: TKey,
    value: TEventMap[TKey],
  ): void {
    this.listeners[event]?.forEach((listener) => listener(value))
  }
}

type LocalEvents = {
  'userConfig:updated': { userId: string; config: UserConfig }
  'riskState:updated': { userId: string; state: RiskState }
  'signal:new': { scope: SignalScope; signal: Signal }
  'watchlists:updated': { userId: string; state: WatchlistsState }
}

const STORAGE_KEY_PREFIX = 'pairlens:persistence:'

// Cross-window bridge: each window holds its own adapter instance over the
// same localStorage, so writes are broadcast to sibling windows (Tauri
// multi-window / browser tabs) which refresh their in-memory copy and
// re-emit the matching typed event to subscribers. The writer already
// persisted the value, so receivers never write back — no loops.
const BRIDGE_CHANNEL = 'pairlens:persistence'

type BridgeMessage = { key: string; value: unknown }

/** Keys that never cross window boundaries (encrypted plugin credentials). */
function isBridgeBlocked(key: string): boolean {
  return key.startsWith('pluginConfig:')
}

function storageKey(key: string): string {
  return `${STORAGE_KEY_PREFIX}${key}`
}

function readFromStorage<T>(key: string): T | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(storageKey(key))
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeToStorage(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(storageKey(key), JSON.stringify(value))
  } catch {
    // SSR or storage quota exceeded — silently ignore
  }
}

function signalScopeKey(scope: {
  userId: string
  market?: string
  pairKey?: string
  timeframe?: string
}): string {
  return `signals:${scope.userId}:${scope.market ?? '*'}:${scope.pairKey ?? '*'}:${scope.timeframe ?? '*'}`
}

function signalMatchesScope(signal: Signal, scope: SignalScope): boolean {
  if (signal.userId !== scope.userId) return false
  if (scope.market !== undefined && signal.market !== scope.market) return false
  if (scope.pairKey !== undefined && signal.pairKey !== scope.pairKey)
    return false
  if (scope.timeframe !== undefined && signal.timeframe !== scope.timeframe)
    return false
  return true
}

export class LocalPersistenceAdapter implements PersistenceAdapter {
  private store = new Map<string, unknown>()
  private emitter = new MiniEmitter<LocalEvents>()
  private bridge: BroadcastChannel | null = null

  readonly syncStatus: SyncStatus = 'local'
  readonly tier: PersistenceTier = 'local'

  constructor() {
    this.hydrateFromStorage()
    if (typeof BroadcastChannel !== 'undefined') {
      this.bridge = new BroadcastChannel(BRIDGE_CHANNEL)
      this.bridge.onmessage = (event: MessageEvent<BridgeMessage>) => {
        this.applyExternalWrite(event.data.key, event.data.value)
      }
    }
  }

  /**
   * Apply a write made by a sibling window: refresh the in-memory copy
   * (which otherwise masks the fresh localStorage value in storeGet) and
   * notify subscribers through the same events a local write would emit.
   */
  private applyExternalWrite(key: string, value: unknown): void {
    const previous = this.store.get(key)
    this.store.set(key, value)

    const [kind, userId] = key.split(':')
    if (userId === undefined) return

    if (kind === 'watchlists') {
      this.emitter.emit('watchlists:updated', {
        userId,
        state: value as WatchlistsState,
      })
    } else if (kind === 'userConfig') {
      this.emitter.emit('userConfig:updated', {
        userId,
        config: value as UserConfig,
      })
    } else if (kind === 'riskState') {
      this.emitter.emit('riskState:updated', {
        userId,
        state: value as RiskState,
      })
    } else if (kind === 'signals' && key === `signals:${userId}:*:*:*`) {
      // Emit signal:new only for an append to the global bucket (a longer
      // array than before) — status updates rewrite arrays in place and
      // must not re-announce old signals.
      const next = value as Array<Signal>
      const prevLen = Array.isArray(previous) ? previous.length : 0
      if (Array.isArray(next) && next.length > prevLen) {
        const signal = next[next.length - 1]
        this.emitter.emit('signal:new', { scope: { userId }, signal })
      }
    }
  }

  private hydrateFromStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i)
        if (!fullKey?.startsWith(STORAGE_KEY_PREFIX)) continue
        const key = fullKey.slice(STORAGE_KEY_PREFIX.length)
        try {
          const raw = localStorage.getItem(fullKey)
          if (raw !== null) {
            this.store.set(key, JSON.parse(raw))
          }
        } catch {
          // Corrupted entry — skip
        }
      }
    } catch {
      // localStorage not available — skip
    }
  }

  private storeGet<T>(key: string): T | null {
    if (this.store.has(key)) {
      return this.store.get(key) as T
    }
    const fromStorage = readFromStorage<T>(key)
    if (fromStorage !== null) {
      this.store.set(key, fromStorage)
    }
    return fromStorage
  }

  private storeSet(key: string, value: unknown): void {
    this.store.set(key, value)
    writeToStorage(key, value)
    if (this.bridge && !isBridgeBlocked(key)) {
      try {
        this.bridge.postMessage({ key, value } satisfies BridgeMessage)
      } catch {
        // Value not structured-cloneable — skip broadcast, local state is fine
      }
    }
  }

  // ---------------------------------------------------------------------------
  // User configuration
  // ---------------------------------------------------------------------------

  async getUserConfig(userId: string): Promise<UserConfig | null> {
    return this.storeGet<UserConfig>(`userConfig:${userId}`)
  }

  async updateUserConfig(
    userId: string,
    patch: Partial<UserConfig>,
  ): Promise<void> {
    const existing = this.storeGet<UserConfig>(`userConfig:${userId}`)
    const updated: UserConfig = {
      aiPersona: 'balanced',
      tradingMode: 'paper',
      preferences: {},
      ...existing,
      ...patch,
      userId,
    }
    this.storeSet(`userConfig:${userId}`, updated)
    this.emitter.emit('userConfig:updated', { userId, config: updated })
  }

  subscribeUserConfig(
    userId: string,
    cb: (config: UserConfig) => void,
  ): Unsubscribe {
    return this.emitter.on('userConfig:updated', ({ userId: uid, config }) => {
      if (uid === userId) cb(config)
    })
  }

  // ---------------------------------------------------------------------------
  // Risk state
  // ---------------------------------------------------------------------------

  async getRiskState(userId: string): Promise<RiskState | null> {
    return this.storeGet<RiskState>(`riskState:${userId}`)
  }

  async updateRiskState(
    userId: string,
    patch: Partial<RiskState>,
  ): Promise<void> {
    const existing = this.storeGet<RiskState>(`riskState:${userId}`)
    const updated: RiskState = {
      dailyPnl: 0,
      dailyTradeCount: 0,
      maxDailyLoss: 0,
      maxPositionSize: 0,
      maxDailyTrades: 0,
      lastUpdated: Date.now(),
      ...existing,
      ...patch,
      userId,
    }
    this.storeSet(`riskState:${userId}`, updated)
    this.emitter.emit('riskState:updated', { userId, state: updated })
  }

  subscribeRiskState(
    userId: string,
    cb: (state: RiskState) => void,
  ): Unsubscribe {
    return this.emitter.on('riskState:updated', ({ userId: uid, state }) => {
      if (uid === userId) cb(state)
    })
  }

  // ---------------------------------------------------------------------------
  // Signals
  // ---------------------------------------------------------------------------

  async appendSignal(signal: Signal): Promise<void> {
    // Store signal in all matching bucket keys
    const bucketKey = signalScopeKey({
      userId: signal.userId,
      market: signal.market,
      pairKey: signal.pairKey,
      timeframe: signal.timeframe,
    })
    const existing = this.storeGet<Array<Signal>>(bucketKey) ?? []
    existing.push(signal)
    this.storeSet(bucketKey, existing)

    // Also maintain a global user-level list for cross-scope queries
    const globalKey = `signals:${signal.userId}:*:*:*`
    const global = this.storeGet<Array<Signal>>(globalKey) ?? []
    global.push(signal)
    this.storeSet(globalKey, global)

    this.emitter.emit('signal:new', {
      scope: { userId: signal.userId },
      signal,
    })
  }

  async getSignals(scope: SignalScope, limit?: number): Promise<Array<Signal>> {
    // Collect from the global user list and filter by scope
    const globalKey = `signals:${scope.userId}:*:*:*`
    const all = this.storeGet<Array<Signal>>(globalKey) ?? []
    const filtered = all.filter((s) => signalMatchesScope(s, scope))
    if (limit !== undefined && limit > 0) {
      return filtered.slice(-limit)
    }
    return filtered
  }

  async updateSignalStatus(
    signalId: string,
    status: SignalStatus,
  ): Promise<void> {
    // Iterate all store entries to find and update the signal
    for (const [key, value] of this.store.entries()) {
      if (!key.startsWith('signals:')) continue
      const signals = value as Array<Signal>
      const idx = signals.findIndex((s) => s.id === signalId)
      if (idx !== -1) {
        signals[idx] = { ...signals[idx], aiStatus: status }
        this.storeSet(key, signals)
      }
    }
  }

  subscribeSignals(
    scope: SignalScope,
    cb: (signal: Signal) => void,
  ): Unsubscribe {
    return this.emitter.on('signal:new', ({ signal }) => {
      if (signalMatchesScope(signal, scope)) cb(signal)
    })
  }

  // ---------------------------------------------------------------------------
  // Plugin configuration
  // ---------------------------------------------------------------------------

  async getPluginConfig(
    userId: string,
    pluginId: string,
  ): Promise<EncryptedPluginConfig | null> {
    return this.storeGet<EncryptedPluginConfig>(
      `pluginConfig:${userId}:${pluginId}`,
    )
  }

  async setPluginConfig(
    userId: string,
    pluginId: string,
    config: EncryptedPluginConfig,
  ): Promise<void> {
    this.storeSet(`pluginConfig:${userId}:${pluginId}`, config)
  }

  async getPluginStates(): Promise<Record<string, PluginPersistedState>> {
    return (
      this.storeGet<Record<string, PluginPersistedState>>('pluginStates') ?? {}
    )
  }

  async setPluginState(
    pluginId: string,
    state: PluginPersistedState,
  ): Promise<void> {
    const all =
      this.storeGet<Record<string, PluginPersistedState>>('pluginStates') ?? {}
    all[pluginId] = state
    this.storeSet('pluginStates', all)
  }

  async removePluginState(pluginId: string): Promise<void> {
    const all =
      this.storeGet<Record<string, PluginPersistedState>>('pluginStates') ?? {}
    delete all[pluginId]
    this.storeSet('pluginStates', all)
  }

  // ---------------------------------------------------------------------------
  // Workspace state
  // ---------------------------------------------------------------------------

  async getWorkspace(
    userId: string,
    id: string,
  ): Promise<WorkspaceLayout | null> {
    return this.storeGet<WorkspaceLayout>(`workspace:${userId}:${id}`)
  }

  async setWorkspace(
    userId: string,
    id: string,
    layout: WorkspaceLayout,
  ): Promise<void> {
    this.storeSet(`workspace:${userId}:${id}`, layout)
  }

  async getChartState(
    userId: string,
    pairKey: string,
  ): Promise<ChartState | null> {
    return this.storeGet<ChartState>(`chartState:${userId}:${pairKey}`)
  }

  async setChartState(
    userId: string,
    pairKey: string,
    state: ChartState,
  ): Promise<void> {
    this.storeSet(`chartState:${userId}:${pairKey}`, state)
  }

  // ---------------------------------------------------------------------------
  // Watchlists
  // ---------------------------------------------------------------------------

  async getWatchlists(userId: string): Promise<WatchlistsState | null> {
    return this.storeGet<WatchlistsState>(`watchlists:${userId}`)
  }

  async setWatchlists(userId: string, state: WatchlistsState): Promise<void> {
    this.storeSet(`watchlists:${userId}`, state)
    this.emitter.emit('watchlists:updated', { userId, state })
  }

  subscribeWatchlists(
    userId: string,
    cb: (state: WatchlistsState) => void,
  ): Unsubscribe {
    return this.emitter.on('watchlists:updated', ({ userId: uid, state }) => {
      if (uid === userId) cb(state)
    })
  }

  // ---------------------------------------------------------------------------
  // Trade journal
  // ---------------------------------------------------------------------------

  async appendTradeEntry(entry: TradeJournalEntry): Promise<void> {
    const key = `tradeJournal:${entry.userId}`
    const entries = this.storeGet<Array<TradeJournalEntry>>(key) ?? []
    entries.push(entry)
    this.storeSet(key, entries)
  }

  async getTradeEntries(
    filter: TradeFilter,
  ): Promise<Array<TradeJournalEntry>> {
    const key = `tradeJournal:${filter.userId}`
    const entries = this.storeGet<Array<TradeJournalEntry>>(key) ?? []
    return entries.filter((entry) => {
      if (filter.market !== undefined && entry.market !== filter.market)
        return false
      if (filter.pairKey !== undefined && entry.pairKey !== filter.pairKey)
        return false
      if (filter.startDate !== undefined && entry.createdAt < filter.startDate)
        return false
      if (filter.endDate !== undefined && entry.createdAt > filter.endDate)
        return false
      return true
    })
  }

  // ---------------------------------------------------------------------------
  // Workflows
  // ---------------------------------------------------------------------------

  async getWorkflows(userId: string): Promise<Array<WorkflowDSL>> {
    return this.storeGet<Array<WorkflowDSL>>(`workflows:${userId}`) ?? []
  }

  async setWorkflow(userId: string, workflow: WorkflowDSL): Promise<void> {
    const workflows =
      this.storeGet<Array<WorkflowDSL>>(`workflows:${userId}`) ?? []
    const idx = workflows.findIndex((w) => w.id === workflow.id)
    if (idx >= 0) {
      workflows[idx] = workflow
    } else {
      workflows.push(workflow)
    }
    this.storeSet(`workflows:${userId}`, workflows)
  }

  async deleteWorkflow(userId: string, workflowId: string): Promise<void> {
    const workflows =
      this.storeGet<Array<WorkflowDSL>>(`workflows:${userId}`) ?? []
    const filtered = workflows.filter((w) => w.id !== workflowId)
    this.storeSet(`workflows:${userId}`, filtered)
  }
}
