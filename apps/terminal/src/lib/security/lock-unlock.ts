// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Answering the lock password, with the vault as the authority wherever there
 * is one.
 *
 * WHY THIS EXISTS. The lock verifier is a salted PBKDF2 digest stored in the
 * clear — it has to be, because the lock screen must be answerable while the
 * vault is deliberately sealed, so it is the one slot the vault never
 * encrypts. Nothing is secret in a digest, but in a browser nothing protects
 * its INTEGRITY either: someone who can edit the profile on disk plants a
 * verifier for a password they choose and walks through. Worse, `verifyPassword`
 * answers `'missing'` when the slot is simply gone, and both lock surfaces
 * treated that as "self-heal and let them in" — so DELETING the file was
 * enough, without even planting anything.
 *
 * THE FIX is not to harden the verifier, which cannot be hardened where it
 * lives. It is to stop asking it. `readVaultRecordRaw()` on browser is a bare
 * `localStorage.getItem`, so the vault record is fully readable while sealed,
 * which means a password can be checked the only way that actually proves
 * anything: try to unwrap the data key with it. AES-GCM either authenticates
 * or it does not. Nothing on disk can be edited to make it say yes.
 *
 * SO: when the vault has a password protector, the unwrap is the whole test
 * and the verifier is never read. Planting one changes nothing; deleting one
 * changes nothing. That is also why the old `vault-diverged` state is gone for
 * password unlocks — there are no longer two artifacts to disagree.
 *
 * WHEN THERE IS NO VAULT PASSWORD PROTECTOR the verifier is all there is, and
 * the old behaviour is kept deliberately: a desktop build with no vault, or a
 * vault opened only by passkey or Touch ID. `'missing'` still self-heals there,
 * because anyone who can delete the slot already owns the account and bricking
 * the app to spite them is the worse trade — and critically, there are no vault
 * keys sitting behind that door to lose.
 */

import { hasPasswordProtector } from './vault/vault-session'
import { VaultProtectorError } from './vault/vault-errors'
import { recordFailedAttempt } from './lock-store'

/**
 * `'ok'` unlocks. `'wrong'` has ALREADY been counted against the shared
 * backoff — see below. `'missing'` is reachable ONLY without a vault password
 * protector, and tells the caller to self-heal. A THROW means the backend
 * itself is unavailable (a locked login keychain, D-Bus down) and the caller
 * must stay locked and offer a retry.
 */
export type LockUnlockResult = 'ok' | 'wrong' | 'missing'

/**
 * Bookkeeping lives here, so callers must NOT record attempts themselves.
 *
 * The two paths below count differently through no fault of the caller:
 * `recoverRawDek` inside the vault already records a wrong password (and
 * clears the counter on success), while `verifyPassword` records nothing. A
 * caller doing its own bookkeeping would double-count every wrong password on
 * the vault path and halve the real lockout — and it is ONE counter shared
 * with the vault's own prompts, so the error compounds across surfaces.
 */
export async function attemptLockUnlock(
  password: string,
): Promise<LockUnlockResult> {
  // Asked of the RECORD, never of `useVaultState()`: that snapshot answers
  // from the untrusted UI mirror until the record has loaded, and a stale
  // `false` here would route a real vault user back to the verifier — the
  // exact door this closes. A backend that will not answer throws, and the
  // caller stays locked.
  if (await hasPasswordProtector()) {
    const { unlockVault } = await import('./vault/vault-protectors')
    try {
      await unlockVault({ kind: 'password', password })
      // One password, both doors — and now in one step rather than two, so a
      // screen unlock can no longer succeed while the keys stay sealed.
      return 'ok'
    } catch (err) {
      // `recoverRawDek` already recorded this one against the backoff.
      if (err instanceof VaultProtectorError && err.kind === 'wrong-password') {
        return 'wrong'
      }
      // Anything else is a real failure (storage unreachable, a damaged
      // record). Staying locked is the safe answer; the caller says so.
      throw err
    }
  }

  const { verifyPassword } = await import('./lock-verifier')
  const result = await verifyPassword(password)
  if (result === 'wrong') recordFailedAttempt()
  return result
}
