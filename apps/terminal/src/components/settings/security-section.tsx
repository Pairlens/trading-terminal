// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import { KeyRound, Lock, TriangleAlert } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import { Spinner } from '@pairlens/ui/components/ui/spinner'
import { Switch } from '@pairlens/ui/components/ui/switch'

import type { LockConfig } from '@/lib/security/lock-config'
import {
  IDLE_MINUTE_OPTIONS,
  PERIODIC_MINUTE_OPTIONS,
  TRADE_GRACE_OPTIONS,
  getLockConfig,
  setLockEnabled,
  subscribeLockConfig,
  updateLockTriggers,
} from '@/lib/security/lock-config'
import { lockNow } from '@/lib/security/lock-store'
import { track } from '@/lib/analytics-events'
import { isStandalone } from '@/lib/platform'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'

const MIN_PASSWORD_LENGTH = 6

function useLockConfig(): LockConfig {
  return React.useSyncExternalStore(
    subscribeLockConfig,
    getLockConfig,
    getLockConfig,
  )
}

/**
 * Security — the optional, device-local screen lock.
 *
 * The copy in here is a functional requirement, not decoration. This feature
 * is easy to over-trust: it is a screen lock, not disk encryption, it
 * encrypts nothing, and armed bots keep trading behind it. A user who
 * believes otherwise will store more on a shared machine than they should.
 */
export function SecuritySection() {
  const { t } = useTranslation()
  const config = useLockConfig()
  const [setOpen, setSetOpen] = React.useState(false)
  const [changeOpen, setChangeOpen] = React.useState(false)
  const [disableOpen, setDisableOpen] = React.useState(false)

  const enabled = config.enabled
  const triggers = config.triggers

  return (
    <div className="max-w-2xl space-y-5">
      {/* 1 — master switch */}
      <section className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-medium">
              <Lock className="size-4 text-muted-foreground" />
              {t('settings.security.lockTitle')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('settings.security.lockDescription')}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(next: boolean) => {
              if (next) setSetOpen(true)
              else setDisableOpen(true)
            }}
          />
        </div>

        {enabled && (
          <div className="mt-4 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setChangeOpen(true)}
            >
              <KeyRound className="size-4" />
              {t('settings.security.changePassword')}
            </Button>
          </div>
        )}

        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{t('settings.security.noRecoveryWarning')}</span>
        </p>
      </section>

      {/* 2 — triggers */}
      <section
        className={
          enabled ? 'rounded-xl border p-4' : 'rounded-xl border p-4 opacity-60'
        }
        aria-disabled={!enabled}
      >
        <h3 className="font-medium">{t('settings.security.triggersTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.security.triggersDescription')}
        </p>

        <div className="mt-4 space-y-4">
          <TriggerRow
            label={t('settings.security.triggerStartup')}
            hint={t('settings.security.triggerStartupHint')}
            checked={triggers.onStartup}
            disabled={!enabled}
            onCheckedChange={(onStartup) => updateLockTriggers({ onStartup })}
          />

          <TriggerRow
            label={t('settings.security.triggerIdle')}
            hint={t('settings.security.triggerIdleHint', {
              minutes: triggers.onIdle.minutes,
            })}
            checked={triggers.onIdle.enabled}
            disabled={!enabled}
            onCheckedChange={(value) =>
              updateLockTriggers({
                onIdle: { ...triggers.onIdle, enabled: value },
              })
            }
          >
            <MinutesSelect
              value={triggers.onIdle.minutes}
              options={IDLE_MINUTE_OPTIONS}
              disabled={!enabled || !triggers.onIdle.enabled}
              format={(minutes) =>
                t('settings.security.afterMinutes', { minutes })
              }
              onChange={(minutes) =>
                updateLockTriggers({ onIdle: { ...triggers.onIdle, minutes } })
              }
            />
          </TriggerRow>

          <TriggerRow
            label={t('settings.security.triggerPeriodic')}
            hint={t('settings.security.triggerPeriodicHint')}
            checked={triggers.periodic.enabled}
            disabled={!enabled}
            onCheckedChange={(value) =>
              updateLockTriggers({
                periodic: { ...triggers.periodic, enabled: value },
              })
            }
          >
            <MinutesSelect
              value={triggers.periodic.minutes}
              options={PERIODIC_MINUTE_OPTIONS}
              disabled={!enabled || !triggers.periodic.enabled}
              format={(minutes) =>
                t('settings.security.everyHours', { hours: minutes / 60 })
              }
              onChange={(minutes) =>
                updateLockTriggers({
                  periodic: { ...triggers.periodic, minutes },
                })
              }
            />
          </TriggerRow>

          <TriggerRow
            label={t('settings.security.triggerWake')}
            hint={t('settings.security.triggerWakeHint')}
            checked={triggers.onWake}
            disabled={!enabled}
            onCheckedChange={(onWake) => updateLockTriggers({ onWake })}
          />

          <TriggerRow
            label={t('settings.security.triggerTrade')}
            hint={t('settings.security.triggerTradeHint')}
            checked={triggers.beforeTrade.enabled}
            disabled={!enabled}
            onCheckedChange={(value) =>
              updateLockTriggers({
                beforeTrade: { ...triggers.beforeTrade, enabled: value },
              })
            }
          >
            <MinutesSelect
              value={triggers.beforeTrade.graceMinutes}
              options={TRADE_GRACE_OPTIONS}
              disabled={!enabled || !triggers.beforeTrade.enabled}
              format={(minutes) =>
                minutes === 0
                  ? t('settings.security.graceNever')
                  : t('settings.security.graceMinutes', { minutes })
              }
              onChange={(graceMinutes) =>
                updateLockTriggers({
                  beforeTrade: { ...triggers.beforeTrade, graceMinutes },
                })
              }
            />
          </TriggerRow>
        </div>
      </section>

      {/* 3 — what this actually protects */}
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.security.protectsTitle')}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('settings.security.protectsBody')}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('settings.security.protectsBots')}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {isStandalone
            ? t('settings.security.protectsDesktop')
            : t('settings.security.protectsBrowser')}
        </p>
      </section>

      {/* 4 — lock now */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium">
              {t('settings.security.lockNowTitle')}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('settings.security.lockNowDescription')}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!enabled}
            onClick={() => {
              useSettingsDialogStore.getState().close()
              lockNow('manual')
            }}
          >
            <Lock className="size-4" />
            {t('settings.security.lockNow')}
          </Button>
        </div>
      </section>

      <SetPasswordDialog open={setOpen} onOpenChange={setSetOpen} />
      <ConfirmPasswordDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        mode="disable"
      />
      <ConfirmPasswordDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        mode="change"
      />
    </div>
  )
}

