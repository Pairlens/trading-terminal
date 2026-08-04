// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Moving what is already stored under the vault DEK.
 *
 * This is the desktop opt-in path, and it is not optional: on desktop the
 * exchange keys and wallet secrets already sitting in the OS keychain are
 * PLAINTEXT, so an enrollment that only covered keys added AFTERWARDS would be
 * a switch that reports protection it never applied. They are enumerated from
 * the credential and wallet indexes, because the keychain has no `list`
 * command, and re-encrypted under the DEK.
 *
 * On browser there is nothing to move: a protector is a precondition for the
 * first credential (vault-policy.ts), so the indexes cannot exist before the
 * vault does and the same walk simply yields an empty map. One code path, two
 * honest answers — not a platform `if` in the middle of the ordering.
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
 *      says "protected". A crash here leaves a mix of plaintext and `enc.v2`,
 *      which is exactly what `getCredential` reads correctly on desktop.
 *   5. Flip the record to `ready`.
 *
 * Failure at 4 leaves `state: 'migrating'` and every value readable in one
 * format or the other; the operation is idempotent and re-runnable, and
 * Security settings offers to finish it.
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
import { readStoredValue, writeStoredValue } from '@/lib/keychain'

export type MigrationDeps = {
  /**
   * Steps 1-2: everything that must move under the DEK, as slot key →
   * plaintext. Injected rather than called directly so the ordering guarantees
   * below can be tested against a fake store.
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
 * The indexes, because the OS keychain has no listing command.
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
      if (stored === null) continue
      // Already under the data key — an interrupted run, nothing to do. The
      // wider `enc.` guard is the belt: an unrecognised ciphertext must never
      // be mistaken for plaintext and encrypted a second time, which would
      // bury the real value under two layers and one recoverable key.
      if (stored.startsWith('enc.')) continue
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
  collect: collectStoredPlaintexts,
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
export async function migrateStoredValues(
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
