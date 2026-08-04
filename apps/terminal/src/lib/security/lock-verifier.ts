// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The lock password's verifier.
 *
 * Nothing is encrypted with this password — it gates a screen, not the data
 * (see the Security section copy). What we store is a salted PBKDF2 digest
 * so the password itself is never at rest, kept in the same place as every
 * other secret: the OS keychain on desktop, AES-GCM-encrypted localStorage
 * in browser dev builds (lib/keychain.ts).
 *
 * PBKDF2-HMAC-SHA256 because `SubtleCrypto` offers no scrypt or Argon2 and
 * this feature is not worth a WASM dependency. Iterations are stored with
 * the verifier so the cost can be raised later without invalidating
 * existing passwords.
 */

import { LOCK_VERIFIER_KEY } from './keys'
import { deleteCredential, getCredential, saveCredential } from '@/lib/keychain'

/**
 * Keychain slot. Follows the `cred:<id>` / `wallet:<id>` convention.
 *
 * Declared in `./keys` and re-exported here: `lib/keychain.ts` needs the name
 * to exempt this slot from vault encryption, and it cannot import this module
 * (this module imports it).
 */
export { LOCK_VERIFIER_KEY }

/** OWASP-current for PBKDF2-HMAC-SHA256 at the time of writing. */
export const PBKDF2_ITERATIONS = 600_000

const SALT_BYTES = 16
const HASH_BYTES = 32

export type LockVerifier = {
  v: 1
  kdf: 'PBKDF2-SHA256'
  iterations: number
  /** base64, 16 random bytes */
  salt: string
  /** base64, 32 derived bytes */
  hash: string
}

export type VerifyResult = 'ok' | 'wrong' | 'missing'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Length-independent equality. Worth the three lines even though an
 * attacker holding the device has better options than timing this.
 */
export function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function deriveHash(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BYTES * 8,
  )
  return new Uint8Array(bits)
}

export async function createVerifier(
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<LockVerifier> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await deriveHash(password, salt, iterations)
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    hash: toBase64(hash),
  }
}

/** Strict parse — a verifier we can't read is a verifier that isn't there. */
export function parseVerifier(raw: string | null): LockVerifier | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LockVerifier>
    if (parsed.v !== 1) return null
    if (parsed.kdf !== 'PBKDF2-SHA256') return null
    if (typeof parsed.salt !== 'string' || typeof parsed.hash !== 'string') {
      return null
    }
    if (typeof parsed.iterations !== 'number' || parsed.iterations < 1) {
      return null
    }
    return {
      v: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: parsed.iterations,
      salt: parsed.salt,
      hash: parsed.hash,
    }
  } catch {
    return null
  }
}

export async function saveVerifier(verifier: LockVerifier): Promise<void> {
  await saveCredential(LOCK_VERIFIER_KEY, JSON.stringify(verifier))
}

export async function clearVerifier(): Promise<void> {
  await deleteCredential(LOCK_VERIFIER_KEY)
}

export async function loadVerifier(): Promise<LockVerifier | null> {
  return parseVerifier(await getCredential(LOCK_VERIFIER_KEY))
}

/**
 * Check a password against the stored verifier.
 *
 * Three outcomes, and the difference matters: `'missing'` means the keychain
 * answered and there is nothing there (the caller self-heals by disabling the
 * lock), while a *throw* means the keychain backend itself is unavailable —
 * a locked login keychain, D-Bus down — and the caller must stay locked and
 * offer a retry.
 */
export async function verifyPassword(password: string): Promise<VerifyResult> {
  const verifier = await loadVerifier()
  if (!verifier) return 'missing'
  const derived = await deriveHash(
    password,
    fromBase64(verifier.salt),
    verifier.iterations,
  )
  return constantTimeEquals(derived, fromBase64(verifier.hash)) ? 'ok' : 'wrong'
}
