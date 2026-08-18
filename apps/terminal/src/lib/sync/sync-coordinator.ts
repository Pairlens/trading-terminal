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
 *
 * What may leave the machine at all is the user's call: every key is routed to
 * a domain (see ./sync-domains) and every domain has a switch (see
 * ./sync-preferences). A key whose domain is off is neither pushed nor
 * hydrated — but its local clock is still stamped, so re-enabling merges
 * newest-wins instead of letting a stale server copy overwrite live work.
 */

import {
  ASSISTANT_CONVERSATIONS_KEY,
  domainForSyncKey,
  isBlocked,
  isTier1,
  localKeysForDomain,
} from './sync-domains'
import {
  enabledSyncDomains,
  subscribeCloudSyncPreferences,
} from './sync-preferences'
import { emitHydrate, onWrite } from './sync-channel'
import type { SyncDomainId } from './sync-domains'
import { handleUnauthorized } from '@/lib/api'
import { APP_SERVER_CREDENTIALS } from '@/lib/auth-client'
import { getInstallableEntries } from '@/lib/plugins/plugin-ledger'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

const TIER1_DEBOUNCE_MS = 1500
const TIER2_DEBOUNCE_MS = 800
const TS_PREFIX = 'pairlens:sync-ts:'

/**
 * Record that this device changed a key at `now`, without sending anything.
 *
 * This is what makes switching a domain back on non-destructive: the merge is
 * `remote.updatedAt > localTs`, so a value edited while sync was off needs a
 * fresh local stamp or the server's older copy wins and eats it.
 */
function stampLocalWrite(key: string): void {
  try {
    localStorage.setItem(`${TS_PREFIX}${key}`, String(Date.now()))
  } catch {
    // Ignore storage errors
  }
}

