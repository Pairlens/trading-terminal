// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * SyncCoordinator — debounced write-through sync from localStorage to App Server.
 *
 * Tier 1 (preferences): batched into a single PUT /api/user/config with
 * per-key timestamps for last-write-wins merge.
 *
 * Tier 2 (structured data): individual debounced PUTs per key to existing
 * workspace / chart-state endpoints.
 *
 * All reads remain local — sync is a background side-effect.
 */

import { emitHydrate, onWrite } from './sync-channel'
import { handleUnauthorized } from '@/lib/api'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

const TIER1_DEBOUNCE_MS = 1500
const TIER2_DEBOUNCE_MS = 800
const TS_PREFIX = 'pairlens:sync-ts:'

// Tier 1 keys (flat preferences stored in user_configs.preferences JSONB)
const TIER1_KEYS = new Set([
  'plugin-registry-settings',
  'language',
  'theme.activePluginId',
  'performance-mode',
  'terminal.market',
  'terminal.timeframe',
  'terminal.chartType',
  'terminal.crosshairMode',
  'terminal.priceScaleMode',
  'terminal.drawingToolMode',
  'copilot.persona',
  'pair-picker.assetClass',
  'pair-picker.category',
  'pair-picker.viewMode',
  'pair-picker.recent',
  'pair-picker.assetClassMap',
  'region.okx',
  'region.binance',
  'region.bybit',
])

function isTier1(key: string): boolean {
  if (TIER1_KEYS.has(key)) return true
  // drawing-last-* prefix match
  if (key.startsWith('drawing-last-')) return true
  return false
}

// Keys that must NEVER be synced (credentials, caches, trust anchors).
// custom-publisher-keys is a local trust decision: syncing it would let a
// hijacked account push a malicious publisher key to every signed-in device.
const BLOCKLIST = new Set(['theme.cachedCss', 'custom-publisher-keys'])
function isBlocked(key: string): boolean {
  if (BLOCKLIST.has(key)) return true
  if (key.startsWith('credentials-store:')) return true
  if (key.startsWith('keychain:')) return true
  // Browser-fallback credential storage prefix (see lib/keychain.ts)
  if (key.startsWith('pairlens:keychain:')) return true
  return false
}

type StatusListener = (status: SyncStatus) => void

// ── Structured collection helpers ─────────────────────────────────────

type SyncedItem = { id: string; updatedAt?: number } & Record<string, unknown>

function readLocalRecord(key: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(`pairlens:${key}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    }
  } catch {
    // Corrupted local data — treat as empty
  }
  return {}
}

function readLocalArray(key: string): Array<SyncedItem> {
  try {
    const raw = localStorage.getItem(`pairlens:${key}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Array<SyncedItem>
    }
  } catch {
    // Corrupted local data — treat as empty
  }
  return []
}

function writeLocalArray(key: string, value: Array<SyncedItem>): void {
  try {
    localStorage.setItem(`pairlens:${key}`, JSON.stringify(value))
  } catch {
    // Ignore quota errors
  }
}

/**
 * Per-item last-write-wins merge. Items present on only one side are
 * kept; when both sides have an item, the newer updatedAt wins (items
 * without updatedAt keep the local copy). localAhead reports whether the
 * merge differs from the remote set, i.e. a push is needed to converge.
 */
function mergeCollections(
  local: Array<SyncedItem>,
  remote: Array<SyncedItem>,
): { merged: Array<SyncedItem>; localAhead: boolean } {
  const byId = new Map<string, SyncedItem>()
  for (const item of remote) {
    if (typeof item?.id === 'string') byId.set(item.id, item)
  }
  let localAhead = false
  for (const item of local) {
    if (typeof item?.id !== 'string') continue
    const existing = byId.get(item.id)
    if (!existing) {
      byId.set(item.id, item)
      localAhead = true
      continue
    }
    const localTs = typeof item.updatedAt === 'number' ? item.updatedAt : 1
    const remoteTs =
      typeof existing.updatedAt === 'number' ? existing.updatedAt : 0
    if (localTs > remoteTs) {
      byId.set(item.id, item)
      localAhead = true
    }
  }
  return { merged: [...byId.values()], localAhead }
}

export class SyncCoordinator {
  private appServerUrl: string
  private getToken: () => Promise<string | null>
  private userId: string | null = null
  private status: SyncStatus = 'idle'
  private statusListeners = new Set<StatusListener>()
  private tier1Dirty = new Map<string, unknown>()
  private tier1Timer: ReturnType<typeof setTimeout> | null = null
  private tier2Timers = new Map<string, ReturnType<typeof setTimeout>>()
  private unsubWrite: (() => void) | null = null

