// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Enrollment, unlock, and protector management — the orchestration layer over
 * the crypto modules. Everything that persists a record or touches the live
 * session goes through here.
 *
 * One thing worth stating plainly, because it shapes the whole API: adding a
 * protector requires proving an existing one. The runtime DEK is
 * non-extractable by design, so it cannot be re-wrapped; the raw bytes have
 * to be recovered from a protector the user can still answer. "Add a passkey"
 * therefore asks for the password (or an existing passkey) first. That is not
 * friction for its own sake — a vault that could enroll new protectors from
 * an unlocked session would let anyone who walks up to an open laptop add
 * their own way in.
 *
 * Attempt backoff is shared with the terminal lock on purpose: one counter,
 * one lockout, one place to reason about brute force. It also means fumbling
 * the vault password delays the screen unlock, which the UI has to say out
 * loud or it reads as a bug.
 */

import {
  VaultConflictError,
  VaultProtectorError,
  VaultSealedError,
} from './vault-errors'
import {
  VAULT_RECORD_VERSION,
  withProtector,
  withoutProtector,
} from './vault-record'
import { generateRawDek, importDek, zero } from './vault-crypto'
import {
  enrollPasswordProtector,
  recoverRawDekWithPassword,
  rewrapPasswordProtectors,
} from './vault-password'
import {
  enrollPasskeyProtector,
  newVaultIdentity,
  recoverRawDekWithPasskey,
} from './vault-passkey'
import { deleteVaultRecord, writeVaultRecord } from './vault-storage'
import {
  ensureVaultLoaded,
  getDek,
  invalidateVaultRecord,
  isVaultUnlocked,
  sealVault,
  setDek,
  setVaultRecord,
} from './vault-session'
import { finishMigration, migrateLegacyValues } from './vault-migration'
import { hasVaultedValues } from './vault-values'
import {
  blockedForMs,
  clearAttempts,
  recordFailedAttempt,
} from './vault-attempts'
import type { PasskeyPrfPort } from './vault-passkey'
import type { VaultProtector, VaultRecord } from './vault-record'

export type EnrollInput =
  | {
      kind: 'password'
      password: string
      label?: string
      /**
       * PBKDF2 cost. Defaults to `VAULT_PBKDF2_ITERATIONS` and callers should
       * leave it alone — it exists because the count is stored per blob (so
       * it can be raised later without invalidating anyone) and because tests
       * have no reason to pay 600k rounds per case.
       */
      iterations?: number
    }
  | {
      kind: 'passkey'
      label?: string
      userName?: string
      userDisplayName?: string
      port?: PasskeyPrfPort
    }

export type UnlockInput =
  | { kind: 'password'; password: string }
  | { kind: 'passkey'; port?: PasskeyPrfPort }

const DEFAULT_PASSKEY_USER = 'Pairlens vault'

async function buildProtector(
  input: EnrollInput,
  identity: { prfSalt: string; webauthnUserId: string },
  rawDek: Uint8Array<ArrayBuffer>,
): Promise<VaultProtector> {
  if (input.kind === 'password') {
    return await enrollPasswordProtector(rawDek, input.password, {
      label: input.label ?? 'Password',
      ...(input.iterations ? { iterations: input.iterations } : {}),
    })
  }
  return await enrollPasskeyProtector(
    identity,
    rawDek,
    {
      label: input.label ?? 'Passkey',
      userName: input.userName ?? DEFAULT_PASSKEY_USER,
      userDisplayName: input.userDisplayName ?? DEFAULT_PASSKEY_USER,
    },
    input.port,
  )
}

/**
 * Recover the raw DEK from one protector. Callers MUST zeroize.
 *
 * Failure bookkeeping lives here so every entry point shares it: a wrong
 * password counts against the backoff, a dismissed passkey prompt never does
 * (cancelling a biometric prompt is not a guess).
 */
