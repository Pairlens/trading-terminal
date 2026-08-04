// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Wiring the vault into the app, once per window.
 *
 * Two jobs, both of which have to happen somewhere that is not a store:
 *
 *   1. `initVaultSession()` — read the record, and if a sibling window already
 *      holds the data key, ask for it. Without this a second window opened
 *      after the first one unlocked would stay sealed forever: the
 *      `vault:unlocked` announcement it would have followed was broadcast
 *      before it was listening.
 *   2. Reload the credential stores on the sealed → unlocked edge. Those
 *      stores latch a `sealed` status rather than pretending to be empty, and
 *      something has to notice when that stops being true.
 *
 * Order-independent on purpose: whether the handshake resolves before or after
 * the stores first load, the unlock edge below re-reads them either way.
 *
 * Not module-level side effects — the stores stay importable in tests without
 * a BroadcastChannel attaching itself.
 */

import {
  getVaultState,
  initVaultSession,
  subscribeVault,
} from './vault-session'
import { sweepLegacyBrowserStorage } from './legacy-sweep'
import { onWindowLeader } from '@/lib/window-leader'
import { useVaultAttentionStore } from '@/stores/vault-attention-store'

let started = false
let wasUnlocked = false
let notifiedParked = false

/**
 * One OS notification when live bots first park, from the leader window only.
 *
 * Leader-gated for the same reason alerts are: three open windows must not
 * produce three notifications. Fires once per park episode — re-arms when the
 * set empties, so unlocking and re-sealing notifies again, but a second bot
 * parking in the same episode does not.
 */
function watchParkedBots(): void {
  onWindowLeader((isLeader) => {
    if (!isLeader) return
    useVaultAttentionStore.subscribe((state) => {
      if (state.parked.length === 0) {
        notifiedParked = false
        return
      }
      if (notifiedParked) return
      notifiedParked = true
      // Imported on demand: this module is pulled in by the bot runtime,
      // which must not drag the notification stack and the whole i18n
      // catalog behind it just to exist.
      void (async () => {
        try {
          const [{ sendOsNotification }, i18n] = await Promise.all([
            import('@/lib/notifications/platform-notify'),
            import('@/lib/i18n').then((m) => m.default),
          ])
          await sendOsNotification(
            i18n.t('security.vault.botsPausedTitle'),
            i18n.t('security.vault.botsPausedBody'),
          )
        } catch (err) {
          // A notification that cannot be delivered must never disturb bot
          // state. The in-app banner is the surface that actually matters;
          // this is the belt on top of it.
          console.warn('[vault] could not announce parked bots:', err)
        }
      })()
    })
  })
}

async function reloadCredentialStores(): Promise<void> {
  const [{ useCredentialsStore }, { useWalletsStore }] = await Promise.all([
    import('@/stores/credentials-store'),
    import('@/stores/wallets-store'),
  ])
  await Promise.all([
    useCredentialsStore.getState().reload(),
    useWalletsStore.getState().reload(),
  ])
}

/** Idempotent. Returns the unsubscribe for the state watcher. */
export function startVaultBootstrap(): () => void {
  if (started || typeof window === 'undefined') return () => {}
  started = true

  wasUnlocked = getVaultState().unlocked
  const unsubscribe = subscribeVault(() => {
    const { unlocked } = getVaultState()
    if (unlocked === wasUnlocked) return
    wasUnlocked = unlocked
    // Only the opening edge matters. A seal leaves the already-loaded
    // credentials in memory, which is the same data the user is looking at —
    // dropping them would blank the Accounts page for no security gain, since
    // the ciphertext on disk is what the seal actually protects.
    if (unlocked) void reloadCredentialStores()
  })

  watchParkedBots()
  // Before the session reads anything: the pre-vault browser format has no
  // reader any more, so what it leaves behind is unopenable bytes sitting in
  // the slots the vault is about to claim.
  sweepLegacyBrowserStorage()
  void initVaultSession()

  return () => {
    started = false
    unsubscribe()
  }
}
