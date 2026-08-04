// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Credential storage.
 *
 * Desktop (Tauri): stored in the OS keychain (macOS Keychain / Windows
 * Credential Manager / Linux Secret Service) via the `keychain_*` commands
 * in apps/desktop/src-tauri, backed by the `keyring` crate. Keychain
 * failures propagate — desktop never silently falls back to weaker storage.
 *
 * Browser (dev/testing builds): values are encrypted at rest with
 * AES-256-GCM. The key is generated non-extractable and lives only in
 * IndexedDB, so secrets can't be read out of localStorage on disk or the
 * key exfiltrated as text. This does NOT defend against same-origin script
 * execution (XSS) — any code running in the origin can call decrypt. The
 * OS keychain on desktop is the supported home for live-trading secrets.
 *
 * ── The vault layer ─────────────────────────────────────────────────
 *
 * Once the user enrolls a protector (a password, a passkey), values are
 * encrypted under a data key that only those protectors can unwrap, and the
 * format discriminator changes from `enc.v1.` to `enc.v2.`. Three properties
 * hold across that change and each one is load-bearing:
 *
 *   1. A sealed vault THROWS. It never reports a value as absent — see
 *      `decryptValue` below for why absence is dangerous.
 *   2. The `enc.v1` reader stays alive on browser permanently. A migration
 *      interrupted halfway leaves a mix of both formats, and the v1 values in
 *      that mix are somebody's live API keys.
 *   3. On desktop with no vault, nothing changes on the wire — the value
 *      handed to `keychain_set` is byte-identical to what it was before.
 */

import { invoke } from '@tauri-apps/api/core'

import { isStandalone } from './platform'
import { LOCK_VERIFIER_KEY } from './security/keys'
import {
  CIPHER_V2,
  decryptWithDek,
  encryptWithDek,
} from './security/vault/vault-crypto'
import { VaultSealedError } from './security/vault/vault-errors'
import { ensureVaultLoaded, getDek } from './security/vault/vault-session'

/** localStorage prefix for the browser fallback. */
export const KEYCHAIN_STORAGE_PREFIX = 'pairlens:keychain:'
/** Legacy (pre-vault) browser format: AES-GCM under the IndexedDB key. */
export const CIPHER_V1 = 'enc.v1.'

/**
 * Slots the vault must never encrypt.
 *
 * The lock verifier is how a password gets checked at the lock screen —
 * including while the vault is deliberately sealed by a hard lock. Encrypting
 * it under the vault creates a state where the user cannot answer the prompt
 * that would open the vault. One entry, and it is a fixed point of the
 * design, not an oversight.
 */
const VAULT_EXEMPT: ReadonlySet<string> = new Set([LOCK_VERIFIER_KEY])

// ── Browser fallback: AES-GCM with a non-extractable IndexedDB key ──

const DB_NAME = 'pairlens-keychain'
const DB_STORE = 'keys'
const AES_KEY_ID = 'aes-gcm-256'

let cachedKey: Promise<CryptoKey> | null = null

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function openDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, 1)
  request.onupgradeneeded = () => {
    request.result.createObjectStore(DB_STORE)
  }
  return idbRequest(request)
}

async function loadOrCreateAesKey(): Promise<CryptoKey> {
  const db = await openDb()
  try {
    const existing = await idbRequest<CryptoKey | undefined>(
      db
        .transaction(DB_STORE, 'readonly')
        .objectStore(DB_STORE)
        .get(AES_KEY_ID),
    )
    if (existing) return existing
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable — raw key material can never be read back out
      ['encrypt', 'decrypt'],
    )
    await idbRequest(
      db
        .transaction(DB_STORE, 'readwrite')
        .objectStore(DB_STORE)
        .put(key, AES_KEY_ID),
    )
    return key
  } finally {
    db.close()
  }
}

function getAesKey(): Promise<CryptoKey> {
  cachedKey ??= loadOrCreateAesKey().catch((err: unknown) => {
    cachedKey = null
    throw err
  })
  return cachedKey
}

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

async function encryptValue(plaintext: string): Promise<string> {
  const key = await getAesKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return `${CIPHER_V1}${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`
}

