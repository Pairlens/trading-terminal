// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Plugin install ledger — the device-local source of truth for *which plugins
 * are installed, their source, enabled state, config, and version*.
 *
 * This is what makes every plugin a real install unit (VS Code built-in model):
 *  - Bootstrap (compiled-in) plugins are **seeded** into the ledger on first run
 *    so the app is usefully populated out of the box.
 *  - Uninstalling a bootstrap plugin leaves a **tombstone** so it does not
 *    reappear on the next boot, even though its code still ships in the binary.
 *  - Registry / URL / local plugins are recorded with their source so boot can
 *    re-load their code from the right backend (IndexedDB cache or disk).
 *
 * The ledger persists locally (works fully signed-out). `enabled` + `config` are
 * additionally synced to the App Server when signed in; `source` / `version` /
 * `tombstoned` are local-only metadata.
 */

export type PluginSourceKind = 'bootstrap' | 'registry' | 'url' | 'local'

/**
 * Execution trust for a plugin's code.
 * - 'sandboxed' — evaluated in a dedicated Web Worker behind the capability
 *   bridge with an enforced network allowlist. Default for every
 *   non-bootstrap plugin.
 * - 'full' — evaluated in the main realm (required for React UI
 *   contributions). Only set by an explicit user grant.
 * Bootstrap plugins are compiled into the app and never consult this.
 */
export type PluginTrustLevel = 'sandboxed' | 'full'

export type PluginLedgerEntry = {
  pluginId: string
  source: PluginSourceKind
  enabled: boolean
  config: Record<string, unknown>
  version: string
  /** Set when the user uninstalls a bootstrap plugin — boot skips re-seeding it. */
  tombstoned?: boolean
  /** Execution trust; absent = 'sandboxed' for non-bootstrap plugins. */
  trust?: PluginTrustLevel
}

export type PluginLedger = Record<string, PluginLedgerEntry>

const LEDGER_KEY = 'pairlens:plugin-ledger'

// ── Read / write ────────────────────────────────────────────────────

export function getLedger(): PluginLedger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PluginLedger
  } catch {
    return {}
  }
}

export function saveLedger(ledger: PluginLedger): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
  } catch {
    // Storage full — non-fatal; ledger lives in memory for this session.
  }
}

export function getLedgerEntry(pluginId: string): PluginLedgerEntry | null {
  return getLedger()[pluginId] ?? null
}

// ── Mutations ───────────────────────────────────────────────────────

export function upsertLedgerEntry(
  entry: Partial<PluginLedgerEntry> & {
    pluginId: string
    source: PluginSourceKind
    version: string
  },
): PluginLedgerEntry {
  const ledger = getLedger()
  const prev = ledger[entry.pluginId]
  const merged: PluginLedgerEntry = {
    pluginId: entry.pluginId,
    source: entry.source,
    version: entry.version,
    enabled: entry.enabled ?? prev?.enabled ?? true,
    config: entry.config ?? prev?.config ?? {},
    // An explicit upsert (install) clears any prior tombstone unless told otherwise.
    tombstoned: entry.tombstoned ?? false,
    // Trust survives reinstalls/updates unless explicitly changed.
    trust: entry.trust ?? prev?.trust,
  }
  ledger[entry.pluginId] = merged
  saveLedger(ledger)
  return merged
}

export function setLedgerEnabled(pluginId: string, enabled: boolean): void {
  const ledger = getLedger()
  const entry = ledger[pluginId]
  if (!entry) return
  entry.enabled = enabled
  saveLedger(ledger)
}

export function setLedgerConfig(
  pluginId: string,
  config: Record<string, unknown>,
): void {
  const ledger = getLedger()
  const entry = ledger[pluginId]
  if (!entry) return
  entry.config = config
  saveLedger(ledger)
}

