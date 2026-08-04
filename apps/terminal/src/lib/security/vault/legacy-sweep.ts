// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Startup hygiene: delete the pre-vault browser format.
 *
 * The browser once stored credentials as `enc.v1` — AES-GCM under a
 * non-extractable key kept in the `pairlens-keychain` IndexedDB database. That
 * reader is gone, so anything still in that format is unreadable bytes. The
 * product is unreleased and nobody has credentials from before the vault, so
 * these are dev leftovers rather than somebody's live API keys — and leaving
 * unreadable ciphertext in localStorage next to a vault that claims to own
 * every credential is worse than deleting it: `getCredential` would answer
 * `null` for it forever while the Accounts page shows an entry.
 *
 * One consequence needs handling rather than just documenting: a pre-change
 * dev profile stored its LOCK VERIFIER as `enc.v1` too — unconditionally, on
 * browser, whether or not a vault existed. Deleting it leaves `verifyPassword()`
 * answering `'missing'`, and the lock screen's self-heal is deliberately
 * suppressed while a password protector is enrolled (terminal-lock.tsx treats a
 * missing verifier as storage damage there). The lock would therefore stay
 * ENABLED with nothing to check against, and every non-empty string would
 * dismiss it — a security control degraded to a no-op, forever, because nothing
 * rewrites a verifier on its own.
 *
 * So the sweep turns the lock off itself when it takes the verifier. It knows
 * something the lock screen cannot: the verifier did not go missing, we removed
 * it, and there is no damage to preserve. The user sets a new lock password
 * when they want one — an honest off beats a prompt that accepts anything.
 *
 * Desktop is untouched: `enc.v1` was never written to the OS keychain.
 */

import { KEYCHAIN_STORAGE_PREFIX } from '@/lib/keychain'
import { isStandalone } from '@/lib/platform'
import { LOCK_VERIFIER_KEY } from '@/lib/security/keys'
import { setLockEnabled } from '@/lib/security/lock-config'

/** The IndexedDB database that held the pre-vault AES key. */
const LEGACY_DB = 'pairlens-keychain'
/** The pre-vault value-format discriminator. */
const LEGACY_PREFIX = 'enc.v1.'
/** The one swept slot that also has a switch pointing at it. */
const VERIFIER_SLOT = `${KEYCHAIN_STORAGE_PREFIX}${LOCK_VERIFIER_KEY}`

/**
 * Best effort, always synchronous-looking, never throws.
 *
 * Called once per window from `startVaultBootstrap()` BEFORE the session is
 * initialised, so nothing can read a value this is about to remove.
 */
export function sweepLegacyBrowserStorage(): void {
  if (isStandalone || typeof window === 'undefined') return

  let removed = 0
  try {
    const stale: Array<string> = []
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (!storageKey?.startsWith(KEYCHAIN_STORAGE_PREFIX)) continue
      if (!localStorage.getItem(storageKey)?.startsWith(LEGACY_PREFIX)) continue
      stale.push(storageKey)
    }
    for (const storageKey of stale) localStorage.removeItem(storageKey)
    removed = stale.length

    // The lock is only ever as real as the verifier behind it. Turning it off
    // here also unlocks any window already showing the overlay — `lock-store`
    // follows the config — which is the difference between "the lock is off"
    // and "the lock is on and takes any password".
    if (stale.includes(VERIFIER_SLOT)) {
      setLockEnabled(false)
      console.info(
        '[vault] the terminal lock was turned off: its stored password check predates the vault and could not be read',
      )
    }
  } catch {
    // Quota, private mode, a storage object that throws on enumeration. The
    // sweep is hygiene — never a precondition for anything below it.
  }

  try {
    // Deliberately NOT awaited: a delete blocked by another open connection
    // never settles, and startup must not wait on it.
    indexedDB.deleteDatabase(LEGACY_DB)
  } catch {
    // Best effort.
  }

  if (removed > 0) {
    console.info(
      `[vault] removed ${removed} unreadable pre-vault value(s) from this browser profile`,
    )
  }
}