async function decryptValue(stored: string): Promise<string | null> {
  // A value without the cipher prefix predates encryption at rest and is
  // unrecoverable — treat as absent.
  if (!stored.startsWith(CIPHER_V1)) return null
  const [ivB64, dataB64] = stored.slice(CIPHER_V1.length).split('.')
  try {
    if (!ivB64 || !dataB64) throw new Error('malformed ciphertext')
    const key = await getAesKey()
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivB64) },
      key,
      fromBase64(dataB64),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    // Ciphertext we hold but cannot open — the IndexedDB key was deleted, or
    // the value was tampered with. NOT the same as "there is nothing stored",
    // and the difference is load-bearing: callers treat absence as "self-heal"
    // (the terminal lock disables itself and lets you in), so reporting this
    // as absence would turn one devtools click on the `pairlens-keychain`
    // database into a lock bypass with every byte of local data still there.
    // Throwing puts it where it belongs — with the desktop keychain backend
    // failures, which stay locked and offer a retry.
    throw new Error('Stored credential could not be decrypted')
  }
}

// ── Raw storage ──────────────────────────────────────────────────────

/** @internal Raw slot read — no format handling. Used by the vault migration. */
export async function readStoredValue(key: string): Promise<string | null> {
  if (isStandalone) {
    return await invoke<string | null>('keychain_get', { key })
  }
  return localStorage.getItem(`${KEYCHAIN_STORAGE_PREFIX}${key}`)
}

/** @internal Raw slot write — no format handling. Used by the vault migration. */
export async function writeStoredValue(
  key: string,
  stored: string,
): Promise<void> {
  if (isStandalone) {
    await invoke('keychain_set', { key, value: stored })
    return
  }
  localStorage.setItem(`${KEYCHAIN_STORAGE_PREFIX}${key}`, stored)
}

/**
 * @internal Every browser slot still holding a legacy `enc.v1` value.
 *
 * Enumeration only works in the browser — localStorage is enumerable and the
 * OS keychain has no `list` command. That is fine: `enc.v1` is a browser-only
 * format, so on desktop the answer is genuinely "none".
 */
export function listLegacyEntries(): Array<{ key: string; stored: string }> {
  if (isStandalone || typeof window === 'undefined') return []
  const entries: Array<{ key: string; stored: string }> = []
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i)
    if (!storageKey?.startsWith(KEYCHAIN_STORAGE_PREFIX)) continue
    const key = storageKey.slice(KEYCHAIN_STORAGE_PREFIX.length)
    if (VAULT_EXEMPT.has(key)) continue
    const stored = localStorage.getItem(storageKey)
    if (stored?.startsWith(CIPHER_V1)) entries.push({ key, stored })
  }
  return entries
}

/** @internal Decrypt a legacy value with the IndexedDB key. Throws if it cannot. */
export async function decryptLegacyValue(stored: string): Promise<string> {
  const plaintext = await decryptValue(stored)
  if (plaintext === null) throw new Error('Not a legacy encrypted value')
  return plaintext
}

// ── Public API ───────────────────────────────────────────────────────

export async function saveCredential(
  key: string,
  value: string,
): Promise<void> {
  await writeStoredValue(key, await encodeForStorage(key, value))
}

async function encodeForStorage(key: string, value: string): Promise<string> {
  if (VAULT_EXEMPT.has(key)) {
    return isStandalone ? value : await encryptValue(value)
  }
  // A backend failure here propagates rather than falling through to the
  // pre-vault format: writing an `enc.v1` value while a vault exists would
  // strand it outside the vault, readable by anyone who can run script.
  const record = await ensureVaultLoaded()
  if (record) {
    const dek = getDek()
    if (!dek) throw new VaultSealedError()
    return await encryptWithDek(dek, key, value)
  }
  return isStandalone ? value : await encryptValue(value)
}

export async function getCredential(key: string): Promise<string | null> {
  const stored = await readStoredValue(key)
  if (stored === null) return null

  if (stored.startsWith(CIPHER_V2)) {
    // Enrolled-but-sealed, or a record that went missing while its ciphertext
    // stayed. Both are "come back when you can open this", never "empty".
    await ensureVaultLoaded()
    const dek = getDek()
    if (!dek) throw new VaultSealedError()
    return await decryptWithDek(dek, key, stored)
  }

  // Legacy browser format. Kept alive permanently — an interrupted migration
  // leaves live keys in this format, and the reader is the only way back to
  // them. Throws rather than returning null when it cannot decrypt.
  if (stored.startsWith(CIPHER_V1)) return await decryptValue(stored)

  // No prefix: plaintext from the desktop keychain, or a browser value that
  // predates encryption at rest and is unrecoverable.
  return isStandalone ? stored : null
}

export async function deleteCredential(key: string): Promise<void> {
  if (isStandalone) {
    await invoke('keychain_delete', { key })
    return
  }
  localStorage.removeItem(`${KEYCHAIN_STORAGE_PREFIX}${key}`)
}
