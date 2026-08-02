// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Plugins that failed to load at boot because they need full trust but their
 * ledger entry is still sandboxed (e.g. installed before the sandbox model, or
 * their trust was cleared). They are recorded here so the Installed Plugins UI
 * can surface a "Needs full trust" row with a Grant action — otherwise a
 * plugin that can't load has no row and would be stuck/unrecoverable.
 *
 * This is device-local only (localStorage). Entries are removed once the user
 * grants trust (and the plugin loads) or uninstalls it.
 */

export type PendingTrustEntry = {
  pluginId: string
  version: string
  source: 'registry' | 'url' | 'local'
}

const KEY = 'plugin-pending-full-trust'

export function getPendingFullTrust(): Array<PendingTrustEntry> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as Array<PendingTrustEntry>
  } catch {
    return []
  }
}

function save(entries: Array<PendingTrustEntry>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Storage full — non-fatal
  }
}

export function recordPendingFullTrust(entry: PendingTrustEntry): void {
  const entries = getPendingFullTrust().filter(
    (e) => e.pluginId !== entry.pluginId,
  )
  entries.push(entry)
  save(entries)
}

export function clearPendingFullTrust(pluginId: string): void {
  save(getPendingFullTrust().filter((e) => e.pluginId !== pluginId))
}
