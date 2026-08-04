// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The vault's error contract.
 *
 * Every one of these exists so a caller can tell "I cannot answer right now"
 * apart from "there is nothing there". That distinction is the whole safety
 * story: `lib/keychain.ts` already refuses to report undecryptable ciphertext
 * as absence, because callers treat absence as permission to self-heal — the
 * terminal lock disables itself, the credentials store renders an empty
 * Accounts page, a bot decides it has no live credential. A sealed vault
 * reported as `null` would trigger every one of those against data that is
 * still sitting on disk.
 *
 * So: sealed throws. Enrollment-required throws. Nothing here ever collapses
 * into a falsy return.
 */

/** The vault is enrolled but no DEK is in memory. Unlock, then retry. */
export class VaultSealedError extends Error {
  readonly code = 'vault-sealed'
  constructor(message = 'The credential vault is locked') {
    super(message)
    this.name = 'VaultSealedError'
  }
}

/**
 * A credential write was attempted before any protector exists, on a platform
 * where the vault is mandatory (the browser). Callers open enrollment and
 * retry rather than surfacing this as a failure.
 */
export class VaultEnrollmentRequiredError extends Error {
  readonly code = 'vault-enrollment-required'
  constructor(message = 'Set up a vault password or passkey first') {
    super(message)
    this.name = 'VaultEnrollmentRequiredError'
  }
}

export type VaultProtectorErrorKind =
  /** A password that did not unwrap any protector. Counts against the backoff. */
  | 'wrong-password'
  /** No WebAuthn PRF support on this browser/authenticator. */
  | 'prf-unsupported'
  /** User dismissed the platform prompt. Must NOT count against the backoff. */
  | 'cancelled'
  /** The authenticator answered with a credential this vault does not know. */
  | 'no-match'
  /** The operation needs an unlocked vault (or a protector) and has neither. */
  | 'unavailable'

export class VaultProtectorError extends Error {
  readonly code = 'vault-protector'
  constructor(
    message: string,
    readonly kind: VaultProtectorErrorKind,
  ) {
    super(message)
    this.name = 'VaultProtectorError'
  }
}

/**
 * A v1 → vault migration that could not complete. The migration is ordered so
 * that every failure leaves a readable state (see vault-migration.ts); this
 * error means "nothing was lost, try again", never "your secrets are gone".
 */
export class VaultMigrationError extends Error {
  readonly code = 'vault-migration'
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'VaultMigrationError'
  }
}

/**
 * A compare-and-set write lost to another window.
 *
 * Two windows enrolling at the same time would otherwise silently drop one
 * protector — the second write would carry a record built before the first
 * one landed. The caller re-reads and re-applies.
 */
export class VaultConflictError extends Error {
  readonly code = 'vault-conflict'
  constructor(message = 'The vault was changed in another window') {
    super(message)
    this.name = 'VaultConflictError'
  }
}

export function isVaultSealed(err: unknown): err is VaultSealedError {
  return err instanceof VaultSealedError
}

export function isVaultEnrollmentRequired(
  err: unknown,
): err is VaultEnrollmentRequiredError {
  return err instanceof VaultEnrollmentRequiredError
}
