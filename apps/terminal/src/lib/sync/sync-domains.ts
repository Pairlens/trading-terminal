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
  | 'copilot'
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
    id: 'copilot',
    labelKey: 'settings.cloudSync.domains.copilot.title',
    descriptionKey: 'settings.cloudSync.domains.copilot.description',
    cloudOnly: true,
    // "Clear history" while this is off clears only this device; the copy in
    // the account survives and reappears on re-enable (api.ts no-ops the
    // remote DELETE on purpose — disabling sync must never erase remote data).
    caveatKey: 'settings.cloudSync.domains.copilot.caveat',
  },
  {
    id: 'trades',
    labelKey: 'settings.cloudSync.domains.trades.title',
    descriptionKey: 'settings.cloudSync.domains.trades.description',
    cloudOnly: true,
  },
]

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
])

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
  if (CHART_KEYS.has(key) || key.startsWith('drawing-last-')) return 'charts'
  if (
    WORKSPACE_KEYS.has(key) ||
    // Per-asset-class pair layouts: terminal.layout.perp, .dex, ...
    key.startsWith('terminal.layout.') ||
    (key.startsWith('workspace.') && key.endsWith('.layout')) ||
    key.startsWith('workspace-vars:')
  ) {
    return 'workspaces'
  }
  if (AUTOMATION_KEYS.has(key)) return 'automation'
  if (TIER1_KEYS.has(key)) return 'preferences'
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
