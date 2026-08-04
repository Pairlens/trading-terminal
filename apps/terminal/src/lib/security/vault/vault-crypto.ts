// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Vault primitives. Pure crypto — no storage, no DOM state, no React.
 *
 *   password ─PBKDF2-SHA256(salt, iters)→ 32B ─HKDF-SHA256(salt, INFO_PW)→ KEK
 *   passkey  ─WebAuthn PRF(prfSalt)─────→ 32B ─HKDF-SHA256(salt, INFO_PK)→ KEK
 *   KEK ─AES-256-GCM(iv, aad)→ wrapped DEK
 *   raw DEK ─importKey(extractable=false)→ the runtime DEK
 *   DEK ─AES-256-GCM(iv, aad=key name)→ every credential value
 *
 * Why encrypt the raw DEK bytes instead of `subtle.wrapKey`: `wrapKey`
 * requires the wrapped key to be `extractable: true`, which would leave a
 * permanently extractable DEK sitting in memory for the life of the session.
 * Generating raw bytes, GCM-encrypting them, and re-importing the result
 * non-extractable gives the same wrapping with a runtime key that cannot be
 * read back out. The raw bytes exist only inside enrollment and unlock, and
 * are zeroized in a `finally`.
 *
 * "Zeroized" is best-effort and worth saying out loud: the byte arrays are
 * overwritten, but the password itself arrives as a JS string and cannot be.
 *
 * Domain separation from the lock verifier is structural on three axes — a
 * different KDF chain (PBKDF2 *then* HKDF, vs PBKDF2 alone), an independent
 * random salt per protector, and an HKDF `info` label. Same password, same
 * salt bytes: still a different key. The KEK is never stored either way.
 */

import type { VaultProtector } from './vault-record'

export const DEK_BYTES = 32
export const KEK_INFO_PASSWORD = 'pairlens/vault/kek/password/v1'
export const KEK_INFO_PASSKEY = 'pairlens/vault/kek/passkey/v1'

/** OWASP-current for PBKDF2-HMAC-SHA256, matching lock-verifier.ts. */
export const VAULT_PBKDF2_ITERATIONS = 600_000
export const PASSWORD_SALT_BYTES = 16
export const PASSKEY_SALT_BYTES = 32
export const IV_BYTES = 12

/** Value-format discriminator for DEK-encrypted credential values. */
export const CIPHER_V2 = 'enc.v2.'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** Best-effort wipe. See the module note. */
export function zero(bytes: Uint8Array): void {
  bytes.fill(0)
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** A fresh DEK. Caller owns the bytes and must zeroize them. */
export function generateRawDek(): Uint8Array<ArrayBuffer> {
  return randomBytes(DEK_BYTES)
}

/**
 * PBKDF2-HMAC-SHA256 → 32 bytes of key material.
 *
 * Deliberately not the KEK: the HKDF step that follows is what separates this
 * from the lock verifier's digest of the same password.
 */
export async function derivePasswordMaterial(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    DEK_BYTES * 8,
  )
  return new Uint8Array(bits)
}

/** HKDF-SHA256 over a 32-byte secret → a non-extractable AES-GCM KEK. */
export async function deriveKek(
  secret: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: string,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Additional authenticated data binding a wrapped DEK to one protector entry
 * in one record version. A blob cannot be moved between protector entries,
 * duplicated under a second id, or replayed from a record of another version.
 */
export function protectorAad(
  recordVersion: number,
  protector: Pick<VaultProtector, 'id' | 'type'>,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    `pairlens/vault/${recordVersion}/${protector.type}/${protector.id}`,
  )
}

/**
 * AAD binding a credential value to its keychain slot. Ciphertext stored for
 * `cred:abc` cannot be renamed onto `wallet:x:secret` — a swap that would
 * otherwise let someone with write access to localStorage point a connector
 * at a different exchange's key.
 */
export function valueAad(keyName: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`pairlens/vault/value/v2/${keyName}`)
}

export async function wrapDek(
  kek: CryptoKey,
  rawDek: Uint8Array<ArrayBuffer>,
  aad: Uint8Array<ArrayBuffer>,
): Promise<{ iv: Uint8Array<ArrayBuffer>; wrapped: Uint8Array<ArrayBuffer> }> {
  const iv = randomBytes(IV_BYTES)
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    kek,
    rawDek,
  )
  return { iv, wrapped: new Uint8Array(wrapped) }
}

/**
 * Decrypt a wrapped DEK back to raw bytes.
 *
 * Callers that only need to use the key should prefer `unwrapDek`, which
 * never hands the bytes out. This exists for enrollment and rotation, where a
 * second protector has to wrap the same DEK — and those callers must zeroize.
 */
export async function unwrapRawDek(
  kek: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  wrapped: Uint8Array<ArrayBuffer>,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    kek,
    wrapped,
  )
  return new Uint8Array(raw)
}

/** Import raw DEK bytes as the runtime key. Non-extractable, always. */
export async function importDek(
  rawDek: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawDek, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** Unwrap straight to a non-extractable runtime key; zeroizes in between. */
export async function unwrapDek(
  kek: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  wrapped: Uint8Array<ArrayBuffer>,
  aad: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const raw = await unwrapRawDek(kek, iv, wrapped, aad)
  try {
    return await importDek(raw)
  } finally {
    zero(raw)
  }
}

export async function encryptWithDek(
  dek: CryptoKey,
  keyName: string,
  plaintext: string,
): Promise<string> {
  const iv = randomBytes(IV_BYTES)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: valueAad(keyName) },
    dek,
    encoder.encode(plaintext),
  )
  return `${CIPHER_V2}${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`
}

/**
 * Decrypt an `enc.v2` value.
 *
 * Throws on anything it cannot open, for the same reason `decryptValue` in
 * lib/keychain.ts throws: ciphertext we hold but cannot read is not the same
 * as nothing being stored, and callers self-heal on absence.
 */
export async function decryptWithDek(
  dek: CryptoKey,
  keyName: string,
  stored: string,
): Promise<string> {
  if (!stored.startsWith(CIPHER_V2)) {
    throw new Error('Not a vault-encrypted value')
  }
  const [ivB64, dataB64] = stored.slice(CIPHER_V2.length).split('.')
  try {
    if (!ivB64 || !dataB64) throw new Error('malformed ciphertext')
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(ivB64),
        additionalData: valueAad(keyName),
      },
      dek,
      fromBase64(dataB64),
    )
    return decoder.decode(plaintext)
  } catch {
    throw new Error('Stored credential could not be decrypted')
  }
}
