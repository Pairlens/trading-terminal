// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Keychain slot names owned by the security layer.
 *
 * These live in their own module for one reason: `lib/keychain.ts` needs to
 * know which slots the vault must never encrypt, and `lock-verifier.ts`
 * imports `lib/keychain.ts`. Declaring the names here breaks what would
 * otherwise be an import cycle, and keeps the two slot names that must never
 * collide with a `cred:` / `wallet:` id in one place.
 */

/** The lock password's PBKDF2 verifier. Never vault-encrypted — see keychain.ts. */
export const LOCK_VERIFIER_KEY = 'security:lock-verifier'

/**
 * The vault record (protector list + wrapped DEKs). On desktop this is an OS
 * keychain entry; in the browser the record lives in localStorage instead, so
 * it dies with the ciphertext it belongs to (see vault/vault-storage.ts).
 */
export const VAULT_RECORD_KEY = 'security:vault'
