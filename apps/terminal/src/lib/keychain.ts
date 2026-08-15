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
 * Browser (the hosted web terminal and the mobile terminal — a shipped
 * surface, not a dev harness): every credential lives inside the vault, as
 * `enc.v2` ciphertext under the vault DEK. There is no weaker fallback and no
 * un-vaulted browser format — enrolling a protector is a precondition for the
 * first credential (vault-policy.ts), so a browser profile either holds
 * ciphertext or holds nothing.
 *
 * ── The vault layer ─────────────────────────────────────────────────
 *
 * One data key encrypts every value; each enrolled protector (a password, a
 * passkey, a Touch ID protector on macOS) wraps that same key. Two properties
 * hold and each one is load-bearing:
 *
 *   1. A sealed vault THROWS. It never reports a value as absent — callers
 *      treat absence as permission to self-heal (the terminal lock disables
 *      itself, the Accounts page renders empty, a bot decides it has no
 *      credential), and every one of those would fire against secrets that are
 *      still on disk.
 *   2. On desktop with no vault, nothing changes on the wire — the value
 *      handed to `keychain_set` is byte-identical to what it was before.
 */

import { invoke } from '@tauri-apps/api/core'

import { isStandalone } from './platform'
import { LOCK_BIOMETRIC_KEY, LOCK_VERIFIER_KEY } from './security/keys'
import {
  CIPHER_V2,
  decryptWithDek,
  encryptWithDek,
} from './security/vault/vault-crypto'
import {
  VaultEnrollmentRequiredError,
  VaultSealedError,
} from './security/vault/vault-errors'
import { ensureVaultLoaded, getDek } from './security/vault/vault-session'

/** localStorage prefix for the browser store. */
export const KEYCHAIN_STORAGE_PREFIX = 'pairlens:keychain:'

/**
 * Slots the vault must never encrypt.
 *
 * The lock verifier is how a password gets checked at the lock screen —
 * including while the vault is deliberately sealed by a hard lock. Encrypting
 * it under the vault creates a state where the user cannot answer the prompt
 * that would open the vault. One entry, and it is a fixed point of the
 * design, not an oversight.
 *
 * The lock screen's WebAuthn credential is exempt for exactly the same reason,
 * and holds even less: a credential id and a label. The secret it stands for
 * never leaves the authenticator, so there is nothing here to encrypt in the
 * first place — what matters is that the lock screen can still find it while
 * the vault is sealed.
 *
 * What the exemption costs, stated because "nothing secret in it" only covers
 * half of it: the digest is unauthenticated on disk. On desktop that is
 * unchanged — it was always plaintext in the OS keychain, which has its own
 * access control. In the browser it means someone editing the profile can
 * write a verifier for a password they choose, or simply delete it.
 *
 * That no longer opens anything where a vault password protector exists: the
 * lock screen stopped reading this slot on that path and unwraps the DEK
 * instead, which AES-GCM either authenticates or does not (see
 * `security/lock-unlock.ts`). Where no such protector exists — a desktop build
 * with no vault, or a vault opened only by passkey or Touch ID — this slot is
 * still the only artifact, and forging or deleting it still passes the screen.
 * It buys the UI lock and nothing behind it: the keys are ciphertext under a
 * protector this file cannot forge.
 */
const VAULT_EXEMPT: ReadonlySet<string> = new Set([
  LOCK_VERIFIER_KEY,
  LOCK_BIOMETRIC_KEY,
])

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

// ── Public API ───────────────────────────────────────────────────────

export async function saveCredential(
  key: string,
  value: string,
): Promise<void> {
  await writeStoredValue(key, await encodeForStorage(key, value))
}

async function encodeForStorage(key: string, value: string): Promise<string> {
  // The lock verifier is a salted PBKDF2 digest with nothing secret in it, and
  // it has to stay answerable while the vault is deliberately sealed. Stored
  // as-is on every platform — encrypting it under the vault is the one thing
  // that would make the prompt that opens the vault impossible to answer.
  if (VAULT_EXEMPT.has(key)) return value

  // A backend failure here propagates rather than falling through to a weaker
  // format: writing an un-vaulted value while a vault exists would strand it
  // outside the vault, readable by anyone who can run script.
  const record = await ensureVaultLoaded()
  if (record) {
    const dek = getDek()
    if (!dek) throw new VaultSealedError()
    return await encryptWithDek(dek, key, value)
  }
  // No vault. Desktop: plaintext into the OS keychain, the pre-opt-in default.
  // Browser: unreachable — vault-policy makes enrollment mandatory before the
  // first credential — and a silent plaintext write is the exact failure that
  // policy exists to prevent, so say so instead of doing it.
  if (!isStandalone) throw new VaultEnrollmentRequiredError()
  return value
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

  // No prefix. Desktop: an un-vaulted value straight from the OS keychain.
  // Browser: only the vault-exempt lock verifier is ever written unencrypted,
  // so anything else without a prefix was not written by us and is not ours to
  // trust — returning it would let a localStorage write become a credential.
  if (isStandalone || VAULT_EXEMPT.has(key)) return stored
  return null
}

export async function deleteCredential(key: string): Promise<void> {
  if (isStandalone) {
    await invoke('keychain_delete', { key })
    return
  }
  localStorage.removeItem(`${KEYCHAIN_STORAGE_PREFIX}${key}`)
}