function readLocalValue(key: string): unknown {
  try {
    const raw = localStorage.getItem(`pairlens:${key}`)
    if (raw === null) return undefined
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

// ── Status bus ───────────────────────────────────────────────────────
//
// Module-level, not per-instance, and deliberately so: coordinators are
// disposable. PairlensProvider's plugin effect re-runs on its own deps, its
// cleanup calls `destroy()`, and the replacement is constructed on the next
// render — an observer bound to the instance it found at subscribe time would
// keep listening to the dead one and show 'Syncing…' for the rest of the
// session. The status is a property of "syncing", not of any one object.

let currentStatus: SyncStatus = 'idle'
const statusListeners = new Set<() => void>()

/** The live transport status. `'idle'` with no coordinator running. */
export function currentSyncStatus(): SyncStatus {
  return currentStatus
}

/** Observe status changes across coordinator replacements. */
export function onSyncStatusChange(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

function publishStatus(status: SyncStatus): void {
  if (status === currentStatus) return
  currentStatus = status
  for (const listener of [...statusListeners]) listener()
}

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

// ── Assistant conversations ──────────────────────────────────────────
//
// The one collection whose items are not already whole in a single key: the
// index lists the threads and each thread's messages sit under a key of
// their own, so the payload is assembled here rather than read straight off
// the bus. The store publishes only the index, which is the signal that
// something changed, not the thing that gets sent.

const ASSISTANT_INDEX_KEY = 'pairlens:assistant.conversations'
const ASSISTANT_THREAD_PREFIX = 'pairlens:assistant.thread.'

/**
 * How many threads ride to the account, newest first. A cap rather than
 * everything, because this is one PUT: fifty long threads is tens of
 * megabytes and the older half is not what anyone came back for. The docs
 * state the number.
 */
const SYNC_MAX_CONVERSATIONS = 25

/** Per-thread ceiling. A single runaway thread cannot eat the payload. */
const SYNC_MAX_THREAD_CHARS = 250_000

/** Whole-payload ceiling, checked as threads are added. */
const SYNC_MAX_PAYLOAD_CHARS = 4_000_000

type AssistantMeta = {
  id: string
  title: string | null
  createdAt: number
  updatedAt: number
  messageCount?: number
}

type AssistantIndex = { activeId: string | null; items: Array<AssistantMeta> }

function readAssistantIndex(): AssistantIndex {
  try {
    const raw = localStorage.getItem(ASSISTANT_INDEX_KEY)
    if (!raw) return { activeId: null, items: [] }
    const parsed = JSON.parse(raw) as Partial<AssistantIndex>
    return {
      activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch {
    return { activeId: null, items: [] }
  }
}

function readAssistantThread(id: string): Array<unknown> {
  try {
    const raw = localStorage.getItem(`${ASSISTANT_THREAD_PREFIX}${id}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Drop whole messages off the FRONT of a thread until it fits. Oldest
 * first, and never the last one: a thread that syncs as an empty array
 * would read on the other device as a conversation someone cleared.
 */
function trimForSync(messages: Array<unknown>): Array<unknown> {
  let out = messages
  while (out.length > 1 && JSON.stringify(out).length > SYNC_MAX_THREAD_CHARS) {
    out = out.slice(1)
  }
  return out
}

/** The bulk body: the newest threads, whole, inside the size budget. */
function buildAssistantPayload(): Array<SyncedItem> {
  const { items } = readAssistantIndex()
  const newestFirst = [...items].sort((a, b) => b.updatedAt - a.updatedAt)
  const out: Array<SyncedItem> = []
  let budget = SYNC_MAX_PAYLOAD_CHARS

  for (const meta of newestFirst.slice(0, SYNC_MAX_CONVERSATIONS)) {
    if (typeof meta?.id !== 'string') continue
    const messages = trimForSync(readAssistantThread(meta.id))
    // An empty thread has nothing to restore and would only occupy a row
    // on the other device.
    if (messages.length === 0) continue
    const conversation = {
      id: meta.id,
      title: typeof meta.title === 'string' ? meta.title : null,
      createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : 0,
      updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : 0,
      messages,
    }
    const cost = JSON.stringify(conversation).length
    if (cost > budget) break
    budget -= cost
    out.push(conversation)
  }
  return out
}

/**
 * Write a merged set back to the two local tiers and report the index, so
 * the caller can decide whether the local side still has more to send.
 */
function writeAssistantMerge(merged: Array<SyncedItem>): void {
  const index = readAssistantIndex()
  const known = new Map(index.items.map((meta) => [meta.id, meta]))

  for (const row of merged) {
    if (typeof row?.id !== 'string') continue
    const messages = Array.isArray(row.messages) ? row.messages : []
    const existing = known.get(row.id)
    const updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : 0
    // Only rewrite a thread the remote side actually won. Rewriting one
    // this device is ahead on would undo work that has not been pushed.
    if (!existing || updatedAt > existing.updatedAt) {
      try {
        localStorage.setItem(
          `${ASSISTANT_THREAD_PREFIX}${row.id}`,
          JSON.stringify(messages),
        )
      } catch {
        // Out of room locally: keep the index honest by skipping the meta
        // too, so a row never points at a thread that was not written.
        continue
      }
    }
    known.set(row.id, {
      id: row.id,
      title: typeof row.title === 'string' ? row.title : null,
      createdAt: typeof row.createdAt === 'number' ? row.createdAt : updatedAt,
      updatedAt: Math.max(updatedAt, existing?.updatedAt ?? 0),
      messageCount:
        existing && existing.updatedAt >= updatedAt
          ? existing.messageCount
          : messages.length,
    })
  }

  const items = [...known.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  try {
    localStorage.setItem(
      ASSISTANT_INDEX_KEY,
      JSON.stringify({ version: 1, activeId: index.activeId, items }),
    )
  } catch {
    // The index is what the list reads; if it cannot be written there is
    // nothing useful left to do here.
  }
}

/**
 * The live coordinator, for surfaces that need its status without a prop
 * chain (the Cloud Sync settings section). Null in standalone builds, where
 * no coordinator is ever constructed.
 */
let activeCoordinator: SyncCoordinator | null = null

export function getSyncCoordinator(): SyncCoordinator | null {
  return activeCoordinator
}

export class SyncCoordinator {
  private appServerUrl: string
  private getToken: () => Promise<string | null>
  private userId: string | null = null
  private tier1Dirty = new Map<string, unknown>()
  private tier1Timer: ReturnType<typeof setTimeout> | null = null
  private tier2Timers = new Map<string, ReturnType<typeof setTimeout>>()
  private unsubWrite: (() => void) | null = null
  private unsubPreferences: (() => void) | null = null
  private enabledDomains: Set<SyncDomainId>

  constructor(appServerUrl: string, getToken: () => Promise<string | null>) {
    this.appServerUrl = appServerUrl.replace(/\/+$/, '')
    this.getToken = getToken
    this.enabledDomains = enabledSyncDomains()

    // Listen to all writes from usePersistedState
    this.unsubWrite = onWrite((key, value) => {
      this.markDirty(key, value)
    })

    // A domain switched off must stop pushing in *every* window, so the cancel
    // half runs on both edges. The resume half only runs on the window that
    // made the change, so N windows don't pull and push the same payload.
    this.unsubPreferences = subscribeCloudSyncPreferences((source) => {
      this.applyDomainFlags(source === 'write')
    })

    activeCoordinator = this
  }

  /** Called when session state changes. Triggers pull-and-merge on login. */
  async setSession(userId: string | null): Promise<void> {
    this.userId = userId
    if (!userId) return
    // Paused means paused in both directions: with nothing that could hydrate,
    // the GET would pull the whole preferences blob down only for
    // applyRemoteEntries to discard every entry.
    if (this.canHydratePreferences()) await this.pullAndMerge()
    await this.pullStructuredCollections()
    // Opt-in, so unlike the collections above this one only runs once the
    // user has actually said yes.
    if (this.enabledDomains.has('assistant')) {
      await this.pullAssistantConversations()
    }
  }

  /**
   * Whether `GET /api/sync/preferences` could hydrate anything right now.
   * Mirrors the domain gate in {@link applyRemoteEntries}: those are the only
   * two domains a tier-1 key ever routes to.
   */
  private canHydratePreferences(): boolean {
    return (
      this.enabledDomains.has('preferences') ||
      this.enabledDomains.has('charts')
    )
  }

  /** Mark a key as dirty — schedule sync. */
  markDirty(key: string, value: unknown): void {
    if (!this.userId) return
    if (isBlocked(key)) return

    const domain = domainForSyncKey(key)
    if (domain && !this.enabledDomains.has(domain)) {
      // Nothing leaves, but this device did change the value — stamping the
      // clock is what makes it win the merge when sync comes back on.
      if (isTier1(key)) stampLocalWrite(key)
      return
    }

    if (isTier1(key)) {
      this.tier1Dirty.set(key, value)
      this.scheduleTier1Flush()
    } else {
      this.scheduleTier2Flush(key, value)
    }
  }

  destroy(): void {
    this.unsubWrite?.()
    this.unsubPreferences?.()
    if (this.tier1Timer) clearTimeout(this.tier1Timer)
    for (const t of this.tier2Timers.values()) clearTimeout(t)
    this.tier2Timers.clear()
    if (activeCoordinator === this) {
      activeCoordinator = null
      // Nothing is transporting anything any more; a lingering 'syncing' would
      // be a lie until the replacement happens to set it again.
      publishStatus('idle')
    }
  }

  // ── Per-domain gating ────────────────────────────────────────────

  /**
   * React to a change in the cloud-sync switches: stop what a newly-disabled
   * domain still had queued, and (only in the window that flipped the switch)
   * reconcile a newly-enabled one.
   */
  private applyDomainFlags(allowResume: boolean): void {
    const next = enabledSyncDomains()
    const previous = this.enabledDomains
    this.enabledDomains = next
    for (const id of previous) {
      if (!next.has(id)) this.cancelDomain(id)
    }
    if (!allowResume) return
    // Resumed together, not one at a time: the master switch turns every
    // domain back on at once, and `preferences` and `charts` share a single
    // GET — resuming them independently fires the same request twice.
    const resumed = [...next].filter((id) => !previous.has(id))
    if (resumed.length > 0) void this.resumeDomains(resumed)
  }

  /**
   * Drop everything queued for a domain. The debounces are 1.5s / 0.8s, so a
   * write from a moment ago would otherwise escape after the switch is off.
   * A request already in flight cannot be recalled — the settings copy says so.
   */
  private cancelDomain(id: SyncDomainId): void {
    for (const key of [...this.tier1Dirty.keys()]) {
      if (domainForSyncKey(key) === id) this.tier1Dirty.delete(key)
    }
    if (this.tier1Dirty.size === 0 && this.tier1Timer) {
      clearTimeout(this.tier1Timer)
      this.tier1Timer = null
    }
    for (const [key, timer] of [...this.tier2Timers]) {
      if (domainForSyncKey(key) === id) {
        clearTimeout(timer)
        this.tier2Timers.delete(key)
      }
    }
  }

  /**
   * Re-enabling merges: nothing is discarded on either side, newest change
   * wins. Same rule as login, so there is one mental model — and turning a
   * switch back on can never destroy work on either device.
   *
   * `workspaces` and the indicators/drawings half of `charts` have no GET
   * endpoint at all, so for those "resume" can only mean "upload what this
   * device has". `plugins` has no timestamp on either side, so it re-uploads
   * the local ledger (see {@link resumePluginStates}). `copilot` and `trades`
   * converge on their next read/write; there is nothing local to reconcile.
   */
  private async resumeDomains(ids: Array<SyncDomainId>): Promise<void> {
    if (!this.userId) return

    // Pull first: where the server is ahead, applyRemoteEntries rewrites
    // localStorage, so the pushes below re-send the winning value — a no-op
    // rather than a clobber. One GET covers both tier-1 domains.
    if (ids.includes('preferences') || ids.includes('charts')) {
      await this.pullAndMerge()
    }
    if (ids.includes('automation')) await this.pullStructuredCollections()
    if (ids.includes('plugins')) await this.resumePluginStates()
    // Turning this one on is the whole feature: pull what the account has,
    // merge, and push whatever this device was holding.
    if (ids.includes('assistant')) {
      await this.pullAssistantConversations()
      this.scheduleTier2Flush(ASSISTANT_CONVERSATIONS_KEY, null)
    }

    for (const id of ids) {
      // Handled above (automation, assistant) or nothing local to send.
      if (
        id === 'automation' ||
        id === 'plugins' ||
        id === 'assistant' ||
        id === 'trades'
      ) {
        continue
      }
      for (const key of localKeysForDomain(id)) {
        const value = readLocalValue(key)
        if (value === undefined) continue
        this.markDirty(key, value)
      }
    }
  }

  /**
   * Re-upload every installed plugin's enable state and config.
   *
   * Plugin state is the one domain that cannot do newest-wins: neither side
   * carries a timestamp. While the switch was off `api.setPluginState`
   * resolved as a no-op, so the server row froze at whatever it last held
   * while the local ledger kept recording every toggle — and the boot merge
   * in `pairlens-provider` assigns the server's `enabled`/`config` over the
   * ledger unconditionally. Without this push, re-enabling the switch would
   * quietly resurrect a connector the user had turned off on the next start.
   *
   * So this device wins, which is the same rule the ledger already states:
   * it is the device source of truth for what is installed. The cost is that
   * a plugin toggled on another device while this one was paused is
   * overwritten — unavoidable without a timestamp, and the smaller surprise.
   *
   * Tombstoned (uninstalled) entries are left alone: boot skips them, so the
   * stale server row is inert, and pushing `enabled: false` for them would
   * write rows for plugins this device no longer has.
   */
  private async resumePluginStates(): Promise<void> {
    // `resumeDomains` awaits two network round trips before it gets here, and
    // the user can switch the domain back off during them. Every sibling
    // resume path re-reads the live snapshot; this one bulk-PUTs over a raw
    // `this.fetch`, so it has to check for itself.
    if (!this.enabledDomains.has('plugins')) return
    const entries = getInstallableEntries()
    if (entries.length === 0) return
    try {
      this.setStatus('syncing')
      const results = await Promise.all(
        entries.map((entry) =>
          this.fetch(`/api/plugins/${encodeURIComponent(entry.pluginId)}`, {
            method: 'PUT',
            body: JSON.stringify({
              pluginId: entry.pluginId,
              enabled: entry.enabled,
              config: entry.config,
            }),
          }),
        ),
      )
      if (results.some((res) => !res.ok)) throw new Error('plugin state PUT')
      this.setStatus('synced')
    } catch {
      this.setStatus('error')
    }
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
    } else if (key.startsWith('terminal.layout.')) {
      // Per-asset-class pair layouts: terminal.layout.perp → terminal-layout-perp
      const cls = key.slice('terminal.layout.'.length)
      endpoint = `/api/user/workspace/terminal-layout-${encodeURIComponent(cls)}`
      body = { name: `terminal-layout-${cls}`, panels: value }
    } else if (key === 'discovery.layout') {
      endpoint = '/api/user/workspace/discovery-layout'
      body = { name: 'discovery-layout', panels: value }
    } else if (key.startsWith('discovery.layout.')) {
      // Per-section Discovery boards: discovery.layout.perp → discovery-layout-perp
      const cls = key.slice('discovery.layout.'.length)
      endpoint = `/api/user/workspace/discovery-layout-${encodeURIComponent(cls)}`
      body = { name: `discovery-layout-${cls}`, panels: value }
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
    } else if (key === ASSISTANT_CONVERSATIONS_KEY) {
      // `value` is only the index the store published. The messages are
      // read here, so the payload is whole however the write was triggered.
      endpoint = '/api/assistant/conversations'
      body = { conversations: buildAssistantPayload() }
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
      // Download is gated as hard as upload. This endpoint only ever received
      // tier-1 preference keys from this app, so anything else in the response
      // is a server writing a slot no client offered it — and the blocklist is
      // named explicitly because that is the list this gate exists for: a
      // pinned publisher key (arbitrary code execution), the terminal-lock
      // switch, a credential slot. Both checks stay, so neither one silently
      // becomes the only thing holding the line.
      if (isBlocked(key) || !isTier1(key)) continue

      // A domain that is off doesn't hydrate either: the remote copy goes
      // stale rather than reaching back into this device. An unroutable key
      // has no switch that could permit it, so it never lands.
      const domain = domainForSyncKey(key)
      if (!domain || !this.enabledDomains.has(domain)) continue

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
    if (!this.enabledDomains.has('automation')) return
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

  /**
   * Pull the account's threads and merge them per conversation.
   *
   * Nothing is deleted locally: a thread the server has never seen stays,
   * and one the server has that this device does not is added. That is the
   * right asymmetry for an opt-in domain, where the common case is a device
   * turning sync on with threads of its own already in hand.
   */
  private async pullAssistantConversations(): Promise<void> {
    try {
      const res = await this.fetch('/api/assistant/conversations', {
        method: 'GET',
      })
      // A server that predates this route answers 404. Local threads are
      // untouched and the switch simply has nothing to talk to yet.
      if (!res.ok) return
      const data = (await res.json()) as { conversations?: Array<SyncedItem> }
      const remote = Array.isArray(data.conversations) ? data.conversations : []

      const { merged, localAhead } = mergeCollections(
        buildAssistantPayload(),
        remote,
      )
      writeAssistantMerge(merged)
      emitHydrate(ASSISTANT_CONVERSATIONS_KEY, merged)
      if (localAhead) this.scheduleTier2Flush(ASSISTANT_CONVERSATIONS_KEY, null)
    } catch {
      // Offline / server unavailable — local threads remain authoritative
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
      credentials: APP_SERVER_CREDENTIALS,
    })
    // Auth rejected mid-sync → sign out so the user can re-authenticate.
    if (response.status === 401 && token) {
      handleUnauthorized()
    }
    return response
  }

  private setStatus(status: SyncStatus): void {
    publishStatus(status)
  }
}
