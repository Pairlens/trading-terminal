// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Reset and erase local data" — the only way past a forgotten lock
 * password.
 *
 * Local-only means no recovery, by construction: there is no account to
 * prove ownership against, and nothing is encrypted with the password, so
 * there is no key to escrow. The alternatives were worse. A reset that
 * clears only the verifier is a bypass, which makes the whole feature
 * theatre. A reset that clears only the secrets leaves chat history, order
 * events, balance snapshots and workspaces readable — and forces a
 * "what counts as sensitive" judgement call that rots the first time a new
 * panel stores something.
 *
 * So it erases everything this device holds: one rule, no judgement calls,
 * and bypassing the lock costs the attacker the entire setup while gaining
 * them nothing.
 *
 * Ordering matters. The lock config and its state mirror must be gone
 * BEFORE the reload, or the next boot comes up locked with no verifier —
 * the self-heal path — instead of a clean first run.
 */

import { clearLockConfig } from './lock-config'
import { clearLockState } from './lock-store'
import { postLock } from './lock-channel'
import { LOCK_VERIFIER_KEY } from './lock-verifier'
import { deleteCredential, getCredential } from '@/lib/keychain'
import { CREDENTIALS_INDEX_KEY } from '@/stores/credentials-store'
import { WALLETS_INDEX_KEY } from '@/stores/wallets-store'

/** The AES key store backing the browser-dev keychain fallback. */
const KEYCHAIN_DB = 'pairlens-keychain'

async function readIds(indexKey: string): Promise<Array<string>> {
  try {
    const raw = await getCredential(indexKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

async function forget(key: string): Promise<void> {
  try {
    await deleteCredential(key)
  } catch {
    // A keychain entry we cannot delete must not stop the rest of the wipe.
  }
}

/**
 * Erase every trace of this install and reload into first-run state.
 *
 * Does not return in practice — the last statement replaces the document.
 */
export async function resetAndErase(): Promise<void> {
  // 1. Secrets first, while the indexes still exist to enumerate them.
  const credentialIds = await readIds(CREDENTIALS_INDEX_KEY)
  for (const id of credentialIds) await forget(`cred:${id}`)

  const walletIds = await readIds(WALLETS_INDEX_KEY)
  for (const id of walletIds) {
    await forget(`wallet:${id}`)
    await forget(`wallet:${id}:secret`)
  }

  await forget(CREDENTIALS_INDEX_KEY)
  await forget(WALLETS_INDEX_KEY)
  await forget(LOCK_VERIFIER_KEY)

  // 2. Lock config and mirror before anything else local, so a failure
  //    partway through still leaves a bootable app.
  clearLockConfig()
  clearLockState()

  // 3. Everything else this app owns in localStorage — settings, layouts,
  //    chat, order journal, the onboarding flag.
  try {
    const keys: Array<string> = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('pairlens:')) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // Best effort.
  }

  // 4. The non-extractable AES key, so nothing encrypted at rest survives.
  try {
    indexedDB.deleteDatabase(KEYCHAIN_DB)
  } catch {
    // Best effort.
  }

  // 5. Tell sibling windows, which are each holding a live copy of everything
  //    just deleted and would write it all back on their next persist — and
  //    would self-heal their lock off against the verifier that is now gone.
  //    Posted after the wipe so nothing they flush lands on top of it.
  postLock({ type: 'reset', at: Date.now() })

  // 6. Back to the front door. `_terminal` sees no onboarding flag and
  //    redirects to /onboarding — fresh-install state.
  window.location.replace('/')
}
