// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, Shield } from 'lucide-react'

import { cn } from '@pairlens/ui'

import { isStandalone } from '@/lib/platform'

// ---------------------------------------------------------------------------
// Stored Locally Disclosure
//
// Expanded inline where an API key is actually pasted, so the promise is
// legible at the moment it matters. The detail is platform-specific because
// the mechanism is: there is no OS keychain in a browser, and telling someone
// their key went into one when it went into a vault would be the one claim on
// this screen that is not true.
// ---------------------------------------------------------------------------

export function StoredLocallyDisclosure() {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()

  // Split the detail text around the "never" clause to bold it
  const detail = isStandalone
    ? t('accounts.storedSecurelyDetail')
    : t('accounts.storedSecurelyDetailBrowser')
  const neverClause = t('accounts.storedSecurelyNever')
  const neverIdx = detail.indexOf(neverClause)

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="w-full text-left"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Shield className="size-3 shrink-0" />
        <span>{t('accounts.storedSecurely')}</span>
        <ChevronLeft
          className={cn(
            'ml-auto size-3 transition-transform duration-200',
            expanded ? 'rotate-90' : '-rotate-90',
          )}
        />
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="disclosure"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
              {neverIdx >= 0 ? (
                <>
                  {detail.slice(0, neverIdx)}
                  <span className="font-medium text-foreground">
                    {neverClause}
                  </span>
                  {detail.slice(neverIdx + neverClause.length)}
                </>
              ) : (
                detail
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  )
}