async function recoverRawDek(
  record: VaultRecord,
  unlock: UnlockInput,
): Promise<Uint8Array<ArrayBuffer>> {
  const blockedMs = blockedForMs()
  if (blockedMs > 0) {
    throw new VaultProtectorError(
      `Too many attempts. Try again in ${Math.ceil(blockedMs / 1000)}s.`,
      'unavailable',
    )
  }
  try {
    const raw =
      unlock.kind === 'password'
        ? await recoverRawDekWithPassword(record, unlock.password)
        : await recoverRawDekWithPasskey(record, unlock.port)
    clearAttempts()
    return raw
  } catch (err) {
    if (err instanceof VaultProtectorError && err.kind === 'wrong-password') {
      recordFailedAttempt()
    }
    throw err
  }
}

/**
 * Create the vault: generate the DEK, wrap it under the first protector, and
 * move everything already stored on this device under it.
 *
 * That last clause is not a detail. On desktop the pre-existing exchange keys
 * and wallet secrets sit in the OS keychain as PLAINTEXT, and an enrollment
 * that only covered future writes would leave every key the user already has
 * exactly as exposed as before — under a switch, and a status line, that says
 * otherwise. The migration enumerates and re-encrypts them; it reports
 * `ready` only once each one has been read back as ciphertext.
 *
 * Leaves the vault unlocked — the user just proved themselves by choosing the
 * secret, and sealing immediately would only make them do it twice.
 */
export async function createVault(input: EnrollInput): Promise<VaultRecord> {
  const existing = await ensureVaultLoaded()
  if (existing) {
    throw new VaultConflictError('A vault already exists on this device')
  }

  const identity = newVaultIdentity()
  const rawDek = generateRawDek()
  try {
    const protector = await buildProtector(input, identity, rawDek)
    const draft: VaultRecord = {
      v: VAULT_RECORD_VERSION,
      state: 'ready',
      revision: 1,
      prfSalt: identity.prfSalt,
      webauthnUserId: identity.webauthnUserId,
      createdAt: Date.now(),
      protectors: [protector],
    }
    // Writes the record first, then re-encrypts — the wrapped DEK must exist
    // on disk before the first value that needs it.
    const { record } = await migrateLegacyValues(rawDek, draft, null)
    setDek(await importDek(rawDek), { broadcast: true })
    setVaultRecord(record, { broadcast: true })
    return record
  } catch (err) {
    // The draft may already be on disk as `migrating` while this session still
    // believes there is no vault. That stale "null" is what turns a retry into
    // an unexplained conflict, so force the next read to hit storage — and do
    // the read here, so the UI learns what actually landed and can offer to
    // finish it rather than holding the pre-failure snapshot.
    invalidateVaultRecord()
    void ensureVaultLoaded().catch(() => undefined)
    throw err
  } finally {
    zero(rawDek)
  }
}

/** Add a second (third, …) way in. Requires proving an existing protector. */
export async function addProtector(
  unlock: UnlockInput,
  enroll: EnrollInput,
): Promise<VaultRecord> {
  const record = await ensureVaultLoaded()
  if (!record) {
    throw new VaultProtectorError('No vault on this device', 'unavailable')
  }
  const rawDek = await recoverRawDek(record, unlock)
  try {
    const protector = await buildProtector(enroll, record, rawDek)
    const next = withProtector(record, protector)
    await writeVaultRecord(next, record.revision)
    setVaultRecord(next, { broadcast: true })
    // Proving a protector is proving identity — an enrollment that left the
    // vault sealed would be a prompt for nothing.
    if (!isVaultUnlocked()) {
      setDek(await importDek(rawDek), { broadcast: true })
    }
    return next
  } finally {
    zero(rawDek)
  }
}

/**
 * Delete one protector's blob. Nothing is re-wrapped — each protector wraps
 * the same DEK independently, which is the entire reason removal is cheap.
 */
