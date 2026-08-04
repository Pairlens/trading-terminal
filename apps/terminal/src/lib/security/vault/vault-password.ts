// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The password protector.
 *
 * PBKDF2-HMAC-SHA256 at 600k, then HKDF to the KEK. `SubtleCrypto` offers no
 * scrypt or Argon2 and this feature is not worth a WASM dependency — the same
 * trade the lock verifier already made, and iterations travel with the blob
 * for the same reason: the cost can be raised later without invalidating
 * anyone's password.
 *
 * Unlock tries every enrolled password protector. A user may have set one up
 * on each of two devices that later shared a record, and GCM authentication
 * makes "wrong password" and "this blob belongs to a different password"
 * indistinguishable — which is exactly what we want to tell the user anyway.
 */

import {
  KEK_INFO_PASSWORD,
  PASSWORD_SALT_BYTES,
  VAULT_PBKDF2_ITERATIONS,
  deriveKek,
  derivePasswordMaterial,
  fromBase64,
  importDek,
  protectorAad,
  randomBytes,
  toBase64,
  unwrapRawDek,
  wrapDek,
  zero,
} from './vault-crypto'
import { VAULT_RECORD_VERSION, passwordProtectors } from './vault-record'
import { VaultProtectorError } from './vault-errors'
import type { PasswordProtector, VaultRecord } from './vault-record'

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : toBase64(randomBytes(16))
}

async function kekFor(
  password: string,
  saltB64: string,
  iterations: number,
): Promise<CryptoKey> {
  const salt = fromBase64(saltB64)
  const material = await derivePasswordMaterial(password, salt, iterations)
  try {
    return await deriveKek(material, salt, KEK_INFO_PASSWORD)
  } finally {
    zero(material)
  }
}

/**
 * Wrap the DEK under a new password.
 *
 * `rawDek` stays the caller's to zeroize — enrollment holds it across several
 * protectors and the wipe belongs at the end of that, not here.
 */
export async function enrollPasswordProtector(
  rawDek: Uint8Array<ArrayBuffer>,
  password: string,
  opts: { label: string; iterations?: number } = { label: 'Password' },
): Promise<PasswordProtector> {
  const iterations = opts.iterations ?? VAULT_PBKDF2_ITERATIONS
  const salt = randomBytes(PASSWORD_SALT_BYTES)
  const id = newId()
  const material = await derivePasswordMaterial(password, salt, iterations)
  let kek: CryptoKey
  try {
    kek = await deriveKek(material, salt, KEK_INFO_PASSWORD)
  } finally {
    zero(material)
  }
  const aad = protectorAad(VAULT_RECORD_VERSION, { id, type: 'password' })
  const { iv, wrapped } = await wrapDek(kek, rawDek, aad)
  return {
    id,
    type: 'password',
    createdAt: Date.now(),
    label: opts.label,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    wrapped: toBase64(wrapped),
  }
}

/**
 * Recover the raw DEK. Callers MUST zeroize what they get back — this exists
 * for enrollment and rotation, which have to re-wrap under a second KEK.
 */
export async function recoverRawDekWithPassword(
  record: VaultRecord,
  password: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const candidates = passwordProtectors(record)
  if (candidates.length === 0) {
    throw new VaultProtectorError(
      'No password is enrolled on this vault',
      'unavailable',
    )
  }
  for (const protector of candidates) {
    const kek = await kekFor(password, protector.salt, protector.iterations)
    try {
      return await unwrapRawDek(
        kek,
        fromBase64(protector.iv),
        fromBase64(protector.wrapped),
        protectorAad(VAULT_RECORD_VERSION, protector),
      )
    } catch {
      // GCM said no. Could be the wrong password, could be a blob belonging to
      // a different one — try the next, and if none match say "wrong password"
      // because from where the user is standing that is the truth.
    }
  }
  throw new VaultProtectorError('Wrong password', 'wrong-password')
}

/** Unlock to a non-extractable runtime DEK. The raw bytes never escape. */
export async function unlockWithPassword(
  record: VaultRecord,
  password: string,
): Promise<CryptoKey> {
  const raw = await recoverRawDekWithPassword(record, password)
  try {
    return await importDek(raw)
  } finally {
    zero(raw)
  }
}

/**
 * Re-wrap every password protector under a new password. Pure — the caller
 * persists.
 *
 * Ordering is the caller's problem and it matters: the vault record must be
 * written BEFORE the lock verifier, and neither written at all if this throws.
 * A crash between the two artifacts leaves a user who can pass the lock screen
 * but not open their own keys.
 */
export async function rewrapPasswordProtectors(
  record: VaultRecord,
  oldPassword: string,
  newPassword: string,
): Promise<VaultRecord> {
  const raw = await recoverRawDekWithPassword(record, oldPassword)
  try {
    const rewrapped: Array<PasswordProtector> = []
    for (const protector of passwordProtectors(record)) {
      rewrapped.push(
        await enrollPasswordProtector(raw, newPassword, {
          label: protector.label,
          iterations: protector.iterations,
        }),
      )
    }
    const replacedIds = new Set(passwordProtectors(record).map((p) => p.id))
    return {
      ...record,
      revision: record.revision + 1,
      protectors: [
        ...record.protectors.filter((p) => !replacedIds.has(p.id)),
        ...rewrapped,
      ],
    }
  } finally {
    zero(raw)
  }
}
