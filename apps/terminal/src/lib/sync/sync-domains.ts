// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Sync taxonomy — which localStorage keys the SyncCoordinator carries, which
 * it must never touch, and which user-facing domain each one belongs to.
 *
 * This is a leaf module on purpose: no React, no `api.ts`, no coordinator. Both
 * the coordinator and `api.ts` gate on it, and the settings UI reads the same
 * catalog, so there is exactly one place that decides what "Chart setup" means.
 */

// Tier 1 keys (flat preferences stored in user_configs.preferences JSONB)
export const TIER1_KEYS: ReadonlySet<string> = new Set([
  'plugin-registry-settings',
  'language',
  'keybindings',
  'theme.activePluginId',
  'performance-mode',
  'trade-confirm-mode',
  'terminal.market',
  'terminal.timeframe',
  'terminal.chartType',
  'terminal.crosshairMode',
  'terminal.priceScaleMode',
  'terminal.drawingToolMode',
  'terminal.drawingFavorites',
  'terminal.orderbookMetric',
  'copilot.persona',
  'pair-picker.assetClass',
  'pair-picker.category',
  // The order of Discovery's asset-class tabs. Tier-1 transport (it is a short
  // array of ids), workspaces domain (see WORKSPACE_KEYS) — the two are
  // independent, exactly as they are for the chart keys above.
  'discovery.sectionOrder',
  'pair-picker.viewMode',
  'pair-picker.recent',
  'pair-picker.assetClassMap',
  'region.okx',
  'region.binance',
  'region.bybit',
])

export function isTier1(key: string): boolean {
  if (TIER1_KEYS.has(key)) return true
  // drawing-last-* prefix match
  if (key.startsWith('drawing-last-')) return true
  // The scanner's chip, per Discovery section: pair-picker.assetClass.perp, …
  // The trailing dot is load-bearing — `pair-picker.assetClassMap` is a
  // different key with its own entry above.
  if (key.startsWith('pair-picker.assetClass.')) return true
  // Per-asset-class chart presentation: terminal.chartType.prediction, …
  if (key.startsWith('terminal.chartType.')) return true
  return false
}

// Keys that must NEVER be synced (credentials, caches, trust anchors).
// custom-publisher-keys is a local trust decision: syncing it would let a
// hijacked account push a malicious publisher key to every signed-in device.
// desktop.closeBehavior is a fact about a machine, not about an account — a
// Mac's default must not govern a Windows box, and it isn't even stored in
// localStorage (Rust owns it; the key only rides the cross-window bus).
// cloud-sync is the per-domain toggle record itself: it decides what this
// device sends, so it has to stay a decision this device makes.
const BLOCKLIST = new Set([
  'theme.cachedCss',
  'custom-publisher-keys',
  'desktop.closeBehavior',
  'cloud-sync',
])

export function isBlocked(key: string): boolean {
  if (BLOCKLIST.has(key)) return true
  // Terminal-lock config and state. These never ride this bus in the first
  // place (lib/security has its own channel precisely so the server can't
  // reach them) — the prefix is here so a later refactor that reroutes a key
  // through usePersistedState can't quietly hand the server an unlock switch.
  if (key.startsWith('security.')) return true
  if (key.startsWith('credentials-store:')) return true
  if (key.startsWith('keychain:')) return true
  // Browser-fallback credential storage prefix (see lib/keychain.ts)
  if (key.startsWith('pairlens:keychain:')) return true
  return false
}

// ── Domains ──────────────────────────────────────────────────────────

export type SyncDomainId =
  | 'preferences'
  | 'charts'
  | 'workspaces'
  | 'automation'
  | 'plugins'
  | 'assistant'
  | 'trades'

export type SyncDomain = {
  id: SyncDomainId
  /**
   * Literal catalog keys, not composed at the call site: the i18n audit scans
   * source statically, so `t(domain.labelKey)` only stays honest while the
   * string itself lives here.
   */
  labelKey: string
  descriptionKey: string
  /**
   * No local store behind it — switching it off means "not recorded at all",
   * not "recorded locally". The UI has to say so.
   */
  cloudOnly?: boolean
  /**
   * Domain-specific footnote rendered under the description. Same literal-key
   * rule as labelKey/descriptionKey.
   */
  caveatKey?: string
  /**
   * Whether the domain syncs before the user has said anything about it.
   * Absent means true, which is every domain that predates this flag: they
   * shipped syncing and turning them off is the opt-out.
   *
   * `false` inverts that. The only domain that takes it is `assistant`,
   * because a chat transcript is a fuller record of what someone is
   * thinking than a chart layout is, and uploading one is a decision they
   * should make rather than discover. It also gives the switch a third
   * state the others do not have: absent is "not asked yet", which is
   * exactly when the rail shows its banner. Once they answer, either way,
   * an explicit boolean lands and the banner is done.
   */
  defaultEnabled?: boolean
}