  constructor(appServerUrl: string, getToken: () => Promise<string | null>) {
    this.appServerUrl = appServerUrl.replace(/\/+$/, '')
    this.getToken = getToken

    // Listen to all writes from usePersistedState
    this.unsubWrite = onWrite((key, value) => {
      this.markDirty(key, value)
    })
  }

  /** Called when session state changes. Triggers pull-and-merge on login. */
  async setSession(userId: string | null): Promise<void> {
    this.userId = userId
    if (userId) {
      await this.pullAndMerge()
      await this.pullStructuredCollections()
    }
  }

  /** Mark a key as dirty — schedule sync. */
  markDirty(key: string, value: unknown): void {
    if (!this.userId) return
    if (isBlocked(key)) return

    if (isTier1(key)) {
      this.tier1Dirty.set(key, value)
      this.scheduleTier1Flush()
    } else {
      this.scheduleTier2Flush(key, value)
    }
  }

  getSyncStatus(): SyncStatus {
    return this.status
  }

  subscribeSyncStatus(cb: StatusListener): () => void {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  destroy(): void {
    this.unsubWrite?.()
    if (this.tier1Timer) clearTimeout(this.tier1Timer)
    for (const t of this.tier2Timers.values()) clearTimeout(t)
    this.tier2Timers.clear()
  }

  // ── Tier 1: batched preferences ──────────────────────────────────

  private scheduleTier1Flush(): void {
    if (this.tier1Timer) clearTimeout(this.tier1Timer)
    this.tier1Timer = setTimeout(() => {
      this.tier1Timer = null
      void this.flushTier1()
    }, TIER1_DEBOUNCE_MS)
  }

  private async flushTier1(): Promise<void> {
    if (this.tier1Dirty.size === 0 || !this.userId) return

    const entries: Record<string, { value: unknown; updatedAt: number }> = {}
    const now = Date.now()
    for (const [key, value] of this.tier1Dirty) {
      entries[key] = { value, updatedAt: now }
      try {
        localStorage.setItem(`${TS_PREFIX}${key}`, String(now))
      } catch {
        // Ignore storage errors
      }
    }
    this.tier1Dirty.clear()

    try {
      this.setStatus('syncing')
      const res = await this.fetch('/api/sync/preferences', {
        method: 'PUT',
        body: JSON.stringify({ entries }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        entries: Record<string, { value: unknown; updatedAt: number }>
      }
      // Apply any server-wins back to localStorage
      this.applyRemoteEntries(data.entries)
      this.setStatus('synced')
    } catch {
      this.setStatus('error')
    }
  }

  // ── Tier 2: individual structured data ───────────────────────────

  private scheduleTier2Flush(key: string, value: unknown): void {
    const existing = this.tier2Timers.get(key)
    if (existing) clearTimeout(existing)
    this.tier2Timers.set(
      key,
      setTimeout(() => {
        this.tier2Timers.delete(key)
        void this.flushTier2(key, value)
      }, TIER2_DEBOUNCE_MS),
    )
  }

  private async flushTier2(key: string, value: unknown): Promise<void> {
    if (!this.userId) return

    let endpoint: string
    let body: unknown

    if (key === 'custom-workspaces') {
      endpoint = '/api/user/workspace/custom-workspaces'
      body = { name: 'custom-workspaces', panels: value }
    } else if (key === 'terminal.layout') {
      endpoint = '/api/user/workspace/terminal-layout'
      body = { name: 'terminal-layout', panels: value }
    } else if (key === 'discovery.layout') {
      endpoint = '/api/user/workspace/discovery-layout'
      body = { name: 'discovery-layout', panels: value }
    } else if (key.startsWith('workspace.') && key.endsWith('.layout')) {
      const id = key.replace('workspace.', '').replace('.layout', '')
      endpoint = `/api/user/workspace/${encodeURIComponent(id)}-layout`
      body = { name: `${id}-layout`, panels: value }
    } else if (key.startsWith('workspace-vars:')) {
      const id = key.replace('workspace-vars:', '')
      endpoint = `/api/user/workspace/vars-${encodeURIComponent(id)}`
      body = { name: `vars-${id}`, panels: value }
    } else if (key === 'terminal.indicators' || key === 'terminal.drawings') {
      // Indicators and drawings share the '_all' chart-state row and the PUT
      // replaces the whole row — always send both maps (the one that changed
      // plus the counterpart read from localStorage) so one flush never
      // clobbers the other's persisted state.
      endpoint = '/api/user/chart-state'
      body = {
        pairKey: '_all',
        indicators:
          key === 'terminal.indicators'
            ? value
            : readLocalRecord('terminal.indicators'),
        drawings:
          key === 'terminal.drawings'
            ? value
            : readLocalRecord('terminal.drawings'),
        settings: {},
      }
    } else if (key === 'workflows') {
      endpoint = '/api/workflows/bulk'
      body = { workflows: value }
    } else if (
      key === 'notification-rules' ||
      key === 'notification-bindings'
    ) {
      // Rules and bindings are replaced together in one transaction so a
      // binding never reaches the server before the rule it references.
      endpoint = '/api/notifications/sync'
      body = {
        rules: readLocalArray('notification-rules'),
        bindings: readLocalArray('notification-bindings'),
      }
    } else {
      // Unknown tier 2 key — skip
      return
    }

    try {
      this.setStatus('syncing')
      const res = await this.fetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      this.setStatus('synced')
    } catch {
      this.setStatus('error')
    }
  }

  // ── Pull and merge on login ──────────────────────────────────────

  private async pullAndMerge(): Promise<void> {
    try {
      this.setStatus('syncing')
      const res = await this.fetch('/api/sync/preferences', { method: 'GET' })
      if (!res.ok) {
        this.setStatus('error')
        return
      }
      const data = (await res.json()) as {
        entries: Record<string, { value: unknown; updatedAt: number }>
      }
      this.applyRemoteEntries(data.entries)
      this.setStatus('synced')
    } catch {
      this.setStatus('error')
    }
  }

  private applyRemoteEntries(
    entries: Record<string, { value: unknown; updatedAt: number }>,
  ): void {
    for (const [key, remote] of Object.entries(entries)) {
      const localTsStr = localStorage.getItem(`${TS_PREFIX}${key}`)
      const localTs = localTsStr ? parseInt(localTsStr, 10) : 0

      if (remote.updatedAt > localTs) {
        try {
          localStorage.setItem(`pairlens:${key}`, JSON.stringify(remote.value))
          localStorage.setItem(`${TS_PREFIX}${key}`, String(remote.updatedAt))
        } catch {
          // Ignore storage errors
        }
        emitHydrate(key, remote.value)
      }
    }
  }

  // ── Structured collections (workflows, notification rules/bindings) ──
  //
  // Local-first collections synced as whole sets. On login, the server
  // copy and the local copy are merged per item id (newest updatedAt
  // wins; items only present on one side are kept), the merge is applied
  // locally via emitHydrate, and — when the merge differs from what the
  // server had — pushed back so both sides converge. Known limitation:
  // an item deleted offline reappears if the server still has it.

  private async pullStructuredCollections(): Promise<void> {
    await Promise.allSettled([this.pullWorkflows(), this.pullNotifications()])
  }

  private async pullWorkflows(): Promise<void> {
    try {
      const res = await this.fetch('/api/workflows/bulk', { method: 'GET' })
      if (!res.ok) return
      const data = (await res.json()) as { workflows?: Array<SyncedItem> }
      const remote = Array.isArray(data.workflows) ? data.workflows : []
      const local = readLocalArray('workflows')
      const { merged, localAhead } = mergeCollections(local, remote)

      writeLocalArray('workflows', merged)
      emitHydrate('workflows', merged)
      if (localAhead) this.scheduleTier2Flush('workflows', merged)
    } catch {
      // Offline / server unavailable — local data remains authoritative
    }
  }

  private async pullNotifications(): Promise<void> {
    try {
      const res = await this.fetch('/api/notifications/sync', {
        method: 'GET',
      })
      if (!res.ok) return
      const data = (await res.json()) as {
        rules?: Array<SyncedItem>
        bindings?: Array<SyncedItem>
      }
      const remoteRules = Array.isArray(data.rules) ? data.rules : []
      const remoteBindings = Array.isArray(data.bindings) ? data.bindings : []

      const rules = mergeCollections(
        readLocalArray('notification-rules'),
        remoteRules,
      )
      const bindings = mergeCollections(
        readLocalArray('notification-bindings'),
        remoteBindings,
      )

      writeLocalArray('notification-rules', rules.merged)
      writeLocalArray('notification-bindings', bindings.merged)
      emitHydrate('notification-rules', rules.merged)
      emitHydrate('notification-bindings', bindings.merged)
      if (rules.localAhead || bindings.localAhead) {
        this.scheduleTier2Flush('notification-rules', rules.merged)
      }
    } catch {
      // Offline / server unavailable — local data remains authoritative
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const token = await this.getToken()
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    // Bearer, not a cookie header: browsers silently drop a manually-set
    // `cookie` (forbidden header name), and real cookies don't survive the
    // cross-origin setups we ship (desktop webview / dev → hosted API).
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const response = await fetch(`${this.appServerUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    })
    // Auth rejected mid-sync → sign out so the user can re-authenticate.
    if (response.status === 401 && token) {
      handleUnauthorized()
    }
    return response
  }

  private setStatus(status: SyncStatus): void {
    this.status = status
    for (const fn of this.statusListeners) fn(status)
  }
}
