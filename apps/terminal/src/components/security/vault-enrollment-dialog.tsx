// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import {
  Fingerprint,
  KeyRound,
  ScanFace,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
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

import { VaultCeiling } from './vault-ceiling'
import { useBlockedSeconds } from './use-lock-attempts'
import { useVaultState } from '@/lib/security/vault/vault-session'
import { VaultProtectorError } from '@/lib/security/vault/vault-errors'
import { MIN_PASSWORD_LENGTH } from '@/lib/security/vault/vault-policy'
import { track } from '@/lib/analytics-events'

/**
 * Steps. `authorize` is not a formality: adding a protector requires PROVING
 * an existing one, because the runtime data key is non-extractable and the raw
 * bytes have to come back out of a protector the user can still answer.
 */
type Step = 'choose' | 'password' | 'authorize' | 'second'

/**
 * Setting up the credential vault.
 *
 * Two protectors can start a vault and both are real: a passkey (WebAuthn PRF —
 * Touch ID, Windows Hello, or a USB security key) and a password. The copy
 * recommends enrolling both and does not force it, because the failure mode of
 * forcing is a user who abandons setup and stores keys unprotected instead.
 *
 * A third, Touch ID on macOS, can only be ADDED to a vault that already exists.
 * That asymmetry is deliberate and lives in `createVault`: the OS invalidates
 * the key whenever the enrolled fingerprints change, so a vault with nothing
 * else in it would be one System Settings visit away from unopenable. It also
 * only appears where the probe says a prompt can actually be raised — the
 * packaged desktop app cannot use passkeys at all (`tauri://localhost` is not a
 * WebAuthn origin), which is exactly the gap it fills.
 *
 * The password is deliberately THE SAME password as the terminal lock. A
 * second secret for the same device would be remembered worse, not better, and
 * a user who confuses the two ends up in the destructive reset. So: if a lock
 * password already exists this asks for it and verifies it; if not, this
 * writes the lock verifier from the password entered here. Turning the screen
 * lock ON stays a separate decision — enrolling a vault should not start
 * covering the screen on idle without being asked.
 */
