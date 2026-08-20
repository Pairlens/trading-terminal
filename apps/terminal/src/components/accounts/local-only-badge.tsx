// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'

import { HEADER_CHIP } from '@/components/chrome/header-chrome'
import { KeySecurityDialog } from '@/components/security/key-security-dialog'

// ---------------------------------------------------------------------------
// Local Only badge
//
// A clickable trust signal on the Accounts bar. The explainer it opens lives in
// components/security/key-security-dialog so the same answer is one click away
// from every other place the app makes this promise.
//
// It wears the bar's chip rather than an outlined badge: every control on a
// page bar is a borderless `--card` chip at 10px (see chrome/header-chrome),
// and a green-outlined pill was the loudest thing on a bar that draws no boxes
// at all. The promise is still green — the shield keeps the colour, which is
// what the eye reads here anyway.
// ---------------------------------------------------------------------------

export function LocalOnlyBadge() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('accounts.localOnly.badgeAria')}
        className={HEADER_CHIP}
      >
        <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        {t('accounts.localOnly.badge')}
      </button>

      <KeySecurityDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
