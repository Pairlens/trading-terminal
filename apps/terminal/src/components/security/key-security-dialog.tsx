// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import {
  Eye,
  HardDrive,
  KeyRound,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  SquareArrowOutUpRight,
  TriangleAlert,
} from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import { isStandalone } from '@/lib/platform'
import { useVaultState } from '@/lib/security/vault/vault-session'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'

const SOURCE_URL = 'https://github.com/Pairlens/trading-terminal'

// ---------------------------------------------------------------------------
// Key security explainer
//
// One dialog, opened from anywhere the app claims your keys are safe — the
// Accounts header badge and the trade ticket's connect gate today. Making the
// claim clickable everywhere it appears is the point: a promise the user
// cannot interrogate is just a slogan.
//
// It describes THIS device rather than the product in general. Which layers
// are actually in play differs by platform and by whether a vault is enrolled,
// and a dialog that described the best case regardless would be marketing
// wearing a shield icon.
//
// It also ends on the ceiling, deliberately. The same honesty the Security
// settings pane commits to (settings.security.vaultCeiling and friends): what
// the encryption does NOT defend against belongs next to what it does, or the
// user calibrates their risk against a promise the code never made.
// ---------------------------------------------------------------------------

/** Name the OS secure store for the user's platform, for a personal touch. */
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

export function KeySecurityDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const vault = useVaultState()
  const osVault = useOsVaultName()

  // Painted from the UI mirror on purpose — `enrolled` is a hint until the
  // record loads, and this dialog only describes state, never gates on it.
  const vaulted = vault.enrolled

  const status = isStandalone
    ? vaulted
      ? t('accounts.localOnly.statusDesktopVault', { vault: osVault })
      : t('accounts.localOnly.statusDesktop', { vault: osVault })
    : vaulted
      ? t('accounts.localOnly.statusBrowserVault')
      : t('accounts.localOnly.statusBrowserNone')

  const encryptionBody = isStandalone
    ? vaulted
      ? t('accounts.localOnly.osBodyDesktopVault', { vault: osVault })
      : t('accounts.localOnly.osBodyDesktop', { vault: osVault })
    : t('accounts.localOnly.osBodyBrowser')

  const points = [
    {
      icon: HardDrive,
      title: t('accounts.localOnly.deviceTitle'),
      body: t('accounts.localOnly.deviceBody'),
    },
    {
      icon: Lock,
      title: t('accounts.localOnly.osTitle'),
      body: encryptionBody,
    },
    {
      icon: KeyRound,
      title: t('accounts.localOnly.unlockTitle'),
      body: t('accounts.localOnly.unlockBody'),
    },
    {
      icon: Eye,
      title: t('accounts.localOnly.openSourceTitle'),
      body: t('accounts.localOnly.openSourceBody'),
    },
  ]

  return (
    /*
      Header and footer are pinned, only the middle scrolls. Not just polish:
      the dialog is taller than a short viewport, and Base UI puts initial
      focus on the first tabbable element — the footer button. With one tall
      scroll container that focus drags the whole dialog to the bottom, so it
      opens on the fine print instead of on the title.
    */
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
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

        <div className="-mr-1 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-[13px] leading-relaxed text-emerald-800 dark:text-emerald-200">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>{status}</span>
          </div>

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

          {/*
          The ceiling. Amber rather than red: this is the honest shape of the
          protection, not a fault, and a red block here would read as something
          being wrong with the user's setup.
        */}
          <div className="space-y-1.5 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-amber-700 dark:text-amber-300">
              <TriangleAlert className="size-3.5 shrink-0" />
              {t('accounts.localOnly.limitsTitle')}
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {t('accounts.localOnly.limitsRunning')}
            </p>
            {vaulted && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {t('accounts.localOnly.limitsNoRecovery')}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              onOpenChange(false)
              useSettingsDialogStore.getState().open('security')
            }}
          >
            <SlidersHorizontal className="size-3.5" />
            {t('accounts.localOnly.openSecurity')}
          </Button>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg border border-border py-2.5',
              'text-sm font-medium transition-colors hover:border-primary/30 hover:bg-accent/50',
            )}
          >
            <SquareArrowOutUpRight className="size-3.5" />
            {t('accounts.localOnly.viewSource')}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
