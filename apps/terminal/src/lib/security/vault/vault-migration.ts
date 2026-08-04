// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Moving what is already stored under the vault DEK.
 *
 * Both platforms need this and neither is optional, which is the correction
 * this module carries: an opt-in that only covers keys added AFTERWARDS is a
 * switch that reports protection it never applied.
 *
 *   Browser   Existing values are `enc.v1` — AES-GCM under a non-extractable
 *             IndexedDB key. Enrollment re-encrypts them under the DEK.
 *   Desktop   Existing values are PLAINTEXT in the OS keychain. Enrollment
 *             re-encrypts those, enumerated from the credential and wallet
 *             indexes, because the keychain has no `list` command.
 *
 * The ordering below is the entire design and must not be rearranged:
 *
 *   1. Enumerate every slot the vault will own.
 *   2. Read ALL of them first, into memory. Any failure aborts before a
 *      single write — nothing on disk has changed and the user still has
 *      everything they had.
 *   3. Write the vault record as `state: 'migrating'`. The wrapped DEK must
 *      exist on disk BEFORE the first `enc.v2` value, or a crash between the
 *      two orphans every value that got re-encrypted.
 *   4. Re-encrypt each value in place, and read it back to prove it landed —
 *      a backend that accepts a write and stores nothing would otherwise be
 *      discovered only by the user, as a plaintext key under a switch that
 *      says "protected". A crash here leaves a mix of formats, which is
 *      exactly why `getCredential` reads both, permanently.
 *   5. Flip the record to `ready`.
 *
 * Failure at 4 leaves `state: 'migrating'` and every value readable in one
 * format or the other; the operation is idempotent and re-runnable, and
 * Security settings offers to finish it.
 *
 * Deviation from the original plan, on purpose: the legacy IndexedDB key is
 * NOT deleted at the end. The lock verifier is deliberately exempt from vault
 * encryption (it has to be answerable while the vault is sealed), so on
 * browser it is still stored under that key — deleting it would leave the
 * user staring at a lock screen whose password can never be checked. After a
 * complete migration the key opens nothing but a salted PBKDF2 digest, which
 * is what a verifier is designed to be.
 */

import { VaultMigrationError } from './vault-errors'
import { writeVaultRecord } from './vault-storage'
import {
  CIPHER_V2,
  decryptWithDek,
  encryptWithDek,
  importDek,
} from './vault-crypto'
import { listIndexedKeys } from './vault-values'
import type { VaultRecord } from './vault-record'
import { isStandalone } from '@/lib/platform'
import {
  decryptLegacyValue,
  listLegacyEntries,
  readStoredValue,
  writeStoredValue,
} from '@/lib/keychain'

export type MigrationDeps = {
  /**
   * Steps 1-2: everything that must move under the DEK, as slot key →
   * plaintext. Platform-shaped, which is why it is one function and not an
   * `if` in the middle of the ordering below.
   */
  collect: (dek: CryptoKey) => Promise<Map<string, string>>
  writeValue: (key: string, stored: string) => Promise<void>
  /** Read-back for the write verification in step 4. */
  readValue: (key: string) => Promise<string | null>
  writeRecord: (
    record: VaultRecord,
    expectedRevision: number | null,
  ) => Promise<VaultRecord>
}

/**
 * Browser: the `enc.v1` slots, decrypted with the legacy IndexedDB key.
 *
 * A failure here aborts before a single write, so the user still has
 * everything they had — hence the whole map is built before returning.
 */
export async function collectLegacyValues(
  _dek: CryptoKey,
  deps: {
    listLegacy?: () => Array<{ key: string; stored: string }>
    decryptLegacy?: (stored: string) => Promise<string>
  } = {},
): Promise<Map<string, string>> {
  const listLegacy = deps.listLegacy ?? listLegacyEntries
  const decryptLegacy = deps.decryptLegacy ?? decryptLegacyValue
  const pending = new Map<string, string>()
  for (const entry of listLegacy()) {
    try {
      pending.set(entry.key, await decryptLegacy(entry.stored))
    } catch (err) {
      throw new VaultMigrationError(
        `Could not read the stored credential "${entry.key}". Nothing was changed.`,
        err,
      )
    }
  }
  return pending
}

