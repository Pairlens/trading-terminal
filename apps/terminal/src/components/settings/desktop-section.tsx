// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { AlertTriangle, Check, LogOut, Power } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  RadioGroup,
  RadioGroupItem,
} from '@pairlens/ui/components/ui/radio-group'

import type { CloseBehavior } from '@/lib/settings/close-behavior'
import { requestQuitApp } from '@/lib/settings/close-behavior'
import { useCloseBehavior } from '@/hooks/use-close-behavior'
import { isLinuxDesktop, isMacDesktop } from '@/lib/platform'

/**
 * Desktop settings — currently one decision, and a consequential one.
 *
 * The copy here has a job beyond labelling a radio: closing the last window
 * used to stop every bot, alert and in-flight workflow without saying so.
 * Whichever option is selected, the user should be able to read what keeps
 * running and what does not.
 */
export function DesktopSection() {
  const { t } = useTranslation()
  const { info, pending, refused, setBehavior } = useCloseBehavior()

  const behavior: CloseBehavior = info?.behavior ?? 'quit'
  const trayRequired = info?.trayRequired ?? !isMacDesktop
  // "No tray exists" is only a failure when background mode is the one in
  // force. Linux defaults to quit-on-close, so nothing ever tries to build a
  // tray there — reporting that as a broken tray would greet every healthy
  // Linux install with an error, and would hide the Linux caveat below.
  const trayMissing =
    behavior === 'background' && trayRequired && !info?.trayAvailable

  const options: Array<{
    value: CloseBehavior
    Icon: typeof Power
    label: string
    description: string
  }> = [
    {
      value: 'quit',
      Icon: Power,
      label: t('settings.desktop.closeBehavior.quit'),
      description: t('settings.desktop.closeBehavior.quitDescription'),
    },
    {
      value: 'background',
      Icon: LogOut,
      label: t('settings.desktop.closeBehavior.background'),
      description: trayRequired
        ? t('settings.desktop.closeBehavior.backgroundDescriptionTray')
        : t('settings.desktop.closeBehavior.backgroundDescriptionDock'),
    },
  ]

  return (
    <div className="max-w-2xl space-y-5">
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">
          {t('settings.desktop.closeBehavior.title')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.desktop.closeBehavior.description')}
        </p>

        <RadioGroup
          className="mt-4 gap-3"
          value={behavior}
          disabled={pending || !info}
          onValueChange={(value: string) => setBehavior(value as CloseBehavior)}
        >
          {options.map(({ value, Icon, label, description }) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <RadioGroupItem value={value} className="mt-0.5 sr-only" />
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">
                  {description}
                </span>
              </div>
              {behavior === value && (
                <Check className="ml-auto mt-0.5 size-4 shrink-0 text-primary" />
              )}
            </label>
          ))}
        </RadioGroup>

        <p className="mt-3 text-xs text-muted-foreground">
          {t('settings.desktop.closeBehavior.alwaysQuitsNote')}
        </p>

        {/* Only Linux can plausibly have no tray at all, so only Linux gets
            warned in advance. Everywhere else the affordance is guaranteed. */}
        {isLinuxDesktop && !trayMissing && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('settings.desktop.closeBehavior.trayNeeded')}
          </p>
        )}

        {(trayMissing || refused) && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{t('settings.desktop.closeBehavior.trayUnavailable')}</span>
          </p>
        )}
      </section>

      {/* macOS already has ⌘Q in the app menu; a second Quit button there would
          be redundant. Windows/Linux ship without a window menu, so this (and
          Ctrl+Q) is how an explicit quit is reachable at all. */}
      {!isMacDesktop && <QuitCard />}
    </div>
  )
}

function QuitCard() {
  const { t } = useTranslation()

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium">
            {t('settings.desktop.quit.title')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('settings.desktop.quit.description')}
          </p>
        </div>
        {/* The armed-bots confirmation lives in the global <QuitConfirm />, so
            this button and the Ctrl+Q accelerator cannot drift apart. */}
        <Button size="sm" variant="outline" onClick={() => requestQuitApp()}>
          <Power className="size-4" />
          {t('settings.desktop.quit.button')}
        </Button>
      </div>
    </section>
  )
}
