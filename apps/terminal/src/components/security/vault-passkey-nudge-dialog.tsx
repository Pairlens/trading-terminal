// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import { Fingerprint } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import { VaultEnrollmentDialog } from './vault-enrollment-dialog'
import { track } from '@/lib/analytics-events'

/**
 * Offered once, at the moment it becomes worth something: a venue was just
 * connected whose MARKET DATA needs the vault open, so from here on every
 * reload of a browser tab costs a password before the chart will draw.
 *
 * A passkey is the one protector that answers the screen lock and the vault in
 * a single gesture, so this is not a security upsell — the vault is already
 * protected by whatever started it. It is the difference between typing a
 * password to look at a price and touching a sensor. Which is why it is asked
 * HERE and not in Settings: the cost has just been created, and nobody goes
 * looking through Settings for a friction they have not met yet.
 *
 * Dismissal is honest. "Not now" is a real answer, the nudge does not return
 * for the same vault, and Settings → Security carries the same row forever.
 *
 * The desktop app never sees this: `tauri://localhost` is not a WebAuthn
 * origin, so the probe that gates this reports no passkey support there, and
 * desktop keys live in the OS keychain rather than the vault anyway.
 */
export function VaultPasskeyNudgeDialog({
  open,
  onOpenChange,
  venueLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The venue whose connection prompted this, named in the copy. */
  venueLabel: string
}) {
  const { t } = useTranslation()
  const [enrollOpen, setEnrollOpen] = React.useState(false)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 ring-inset">
              <Fingerprint className="size-5" />
            </div>
            <DialogTitle className="pt-1">
              {t('security.vault.passkeyNudgeTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('security.vault.passkeyNudgeBody', { venue: venueLabel })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                track('security_passkey_nudge', { action: 'dismissed' })
                onOpenChange(false)
              }}
            >
              {t('security.vault.passkeyNudgeDismiss')}
            </Button>
            <Button
              onClick={() => {
                track('security_passkey_nudge', { action: 'accepted' })
                onOpenChange(false)
                setEnrollOpen(true)
              }}
            >
              <Fingerprint className="size-4" />
              {t('security.vault.passkeyNudgeAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The real flow, unchanged: adding a protector means proving one, and
          this dialog already owns that step. Duplicating it here to save a
          click is how the two copies drift. */}
      <VaultEnrollmentDialog open={enrollOpen} onOpenChange={setEnrollOpen} />
    </>
  )
}