export function VaultEnrollmentDialog({
  open,
  onOpenChange,
  onEnrolled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEnrolled?: () => void
}) {
  const { t } = useTranslation()
  const vault = useVaultState()
  const [step, setStep] = React.useState<Step>('choose')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [passkeySupported, setPasskeySupported] = React.useState<
    boolean | null
  >(null)
  /**
   * Null until probed. Gated on the PROBE and never on `isStandalone`: a Mac
   * mini has no sensor and Windows has no implementation, so the platform is
   * not the question — whether this machine can actually raise a prompt is.
   */
  const [biometricSupported, setBiometricSupported] = React.useState<
    boolean | null
  >(null)
  /** Null until probed. True when the terminal lock already has a password. */
  const [hasLockPassword, setHasLockPassword] = React.useState<boolean | null>(
    null,
  )
  const [migrated, setMigrated] = React.useState(0)
  /**
   * What the `authorize` step is proving a password FOR. Without this the step
   * would always enroll a passkey, and the Touch ID card would silently add
   * the wrong kind of protector.
   */
  const [pendingEnroll, setPendingEnroll] = React.useState<
    'passkey' | 'biometric'
  >('passkey')
  const blockedSeconds = useBlockedSeconds()

  const secureContext =
    typeof window === 'undefined' ? true : window.isSecureContext

  React.useEffect(() => {
    if (!open) {
      setStep('choose')
      setPassword('')
      setConfirm('')
      setError(null)
      setBusy(false)
      setMigrated(0)
      setPendingEnroll('passkey')
      return
    }
    let cancelled = false
    void (async () => {
      const [
        { isPasskeySupported },
        { isBiometricSupported },
        { loadVerifier },
      ] = await Promise.all([
        import('@/lib/security/vault/vault-passkey'),
        import('@/lib/security/vault/vault-biometric'),
        import('@/lib/security/lock-verifier'),
      ])
      const [supported, biometric] = await Promise.all([
        isPasskeySupported(),
        isBiometricSupported(),
      ])
      let verifier = false
      try {
        verifier = (await loadVerifier()) !== null
      } catch {
        // Keychain backend trouble — treat as "no password yet" and let the
        // write below surface the real failure rather than guessing here.
      }
      if (cancelled) return
      setPasskeySupported(supported)
      setBiometricSupported(biometric)
      setHasLockPassword(verifier)
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const finish = () => {
    onOpenChange(false)
    onEnrolled?.()
  }

  const describeError = (
    err: unknown,
    kind: 'password' | 'passkey' | 'biometric' = 'passkey',
  ): string => {
    if (err instanceof VaultProtectorError) {
      if (err.kind === 'wrong-password') {
        return t('settings.security.passwordWrong')
      }
      if (err.kind === 'cancelled') {
        // Naming the prompt the user actually dismissed. Both kinds cancel
        // identically, so only the caller can tell them apart.
        return kind === 'biometric'
          ? t('security.vault.biometricCancelled')
          : t('security.vault.passkeyCancelled')
      }
      if (err.kind === 'prf-unsupported') {
        return t('security.vault.passkeyUnsupportedHint')
      }
      if (err.kind === 'no-match') return t('security.vault.passkeyNoMatch')
      if (err.kind === 'invalidated') {
        return t('security.vault.biometricInvalidated')
      }
    }
    return err instanceof Error ? err.message : String(err)
  }

  /**
   * Touch ID is only ever ADDED to an existing vault — `createVault` refuses to
   * make it the first protector, because the OS invalidates the key whenever
   * the enrolled fingerprints change and a biometric-only vault is one System
   * Settings visit away from unopenable.
   */
  const enrollBiometric = async () => {
    if (busy) return
    if (vault.hasPassword) {
      // Prove the password first — the same shape the passkey path uses, and
      // for the same reason: the runtime data key is non-extractable, so the
      // raw bytes have to come back out of a protector the user can answer.
      setError(null)
      setPassword('')
      setPendingEnroll('biometric')
      setStep('authorize')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { addProtector } =
        await import('@/lib/security/vault/vault-protectors')
      // A passkey-only vault: the passkey authorizes.
      await addProtector(
        { kind: 'passkey' },
        {
          kind: 'biometric',
          label: t('security.vault.biometricLabel'),
          reason: t('security.vault.biometricPromptReason'),
        },
      )
      track('security_vault_enrolled', { protector: 'biometric' })
      finish()
    } catch (err) {
      setError(describeError(err, 'biometric'))
    } finally {
      setBusy(false)
    }
  }

  const enrollPasskey = async () => {
    if (busy) return
    // Adding a passkey to a vault that already exists has to prove an existing
    // protector first, and the only one it can be is the password (the card
    // that got us here is hidden once a passkey is enrolled). Sending the
    // component's `password` — cleared the moment the first step finished, and
    // empty by construction when this dialog is opened from Settings — would
    // grind PBKDF2 over "" and come back "Wrong password", one shared-backoff
    // failure at a time.
    if (vault.enrolled && vault.hasPassword) {
      setError(null)
      setPassword('')
      setPendingEnroll('passkey')
      setStep('authorize')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { createVault, addProtector } =
        await import('@/lib/security/vault/vault-protectors')
      if (vault.enrolled) {
        // A vault with no password protector: the existing passkey authorizes.
        await addProtector(
          { kind: 'passkey' },
          { kind: 'passkey', label: t('security.vault.choosePasskey') },
        )
      } else {
        await createVault({
          kind: 'passkey',
          label: t('security.vault.choosePasskey'),
        })
      }
      track('security_vault_enrolled', { protector: 'passkey' })
      if (vault.enrolled) finish()
      else setStep('second')
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  /** The second-protector path: prove the password, enroll what was chosen. */
  const submitAuthorize = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { addProtector } =
        await import('@/lib/security/vault/vault-protectors')
      await addProtector(
        { kind: 'password', password },
        pendingEnroll === 'biometric'
          ? {
              kind: 'biometric',
              label: t('security.vault.biometricLabel'),
              reason: t('security.vault.biometricPromptReason'),
            }
          : { kind: 'passkey', label: t('security.vault.choosePasskey') },
      )
      track('security_vault_enrolled', { protector: pendingEnroll })
      setPassword('')
      finish()
    } catch (err) {
      setError(describeError(err, pendingEnroll))
    } finally {
      setBusy(false)
    }
  }

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    // Only validate as a NEW password when we are actually setting one. When a
    // lock password already exists we are checking it, and rejecting it for
    // being short would lock out anyone who set one under an older rule.
    if (hasLockPassword === false) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(
          t('settings.security.passwordTooShort', { min: MIN_PASSWORD_LENGTH }),
        )
        return
      }
      if (password !== confirm) {
        setError(t('settings.security.passwordMismatch'))
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      const { createVerifier, saveVerifier, verifyPassword } =
        await import('@/lib/security/lock-verifier')
      if (hasLockPassword) {
        const result = await verifyPassword(password)
        if (result === 'wrong') {
          setError(t('settings.security.passwordWrong'))
          setBusy(false)
          return
        }
      }
      const { createVault, addProtector } =
        await import('@/lib/security/vault/vault-protectors')
      if (vault.enrolled) {
        // Adding a password to a passkey-only vault: the passkey authorizes.
        await addProtector(
          { kind: 'passkey' },
          {
            kind: 'password',
            password,
            label: t('security.vault.choosePassword'),
          },
        )
      } else {
        // `migrated` is the number of keys that were already on this device
        // and have just moved under the vault — a desktop-only quantity, and
        // zero on browser. Counting protectors here (what this used to do)
        // claimed "we moved your keys" on every fresh enrollment that moved
        // nothing.
        const created = await createVault({
          kind: 'password',
          password,
          label: t('security.vault.choosePassword'),
        })
        setMigrated(created.migrated)
      }
      // The verifier is written AFTER the protector, never before: a crash
      // between the two must not leave a password that passes the lock screen
      // and cannot open the vault.
      if (!hasLockPassword) {
        await saveVerifier(await createVerifier(password))
      }
      track('security_vault_enrolled', { protector: 'password' })
      const wasEnrolled = vault.enrolled
      setPassword('')
      setConfirm('')
      // Adding to a vault that already existed is the end of the flow — there
      // is no "second way in" left to offer.
      if (wasEnrolled) finish()
      else setStep('second')
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? () => undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 ring-inset">
            <ShieldCheck className="size-5" />
          </div>
          <DialogTitle className="pt-1">
            {step === 'second' || step === 'authorize'
              ? t('security.vault.secondTitle')
              : t('security.vault.enrollTitle')}
          </DialogTitle>
          <DialogDescription>
            {step === 'second' || step === 'authorize'
              ? t('security.vault.secondSubtitle')
              : t('security.vault.enrollSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {!secureContext ? (
          <>
            <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{t('security.vault.insecureContext')}</span>
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
            </DialogFooter>
          </>
        ) : step === 'choose' || step === 'second' ? (
          <div className="space-y-3">
            {step === 'choose' && (
              <p className="text-sm text-muted-foreground">
                {t('security.vault.enrollRecommendBoth')}
              </p>
            )}

            {passkeySupported !== false && !vault.hasPasskey && (
              <ProtectorCard
                icon={Fingerprint}
                title={t('security.vault.choosePasskey')}
                hint={t('security.vault.choosePasskeyHint')}
                disabled={
                  busy ||
                  passkeySupported === null ||
                  // Enrolling onto an existing vault has to prove a protector,
                  // and the backoff is shared with the lock screen: letting
                  // this through while blocked spends attempts the user needs.
                  (vault.enrolled && blockedSeconds > 0)
                }
                busy={busy}
                onClick={() => void enrollPasskey()}
              />
            )}

            {passkeySupported === false && step === 'choose' && (
              <p className="text-xs text-muted-foreground">
                {t('security.vault.passkeyUnsupported')}
              </p>
            )}

            {/* Additive only, and deliberately so: Touch ID is never the first
                protector (createVault refuses), because macOS invalidates the
                key whenever the enrolled fingerprints change — a vault with
                nothing else in it would be one System Settings visit from
                unopenable. Gated on the probe, so a Mac with no sensor and
                every non-Mac simply never see it. */}
            {biometricSupported === true &&
              vault.enrolled &&
              !vault.hasBiometric && (
                <ProtectorCard
                  icon={ScanFace}
                  title={t('security.vault.chooseBiometric')}
                  hint={t('security.vault.chooseBiometricHint')}
                  disabled={busy || blockedSeconds > 0}
                  busy={busy}
                  onClick={() => void enrollBiometric()}
                />
              )}

            {!vault.hasPassword ? (
              <ProtectorCard
                icon={KeyRound}
                title={t('security.vault.choosePassword')}
                hint={
                  hasLockPassword
                    ? t('security.vault.useExistingPassword')
                    : t('security.vault.choosePasswordHint')
                }
                disabled={busy}
                busy={false}
                onClick={() => {
                  setError(null)
                  setStep('password')
                }}
              />
            ) : null}

            {/* Reported HERE, not on the form that triggered it: the form is
                replaced the instant enrollment resolves, so a line rendered
                there is a line nobody ever sees. Desktop-only in practice —
                on browser a protector is a precondition for the first
                credential, so there is never anything to move. */}
            {step === 'second' && migrated > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('settings.security.vaultMigrated', { count: migrated })}
              </p>
            )}

            {error && <p className="text-destructive text-xs">{error}</p>}

            {step === 'choose' ? <VaultCeiling /> : null}

            <DialogFooter>
              <Button
                variant={step === 'second' ? 'default' : 'outline'}
                onClick={step === 'second' ? finish : () => onOpenChange(false)}
                disabled={busy}
              >
                {step === 'second'
                  ? t('security.vault.doneButton')
                  : t('common.cancel')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={step === 'authorize' ? submitAuthorize : submitPassword}
          >
            <div className="space-y-1.5">
              <Label htmlFor="pairlens-vault-password">
                {step === 'authorize' || hasLockPassword
                  ? t('settings.security.currentPassword')
                  : t('settings.security.newPassword')}
              </Label>
              <Input
                autoFocus
                id="pairlens-vault-password"
                type="password"
                autoComplete={
                  step === 'authorize' || hasLockPassword
                    ? 'current-password'
                    : 'new-password'
                }
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
              {(step === 'authorize' || hasLockPassword) && (
                <p className="text-xs text-muted-foreground">
                  {t('security.vault.useExistingPassword')}
                </p>
              )}
            </div>

            {step === 'password' && hasLockPassword === false && (
              <div className="space-y-1.5">
                <Label htmlFor="pairlens-vault-confirm">
                  {t('settings.security.confirmPassword')}
                </Label>
                <Input
                  id="pairlens-vault-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  disabled={busy}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
            )}

            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{t('settings.security.vaultNoRecovery')}</span>
            </p>

            {blockedSeconds > 0 && (
              <p className="text-destructive text-xs">
                {t('security.lock.tooManyAttempts', {
                  seconds: blockedSeconds,
                })}
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
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setError(null)
                  setStep('choose')
                }}
              >
                {t('common.back', 'Back')}
              </Button>
              <Button
                type="submit"
                disabled={busy || !password || blockedSeconds > 0}
              >
                {busy && <Spinner />}
                {t('security.vault.enrollButton')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ProtectorCard({
  icon: Icon,
  title,
  hint,
  disabled,
  busy,
  onClick,
}: {
  icon: typeof KeyRound
  title: string
  hint: string
  disabled: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors hover:border-primary/30 hover:bg-accent/40 disabled:opacity-60"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
        {busy ? <Spinner /> : <Icon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[13px] leading-relaxed text-muted-foreground">
          {hint}
        </span>
      </span>
    </button>
  )
}
