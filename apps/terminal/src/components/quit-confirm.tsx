// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'

import { quitApp, setQuitConfirmHandler } from '@/lib/settings/close-behavior'
import { isStandalone } from '@/lib/platform'
import { useBotsStore } from '@/stores/bots-store'

/**
 * The one place that asks "really quit?".
 *
 * Mounted in the root shell so it is reachable from every quit affordance —
 * the Desktop settings button, the tray, and the Ctrl+Q accelerator, which
 * fires regardless of what has focus and so can be triggered by a stray chord
 * typed into a chat box or a bot script. Armed bots are managing real
 * positions and quitting stops them dead; an unarmed app deserves not to be
 * asked at all.
 *
 * Reads the bot count imperatively at prompt time rather than subscribing:
 * this sits in the root shell, and the store ticks on every fill.
 */
export function QuitConfirm() {
  const { t } = useTranslation()
  const [armed, setArmed] = React.useState(0)

  React.useEffect(() => {
    if (!isStandalone) return
    setQuitConfirmHandler(() => {
      const count = useBotsStore
        .getState()
        .bots.filter((bot) => bot.enabled).length
      if (count > 0) setArmed(count)
      else void quitApp()
    })
    return () => setQuitConfirmHandler(null)
  }, [])

  return (
    <AlertDialog
      open={armed > 0}
      onOpenChange={(next: boolean) => {
        if (!next) setArmed(0)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('settings.desktop.quit.confirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.desktop.quit.confirmDescription', { count: armed })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setArmed(0)
              void quitApp()
            }}
          >
            {t('settings.desktop.quit.confirmAction')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
