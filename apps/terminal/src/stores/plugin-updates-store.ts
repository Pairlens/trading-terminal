// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { usePersistedState } from '@/hooks/use-persisted-state'

// ── Auto-update settings ────────────────────────────────────────────

export type PluginAutoUpdateMode = 'auto' | 'notify' | 'off'

export type PluginAutoUpdateSettings = {
  mode: PluginAutoUpdateMode
  checkIntervalHours: number
}

const DEFAULT_AUTO_UPDATE: PluginAutoUpdateSettings = {
  mode: 'notify',
  checkIntervalHours: 6,
}

export function usePluginAutoUpdateSettings() {
  const [settings, setSettings] = usePersistedState<PluginAutoUpdateSettings>(
    'plugin-auto-update-settings',
    DEFAULT_AUTO_UPDATE,
  )
  return { settings, setSettings }
}

// ── Available updates (discovered, not yet staged) ──────────────────

export type PluginUpdateInfo = {
  pluginId: string
  currentVersion: string
  latestVersion: string
  moduleUrl: string
  moduleHash?: string
  styleUrl?: string
  styleHash?: string
  // Publisher signature over the new version — required by the mandatory
  // signature check in the registry install path.
  signature?: string
  publisherKeyId?: string
}

const UPDATES_KEY = 'plugin-available-updates'

export function getAvailableUpdates(): Array<PluginUpdateInfo> {
  try {
    const raw = localStorage.getItem(UPDATES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Array<PluginUpdateInfo>
  } catch {
    return []
  }
}

export function setAvailableUpdates(updates: Array<PluginUpdateInfo>): void {
  try {
    localStorage.setItem(UPDATES_KEY, JSON.stringify(updates))
  } catch {
    // Storage full
  }
}

export function clearAvailableUpdates(): void {
  localStorage.removeItem(UPDATES_KEY)
}

export function removeUpdateForPlugin(pluginId: string): void {
  const updates = getAvailableUpdates().filter((u) => u.pluginId !== pluginId)
  setAvailableUpdates(updates)
}

// ── Staged updates (downloaded, apply on next boot) ─────────────────

export type StagedUpdate = {
  pluginId: string
  version: string
  stagedAt: number
}

const STAGED_KEY = 'plugin-staged-updates'

export function getStagedUpdates(): Array<StagedUpdate> {
  try {
    const raw = localStorage.getItem(STAGED_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Array<StagedUpdate>
  } catch {
    return []
  }
}

export function addStagedUpdate(update: StagedUpdate): void {
  const existing = getStagedUpdates().filter(
    (s) => s.pluginId !== update.pluginId,
  )
  existing.push(update)
  try {
    localStorage.setItem(STAGED_KEY, JSON.stringify(existing))
  } catch {
    // Storage full
  }
}

export function clearStagedUpdates(): void {
  localStorage.removeItem(STAGED_KEY)
}

export function hasStagedUpdates(): boolean {
  return getStagedUpdates().length > 0
}

// ── Last check timestamp ────────────────────────────────────────────

const LAST_CHECK_KEY = 'plugin-update-last-check'

export function getLastUpdateCheck(): number {
  try {
    return Number(localStorage.getItem(LAST_CHECK_KEY) ?? '0')
  } catch {
    return 0
  }
}

export function setLastUpdateCheck(timestamp: number): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(timestamp))
  } catch {
    // Storage full
  }
}

// ── Hook: available update count (reactive via storage events) ──────

export function useAvailableUpdateCount(): number {
  const [updates] = usePersistedState<Array<PluginUpdateInfo>>(
    'plugin-available-updates',
    [],
  )
  return updates.length
}
