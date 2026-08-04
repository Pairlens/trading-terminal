// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where the vault record lives.
 *
 * Deliberately bypasses `lib/keychain.ts`. The record is not a credential —
 * it is the thing that decides how credentials are stored — and routing it
 * through the vault-aware value layer would be circular.
 *
 * Browser: `pairlens:security.vault` in localStorage. The name is doing two
 * jobs. `pairlens:` means the destructive reset already sweeps it
 * (lock-reset.ts), and `security.` means the sync blocklist already refuses
 * to send it to the App Server (sync-domains.ts). Both invariants come for
 * free by choosing exactly this string, and both are load-bearing: a record
 * that outlives its ciphertext is unopenable data, and a record on the sync
 * bus is a server-reachable list of wrapped keys.
 *
 * Desktop: an OS keychain entry, `security:vault`. Storing it there in the
 * clear is correct — the record is already ciphertext, and the keychain is
 * the desktop store.
 *
 * Writes are compare-and-set on `revision`. Two windows enrolling at the same
 * time would otherwise silently drop one protector, and "my passkey stopped
 * working" is not a bug anyone can debug after the fact.
 */

import { invoke } from '@tauri-apps/api/core'

import { VAULT_RECORD_KEY } from '../keys'
import {
  assertRevision,
  parseVaultRecord,
  serializeVaultRecord,
} from './vault-record'
import type { VaultRecord } from './vault-record'
import { isStandalone } from '@/lib/platform'

const BROWSER_KEY = 'pairlens:security.vault'

/**
 * UI hints, so settings and the Accounts page can render "enrolled, 2
 * protectors" without an async keychain probe on desktop.
 *
 * NEVER read by anything that decides whether to encrypt. It is an untrusted
 * mirror of a trusted record; flipping it by hand must change what a panel
 * says and nothing else.
 */
const UI_MIRROR_KEY = 'pairlens:security.vault-ui'

export type VaultUiMirror = {
  enrolled: boolean
  protectors: number
  hasPasskey: boolean
  hasPassword: boolean
  state: 'ready' | 'migrating'
}

export async function readVaultRecordRaw(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  if (isStandalone) {
    return await invoke<string | null>('keychain_get', {
      key: VAULT_RECORD_KEY,
    })
  }
  return localStorage.getItem(BROWSER_KEY)
}

export async function readVaultRecord(): Promise<VaultRecord | null> {
  return parseVaultRecord(await readVaultRecordRaw())
}

async function writeRaw(next: string): Promise<void> {
  if (isStandalone) {
    await invoke('keychain_set', { key: VAULT_RECORD_KEY, value: next })
    return
  }
  localStorage.setItem(BROWSER_KEY, next)
}

/**
 * Persist a record, refusing to clobber a concurrent write.
 *
 * `expectedRevision === null` means "there must be no record yet" — the
 * create path. Anything else must match what is on disk right now.
 */
export async function writeVaultRecord(
  next: VaultRecord,
  expectedRevision: number | null,
): Promise<VaultRecord> {
  const current = await readVaultRecord()
  assertRevision(current, expectedRevision)
  await writeRaw(serializeVaultRecord(next))
  writeUiMirror(next)
  return next
}

export async function deleteVaultRecord(): Promise<void> {
  if (typeof window === 'undefined') return
  if (isStandalone) {
    await invoke('keychain_delete', { key: VAULT_RECORD_KEY })
  } else {
    localStorage.removeItem(BROWSER_KEY)
  }
  clearUiMirror()
}

export function writeUiMirror(record: VaultRecord | null): void {
  if (typeof window === 'undefined') return
  try {
    if (!record) {
      localStorage.removeItem(UI_MIRROR_KEY)
      return
    }
    const mirror: VaultUiMirror = {
      enrolled: record.protectors.length > 0,
      protectors: record.protectors.length,
      hasPasskey: record.protectors.some((p) => p.type === 'passkey'),
      hasPassword: record.protectors.some((p) => p.type === 'password'),
      state: record.state,
    }
    localStorage.setItem(UI_MIRROR_KEY, JSON.stringify(mirror))
  } catch {
    // Quota / private mode. The mirror is a hint; the record still governs.
  }
}

export function clearUiMirror(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(UI_MIRROR_KEY)
  } catch {
    // Best effort.
  }
}

/** Synchronous first-paint hint. Never trusted for a crypto decision. */
export function readUiMirror(): VaultUiMirror | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(UI_MIRROR_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<VaultUiMirror>
    if (typeof parsed.enrolled !== 'boolean') return null
    return {
      enrolled: parsed.enrolled,
      protectors: typeof parsed.protectors === 'number' ? parsed.protectors : 0,
      hasPasskey: parsed.hasPasskey === true,
      hasPassword: parsed.hasPassword === true,
      state: parsed.state === 'migrating' ? 'migrating' : 'ready',
    }
  } catch {
    return null
  }
}
