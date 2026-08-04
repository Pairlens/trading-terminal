// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Who needs a vault, and when.
 *
 * Two platforms, two different honest answers:
 *
 *   Browser   Always. There is no OS keychain to fall back on — without a
 *             protector, an exchange API key is AES-GCM ciphertext whose key
 *             sits in the same browser profile, so anyone who copies the
 *             profile copies the keys. The first credential a user stores is
 *             therefore gated on enrolling something.
 *   Desktop   Only if the user opted in. The OS keychain already protects
 *             values at rest against exactly the attack the vault defends
 *             against, and prompting for a password the OS is already asking
 *             for would be ceremony, not security.
 *
 * The gate is enforced in the STORES (`addCredential`, `addWallet`), not in
 * the pages that call them, so a future call site — the copilot, a workspace
 * template, an onboarding step — is covered by construction rather than by
 * somebody remembering.
 */

import { VaultEnrollmentRequiredError } from './vault-errors'
import { ensureVaultLoaded } from './vault-session'
import { isStandalone } from '@/lib/platform'

/**
 * The floor for every NEW password this app mints.
 *
 * One number, because there is one password: the terminal lock and the vault
 * deliberately share a secret (a second one for the same device would be
 * remembered worse, not better), so a lock password set today is a vault
 * password the moment the user enrolls.
 *
 * Six was defensible while that password encrypted nothing and only put a
 * prompt in front of the UI. It is not defensible now: the copy the vault
 * ships promises that someone who copies this disk "gets ciphertext they
 * cannot open without your password", and that promise is made against an
 * OFFLINE attacker. PBKDF2-HMAC-SHA256 at 600k rounds multiplies their cost by
 * a constant; it does not make a six-character keyspace survive a GPU. Length
 * is the only part of this the app controls.
 *
 * So this number and `settings.security.vaultProtectsBody` move together —
 * lower it and the copy becomes false.
 *
 * Applied to new passwords only: an existing one is verified, never
 * re-measured, so nobody is locked out of a vault they already have.
 */
export const MIN_PASSWORD_LENGTH = 12

/**
 * Does a NEW credential have to land inside a vault?
 *
 * Takes `enrolled` rather than reading it, so the sync UI path (which paints
 * from `useVaultState()`) and the async write path (which awaits the record)
 * share one rule instead of two copies that can drift.
 */
export function vaultRequiredForNewCredentials(enrolled: boolean): boolean {
  if (!isStandalone) return true
  return enrolled
}

/**
 * Authoritative, and therefore async: it awaits the record.
 *
 * `isVaultEnrolled()` is deliberately false until the record has actually been
 * read (see vault-session), so a synchronous check on a cold start would claim
 * "no vault" for a user who has one — and enrollment would then fail with a
 * conflict instead of the credential simply being written. Anything that
 * decides whether to WRITE must go through here.
 */
export async function mustEnrollFirst(): Promise<boolean> {
  const record = await ensureVaultLoaded()
  if (record) return false
  return vaultRequiredForNewCredentials(false)
}

/** Throws `VaultEnrollmentRequiredError`, which callers turn into a dialog. */
export async function assertCanAddCredential(): Promise<void> {
  if (await mustEnrollFirst()) throw new VaultEnrollmentRequiredError()
}