/**
 * Desktop: the indexes, because the OS keychain has no listing command.
 *
 * Everything there is plaintext until a vault exists, which is exactly why
 * this has to run — an enrollment that skipped it would leave every key the
 * user already had as readable as it was before, under a switch that says
 * otherwise. Reads through the DEK so a re-run sees the same set: values a
 * previous attempt converted decrypt (and are skipped), values that never
 * made it come back plaintext (and are returned).
 */
export async function collectStoredPlaintexts(
  dek: CryptoKey,
  read: (key: string) => Promise<string | null> = readStoredValue,
): Promise<Map<string, string>> {
  const readPlain = async (key: string): Promise<string | null> => {
    const stored = await read(key)
    if (stored === null) return null
    if (!stored.startsWith(CIPHER_V2)) return stored
    return await decryptWithDek(dek, key, stored)
  }
  const pending = new Map<string, string>()
  try {
    for (const key of await listIndexedKeys(readPlain)) {
      const stored = await read(key)
      // Already under the data key — an interrupted run, nothing to do.
      if (stored === null || stored.startsWith(CIPHER_V2)) continue
      pending.set(key, stored)
    }
  } catch (err) {
    throw new VaultMigrationError(
      'Could not read the credentials already stored on this device. Nothing was changed.',
      err,
    )
  }
  return pending
}

const defaultDeps: MigrationDeps = {
  collect: isStandalone ? collectStoredPlaintexts : collectLegacyValues,
  writeValue: writeStoredValue,
  readValue: readStoredValue,
  writeRecord: writeVaultRecord,
}

export type MigrationResult = {
  /** Values re-encrypted under the DEK. */
  migrated: number
  /** The record as persisted, `state: 'ready'`. */
  record: VaultRecord
}

/** Step 4. The record already exists on disk when this runs. */
async function writeVaulted(
  dek: CryptoKey,
  pending: Map<string, string>,
  deps: MigrationDeps,
): Promise<number> {
  let migrated = 0
  for (const [key, plaintext] of pending) {
    const stored = await encryptWithDek(dek, key, plaintext)
    try {
      await deps.writeValue(key, stored)
      if ((await deps.readValue(key)) !== stored) {
        throw new Error('the value was not stored')
      }
      migrated++
    } catch (err) {
      throw new VaultMigrationError(
        `Could not re-encrypt "${key}". Your credentials are still readable; run the migration again to finish.`,
        err,
      )
    }
  }
  return migrated
}

/**
 * Move every value already on this device under the vault DEK and persist the
 * record.
 *
 * `record` is the freshly built one (protectors already wrapped) with its
 * revision set to what should land on disk. `expectedRevision` is the CAS
 * token — `null` when creating the vault.
 */
export async function migrateLegacyValues(
  rawDek: Uint8Array<ArrayBuffer>,
  record: VaultRecord,
  expectedRevision: number | null,
  overrides: Partial<MigrationDeps> = {},
): Promise<MigrationResult> {
  const deps = { ...defaultDeps, ...overrides }
  const dek = await importDek(rawDek)

  // 1-2. Everything readable, before anything is written.
  const pending = await deps.collect(dek)

  // 3. The wrapped DEK lands first, always.
  const migratingRecord: VaultRecord = { ...record, state: 'migrating' }
  await deps.writeRecord(migratingRecord, expectedRevision)

  // 4. Re-encrypt in place.
  const migrated = await writeVaulted(dek, pending, deps)

  // 5. Done.
  const readyRecord: VaultRecord = {
    ...migratingRecord,
    state: 'ready',
    revision: migratingRecord.revision + 1,
  }
  await deps.writeRecord(readyRecord, migratingRecord.revision)

  return { migrated, record: readyRecord }
}

/**
 * Re-run steps 4-5 for a vault left in `migrating`.
 *
 * Same guarantees, minus the record creation: the record already exists, so
 * the only failure mode is "still migrating", never "orphaned ciphertext".
 * Takes the runtime key rather than raw bytes, so a window that already holds
 * an unlocked vault can finish the job without asking for the password again.
 */
export async function finishMigration(
  dek: CryptoKey,
  record: VaultRecord,
  overrides: Partial<MigrationDeps> = {},
): Promise<MigrationResult> {
  const deps = { ...defaultDeps, ...overrides }
  const pending = await deps.collect(dek)
  const migrated = await writeVaulted(dek, pending, deps)

  const readyRecord: VaultRecord = {
    ...record,
    state: 'ready',
    revision: record.revision + 1,
  }
  await deps.writeRecord(readyRecord, record.revision)
  return { migrated, record: readyRecord }
}
