// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Is there anything in the vault?" — the question the last-protector guard
 * has to answer before it lets someone throw away the only way in.
 *
 * Browser: a localStorage scan for `enc.v2` values, which is exact.
 *
 * Desktop: there is no `keychain_list` command (see apps/desktop/src-tauri),
 * so the only honest answer comes from the credential and wallet indexes —
 * which are themselves vaulted, and therefore only readable while the vault
 * is unlocked. That is not a weakness of this check: removing a protector
 * already requires an unlocked vault, so the two rules hold each other up.
 * Do not weaken either one on its own.
 */

import { CIPHER_V2 } from './vault-crypto'
import { isStandalone } from '@/lib/platform'
import { KEYCHAIN_STORAGE_PREFIX, getCredential } from '@/lib/keychain'

/** Reads a slot as plaintext, or null when it is not there. */
export type PlainReader = (key: string) => Promise<string | null>

function parseIds(raw: string | null): Array<string> {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    return []
  }
}

/**
 * Every slot the vault owns (or is about to own), read out of the indexes.
 *
 * This is the only enumeration the OS keychain allows — there is no
 * `keychain_list` command — so both directions of the desktop toggle depend on
 * it: turning the vault ON has to find the values already sitting there, and
 * turning it OFF has to find the ones to decrypt. `read` is injected because
 * those two callers hold different keys: teardown reads through the live
 * session, enrollment reads with the DEK it just generated.
 */
export async function listIndexedKeys(
  read: PlainReader,
): Promise<Array<string>> {
  const [{ CREDENTIALS_INDEX_KEY }, { WALLETS_INDEX_KEY }] = await Promise.all([
    import('@/stores/credentials-store'),
    import('@/stores/wallets-store'),
  ])
  const keys: Array<string> = []

  const credIndex = await read(CREDENTIALS_INDEX_KEY)
  if (credIndex !== null) keys.push(CREDENTIALS_INDEX_KEY)
  for (const id of parseIds(credIndex)) keys.push(`cred:${id}`)

  const walletIndex = await read(WALLETS_INDEX_KEY)
  if (walletIndex !== null) keys.push(WALLETS_INDEX_KEY)
  for (const id of parseIds(walletIndex)) {
    keys.push(`wallet:${id}`)
    keys.push(`wallet:${id}:secret`)
  }
  return keys
}

function browserHasVaultedValues(): boolean {
  if (typeof window === 'undefined') return false
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i)
    if (!storageKey?.startsWith(KEYCHAIN_STORAGE_PREFIX)) continue
    if (localStorage.getItem(storageKey)?.startsWith(CIPHER_V2)) return true
  }
  return false
}

async function indexHasEntries(key: string): Promise<boolean> {
  try {
    const raw = await getCredential(key)
    if (!raw) return false
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) && parsed.length > 0
  } catch {
    // A sealed vault or an unreadable index is not "nothing is stored" — err
    // toward keeping the protector.
    return true
  }
}

/**
 * True when removing the last protector would strand real secrets.
 *
 * Errs on the side of `true`: refusing to remove a protector is an
 * inconvenience, removing the last one over live keys is unrecoverable.
 */
export async function hasVaultedValues(): Promise<boolean> {
  if (!isStandalone) return browserHasVaultedValues()
  const [{ CREDENTIALS_INDEX_KEY }, { WALLETS_INDEX_KEY }] = await Promise.all([
    import('@/stores/credentials-store'),
    import('@/stores/wallets-store'),
  ])
  if (await indexHasEntries(CREDENTIALS_INDEX_KEY)) return true
  return await indexHasEntries(WALLETS_INDEX_KEY)
}