export const SYNC_DOMAINS: ReadonlyArray<SyncDomain> = [
  {
    id: 'preferences',
    labelKey: 'settings.cloudSync.domains.preferences.title',
    descriptionKey: 'settings.cloudSync.domains.preferences.description',
  },
  {
    id: 'charts',
    labelKey: 'settings.cloudSync.domains.charts.title',
    descriptionKey: 'settings.cloudSync.domains.charts.description',
  },
  {
    id: 'workspaces',
    labelKey: 'settings.cloudSync.domains.workspaces.title',
    descriptionKey: 'settings.cloudSync.domains.workspaces.description',
  },
  {
    id: 'automation',
    labelKey: 'settings.cloudSync.domains.automation.title',
    descriptionKey: 'settings.cloudSync.domains.automation.description',
  },
  {
    id: 'plugins',
    labelKey: 'settings.cloudSync.domains.plugins.title',
    descriptionKey: 'settings.cloudSync.domains.plugins.description',
  },
  {
    id: 'assistant',
    labelKey: 'settings.cloudSync.domains.assistant.title',
    descriptionKey: 'settings.cloudSync.domains.assistant.description',
    defaultEnabled: false,
    caveatKey: 'settings.cloudSync.domains.assistant.caveat',
  },
  {
    id: 'trades',
    labelKey: 'settings.cloudSync.domains.trades.title',
    descriptionKey: 'settings.cloudSync.domains.trades.description',
    cloudOnly: true,
  },
]

/**
 * Whether `id` syncs with no answer on record. Reading through the catalog
 * rather than a second list, so a domain cannot be declared opt-in in one
 * place and treated as opt-out in another.
 */
export function syncDomainDefault(id: SyncDomainId): boolean {
  return SYNC_DOMAINS.find((domain) => domain.id === id)?.defaultEnabled ?? true
}

export const SYNC_DOMAIN_IDS: ReadonlyArray<SyncDomainId> = SYNC_DOMAINS.map(
  (d) => d.id,
)

export function isSyncDomainId(value: unknown): value is SyncDomainId {
  return (
    typeof value === 'string' && SYNC_DOMAIN_IDS.includes(value as SyncDomainId)
  )
}

// Chart setup, as a user reads it: what's drawn on the chart plus how the
// chart is set up to draw it. Transport-wise this spans both tiers, which
// doesn't matter — gating happens per key, not per tier.
// `terminal.drawingRecents` is deliberately absent: recents are a local trace
// of what this hand just did, rewritten on nearly every tool selection. Pinned
// favorites are the curated set worth carrying between devices.
const CHART_KEYS = new Set([
  'terminal.indicators',
  'terminal.drawings',
  'terminal.chartType',
  'terminal.crosshairMode',
  'terminal.priceScaleMode',
  'terminal.drawingToolMode',
  'terminal.drawingFavorites',
])

const WORKSPACE_KEYS = new Set([
  'custom-workspaces',
  'terminal.layout',
  'discovery.layout',
  'discovery.sectionOrder',
])

/**
 * What the conversation store publishes when anything about a thread
 * changes. One key for the whole collection: the payload is assembled from
 * the index plus each thread at flush time (see the coordinator), the way
 * notification rules and bindings are.
 */
export const ASSISTANT_CONVERSATIONS_KEY = 'assistant.conversations'

const AUTOMATION_KEYS = new Set([
  'workflows',
  'notification-rules',
  'notification-bindings',
])

/**
 * Which domain owns a sync-channel key, or `null` when the coordinator
 * wouldn't have synced it anyway (an unknown tier-2 key it silently drops).
 */
export function domainForSyncKey(key: string): SyncDomainId | null {
  if (
    CHART_KEYS.has(key) ||
    key.startsWith('drawing-last-') ||
    // Per-asset-class chart type: terminal.chartType.prediction, …
    key.startsWith('terminal.chartType.')
  ) {
    return 'charts'
  }
  if (
    WORKSPACE_KEYS.has(key) ||
    // Per-asset-class pair layouts: terminal.layout.perp, .dex, ...
    key.startsWith('terminal.layout.') ||
    // Per-section Discovery boards: discovery.layout.perp, .dex, ...
    key.startsWith('discovery.layout.') ||
    (key.startsWith('workspace.') && key.endsWith('.layout')) ||
    key.startsWith('workspace-vars:')
  ) {
    return 'workspaces'
  }
  if (AUTOMATION_KEYS.has(key)) return 'automation'
  // The single aggregate key the conversation store publishes. The
  // per-thread keys (`assistant.thread.<id>`) deliberately route nowhere:
  // they are pushed as part of this one bulk payload, never one PUT each.
  if (key === ASSISTANT_CONVERSATIONS_KEY) return 'assistant'
  if (TIER1_KEYS.has(key) || key.startsWith('pair-picker.assetClass.')) {
    return 'preferences'
  }
  return null
}

const STORAGE_PREFIX = 'pairlens:'
const TS_PREFIX = 'pairlens:sync-ts:'

/**
 * Every key currently in localStorage that belongs to a domain.
 *
 * Resume needs this because `markDirty` deliberately forgets what changed
 * while a domain was off — and because the dynamic families
 * (`workspace.<id>.layout`, `workspace-vars:<id>`, `drawing-last-*`) can't be
 * enumerated from a static list.
 */
export function localKeysForDomain(id: SyncDomainId): Array<string> {
  const out: Array<string> = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (!storageKey?.startsWith(STORAGE_PREFIX)) continue
      if (storageKey.startsWith(TS_PREFIX)) continue
      const key = storageKey.slice(STORAGE_PREFIX.length)
      if (isBlocked(key)) continue
      if (domainForSyncKey(key) === id) out.push(key)
    }
  } catch {
    // No storage (SSR, private mode) — nothing local to resume.
  }
  return out
}
