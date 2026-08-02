// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Eye,
  HardDrive,
  Lock,
  ShieldCheck,
  SquareArrowOutUpRight,
} from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import { isStandalone } from '@/lib/platform'

const SOURCE_URL = 'https://github.com/Pairlens/trading-terminal'

// ---------------------------------------------------------------------------
// Local Only badge + explainer
//
// A prominent, clickable trust signal in the Accounts header. Clicking it
// opens a plain-language dialog explaining why local-only credential storage
// matters — written for non-technical users.
// ---------------------------------------------------------------------------

/** Name the OS secure vault for the user's platform, for a personal touch. */
function useOsVaultName(): string {
  const { t } = useTranslation()
  if (typeof navigator !== 'undefined') {
    const ua = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`
    if (/Mac|iPhone|iPad/i.test(ua)) return t('accounts.localOnly.vaultMac')
    if (/Win/i.test(ua)) return t('accounts.localOnly.vaultWindows')
    if (/Linux|X11|CrOS/i.test(ua)) return t('accounts.localOnly.vaultLinux')
  }
  return t('accounts.localOnly.vaultGeneric')
}

export function LocalOnlyBadge() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const vault = useOsVaultName()

  const points = [
    {
      icon: HardDrive,
      title: t('accounts.localOnly.deviceTitle'),
      body: t('accounts.localOnly.deviceBody'),
    },
    {
      icon: Lock,
      title: t('accounts.localOnly.osTitle'),
      body: isStandalone
        ? t('accounts.localOnly.osBodyDesktop', { vault })
        : t('accounts.localOnly.osBodyBrowser', { vault }),
    },
    {
      icon: Eye,
      title: t('accounts.localOnly.openSourceTitle'),
      body: t('accounts.localOnly.openSourceBody'),
    },
  ]

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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400">
              <ShieldCheck className="size-5" />
            </div>
            <DialogTitle className="pt-1">
              {t('accounts.localOnly.title')}
            </DialogTitle>
            <DialogDescription>
              {t('accounts.localOnly.subtitle')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {points.map((point) => (
              <div key={point.title} className="flex gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
                  <point.icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium">{point.title}</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {point.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg border border-border py-2.5',
              'text-sm font-medium transition-colors hover:border-primary/30 hover:bg-accent/50',
            )}
          >
            <SquareArrowOutUpRight className="size-3.5" />
            {t('accounts.localOnly.viewSource')}
          </a>

          <p className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-[13px] leading-relaxed text-emerald-800 dark:text-emerald-200">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            <span>{t('accounts.localOnly.reassurance')}</span>
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