function TriggerRow({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
  children,
}: {
  label: string
  hint: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (value: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {children}
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </div>
  )
}

function MinutesSelect({
  value,
  options,
  disabled,
  format,
  onChange,
}: {
  value: number
  options: ReadonlyArray<number>
  disabled: boolean
  format: (minutes: number) => string
  onChange: (minutes: number) => void
}) {
  return (
    <Select
      value={String(value)}
      disabled={disabled}
      onValueChange={(next: string | null) => {
        if (next !== null) onChange(Number(next))
      }}
    >
      <SelectTrigger className="w-[136px]" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((minutes) => (
          <SelectItem key={minutes} value={String(minutes)}>
            {format(minutes)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ── Password dialogs ─────────────────────────────────────────────────

/**
 * Turning the lock on. The switch only flips once the keychain write has
 * resolved — a keychain that refuses the write must not leave a "protected"
 * terminal with nothing to check passwords against.
 */
function SetPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setPassword('')
      setConfirm('')
      setError(null)
      setBusy(false)
    }
  }, [open])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('settings.security.passwordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('settings.security.passwordMismatch'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { createVerifier, saveVerifier } =
        await import('@/lib/security/lock-verifier')
      await saveVerifier(await createVerifier(password))
      setLockEnabled(true)
      track('security_lock_enabled')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.security.setPassword')}</DialogTitle>
          <DialogDescription>
            {t('settings.security.noRecoveryWarning')}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="pairlens-new-lock-password">
              {t('settings.security.newPassword')}
            </Label>
            <Input
              autoFocus
              id="pairlens-new-lock-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pairlens-confirm-lock-password">
              {t('settings.security.confirmPassword')}
            </Label>
            <Input
              id="pairlens-confirm-lock-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner />}
              {t('settings.security.setPassword')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Turning the lock off, or replacing the password. Both start by proving the
 * current one — otherwise "turn it off" would be the bypass the whole
 * feature exists to prevent.
 */
function ConfirmPasswordDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'disable' | 'change'
}) {
  const { t } = useTranslation()
  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setCurrent('')
      setNext('')
      setConfirm('')
      setError(null)
      setBusy(false)
    }
  }, [open])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (mode === 'change') {
      if (next.length < MIN_PASSWORD_LENGTH) {
        setError(t('settings.security.passwordTooShort'))
        return
      }
      if (next !== confirm) {
        setError(t('settings.security.passwordMismatch'))
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      const { createVerifier, clearVerifier, saveVerifier, verifyPassword } =
        await import('@/lib/security/lock-verifier')
      const result = await verifyPassword(current)
      if (result === 'wrong') {
        setError(t('settings.security.passwordWrong'))
        setBusy(false)
        return
      }
      // 'missing' means there is nothing to check against — treat it as a
      // successful disable rather than trapping the user in a broken state.
      if (mode === 'disable' || result === 'missing') {
        await clearVerifier()
        setLockEnabled(false)
        track('security_lock_disabled')
      } else {
        await saveVerifier(await createVerifier(next))
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'disable'
              ? t('settings.security.turnOff')
              : t('settings.security.changePassword')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'disable'
              ? t('settings.security.turnOffDescription')
              : t('settings.security.noRecoveryWarning')}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="pairlens-current-lock-password">
              {t('settings.security.currentPassword')}
            </Label>
            <Input
              autoFocus
              id="pairlens-current-lock-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </div>
          {mode === 'change' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="pairlens-change-lock-password">
                  {t('settings.security.newPassword')}
                </Label>
                <Input
                  id="pairlens-change-lock-password"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pairlens-change-lock-confirm">
                  {t('settings.security.confirmPassword')}
                </Label>
                <Input
                  id="pairlens-change-lock-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
            </>
          )}
          {error && <p className="text-destructive text-xs">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant={mode === 'disable' ? 'destructive' : 'default'}
              disabled={busy}
            >
              {busy && <Spinner />}
              {mode === 'disable'
                ? t('settings.security.turnOff')
                : t('settings.security.changePassword')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
