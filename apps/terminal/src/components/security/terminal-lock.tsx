// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import { LockKeyhole, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import { Spinner } from '@pairlens/ui/components/ui/spinner'

import {
  blockedForMs,
  cancelTradeChallenge,
  getLockState,
  passTradeChallenge,
  recordFailedAttempt,
  subscribeLock,
  unlockNow,
  useLockState,
} from '@/lib/security/lock-store'
import { setLockEnabled } from '@/lib/security/lock-config'
import { track } from '@/lib/analytics-events'

/** The literal a user types to confirm the destructive reset. Not localized
 * on purpose — a fixed token is unambiguous in every language. */
const RESET_PHRASE = 'RESET'

/** Removed as soon as React owns the screen. See __root.tsx's shield script. */
function dismissPrePaintShield(): void {
  document.getElementById('pairlens-lock-shield')?.remove()
}

/**
 * The lock surfaces.
 *
 * Mounted in the root shell ALONGSIDE the routed children, never instead of
 * them: `closeSplashScreen()` only runs when `_terminal` mounts, so a lock
 * that replaced the app would leave the desktop build stuck behind its
 * native splash. Rendering on top also means bots, alert rules and market
 * streams keep running while locked, and unlocking is instantaneous.
 */
export function TerminalLock() {
  const state = useLockState()

  React.useLayoutEffect(() => {
    // NOT `state.mode`: the hydration render always commits `unlocked`
    // (useLockState passes `() => UNLOCKED` as its server snapshot), so
    // trusting the rendered value here strips the shield one commit before
    // the store swaps in the real `locked` snapshot — which is the whole
    // frame of live balances the shield exists to cover. Ask the store.
    // The locked branch keeps the shield until LockOverlay's own DOM is
    // committed; by then there is a password prompt to look at instead of a
    // black rectangle.
    if (getLockState().mode !== 'locked') dismissPrePaintShield()
  }, [state.mode])

  if (state.mode === 'unlocked') return null
  if (state.mode === 'challenge') return <TradeChallengeDialog />
  return <LockOverlay reason={state.reason} />
}

// ── Shared password field behaviour ──────────────────────────────────

type VerifyState = 'idle' | 'checking' | 'wrong' | 'unavailable'

/**
 * Seconds left on the brute-force lockout. Ticks on a plain interval and
 * setState-bails when the value hasn't changed, so an unblocked overlay
 * re-renders zero times.
 */
