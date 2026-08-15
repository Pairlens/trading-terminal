// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import { Fingerprint, LockKeyhole, ScanFace, ShieldAlert } from 'lucide-react'
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

import { useBlockedSeconds } from './use-lock-attempts'
import { useLockBiometric } from './use-lock-biometric'
import {
  cancelTradeChallenge,
  getLockState,
  passTradeChallenge,
  unlockNow,
  useLockState,
} from '@/lib/security/lock-store'
import { setLockEnabled } from '@/lib/security/lock-config'
import { useVaultState } from '@/lib/security/vault/vault-session'
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

type VerifyState =
  | 'idle'
  | 'checking'
  | 'wrong'
  | 'unavailable'
  /**
   * The OS key behind the Touch ID protector is gone — the fingerprint set on
   * this Mac changed. No retry will ever work, so this must not read as "wrong"
   * and must point at the only thing that fixes it.
   */
  | 'biometric-invalidated'
  /**
   * The lock screen's own Face ID / fingerprint door refused, and not because
   * the prompt was dismissed. Distinct from `'wrong'`: nobody typed anything,
   * so the message has to send them to the password field rather than imply
   * they mistyped.
   */
  | 'biometric-failed'

// ── Full-screen lock ─────────────────────────────────────────────────

function LockOverlay({ reason }: { reason: string }) {
  const { t } = useTranslation()
  const [password, setPassword] = React.useState('')
  const [status, setStatus] = React.useState<VerifyState>('idle')
  const [resetOpen, setResetOpen] = React.useState(false)
  const blockedSeconds = useBlockedSeconds()
  const vault = useVaultState()
  const { enrolled: biometricEnrolled } = useLockBiometric()

  /**
   * Offered only when the vault has nothing better. A vault passkey or Touch ID
   * protector opens the screen AND the keys in one gesture; this one opens the
   * screen. Two buttons that both say "use your face" and do different amounts
   * would be the worst of both.
   */
  const showLockBiometric =
    biometricEnrolled && !vault.hasPasskey && !vault.hasBiometric

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

  /**
   * The non-password doors. WebAuthn user verification and a Touch ID gesture
   * are both identity checks — they satisfy the screen lock exactly the way the
   * password does, and they open the vault in the same step.
   */
  const unlockWithProtector = async (kind: 'passkey' | 'biometric') => {
    if (status === 'checking' || blockedSeconds > 0) return
    setStatus('checking')
    try {
      const { unlockVault } =
        await import('@/lib/security/vault/vault-protectors')
      await unlockVault(
        kind === 'passkey'
          ? { kind: 'passkey' }
          : {
              kind: 'biometric',
              reason: t('security.vault.biometricPromptReason'),
            },
      )
      track('security_vault_unlocked', { protector: kind })
      setStatus('idle')
      unlockNow()
    } catch (err) {
      const { VaultProtectorError } =
        await import('@/lib/security/vault/vault-errors')
      // A dismissed biometric prompt is not a failed guess — it must not
      // count against the backoff, and the vault layer already makes sure it
      // doesn't. Just put the user back where they were.
      if (err instanceof VaultProtectorError && err.kind === 'cancelled') {
        setStatus('idle')
        return
      }
      // The protector is dead rather than refused. Saying "wrong" here sends
      // someone who did nothing wrong toward the destructive reset.
      if (err instanceof VaultProtectorError && err.kind === 'invalidated') {
        setStatus('biometric-invalidated')
        return
      }
      setStatus('wrong')
    }
  }

  /**
   * The lock screen's own biometric door. Opens the SCREEN — see the module
   * note in lock-biometric.ts for why it deliberately cannot open the vault.
   * When a vault is enrolled and sealed, the sealed banner takes it from here.
   */
  const unlockWithFace = async () => {
    if (status === 'checking' || blockedSeconds > 0) return
    setStatus('checking')
    try {
      const { refreshLockBiometric, verifyLockBiometric } =
        await import('@/lib/security/lock-biometric')
      const result = await verifyLockBiometric()
      if (result === 'ok') {
        setStatus('idle')
        track('security_lock_biometric', { action: 'unlocked' })
        unlockNow()
        return
      }
      // A dismissed prompt is a change of mind, not a failure: no message, and
      // nothing counted against the backoff — biometrics are not guessable, so
      // spending an attempt here would only penalise a mis-tap.
      if (result === 'cancelled') {
        setStatus('idle')
        return
      }
      if (result === 'missing') {
        // The record went out from under us (cleared site data, a sibling
        // window turning it off). Correct the flag so the button stops being
        // offered, and let the password field — already on screen — do the work.
        setStatus('idle')
        void refreshLockBiometric()
        return
      }
      setStatus('biometric-failed')
    } catch {
      // `verifyLockBiometric` swallows its own failures, so this is the chunk
      // load. Leaving `checking` set would wedge the overlay: the biometric
      // button AND the password submit are both disabled by it, and the only
      // way out would be a reload.
      setStatus('biometric-failed')
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (status === 'checking' || blockedSeconds > 0 || !password) return
    setStatus('checking')
    try {
      // PBKDF2, the vault unwrap and the reset routine are all pulled on
      // demand — none of them belongs in the root bundle.
      const { attemptLockUnlock } = await import('@/lib/security/lock-unlock')
      const result = await attemptLockUnlock(password)
      if (result === 'ok') {
        // One password, both doors — and with a vault password protector the
        // unwrap WAS the test, so there is no longer a second artifact that
        // can disagree with the first.
        setPassword('')
        setStatus('idle')
        // Also clears the attempt counter, in every window.
        unlockNow()
        return
      }
      if (result === 'missing') {
        // Only reachable with no vault password protector behind this door
        // (see `attemptLockUnlock`): the verifier is all there was, and it is
        // gone — a keychain reset, cleared browser storage. Anyone who can do
        // that already owns the account, so bricking the app to spite them is
        // the worse trade. Self-heal.
        setLockEnabled(false)
        setPassword('')
        setStatus('idle')
        unlockNow()
        return
      }
      // The attempt is already counted — `attemptLockUnlock` owns that, since
      // the two paths behind it count differently.
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

            {/* Above the password field, not below it: on a phone this is the
                way in, and a button under an autofocused input sits behind the
                software keyboard. */}
            {showLockBiometric && (
              <Button
                className="mt-6 w-full"
                disabled={status === 'checking' || blockedSeconds > 0}
                onClick={() => void unlockWithFace()}
              >
                {status === 'checking' ? (
                  <Spinner />
                ) : (
                  <ScanFace className="size-4" />
                )}
                {t('security.lock.biometricUnlock')}
              </Button>
            )}

            <form
              className={
                showLockBiometric ? 'mt-3 space-y-3' : 'mt-6 space-y-3'
              }
              onSubmit={submit}
            >
              <Label htmlFor="pairlens-lock-password" className="sr-only">
                {t('security.lock.passwordLabel')}
              </Label>
              <Input
                // Not with biometrics enrolled: focusing this pops the phone's
                // keyboard over the button the user actually came for.
                autoFocus={!showLockBiometric}
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
              {status === 'biometric-invalidated' && (
                <p className="text-destructive text-xs">
                  {t('security.vault.biometricInvalidated')}
                </p>
              )}
              {status === 'biometric-failed' && (
                <p className="text-destructive text-xs">
                  {t('security.lock.biometricFailed')}
                </p>
              )}

              <Button
                type="submit"
                // Secondary once there is a biometric button above: two filled
                // buttons stacked read as two equal choices, and they are not.
                variant={showLockBiometric ? 'outline' : 'default'}
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

            {/* Offered only when the protector is actually enrolled — the
                record is what knows, and a button that cannot raise a prompt
                is worse than no button. */}
            {vault.hasPasskey && (
              <Button
                variant="outline"
                className="mt-2 w-full"
                disabled={status === 'checking' || blockedSeconds > 0}
                onClick={() => void unlockWithProtector('passkey')}
              >
                <Fingerprint className="size-4" />
                {t('security.vault.unlockWithPasskey')}
              </Button>
            )}

            {vault.hasBiometric && (
              <Button
                variant="outline"
                className="mt-2 w-full"
                disabled={
                  status === 'checking' ||
                  blockedSeconds > 0 ||
                  // Once it is dead, keep it dead: re-prompting only produces
                  // the same failure and reads as a flaky sensor.
                  status === 'biometric-invalidated'
                }
                onClick={() => void unlockWithProtector('biometric')}
              >
                <ScanFace className="size-4" />
                {t('security.vault.unlockWithBiometric')}
              </Button>
            )}

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
  const { enrolled: biometricEnrolled } = useLockBiometric()

  /**
   * The same door as the lock screen, and it belongs here for the same reason
   * it belongs there: "confirm before every order" is a setting people turn off
   * when confirming means typing. A face is still an identity check.
   */
  const confirmWithFace = async () => {
    if (status === 'checking') return
    setStatus('checking')
    try {
      const { refreshLockBiometric, verifyLockBiometric } =
        await import('@/lib/security/lock-biometric')
      const result = await verifyLockBiometric()
      if (result === 'ok') {
        setStatus('idle')
        track('security_lock_biometric', { action: 'unlocked' })
        passTradeChallenge()
        return
      }
      if (result === 'cancelled') {
        setStatus('idle')
        return
      }
      if (result === 'missing') {
        setStatus('idle')
        void refreshLockBiometric()
        return
      }
      setStatus('biometric-failed')
    } catch {
      // Same wedge as the lock overlay, with an order waiting on it: a stuck
      // `checking` disables both ways of answering, and the challenge would sit
      // there until its 2-minute timeout cancelled the order.
      setStatus('biometric-failed')
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (status === 'checking' || !password) return
    setStatus('checking')
    try {
      const { attemptLockUnlock } = await import('@/lib/security/lock-unlock')
      const result = await attemptLockUnlock(password)
      if (result === 'ok' || result === 'missing') {
        // 'missing' self-heals the same way the overlay does — a check with
        // nothing to check against must not strand a pending order — and it
        // is only reachable at all when no vault password protector stands
        // behind this prompt.
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

        {biometricEnrolled && (
          <Button
            className="w-full"
            disabled={status === 'checking'}
            onClick={() => void confirmWithFace()}
          >
            {status === 'checking' ? (
              <Spinner />
            ) : (
              <ScanFace className="size-4" />
            )}
            {t('security.lock.biometricConfirm')}
          </Button>
        )}

        <form className="space-y-3" onSubmit={submit}>
          <Label htmlFor="pairlens-challenge-password" className="sr-only">
            {t('security.lock.passwordLabel')}
          </Label>
          <Input
            autoFocus={!biometricEnrolled}
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
          {status === 'biometric-failed' && (
            <p className="text-destructive text-xs">
              {t('security.lock.biometricFailed')}
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
