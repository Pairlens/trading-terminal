// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'

import { Badge } from '@pairlens/ui/components/ui/badge'

import { KeySecurityDialog } from '@/components/security/key-security-dialog'

// ---------------------------------------------------------------------------
// Local Only badge
//
// A prominent, clickable trust signal in the Accounts header. The explainer it
// opens lives in components/security/key-security-dialog so the same answer is
// one click away from every other place the app makes this promise.
// ---------------------------------------------------------------------------

export function LocalOnlyBadge() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Badge
        variant="outline"
        render={<button type="button" />}
        onClick={() => setOpen(true)}
        aria-label={t('accounts.localOnly.badgeAria')}
        className="h-6 cursor-pointer gap-1.5 border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-700 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/20 dark:text-emerald-300"
      >
        <ShieldCheck className="size-3.5" />
        {t('accounts.localOnly.badge')}
      </Badge>

      <KeySecurityDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
