// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Cloud-sync preferences — the per-device answer to "what may leave this
 * machine?".
 *
 * One master pause plus a switch per {@link SyncDomainId}. Defaults are all-on,
 * which is what every existing install already does, and a corrupt record fails
 * open for the same reason: sync-on is the documented behaviour, so a bad
 * payload must not silently stop backing someone's work up.
 *
 * The record itself is device-local — it rides the cross-window bus (so every
 * window of the same install agrees) but is blocklisted in the coordinator, so
 * one machine's decision never governs another.
 */

import { SYNC_DOMAIN_IDS, isSyncDomainId } from './sync-domains'
import { onHydrate, onWrite } from './sync-channel'
import type { SyncDomainId } from './sync-domains'
import { createSyncedSetting } from '@/lib/settings/synced-setting'

export type CloudSyncPreferences = {
  /** Master pause. Off = nothing syncs, whatever the per-domain flags say. */
  enabled: boolean
  /** Per-domain opt-outs. A missing entry means on. */
  domains: Partial<Record<SyncDomainId, boolean>>
}

export const CLOUD_SYNC_STORAGE_KEY = 'cloud-sync'

const DEFAULT_PREFERENCES: CloudSyncPreferences = { enabled: true, domains: {} }

const setting = createSyncedSetting<CloudSyncPreferences>(
  CLOUD_SYNC_STORAGE_KEY,
  DEFAULT_PREFERENCES,
)

function sanitize(raw: unknown): CloudSyncPreferences {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return DEFAULT_PREFERENCES
  }
  const source = raw as Partial<Record<keyof CloudSyncPreferences, unknown>>
  const enabled = typeof source.enabled === 'boolean' ? source.enabled : true

  const domains: Partial<Record<SyncDomainId, boolean>> = {}
  if (typeof source.domains === 'object' && source.domains !== null) {
    for (const [id, value] of Object.entries(
      source.domains as Record<string, unknown>,
    )) {
      // Unknown ids are dropped rather than kept: a domain that no longer
      // exists must not resurrect as a switch nobody can see.
      if (!isSyncDomainId(id) || typeof value !== 'boolean') continue
      domains[id] = value
    }
  }
  return { enabled, domains }
}

// ── Cache ────────────────────────────────────────────────────────────
// `isDomainSyncEnabled` runs on every persisted write, so the parsed record is
// held in memory and invalidated on change instead of re-read per call.

let cache: CloudSyncPreferences | null = null

/** Bumped on every change so `useSyncExternalStore` sees a new snapshot. */
let version = 0

type Source = 'write' | 'hydrate'
type Listener = (source: Source) => void

const listeners = new Set<Listener>()

function invalidate(source: Source) {
  cache = null
  version += 1
  for (const listener of listeners) listener(source)
}

// Registered at module load, ahead of any subscriber: by the time a listener
// runs, the cache is already cleared, so a read inside it sees the new record.
onWrite((key) => {
  if (key === CLOUD_SYNC_STORAGE_KEY) invalidate('write')
})
onHydrate((key) => {
  if (key === CLOUD_SYNC_STORAGE_KEY) invalidate('hydrate')
})

function read(): CloudSyncPreferences {
  if (!cache) cache = sanitize(setting.get())
  return cache
}

// ── Reads ────────────────────────────────────────────────────────────

export function getCloudSyncPreferences(): CloudSyncPreferences {
  return read()
}

export function isCloudSyncEnabled(): boolean {
  return read().enabled
}

export function isDomainSyncEnabled(id: SyncDomainId): boolean {
  const prefs = read()
  return prefs.enabled && prefs.domains[id] !== false
}

/** The domains currently allowed to sync — the set the coordinator diffs. */
export function enabledSyncDomains(): Set<SyncDomainId> {
  const prefs = read()
  const out = new Set<SyncDomainId>()
  if (!prefs.enabled) return out
  for (const id of SYNC_DOMAIN_IDS) {
    if (prefs.domains[id] !== false) out.add(id)
  }
  return out
}

export function cloudSyncVersion(): number {
  return version
}

/**
 * Observe changes from any window. `source` is `'write'` when this window made
 * the change and `'hydrate'` when a sibling did — which is how only one window
 * does the network work on re-enable.
 */
export function subscribeCloudSyncPreferences(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ── Writes ───────────────────────────────────────────────────────────

export function setCloudSyncEnabled(enabled: boolean): void {
  setting.set({ ...read(), enabled })
}

export function setDomainSyncEnabled(id: SyncDomainId, enabled: boolean): void {
  const prefs = read()
  setting.set({ ...prefs, domains: { ...prefs.domains, [id]: enabled } })
}
