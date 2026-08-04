// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import { useTranslation } from 'react-i18next'

/**
 * What the vault does, and — more importantly — what it does not.
 *
 * Shared between enrollment and Security settings so the honest half can never
 * be present in one place and quietly missing from the other. The ceiling
 * paragraph is on screen, not behind a disclosure: a user who over-trusts this
 * feature will keep more on a shared machine than they should, and the moment
 * they are most likely to over-trust it is the moment they turn it on.
 */
export function VaultCeiling({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={className ?? 'space-y-2 rounded-lg bg-muted/50 p-3'}>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {t('settings.security.vaultProtectsBody')}
      </p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {t('settings.security.vaultCeiling')}
      </p>
    </div>
  )
}
