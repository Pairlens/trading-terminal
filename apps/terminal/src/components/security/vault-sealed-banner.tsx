// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import { LockKeyhole, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'

import { VaultUnlockDialog } from './vault-unlock-dialog'
import { useVaultState } from '@/lib/security/vault/vault-session'
import { useVaultAttentionStore } from '@/stores/vault-attention-store'

/**
 * "Live bots are paused — unlock to resume."
 *
 * The whole point of parking bots instead of disabling them is that the state
 * is recoverable; the whole point of this banner is that the state is VISIBLE.
 * A parked bot nobody knows about is functionally the same as a disabled one.
 *
 * Only renders when bots are actually parked — a sealed vault with nothing
 * armed is not a problem and does not deserve a banner. Dismissible, and a
 * newly parked bot brings it back (see the store).
 */
export function VaultSealedBanner() {
  const { t } = useTranslation()
  const vault = useVaultState()
  const parked = useVaultAttentionStore((s) => s.parked)
  const dismissed = useVaultAttentionStore((s) => s.dismissed)
  const dismiss = useVaultAttentionStore((s) => s.dismiss)
  const [unlockOpen, setUnlockOpen] = React.useState(false)

  const show = vault.enrolled && !vault.unlocked && parked.length > 0
  if (!show || dismissed) return null

  return (
    <>
      <div className="flex items-start gap-3 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-amber-900 dark:text-amber-100">
            {t('security.vault.sealedBanner', { count: parked.length })}
          </p>
          <p className="text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/80">
            {t('security.vault.botsPausedBody')}
          </p>
        </div>
        <Button size="sm" onClick={() => setUnlockOpen(true)}>
          {t('security.vault.sealedBannerAction')}
        </Button>
        <button
          type="button"
          aria-label={t('common.dismiss', 'Dismiss')}
          className="text-amber-700/70 transition-colors hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100"
          onClick={dismiss}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <VaultUnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} />
    </>
  )
}
