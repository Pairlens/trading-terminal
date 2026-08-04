// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning the desktop vault back off.
 *
 * This is real crypto ordering, not settings-component logic, which is why it
 * lives here: every value has to come back out from under the data key and
 * land in the OS keychain as plaintext BEFORE the wrapped-DEK record is
 * deleted. There is no transaction across N keychain writes, so the ordering
 * is the only guarantee available:
 *
 *   1. Enumerate. On desktop that means the credential and wallet indexes —
 *      there is no `keychain_list` command — which is why this needs an
 *      unlocked vault to even see what is stored.
 *   2. Decrypt everything into memory first. A failure here changes nothing.
 *   3. Write each value back as plaintext, and read it back to prove it
 *      landed. A keychain that accepted the write but stored nothing would
 *      otherwise be discovered after the record was gone.
 *   4. Delete the record LAST.
 *
 * A crash anywhere leaves a mix of plaintext and `enc.v2` values with the
 * record still present — which `getCredential` reads correctly on desktop
 * (plaintext passes through, `enc.v2` decrypts) — so re-running finishes the
 * job. The operation is idempotent by construction.
 *
 * Browser has no opt-out on purpose: the web policy is that credentials only
 * exist inside a vault, and "decrypt everything back to a key sitting in the
 * same browser profile" is not a state the product offers.
 */

import { CIPHER_V2 } from './vault-crypto'
import { VaultProtectorError, VaultSealedError } from './vault-errors'
import { listIndexedKeys } from './vault-values'
import { removeAllBiometricMaterial } from './vault-biometric'
import { deleteVaultRecord } from './vault-storage'
import {
  ensureVaultLoaded,
  isVaultUnlocked,
  sealVault,
  setVaultRecord,
} from './vault-session'
import {
  KEYCHAIN_STORAGE_PREFIX,
  getCredential,
  readStoredValue,
  writeStoredValue,
} from '@/lib/keychain'
import { isStandalone } from '@/lib/platform'

/**
 * Every slot the vault currently owns.
 *
 * Desktop answers from the indexes, which is the only enumeration the OS
 * keychain allows and therefore requires an unlocked vault (the indexes are
 * themselves vaulted). Browser scans localStorage, which is exact.
 */
export async function listVaultedKeys(): Promise<Array<string>> {
  if (!isStandalone) {
    if (typeof window === 'undefined') return []
    const keys: Array<string> = []
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (!storageKey?.startsWith(KEYCHAIN_STORAGE_PREFIX)) continue
      if (!localStorage.getItem(storageKey)?.startsWith(CIPHER_V2)) continue
      keys.push(storageKey.slice(KEYCHAIN_STORAGE_PREFIX.length))
    }
    return keys
  }
  // The live session holds the key, so `getCredential` is the reader: vaulted
  // values decrypt, and anything an interrupted run left as plaintext passes
  // straight through.
  return await listIndexedKeys(getCredential)
}

export type TeardownResult = { restored: number }

/**
 * Decrypt every vaulted value back into the OS keychain and drop the record.
 *
 * Desktop only, and only with the vault unlocked — without the DEK there is
 * nothing to decrypt with and no way to enumerate what to decrypt.
 */
export async function disableVault(): Promise<TeardownResult> {
  if (!isStandalone) {
    throw new VaultProtectorError(
      'The vault cannot be turned off in the browser',
      'unavailable',
    )
  }
  const record = await ensureVaultLoaded()
  if (!record) return { restored: 0 }
  if (!isVaultUnlocked()) throw new VaultSealedError()

  // 1-2. Everything readable, before anything is written.
  const keys = await listVaultedKeys()
  const plaintexts = new Map<string, string>()
  for (const key of keys) {
    const stored = await readStoredValue(key)
    if (stored === null) continue
    // Already plaintext from an interrupted earlier run — nothing to do.
    if (!stored.startsWith(CIPHER_V2)) continue
    const value = await getCredential(key)
    if (value === null) continue
    plaintexts.set(key, value)
  }

  // 3. Write back, and prove each one landed.
  let restored = 0
  for (const [key, value] of plaintexts) {
    await writeStoredValue(key, value)
    if ((await readStoredValue(key)) !== value) {
      throw new VaultProtectorError(
        `Could not write "${key}" back to the system keychain. Nothing was lost — your vault is still set up; try again.`,
        'unavailable',
      )
    }
    restored++
  }

  // 4. The record goes last, so a crash above is always recoverable. The OS
  //    biometric items go just before it, while the record still names them —
  //    afterwards nothing remembers those accounts exist and they would sit in
  //    the user's Keychain forever, behind a Touch ID prompt, opening nothing.
  await removeAllBiometricMaterial(record)
  await deleteVaultRecord()
  setVaultRecord(null, { broadcast: true })
  sealVault({ broadcast: true })
  return { restored }
}