function useBlockedSeconds(): number {
  const [seconds, setSeconds] = React.useState(() =>
    Math.max(0, Math.ceil(blockedForMs() / 1000)),
  )
  React.useEffect(() => {
    const sync = () => setSeconds(Math.max(0, Math.ceil(blockedForMs() / 1000)))
    // Another window's failed attempt counts against this one too.
    const unsubscribe = subscribeLock(sync)
    const timer = setInterval(sync, 500)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [])
  return seconds
}

// ── Full-screen lock ─────────────────────────────────────────────────

function LockOverlay({ reason }: { reason: string }) {
  const { t } = useTranslation()
  const [password, setPassword] = React.useState('')
  const [status, setStatus] = React.useState<VerifyState>('idle')
  const [resetOpen, setResetOpen] = React.useState(false)
  const blockedSeconds = useBlockedSeconds()

  // The overlay's DOM (dialog portal included) is committed by the time a
  // layout effect runs, and this frame has not painted yet — so handing the
  // screen over here is seamless. It is also the only thing that removes the
  // shield on the locked path: on a boot that client-renders instead of
  // hydrating, the first commit is already `locked`, and without this the
  // opaque `html::before` would hide AND hit-block the password prompt until
  // the 8s watchdog fired.
  React.useLayoutEffect(() => {
    dismissPrePaintShield()
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (status === 'checking' || blockedSeconds > 0 || !password) return
    setStatus('checking')
    try {
      // PBKDF2 and the reset routine are both pulled on demand — neither
      // belongs in the root bundle.
      const { verifyPassword } = await import('@/lib/security/lock-verifier')
      const result = await verifyPassword(password)
      if (result === 'ok') {
        setPassword('')
        setStatus('idle')
        // Also clears the attempt counter, in every window.
        unlockNow()
        return
      }
      if (result === 'missing') {
        // The keychain answered and there is nothing there: the entry was
        // deleted out from under us (keychain reset, cleared browser
        // storage). Anyone who can do that already owns the account, so
        // bricking the app to spite them is the worse trade — self-heal.
        setLockEnabled(false)
        setPassword('')
        setStatus('idle')
        unlockNow()
        return
      }
      recordFailedAttempt()
      setStatus('wrong')
    } catch {
      // The keychain BACKEND failed (locked login keychain, D-Bus down).
      // Distinct from 'missing': stay locked and offer a retry.
      setStatus('unavailable')
    }
  }

  return (
    // Controlled `open` with a no-op change handler: Escape, outside press
    // and every other dismissal reason resolve to "stay open".
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        // Opaque and full-bleed on purpose: the terminal is fully rendered
        // behind this, and balances must not be legible through a blur.
        className="bg-background inset-0 top-0 left-0 h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none p-0 ring-0 sm:max-w-none"
      >
        <div className="flex h-full w-full flex-col items-center justify-center px-6">
          <div className="w-full max-w-sm">
            <div className="flex items-center gap-2">
              <LockKeyhole className="size-4 text-muted-foreground" />
              <span className="font-serif text-lg font-semibold tracking-[-0.01em] text-foreground">
                Pairlens
              </span>
            </div>

            <DialogTitle className="mt-6 font-serif text-2xl font-semibold tracking-[-0.02em]">
              {t('security.lock.title')}
            </DialogTitle>
            <DialogDescription className="mt-1.5">
              {t(`security.lock.reason.${reason}`, {
                defaultValue: t('security.lock.subtitle'),
              })}
            </DialogDescription>

            <form className="mt-6 space-y-3" onSubmit={submit}>
              <Label htmlFor="pairlens-lock-password" className="sr-only">
                {t('security.lock.passwordLabel')}
              </Label>
              <Input
                autoFocus
                id="pairlens-lock-password"
                type="password"
                autoComplete="current-password"
                placeholder={t('security.lock.passwordLabel')}
                value={password}
                disabled={status === 'checking'}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (status === 'wrong') setStatus('idle')
                }}
              />

              {status === 'wrong' && blockedSeconds === 0 && (
                <p className="text-destructive text-xs">
                  {t('security.lock.wrongPassword')}
                </p>
              )}
              {blockedSeconds > 0 && (
                <p className="text-destructive text-xs">
                  {t('security.lock.tooManyAttempts', {
                    seconds: blockedSeconds,
                  })}
                </p>
              )}
              {status === 'unavailable' && (
                <p className="text-destructive text-xs">
                  {t('security.lock.keychainUnavailable')}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  status === 'checking' || blockedSeconds > 0 || !password
                }
              >
                {status === 'checking' && <Spinner />}
                {status === 'checking'
                  ? t('security.lock.unlocking')
                  : t('security.lock.unlock')}
              </Button>
            </form>

            <button
              type="button"
              className="text-muted-foreground hover:text-foreground mt-4 text-xs underline underline-offset-4"
              onClick={() => setResetOpen(true)}
            >
              {t('security.lock.forgot')}
            </button>
          </div>
        </div>

        <ResetDialog open={resetOpen} onOpenChange={setResetOpen} />
      </DialogContent>
    </Dialog>
  )
}

// ── Forgotten password: erase this device ────────────────────────────

function ResetDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [phrase, setPhrase] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const confirm = async () => {
    setBusy(true)
    track('security_lock_reset')
    const { resetAndErase } = await import('@/lib/security/lock-reset')
    await resetAndErase()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="text-destructive size-4" />
            {t('settings.security.resetConfirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.security.resetConfirmBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="pairlens-lock-reset-phrase" className="text-xs">
            {t('settings.security.resetConfirmPhrase', {
              phrase: RESET_PHRASE,
            })}
          </Label>
          <Input
            id="pairlens-lock-reset-phrase"
            value={phrase}
            autoComplete="off"
            onChange={(event) => setPhrase(event.target.value)}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t('common.cancel')}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction: that closes the dialog on click, and
              this one must stay put while the erase runs. */}
          <Button
            variant="destructive"
            disabled={busy || phrase.trim() !== RESET_PHRASE}
            onClick={() => void confirm()}
          >
            {busy && <Spinner />}
            {t('settings.security.resetButton')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── Before-trade identity check ──────────────────────────────────────

/**
 * A normal small modal, not the full-screen lock: gating one order should
 * not tear the whole UI down.
 */
function TradeChallengeDialog() {
  const { t } = useTranslation()
  const [password, setPassword] = React.useState('')
  const [status, setStatus] = React.useState<VerifyState>('idle')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (status === 'checking' || !password) return
    setStatus('checking')
    try {
      const { verifyPassword } = await import('@/lib/security/lock-verifier')
      const result = await verifyPassword(password)
      if (result === 'ok' || result === 'missing') {
        // 'missing' self-heals the same way the overlay does — a check with
        // nothing to check against must not strand a pending order.
        if (result === 'missing') setLockEnabled(false)
        setPassword('')
        setStatus('idle')
        passTradeChallenge()
        return
      }
      setStatus('wrong')
    } catch {
      setStatus('unavailable')
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next: boolean) => {
        if (!next) cancelTradeChallenge()
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogTitle>{t('security.challenge.title')}</DialogTitle>
        <DialogDescription>
          {t('security.challenge.description')}
        </DialogDescription>

        <form className="space-y-3" onSubmit={submit}>
          <Label htmlFor="pairlens-challenge-password" className="sr-only">
            {t('security.lock.passwordLabel')}
          </Label>
          <Input
            autoFocus
            id="pairlens-challenge-password"
            type="password"
            autoComplete="current-password"
            placeholder={t('security.lock.passwordLabel')}
            value={password}
            disabled={status === 'checking'}
            onChange={(event) => {
              setPassword(event.target.value)
              if (status === 'wrong') setStatus('idle')
            }}
          />
          {status === 'wrong' && (
            <p className="text-destructive text-xs">
              {t('security.lock.wrongPassword')}
            </p>
          )}
          {status === 'unavailable' && (
            <p className="text-destructive text-xs">
              {t('security.lock.keychainUnavailable')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={status === 'checking'}
              onClick={() => cancelTradeChallenge()}
            >
              {t('security.challenge.cancel')}
            </Button>
            <Button type="submit" disabled={status === 'checking' || !password}>
              {status === 'checking' && <Spinner />}
              {t('security.challenge.confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
