// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldAlert } from 'lucide-react'

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
import type { ReactNode } from 'react'

type ConsentTarget = { name: string; author?: string }

type Pending = ConsentTarget & { resolve: (granted: boolean) => void }

/**
 * Shared "grant full trust?" consent flow. `requestFullTrust({ name })` returns
 * a promise that resolves to the user's decision; render `dialog` somewhere in
 * the tree. Full trust means the plugin runs in the main app realm with no
 * sandbox — the warning spells out exactly what that exposes.
 */
export function useFullTrustConsent(): {
  requestFullTrust: (target: ConsentTarget) => Promise<boolean>
  dialog: ReactNode
} {
  const { t } = useTranslation()
  const [pending, setPending] = useState<Pending | null>(null)
  // Track the live pending consent so we can resolve it if the component
  // unmounts mid-flow (otherwise the caller's `await` would hang forever).
  const pendingRef = useRef<Pending | null>(null)
  pendingRef.current = pending

  const requestFullTrust = useCallback(
    (target: ConsentTarget) =>
      new Promise<boolean>((resolve) => {
        // Supersede any earlier prompt so its awaiter doesn't hang.
        pendingRef.current?.resolve(false)
        setPending({ ...target, resolve })
      }),
    [],
  )

  const settle = useCallback((granted: boolean) => {
    pendingRef.current?.resolve(granted)
    pendingRef.current = null
    setPending(null)
  }, [])

  useEffect(
    () => () => {
      // Unmounted with a decision outstanding → treat as declined.
      pendingRef.current?.resolve(false)
      pendingRef.current = null
    },
    [],
  )

  const dialog = (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) settle(false)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-500" />
            {t('pluginStore.fullTrust.title', { name: pending?.name ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('pluginStore.fullTrust.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t('pluginStore.fullTrust.itCan')}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>{t('pluginStore.fullTrust.grantPlugins')}</li>
            <li>{t('pluginStore.fullTrust.grantCredentials')}</li>
            <li>{t('pluginStore.fullTrust.grantTrading')}</li>
          </ul>
          {/* Two keys, not a concatenated tail: the author clause carries the
              sentence's subject in several languages, so it cannot be bolted
              on after a full stop. */}
          <p className="text-muted-foreground">
            {pending?.author
              ? t('pluginStore.fullTrust.trustNoteAuthor', {
                  author: pending.author,
                })
              : t('pluginStore.fullTrust.trustNote')}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className="bg-amber-500 text-black hover:bg-amber-400"
          >
            {t('pluginStore.fullTrust.grant')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { requestFullTrust, dialog }
}
