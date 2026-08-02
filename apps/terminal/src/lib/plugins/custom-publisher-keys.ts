// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * User-added ("custom") plugin publisher keys.
 *
 * Lets a user trust additional publishers at runtime — the enterprise /
 * self-hosted registry case — without rebuilding the terminal. Adding a key is
 * a deliberate, dangerous grant: plugins signed by it can request full trust
 * and everything that implies, so the settings UI routes every add through an
 * explicit consent dialog showing the key's fingerprint.
 *
 * Storage is intentionally LOCAL-ONLY (localStorage; the key is on the
 * sync-coordinator blocklist): trust anchors must never ride along with cloud
 * account sync, or a hijacked account could push a malicious publisher key to
 * every signed-in device.
 *
 * Built-in keys always win: a custom key can never shadow an official or dev
 * key id (enforced both at add time and at merge time in
 * pinned-publisher-keys.ts).
 */
import {
  COMMUNITY_PUBLISHER_KEYS,
  DEV_COMMUNITY_PUBLISHER_KEY_ID,
  DEV_PUBLISHER_KEY_ID,
  OFFICIAL_PUBLISHER_KEYS,
} from '@pairlens/shared/publisher-keys'
import {
  base64ToBytes,
  importPublisherPublicKey,
} from '@pairlens/shared/plugin-signing'

/** localStorage key — shared with usePersistedState('custom-publisher-keys'). */
export const CUSTOM_PUBLISHER_KEYS_STORAGE_KEY =
  'pairlens:custom-publisher-keys'

export type CustomPublisherKey = {
  /** Stable id referenced by registry entries as `publisherKeyId`. */
  id: string
  /** base64 of the raw 32-byte Ed25519 public key. */
  publicKey: string
  /** ISO timestamp of when the user added the key. */
  addedAt: string
}

/** Read the user's custom publisher keys. SSR-safe; returns [] on any error. */
export function getCustomPublisherKeys(): Array<CustomPublisherKey> {
  if (typeof window === 'undefined' || !('localStorage' in globalThis)) {
    return []
  }
  try {
    const raw = localStorage.getItem(CUSTOM_PUBLISHER_KEYS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is CustomPublisherKey =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as CustomPublisherKey).id === 'string' &&
        typeof (e as CustomPublisherKey).publicKey === 'string',
    )
  } catch {
    return []
  }
}

/** True when the id belongs to a built-in (official, community, or dev) key. */
export function isReservedPublisherKeyId(id: string): boolean {
  return (
    id === DEV_PUBLISHER_KEY_ID ||
    id === DEV_COMMUNITY_PUBLISHER_KEY_ID ||
    id in OFFICIAL_PUBLISHER_KEYS ||
    id in COMMUNITY_PUBLISHER_KEYS
  )
}

const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/

/** Validate a publisher key id: kebab-case, 2–64 chars, not a built-in id. */
export function validatePublisherKeyId(
  id: string,
): 'ok' | 'invalid-format' | 'reserved' {
  if (!KEY_ID_PATTERN.test(id)) return 'invalid-format'
  if (isReservedPublisherKeyId(id)) return 'reserved'
  return 'ok'
}

/**
 * Validate that a string is a base64-encoded raw 32-byte Ed25519 public key
 * that WebCrypto will actually accept for verification.
 */
export async function validatePublisherPublicKey(
  publicKeyB64: string,
): Promise<boolean> {
  try {
    const bytes = base64ToBytes(publicKeyB64.trim())
    if (bytes.length !== 32) return false
    await importPublisherPublicKey(publicKeyB64.trim())
    return true
  } catch {
    return false
  }
}

/**
 * Short SHA-256 fingerprint of the raw key bytes, for human verification in
 * the consent dialog (e.g. "3f2a 9c01 77de b4e2"). Publishers should share
 * this out-of-band so users can compare before trusting.
 */
export async function publisherKeyFingerprint(
  publicKeyB64: string,
): Promise<string> {
  const bytes = base64ToBytes(publicKeyB64.trim())
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', bytes as BufferSource),
  )
  const hex = Array.from(digest.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex.replace(/(.{4})(?=.)/g, '$1 ')
}