/**
 * Uninstall a plugin from the ledger.
 *
 * - Bootstrap plugins are **tombstoned** (entry kept, marked uninstalled) so
 *   they are not re-seeded on boot.
 * - Non-bootstrap plugins are removed outright (their code lives in the cache /
 *   on disk and is evicted separately by the caller).
 */
export function removeFromLedger(pluginId: string): void {
  const ledger = getLedger()
  const entry = ledger[pluginId]
  if (!entry) return
  if (entry.source === 'bootstrap') {
    entry.enabled = false
    entry.tombstoned = true
  } else {
    delete ledger[pluginId]
  }
  saveLedger(ledger)
}

/**
 * Resolve the execution trust for a plugin loaded through the module loader.
 * Fail closed: unknown plugins and plugins without an explicit grant are
 * sandboxed. (Bootstrap plugins never go through the module loader.)
 */
export function getPluginTrust(pluginId: string): PluginTrustLevel {
  return getLedger()[pluginId]?.trust === 'full' ? 'full' : 'sandboxed'
}

export function setPluginTrust(
  pluginId: string,
  trust: PluginTrustLevel,
): void {
  const ledger = getLedger()
  const entry = ledger[pluginId]
  if (!entry) return
  entry.trust = trust
  saveLedger(ledger)
}

// Capabilities whose plugins render React components (via
// getContributedComponents), so they cannot run in a DOM-less sandbox worker.
const MAIN_REALM_CAPABILITIES = new Set([
  'workflow:step-types',
  'notification:channel',
])

/**
 * True when a plugin can only run in the main realm — it contributes React UI
 * (panels / status-bar items / settings pages) or a capability that renders
 * components. Such plugins require an explicit full-trust grant; they cannot be
 * sandboxed (workers have no DOM, React, or host import map).
 */
export function pluginRequiresFullTrust(manifest: {
  contributes?: {
    panels?: Array<unknown>
    statusBarItems?: Array<unknown>
    settings?: Array<unknown>
  }
  capabilities?: Array<{ id: string }>
}): boolean {
  const c = manifest.contributes
  if (c?.panels?.length || c?.statusBarItems?.length || c?.settings?.length) {
    return true
  }
  return (
    manifest.capabilities?.some((cap) => MAIN_REALM_CAPABILITIES.has(cap.id)) ??
    false
  )
}

export function isTombstoned(pluginId: string): boolean {
  return getLedger()[pluginId]?.tombstoned === true
}

/** Reset to defaults: drop all non-bootstrap entries and clear tombstones so
 *  the bootstrap set is fully re-seeded on the next boot. */
export function clearTombstonesAndRemoteEntries(): void {
  const ledger = getLedger()
  for (const [id, entry] of Object.entries(ledger)) {
    if (entry.source === 'bootstrap') {
      entry.tombstoned = false
      entry.enabled = true
    } else {
      delete ledger[id]
    }
  }
  saveLedger(ledger)
}

// ── Seeding & queries ───────────────────────────────────────────────

/**
 * Seed the ledger with the bootstrap (compiled-in) plugins on first run.
 * Existing entries are preserved (respecting prior enable/disable + tombstones).
 */
export function seedBootstrap(
  bootstrap: Array<{ pluginId: string; version: string }>,
): PluginLedger {
  const ledger = getLedger()
  let changed = false
  for (const { pluginId, version } of bootstrap) {
    const existing = ledger[pluginId]
    if (existing) {
      // Keep prior state; refresh the known version of the shipped binary.
      if (existing.source === 'bootstrap' && existing.version !== version) {
        existing.version = version
        changed = true
      }
      continue
    }
    ledger[pluginId] = {
      pluginId,
      source: 'bootstrap',
      enabled: true,
      config: {},
      version,
    }
    changed = true
  }
  if (changed) saveLedger(ledger)
  return ledger
}

/** All entries that should be installed at boot (not tombstoned). */
export function getInstallableEntries(): Array<PluginLedgerEntry> {
  return Object.values(getLedger()).filter((e) => !e.tombstoned)
}
