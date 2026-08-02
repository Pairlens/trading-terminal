// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { PersistenceAdapter } from './adapter'
import type {
  AIMessage,
  AIMessageScope,
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

// WebSocket message envelopes
type WsUserConfigUpdated = {
  type: 'userConfig.updated'
  userId: string
  config: UserConfig
}

type WsRiskStateUpdated = {
  type: 'riskState.updated'
  userId: string
  state: RiskState
}

type WsSignalNew = {
  type: 'signal.new'
  userId: string
  market?: string
  pairKey?: string
  timeframe?: string
  signal: Signal
}

type WsWatchlistsUpdated = {
  type: 'watchlists.updated'
  userId: string
  state: WatchlistsState
}

type WsMessage =
  | WsUserConfigUpdated
  | WsRiskStateUpdated
  | WsSignalNew
  | WsWatchlistsUpdated

type WsListener = (msg: WsMessage) => void

function signalMatchesScope(signal: Signal, scope: SignalScope): boolean {
  if (signal.userId !== scope.userId) return false
  if (scope.market !== undefined && signal.market !== scope.market) return false
  if (scope.pairKey !== undefined && signal.pairKey !== scope.pairKey)
    return false
  if (scope.timeframe !== undefined && signal.timeframe !== scope.timeframe)
    return false
  return true
}

class PersistenceApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'PersistenceApiError'
  }
}

export class RemotePersistenceAdapter implements PersistenceAdapter {
  private serverUrl: string
  private authToken: string
  private ws: WebSocket | null
  private wsListeners = new Set<WsListener>()

  private _syncStatus: SyncStatus = 'syncing'
  readonly tier: PersistenceTier = 'remote'

  get syncStatus(): SyncStatus {
    return this._syncStatus
  }

  constructor(serverUrl: string, authToken: string, ws?: WebSocket) {
    this.serverUrl = serverUrl.replace(/\/$/, '')
    this.authToken = authToken
    this.ws = ws ?? null

    if (this.ws) {
      this.attachWebSocket(this.ws)
    }
  }

