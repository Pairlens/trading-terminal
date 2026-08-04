// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import { Fingerprint, LockKeyhole, ScanFace } from 'lucide-react'
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
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import { Spinner } from '@pairlens/ui/components/ui/spinner'

import { useBlockedSeconds } from './use-lock-attempts'
import { useVaultState } from '@/lib/security/vault/vault-session'
import { VaultProtectorError } from '@/lib/security/vault/vault-errors'
import { track } from '@/lib/analytics-events'

/**
 * Opening the vault when the screen is NOT locked.
 *
 * Two distinct states share one vocabulary: the screen lock covers the UI, the
 * vault seals the keys. A hard lock does both; unlocking the screen with the
 * shared password does both; but a vault that is sealed while the terminal is
 * perfectly usable — after a reload, or a hard lock the user dismissed — needs
 * its own small prompt rather than dropping a full-screen overlay over a
 * working terminal.
 *
 * The attempt backoff is the lock's, deliberately: one counter, one lockout.
 * The copy says so, because being told "try again in 90s" here after fumbling
 * a password at the lock screen otherwise reads as a bug.
 */
export function VaultUnlockDialog({
  open,
  onOpenChange,
  onUnlocked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUnlocked?: () => void
}) {
  const { t } = useTranslation()
  const vault = useVaultState()
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const blockedSeconds = useBlockedSeconds()

  React.useEffect(() => {
    if (!open) {
      setPassword('')
      setError(null)
      setBusy(false)
    }
  }, [open])

  const describe = (
    err: unknown,
    kind: 'password' | 'passkey' | 'biometric',
  ): string => {
    if (err instanceof VaultProtectorError) {
      switch (err.kind) {
        case 'wrong-password':
          return t('security.lock.wrongPassword')
        case 'cancelled':
          // Both prompts cancel the same way; only the caller knows which one
          // the user actually dismissed, and naming the wrong one reads as a
          // bug in a dialog that is already asking for trust.
          return kind === 'biometric'
            ? t('security.vault.biometricCancelled')
            : t('security.vault.passkeyCancelled')
        case 'no-match':
          return t('security.vault.passkeyNoMatch')
        case 'prf-unsupported':
          return t('security.vault.passkeyUnsupportedHint')
        case 'invalidated':
          // Not "wrong" and not "try again": nothing the user does at this
          // prompt will ever open it, so the copy has to point at Settings.
          return t('security.vault.biometricInvalidated')
        default:
          return err.message
      }
    }
    return err instanceof Error ? err.message : String(err)
  }

  const run = async (kind: 'password' | 'passkey' | 'biometric') => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { unlockVault } =
        await import('@/lib/security/vault/vault-protectors')
      await unlockVault(
        kind === 'password'
          ? { kind: 'password', password }
          : kind === 'biometric'
            ? {
                kind: 'biometric',
                reason: t('security.vault.biometricPromptReason'),
              }
            : { kind: 'passkey' },
      )
      track('security_vault_unlocked', { protector: kind })
      setPassword('')
      onOpenChange(false)
      onUnlocked?.()
    } catch (err) {
      setError(describe(err, kind))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? () => undefined : onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 ring-inset">
            <LockKeyhole className="size-5" />
          </div>
          <DialogTitle className="pt-1">
            {t('security.vault.unlockTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('security.vault.unlockSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {vault.hasPasskey && (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy || blockedSeconds > 0}
            onClick={() => void run('passkey')}
          >
            <Fingerprint className="size-4" />
            {t('security.vault.unlockWithPasskey')}
          </Button>
        )}

        {/* Shown on `hasBiometric`, not on a platform check: the record is what
            knows whether there is an OS key to read, and a button offered
            without one is a prompt that cannot appear. Disabled during a
            lockout for the same reason the passkey button is — a penalty
            earned with wrong passwords must not be walked around. */}
        {vault.hasBiometric && (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy || blockedSeconds > 0}
            onClick={() => void run('biometric')}
          >
            <ScanFace className="size-4" />
            {t('security.vault.unlockWithBiometric')}
          </Button>
        )}

        {vault.hasPassword && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              void run('password')
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="pairlens-vault-unlock" className="sr-only">
                {t('security.lock.passwordLabel')}
              </Label>
              <Input
                autoFocus
                id="pairlens-vault-unlock"
                type="password"
                autoComplete="current-password"
                placeholder={t('security.lock.passwordLabel')}
                value={password}
                disabled={busy}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError(null)
                }}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !password || blockedSeconds > 0}
            >
              {busy && <Spinner />}
              {busy
                ? t('security.vault.unlocking')
                : t('security.vault.unlockWithPassword')}
            </Button>
          </form>
        )}

        {blockedSeconds > 0 && (
          <p className="text-destructive text-xs">
            {t('security.lock.tooManyAttempts', { seconds: blockedSeconds })}
          </p>
        )}
        {error && blockedSeconds === 0 && (
          <p className="text-destructive text-xs">{error}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {t('settings.security.vaultSharedBackoff')}
        </p>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
