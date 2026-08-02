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
 */

import { invoke } from '@tauri-apps/api/core'

import { isStandalone } from './platform'

const STORAGE_PREFIX = 'pairlens:keychain:'
const CIPHER_PREFIX = 'enc.v1.'

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
  return `${CIPHER_PREFIX}${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`
}

async function decryptValue(stored: string): Promise<string | null> {
  // Values without the cipher prefix (or that fail to decrypt, e.g. the
  // IndexedDB key was cleared) are unrecoverable — treat as absent.
  if (!stored.startsWith(CIPHER_PREFIX)) return null
  const [ivB64, dataB64] = stored.slice(CIPHER_PREFIX.length).split('.')
  if (!ivB64 || !dataB64) return null
  try {
    const key = await getAesKey()
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivB64) },
      key,
      fromBase64(dataB64),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

// ── Public API ───────────────────────────────────────────────────────

export async function saveCredential(
  key: string,
  value: string,
): Promise<void> {
  if (isStandalone) {
    await invoke('keychain_set', { key, value })
    return
  }
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, await encryptValue(value))
}

export async function getCredential(key: string): Promise<string | null> {
  if (isStandalone) {
    return await invoke<string | null>('keychain_get', { key })
  }
  const stored = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
  if (stored === null) return null
  return decryptValue(stored)
}

export async function deleteCredential(key: string): Promise<void> {
  if (isStandalone) {
    await invoke('keychain_delete', { key })
    return
  }
  localStorage.removeItem(`${STORAGE_PREFIX}${key}`)
}