  private attachWebSocket(ws: WebSocket): void {
    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage
        this.wsListeners.forEach((listener) => listener(msg))
      } catch {
        // Malformed message — ignore
      }
    })

    ws.addEventListener('close', () => {
      this._syncStatus = 'offline'
    })

    ws.addEventListener('error', () => {
      this._syncStatus = 'error'
    })
  }

  private addWsListener(listener: WsListener): Unsubscribe {
    this.wsListeners.add(listener)
    return () => this.wsListeners.delete(listener)
  }

  private async fetchJson<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.serverUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.authToken}`,
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })

      if (!res.ok) {
        this._syncStatus = 'error'
        throw new PersistenceApiError(
          res.status,
          `Persistence API error ${res.status}: ${res.statusText}`,
        )
      }

      this._syncStatus = 'synced'

      // For 204 No Content responses, return undefined cast to T
      if (res.status === 204) {
        return undefined as T
      }

      return res.json() as Promise<T>
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith('Persistence API error')
      ) {
        throw err
      }
      this._syncStatus = 'error'
      throw err
    }
  }

  private buildQuery(
    params: Record<string, string | number | undefined>,
  ): string {
    const parts: Array<string> = []
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined) {
        parts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`,
        )
      }
    }
    return parts.length > 0 ? `?${parts.join('&')}` : ''
  }

  // ---------------------------------------------------------------------------
  // AI conversation history
  // ---------------------------------------------------------------------------

  async getAIMessages(
    scope: AIMessageScope,
    limit?: number,
  ): Promise<Array<AIMessage>> {
    const query = this.buildQuery({
      userId: scope.userId,
      market: scope.market,
      pairKey: scope.pairKey,
      limit,
    })
    return this.fetchJson<Array<AIMessage>>(
      'GET',
      `/api/persistence/ai-messages${query}`,
    )
  }

  async appendAIMessage(
    scope: AIMessageScope,
    message: AIMessage,
  ): Promise<void> {
    await this.fetchJson<void>('POST', '/api/persistence/ai-messages', {
      scope,
      message,
    })
  }

  // ---------------------------------------------------------------------------
  // User configuration
  // ---------------------------------------------------------------------------

  async getUserConfig(userId: string): Promise<UserConfig | null> {
    const query = this.buildQuery({ userId })
    try {
      return await this.fetchJson<UserConfig>(
        'GET',
        `/api/persistence/user-config${query}`,
      )
    } catch {
      return null
    }
  }

  async updateUserConfig(
    userId: string,
    patch: Partial<UserConfig>,
  ): Promise<void> {
    await this.fetchJson<void>('PATCH', '/api/persistence/user-config', {
      userId,
      patch,
    })
  }

  subscribeUserConfig(
    userId: string,
    cb: (config: UserConfig) => void,
  ): Unsubscribe {
    return this.addWsListener((msg) => {
      if (msg.type === 'userConfig.updated' && msg.userId === userId) {
        cb(msg.config)
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Risk state
  // ---------------------------------------------------------------------------

  async getRiskState(userId: string): Promise<RiskState | null> {
    const query = this.buildQuery({ userId })
    try {
      return await this.fetchJson<RiskState>(
        'GET',
        `/api/persistence/risk-state${query}`,
      )
    } catch {
      return null
    }
  }

  async updateRiskState(
    userId: string,
    patch: Partial<RiskState>,
  ): Promise<void> {
    await this.fetchJson<void>('PATCH', '/api/persistence/risk-state', {
      userId,
      patch,
    })
  }

  subscribeRiskState(
    userId: string,
    cb: (state: RiskState) => void,
  ): Unsubscribe {
    return this.addWsListener((msg) => {
      if (msg.type === 'riskState.updated' && msg.userId === userId) {
        cb(msg.state)
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Signals
  // ---------------------------------------------------------------------------

  async appendSignal(signal: Signal): Promise<void> {
    await this.fetchJson<void>('POST', '/api/persistence/signals', signal)
  }

  async getSignals(scope: SignalScope, limit?: number): Promise<Array<Signal>> {
    const query = this.buildQuery({
      userId: scope.userId,
      market: scope.market,
      pairKey: scope.pairKey,
      timeframe: scope.timeframe,
      limit,
    })
    return this.fetchJson<Array<Signal>>(
      'GET',
      `/api/persistence/signals${query}`,
    )
  }

  async updateSignalStatus(
    signalId: string,
    status: SignalStatus,
  ): Promise<void> {
    await this.fetchJson<void>(
      'PATCH',
      `/api/persistence/signals/${encodeURIComponent(signalId)}/status`,
      { status },
    )
  }

  subscribeSignals(
    scope: SignalScope,
    cb: (signal: Signal) => void,
  ): Unsubscribe {
    return this.addWsListener((msg) => {
      if (msg.type === 'signal.new' && signalMatchesScope(msg.signal, scope)) {
        cb(msg.signal)
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Plugin configuration
  // ---------------------------------------------------------------------------

  async getPluginConfig(
    userId: string,
    pluginId: string,
  ): Promise<EncryptedPluginConfig | null> {
    const query = this.buildQuery({ userId, pluginId })
    try {
      return await this.fetchJson<EncryptedPluginConfig>(
        'GET',
        `/api/persistence/plugin-config${query}`,
      )
    } catch {
      return null
    }
  }

  async setPluginConfig(
    userId: string,
    pluginId: string,
    config: EncryptedPluginConfig,
  ): Promise<void> {
    await this.fetchJson<void>('PUT', '/api/persistence/plugin-config', {
      userId,
      pluginId,
      config,
    })
  }

  async getPluginStates(): Promise<Record<string, PluginPersistedState>> {
    const items = await this.fetchJson<
      Array<{
        pluginId: string
        enabled: boolean
        config: Record<string, unknown>
      }>
    >('GET', '/api/persistence/plugin-configs')
    const result: Record<string, PluginPersistedState> = {}
    for (const item of items) {
      result[item.pluginId] = { enabled: item.enabled, config: item.config }
    }
    return result
  }

  async setPluginState(
    pluginId: string,
    state: PluginPersistedState,
  ): Promise<void> {
    await this.fetchJson<void>('PUT', '/api/persistence/plugin-config', {
      pluginId,
      enabled: state.enabled,
      config: state.config,
    })
  }

  async removePluginState(pluginId: string): Promise<void> {
    await this.fetchJson<void>(
      'DELETE',
      `/api/persistence/plugin-config?pluginId=${encodeURIComponent(pluginId)}`,
    )
  }

  // ---------------------------------------------------------------------------
  // Watchlists
  // ---------------------------------------------------------------------------

  async getWatchlists(userId: string): Promise<WatchlistsState | null> {
    const query = this.buildQuery({ userId })
    try {
      return await this.fetchJson<WatchlistsState>(
        'GET',
        `/api/persistence/watchlists${query}`,
      )
    } catch {
      return null
    }
  }

  async setWatchlists(userId: string, state: WatchlistsState): Promise<void> {
    await this.fetchJson<void>('PUT', '/api/persistence/watchlists', {
      userId,
      state,
    })
  }

  subscribeWatchlists(
    userId: string,
    cb: (state: WatchlistsState) => void,
  ): Unsubscribe {
    return this.addWsListener((msg) => {
      if (msg.type === 'watchlists.updated' && msg.userId === userId) {
        cb(msg.state)
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Workspace state
  // ---------------------------------------------------------------------------

  async getWorkspace(
    userId: string,
    id: string,
  ): Promise<WorkspaceLayout | null> {
    const query = this.buildQuery({ userId })
    try {
      return await this.fetchJson<WorkspaceLayout>(
        'GET',
        `/api/persistence/workspaces/${encodeURIComponent(id)}${query}`,
      )
    } catch {
      return null
    }
  }

  async setWorkspace(
    userId: string,
    id: string,
    layout: WorkspaceLayout,
  ): Promise<void> {
    await this.fetchJson<void>(
      'PUT',
      `/api/persistence/workspaces/${encodeURIComponent(id)}`,
      { userId, layout },
    )
  }

  async getChartState(
    userId: string,
    pairKey: string,
  ): Promise<ChartState | null> {
    const query = this.buildQuery({ userId, pairKey })
    try {
      return await this.fetchJson<ChartState>(
        'GET',
        `/api/persistence/chart-state${query}`,
      )
    } catch {
      return null
    }
  }

  async setChartState(
    userId: string,
    pairKey: string,
    state: ChartState,
  ): Promise<void> {
    await this.fetchJson<void>('PUT', '/api/persistence/chart-state', {
      userId,
      pairKey,
      state,
    })
  }

  // ---------------------------------------------------------------------------
  // Trade journal
  // ---------------------------------------------------------------------------

  async appendTradeEntry(entry: TradeJournalEntry): Promise<void> {
    await this.fetchJson<void>('POST', '/api/persistence/trade-journal', entry)
  }

  async getTradeEntries(
    filter: TradeFilter,
  ): Promise<Array<TradeJournalEntry>> {
    const query = this.buildQuery({
      userId: filter.userId,
      market: filter.market,
      pairKey: filter.pairKey,
      startDate: filter.startDate,
      endDate: filter.endDate,
    })
    return this.fetchJson<Array<TradeJournalEntry>>(
      'GET',
      `/api/persistence/trade-journal${query}`,
    )
  }

  // ---------------------------------------------------------------------------
  // Workflows
  // ---------------------------------------------------------------------------

  async getWorkflows(_userId: string): Promise<Array<WorkflowDSL>> {
    return this.fetchJson<Array<WorkflowDSL>>('GET', '/api/workflows')
  }

  async setWorkflow(_userId: string, workflow: WorkflowDSL): Promise<void> {
    // Try PUT first (update), fall back to POST (create) on 404
    try {
      await this.fetchJson<void>(
        'PUT',
        `/api/workflows/${encodeURIComponent(workflow.id)}`,
        {
          name: workflow.name,
          description: workflow.description,
          dsl: workflow,
        },
      )
    } catch (err) {
      if (err instanceof PersistenceApiError && err.status === 404) {
        await this.fetchJson<void>('POST', '/api/workflows', {
          name: workflow.name,
          description: workflow.description,
          dsl: workflow,
        })
      } else {
        throw err
      }
    }
  }

  async deleteWorkflow(_userId: string, workflowId: string): Promise<void> {
    await this.fetchJson<void>(
      'DELETE',
      `/api/workflows/${encodeURIComponent(workflowId)}`,
    )
  }
}