export async function removeProtector(
  id: string,
  deps: { hasValues?: () => Promise<boolean> } = {},
): Promise<VaultRecord | null> {
  const record = await ensureVaultLoaded()
  if (!record) {
    throw new VaultProtectorError('No vault on this device', 'unavailable')
  }
  // Otherwise someone who walks up to an unattended-but-locked terminal can
  // strip the passkey and leave only a password to guess.
  if (!isVaultUnlocked()) throw new VaultSealedError()
  if (!record.protectors.some((p) => p.id === id)) {
    throw new VaultProtectorError('No such protector', 'no-match')
  }

  const hasValues = deps.hasValues ?? hasVaultedValues
  if (record.protectors.length === 1 && (await hasValues())) {
    throw new VaultProtectorError(
      'This is the only way into your vault. Add another before removing it.',
      'unavailable',
    )
  }

  const next = withoutProtector(record, id)
  if (next.protectors.length === 0) {
    // Nothing left to protect and nothing left to protect it with: the vault
    // is over. Delete the record rather than leave a husk that parses as null
    // and silently downgrades the next write.
    await deleteVaultRecord()
    setVaultRecord(null, { broadcast: true })
    sealVault({ broadcast: true })
    return null
  }
  await writeVaultRecord(next, record.revision)
  setVaultRecord(next, { broadcast: true })
  return next
}

/** Open the vault for this window (and offer the key to siblings). */
export async function unlockVault(unlock: UnlockInput): Promise<void> {
  const record = await ensureVaultLoaded()
  if (!record) {
    throw new VaultProtectorError('No vault on this device', 'unavailable')
  }
  const raw = await recoverRawDek(record, unlock)
  try {
    setDek(await importDek(raw), { broadcast: true })
  } finally {
    zero(raw)
  }
}

/**
 * Rotate the vault password.
 *
 * Persists the rewrapped record and nothing else. The caller writes the lock
 * verifier AFTER this resolves — never before, and never at all if this
 * throws. A crash between the two artifacts leaves someone who can pass the
 * lock screen but not open their own keys, and there is no way back from that
 * except the destructive reset.
 */
export async function changeVaultPassword(
  oldPassword: string,
  newPassword: string,
): Promise<VaultRecord> {
  const record = await ensureVaultLoaded()
  if (!record) {
    throw new VaultProtectorError('No vault on this device', 'unavailable')
  }
  const blockedMs = blockedForMs()
  if (blockedMs > 0) {
    throw new VaultProtectorError(
      `Too many attempts. Try again in ${Math.ceil(blockedMs / 1000)}s.`,
      'unavailable',
    )
  }
  let next: VaultRecord
  try {
    next = await rewrapPasswordProtectors(record, oldPassword, newPassword)
    clearAttempts()
  } catch (err) {
    if (err instanceof VaultProtectorError && err.kind === 'wrong-password') {
      recordFailedAttempt()
    }
    throw err
  }
  await writeVaultRecord(next, record.revision)
  setVaultRecord(next, { broadcast: true })
  return next
}

/**
 * Re-run an interrupted migration. Safe to call when there is nothing to do.
 *
 * `unlock` is optional: a window that already holds the key can finish without
 * being asked for the password a second time. Without it, and sealed, this
 * throws rather than pretending there was nothing left to move.
 */
export async function finishPendingMigration(
  unlock?: UnlockInput,
): Promise<VaultRecord> {
  const record = await ensureVaultLoaded()
  if (!record) {
    throw new VaultProtectorError('No vault on this device', 'unavailable')
  }
  if (!unlock) {
    const dek = getDek()
    if (!dek) throw new VaultSealedError()
    const { record: next } = await finishMigration(dek, record)
    setVaultRecord(next, { broadcast: true })
    return next
  }
  const raw = await recoverRawDek(record, unlock)
  try {
    const dek = await importDek(raw)
    // Adopt the key BEFORE the migration: it re-reads what an earlier attempt
    // already converted, and a sealed session would fail those reads.
    setDek(dek, { broadcast: true })
    const { record: next } = await finishMigration(dek, record)
    setVaultRecord(next, { broadcast: true })
    return next
  } finally {
    zero(raw)
  }
}

/** Force the next read to hit storage — used after an out-of-band change. */
export function refreshVaultRecord(): Promise<VaultRecord | null> {
  invalidateVaultRecord()
  return ensureVaultLoaded()
}
