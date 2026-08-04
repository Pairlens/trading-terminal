// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Hard lock — the one action that drops the data key.
 *
 * The ordinary terminal lock covers the screen and leaves armed bots trading,
 * which is deliberate (see vault-session.ts). This is the other choice, for
 * when the honest answer is "stop everything": it seals the vault first, so
 * the key is gone before the overlay even paints, and then locks the screen.
 *
 * Live automations stop. The confirm dialog has to say that in the body, not
 * a footnote — a user who reaches for this because someone is standing behind
 * them should not discover the consequence afterwards.
 *
 * Lives in its own module rather than in vault-session so that lock-store can
 * depend on the vault (it needs the sealed state for the before-trade gate)
 * without the vault depending back on it.
 */

import { lockNow } from '../lock-store'
import { sealVault } from './vault-session'

export function hardLock(): void {
  // Seal first: if `lockNow` is a no-op because the screen lock is switched
  // off, the vault still ends up sealed, which is what was asked for.
  sealVault({ broadcast: true })
  lockNow('hard')
}
