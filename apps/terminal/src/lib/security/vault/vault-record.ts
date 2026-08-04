// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The vault record — the only thing the vault persists.
 *
 * One random 256-bit DEK encrypts every credential value. Each enrolled
 * protector (a password, a passkey) independently wraps that same DEK, so any
 * one of them opens the vault and removing one re-wraps nothing. What is on
 * disk is a list of those wrapped copies plus the parameters needed to redo
 * the derivation: salt, iteration count, IV. The KEKs themselves are never
 * stored, and the DEK is only ever on disk wrapped.
 *
 * Parsing is strict in the same way `parseVerifier` is (lock-verifier.ts): a
 * record we cannot read is a record that isn't there. That is safe here only
 * because nothing ever *deletes* on a failed parse — an unreadable record
 * means the vault reports itself unenrolled, which makes vaulted values
 * unreadable (they throw), and the user is told to fix it rather than having
 * their ciphertext quietly overwritten.
 */

import { VaultConflictError } from './vault-errors'

export const VAULT_RECORD_VERSION = 1

/** Bytes of the fixed per-vault WebAuthn PRF eval salt. */
export const PRF_SALT_BYTES = 32
/** Bytes of the stable WebAuthn `user.id` several passkeys group under. */
export const WEBAUTHN_USER_ID_BYTES = 32

export type PasswordProtector = {
  id: string
  type: 'password'
  createdAt: number
  label: string
  kdf: 'PBKDF2-SHA256'
  /** Stored per blob so the cost can be raised without invalidating anyone. */
  iterations: number
  /** base64, 16 bytes — PBKDF2 salt, reused as the HKDF salt. */
  salt: string
  /** base64, 12 bytes */
  iv: string
  /** base64 — AES-GCM(KEK, rawDEK) */
  wrapped: string
}

export type PasskeyProtector = {
  id: string
  type: 'passkey'
  createdAt: number
  label: string
  /** base64 of the raw credential id (not base64url — we never send it as JSON). */
  credentialId: string
  transports?: Array<string>
  /** base64, 32 bytes — HKDF salt for this protector. */
  salt: string
  iv: string
  wrapped: string
}

export type VaultProtector = PasswordProtector | PasskeyProtector

export type VaultRecordState = 'ready' | 'migrating'

export type VaultRecord = {
  v: 1
  /**
   * `'migrating'` means a v1 → vault migration started and did not finish.
   * The vault is fully usable in that state (both value formats read), but
   * Security settings offers to finish the job.
   */
  state: VaultRecordState
  /** Bumped on every write; the compare-and-set token for multi-window races. */
  revision: number
  /** base64, 32 bytes. Fixed for the life of the vault — the PRF eval input. */
  prfSalt: string
  /** base64, 32 bytes. Stable WebAuthn user handle. */
  webauthnUserId: string
  createdAt: number
  protectors: Array<VaultProtector>
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseProtector(raw: unknown): VaultProtector | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  const id = str(p.id)
  const label = typeof p.label === 'string' ? p.label : ''
  const salt = str(p.salt)
  const iv = str(p.iv)
  const wrapped = str(p.wrapped)
  const createdAt = num(p.createdAt) ?? 0
  if (!id || !salt || !iv || !wrapped) return null

  if (p.type === 'password') {
    const iterations = num(p.iterations)
    if (p.kdf !== 'PBKDF2-SHA256') return null
    if (iterations === null || iterations < 1) return null
    return {
      id,
      type: 'password',
      createdAt,
      label,
      kdf: 'PBKDF2-SHA256',
      iterations,
      salt,
      iv,
      wrapped,
    }
  }

  if (p.type === 'passkey') {
    const credentialId = str(p.credentialId)
    if (!credentialId) return null
    const transports = Array.isArray(p.transports)
      ? p.transports.filter((t): t is string => typeof t === 'string')
      : undefined
    return {
      id,
      type: 'passkey',
      createdAt,
      label,
      credentialId,
      ...(transports && transports.length > 0 ? { transports } : {}),
      salt,
      iv,
      wrapped,
    }
  }

  return null
}

/** Strict parse. Unknown version, missing salt, or zero protectors ⇒ null. */
export function parseVaultRecord(raw: string | null): VaultRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.v !== VAULT_RECORD_VERSION) return null
    const prfSalt = str(parsed.prfSalt)
    const webauthnUserId = str(parsed.webauthnUserId)
    if (!prfSalt || !webauthnUserId) return null
    if (!Array.isArray(parsed.protectors)) return null

    const protectors: Array<VaultProtector> = []
    for (const entry of parsed.protectors) {
      const protector = parseProtector(entry)
      // One damaged protector must not cost the user the others: a passkey
      // blob we cannot read still leaves the password blob openable.
      if (protector) protectors.push(protector)
    }
    // A record with no way in is indistinguishable from no record at all, and
    // treating it as absent is what lets enrollment start over.
    if (protectors.length === 0) return null

    const state: VaultRecordState =
      parsed.state === 'migrating' ? 'migrating' : 'ready'

    return {
      v: VAULT_RECORD_VERSION,
      state,
      revision: num(parsed.revision) ?? 0,
      prfSalt,
      webauthnUserId,
      createdAt: num(parsed.createdAt) ?? 0,
      protectors,
    }
  } catch {
    return null
  }
}

export function serializeVaultRecord(record: VaultRecord): string {
  return JSON.stringify(record)
}

/** Next revision for a compare-and-set write. */
export function bumpRevision(record: VaultRecord): VaultRecord {
  return { ...record, revision: record.revision + 1 }
}

/**
 * Throw unless `record`'s revision is the one the caller read.
 *
 * `expected === null` means "there must be no record" — the create path.
 */
export function assertRevision(
  current: VaultRecord | null,
  expected: number | null,
): void {
  if (expected === null) {
    if (current !== null) {
      throw new VaultConflictError('A vault already exists on this device')
    }
    return
  }
  if (current === null || current.revision !== expected) {
    throw new VaultConflictError()
  }
}

export function withProtector(
  record: VaultRecord,
  protector: VaultProtector,
): VaultRecord {
  return bumpRevision({
    ...record,
    protectors: [...record.protectors, protector],
  })
}

export function withoutProtector(record: VaultRecord, id: string): VaultRecord {
  return bumpRevision({
    ...record,
    protectors: record.protectors.filter((p) => p.id !== id),
  })
}

export function passwordProtectors(
  record: VaultRecord,
): Array<PasswordProtector> {
  return record.protectors.filter(
    (p): p is PasswordProtector => p.type === 'password',
  )
}

export function passkeyProtectors(
  record: VaultRecord,
): Array<PasskeyProtector> {
  return record.protectors.filter(
    (p): p is PasskeyProtector => p.type === 'passkey',
  )
}
