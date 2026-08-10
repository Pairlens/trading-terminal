// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import {
  Fingerprint,
  KeyRound,
  Lock,
  ScanFace,
  ShieldCheck,
  ShieldOff,
  Trash2,
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
import type { VaultRecord } from '@/lib/security/vault/vault-record'
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
import {
  hasPasswordProtector,
  useVaultState,
} from '@/lib/security/vault/vault-session'
import { removalStrandsVault } from '@/lib/security/vault/vault-record'
import { MIN_PASSWORD_LENGTH } from '@/lib/security/vault/vault-policy'
import { useLockBiometric } from '@/components/security/use-lock-biometric'
import { VaultEnrollmentDialog } from '@/components/security/vault-enrollment-dialog'
import { VaultUnlockDialog } from '@/components/security/vault-unlock-dialog'
import { VaultCeiling } from '@/components/security/vault-ceiling'
import { track } from '@/lib/analytics-events'
import { isStandalone } from '@/lib/platform'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'

function useLockConfig(): LockConfig {
  return React.useSyncExternalStore(
    subscribeLockConfig,
    getLockConfig,
    getLockConfig,
  )
}

/**
 * Security — the terminal lock and the credential vault.
 *
 * The copy in here is a functional requirement, not decoration. These
 * features are easy to over-trust: the lock is a screen lock, not disk
 * encryption, and armed bots keep trading behind it. A user who believes
 * otherwise will store more on a shared machine than they should.
 *
 * ORDER is part of the story: the lock comes first because its password is
 * the foundation everything else builds on — the vault below reuses it
 * ("the same password that unlocks this terminal" has to point UP at
 * something already seen, not forward at something unexplained), and Touch
 * ID and passkeys are added on top of it.
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
    <div className="max-w-4xl space-y-5">
      {/* 1 — the lock, with its password and its triggers in one card:
          "when to lock" is meaningless without the lock, so it does not get
          to look like an independent feature. */}
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

        {enabled && <BiometricUnlockRow />}

        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{t('settings.security.noRecoveryWarning')}</span>
        </p>

        <div
          className={
            enabled ? 'mt-5 border-t pt-4' : 'mt-5 border-t pt-4 opacity-60'
          }
          aria-disabled={!enabled}
        >
          <h4 className="text-sm font-medium">
            {t('settings.security.triggersTitle')}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
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
                  updateLockTriggers({
                    onIdle: { ...triggers.onIdle, minutes },
                  })
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
        </div>
      </section>

      {/* 2 — the credential vault, built on the password above */}
      <VaultCard />

      {/* 3 — the two lock actions, side by side so their difference is
          visible: one covers the screen, the other seals the keys. */}
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
        <div className="mt-4 border-t pt-4">
          <HardLockRow />
        </div>
      </section>

      {/* 4 — the fine print: true, load-bearing, and none of it a control */}
      <FinePrint />

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

// ── Biometric unlock (the lock screen's own door) ────────────────────

/**
 * Face ID, Touch ID, a fingerprint reader, Windows Hello — as a way past the
 * LOCK SCREEN. It lives inside the lock card and not in the vault's list of
 * ways in, because that is exactly what it is and is not: it opens the screen
 * and it opens nothing else (see lock-biometric.ts).
 *
 * That distinction is the whole reason the note below exists. A user with a
 * vault who turns this on and then meets a sealed-vault banner would reasonably
 * conclude the feature is broken; told up front, they either accept it or go
 * add the vault passkey that does open both.
 *
 * Rendered only where a prompt can actually be raised — no platform
 * authenticator, an insecure origin, or the packaged desktop app (whose
 * `tauri://` origin is not a valid WebAuthn origin; desktop gets Touch ID
 * through the vault instead) and there is nothing to offer.
 */
function BiometricUnlockRow() {
  const { t } = useTranslation()
  const vault = useVaultState()
  const { enrolled, supported } = useLockBiometric()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /** The vault already has a door that opens the screen AND the keys. */
  const coveredByVault = vault.hasPasskey || vault.hasBiometric

  const toggle = async (next: boolean) => {
    if (busy) return
    setBusy(true)
    setError(null)
    // Loaded before the try so the catch below can ask it whether the failure
    // was a dismissed prompt. A chunk that will not load is its own outcome.
    const lockBiometric = await import('@/lib/security/lock-biometric').catch(
      () => null,
    )
    if (!lockBiometric) {
      setError(t('security.lock.keychainUnavailable'))
      setBusy(false)
      return
    }
    try {
      if (next) {
        await lockBiometric.enrollLockBiometric({
          label: t('security.lock.biometricLabel'),
          userName: t('security.lock.biometricUserName'),
          userDisplayName: 'Pairlens',
        })
        track('security_lock_biometric', { action: 'enrolled' })
      } else {
        await lockBiometric.clearLockBiometric()
        track('security_lock_biometric', { action: 'removed' })
      }
    } catch (err) {
      // A dismissed prompt is not an error worth a red line — the switch snaps
      // back on its own because the state is read, not assumed.
      if (!lockBiometric.isLockBiometricCancellation(err)) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  if (supported !== true) return null

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <ScanFace className="size-4 text-muted-foreground" />
            {t('settings.security.biometricUnlockTitle')}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('settings.security.biometricUnlockDescription')}
          </p>
        </div>
        <Switch
          checked={enrolled}
          // Adding a second, weaker biometric door next to one that already
          // opens the keys would be a downgrade dressed as a feature. Removing
          // a leftover one stays possible.
          disabled={busy || (coveredByVault && !enrolled)}
          onCheckedChange={(next: boolean) => void toggle(next)}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {coveredByVault
          ? t('settings.security.biometricUnlockCoveredByVault')
          : vault.enrolled
            ? t('settings.security.biometricUnlockVaultNote')
            : t('settings.security.biometricUnlockScreenOnly')}
      </p>

      {error && <p className="mt-2 text-destructive text-xs">{error}</p>}
    </div>
  )
}

// ── Credential vault ─────────────────────────────────────────────────

/**
 * Managing protectors, and — on desktop — whether there is a vault at all.
 *
 * The removal rule is the load-bearing part: a protector can only be removed
 * while the vault is UNLOCKED (otherwise someone at an unattended terminal
 * strips the passkey and leaves only a password to guess), and a removal that
 * would strand stored values is refused — the last protector, and equally the
 * second-to-last one when what remains is only Touch ID, which macOS
 * invalidates whenever the fingerprint set changes. Those rules hold each
 * other up on desktop, where "is anything stored?" can only be answered by
 * reading the vaulted indexes — do not weaken any of them on its own. The
 * button below asks `removalStrandsVault` so it cannot drift from what
 * `removeProtector` will actually allow.
 */
function VaultCard() {
  const { t } = useTranslation()
  const vault = useVaultState()
  const [enrollOpen, setEnrollOpen] = React.useState(false)
  const [unlockOpen, setUnlockOpen] = React.useState(false)
  const [disableOpen, setDisableOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const removeProtector = async (id: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { removeProtector: remove } =
        await import('@/lib/security/vault/vault-protectors')
      const record = await import('@/lib/security/vault/vault-session').then(
        (m) => m.getVaultRecord(),
      )
      const kind = record?.protectors.find((p) => p.id === id)?.type
      await remove(id)
      if (kind) track('security_vault_removed', { protector: kind })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  /** Re-run the value migration with the key this window already holds. */
  const finishMigration = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { finishPendingMigration } =
        await import('@/lib/security/vault/vault-protectors')
      await finishPendingMigration()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const record = useVaultRecord(vault)
  const biometricSupported = useBiometricSupported()
  const passkeySupported = usePasskeySupported()

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-medium">
            <ShieldCheck className="size-4 text-muted-foreground" />
            {t('settings.security.vaultTitle')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('settings.security.vaultDescription')}
          </p>
        </div>
        {isStandalone && (
          <Switch
            checked={vault.enrolled}
            disabled={busy}
            onCheckedChange={(next: boolean) => {
              if (next) setEnrollOpen(true)
              else setDisableOpen(true)
            }}
          />
        )}
      </div>

      <p className="mt-3 text-sm">
        {vault.enrolled
          ? t('settings.security.vaultStatusReady', {
              count: vault.protectors,
            })
          : t('settings.security.vaultStatusNone')}
      </p>

      {isStandalone && !vault.enrolled && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('settings.security.vaultDesktopToggleHint')}
        </p>
      )}
      {/* An interrupted migration has to be finishable from here. This is the
          desktop opt-in path only — browser enrollment has nothing to move,
          because a protector is a precondition for the first credential — and
          on desktop the values it did not reach are still PLAINTEXT in the OS
          keychain. Saying "open the vault to complete it" and offering nothing
          that completes it leaves them there permanently, under a panel that
          claims protection; a second "Set up vault" only produces a conflict,
          because the record is already on disk. */}
      {vault.migrating && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-amber-600 dark:text-amber-400">
            {t('settings.security.vaultMigrationFailed')}
          </p>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              if (!vault.unlocked) {
                setUnlockOpen(true)
                return
              }
              void finishMigration()
            }}
          >
            {vault.unlocked
              ? t('settings.security.vaultSetUp')
              : t('security.vault.unlockWithPassword')}
          </Button>
        </div>
      )}

      {/* Every way in, in one list: what is enrolled (solid border, removable),
          what can be added (dashed, with its own Add), and what exists but is
          out of reach yet (dimmed, with the reason written on the row) — the
          user asked where Touch ID was and the honest answer was "hidden".
          The intro line answers the other standing question: these are not
          vault-only, the lock screen accepts all of them. */}
      <div className="mt-4">
        <h4 className="text-sm font-medium">
          {t('settings.security.vaultWaysTitle')}
        </h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('settings.security.vaultAlsoUnlocks')}
        </p>
        <ul className="mt-3 space-y-2">
          {vault.enrolled &&
            record?.protectors.map((protector) => (
              <li
                key={protector.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                {protector.type === 'passkey' ? (
                  <Fingerprint className="size-4 shrink-0 text-muted-foreground" />
                ) : protector.type === 'biometric' ? (
                  <ScanFace className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {protector.label}
                </span>
                {/* Disabled on the same rule the library enforces
                    (`removalStrandsVault`), so the button never offers a
                    removal that comes back as an error — and never offers the
                    one that leaves Touch ID alone holding the vault. */}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('settings.security.vaultRemoveProtector')}
                  title={
                    record.protectors.length === 1
                      ? t('settings.security.vaultRemoveLastBlocked')
                      : removalStrandsVault(record, protector.id)
                        ? t('settings.security.vaultRemoveBiometricOnlyBlocked')
                        : !vault.unlocked
                          ? t('security.vault.sealed')
                          : t('settings.security.vaultRemoveProtector')
                  }
                  disabled={
                    busy ||
                    removalStrandsVault(record, protector.id) ||
                    !vault.unlocked
                  }
                  onClick={() => void removeProtector(protector.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}

          {!vault.hasPassword && (
            <MethodRow
              icon={KeyRound}
              title={t('security.vault.choosePassword')}
              hint={t('security.vault.choosePasswordHint')}
              action={
                vault.enrolled ? (
                  <AddMethodButton
                    disabled={busy}
                    onClick={() => setEnrollOpen(true)}
                  />
                ) : null
              }
            />
          )}

          {passkeySupported && !vault.hasPasskey && (
            <MethodRow
              icon={Fingerprint}
              title={t('security.vault.choosePasskey')}
              hint={t('security.vault.choosePasskeyHint')}
              action={
                vault.enrolled ? (
                  <AddMethodButton
                    disabled={busy}
                    onClick={() => setEnrollOpen(true)}
                  />
                ) : null
              }
            />
          )}

          {biometricSupported && !vault.hasBiometric && (
            <MethodRow
              icon={ScanFace}
              title={t('security.vault.chooseBiometric')}
              // The row the feedback asked for: Touch ID visible before it is
              // reachable, with the reason in place of a dead button.
              hint={
                vault.enrolled
                  ? t('security.vault.chooseBiometricHint')
                  : t('settings.security.biometricNeedsVault')
              }
              muted={!vault.enrolled}
              action={
                vault.enrolled ? (
                  <AddMethodButton
                    disabled={busy}
                    onClick={() => setEnrollOpen(true)}
                  />
                ) : null
              }
            />
          )}
        </ul>
      </div>

      {error && <p className="mt-2 text-destructive text-xs">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!vault.enrolled && (
          <Button size="sm" disabled={busy} onClick={() => setEnrollOpen(true)}>
            <ShieldCheck className="size-4" />
            {t('settings.security.vaultSetUp')}
          </Button>
        )}
        {vault.enrolled && !vault.unlocked && (
          <Button size="sm" onClick={() => setUnlockOpen(true)}>
            {t('security.vault.unlockWithPassword')}
          </Button>
        )}
      </div>

      <VaultCeiling className="mt-4 space-y-2 rounded-lg bg-muted/50 p-3" />

      <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>{t('settings.security.vaultNoRecovery')}</span>
      </p>

      <VaultEnrollmentDialog open={enrollOpen} onOpenChange={setEnrollOpen} />
      <VaultUnlockDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        // Unlocking to finish a migration should finish it, not hand the user
        // back to the same amber line they just acted on.
        onUnlocked={() => {
          if (vault.migrating) void finishMigration()
        }}
      />
      <DisableVaultDialog open={disableOpen} onOpenChange={setDisableOpen} />
    </section>
  )
}

/**
 * One row of the "ways to unlock" list that is NOT an enrolled protector:
 * either addable (dashed border, its own Add) or visible-but-out-of-reach
 * (dimmed, the reason written where the button would be). Distinct from the
 * enrolled rows' solid border on purpose — present and possible are
 * different states and should read differently at a glance.
 */
function MethodRow({
  icon: Icon,
  title,
  hint,
  muted,
  action,
}: {
  icon: typeof KeyRound
  title: string
  hint: string
  muted?: boolean
  action: React.ReactNode
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg border border-dashed px-3 py-2 ${
        muted ? 'opacity-60' : ''
      }`}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      {action}
    </li>
  )
}

function AddMethodButton({
  disabled,
  onClick,
}: {
  disabled: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  return (
    <Button
      size="sm"
      variant="outline"
      className="shrink-0"
      disabled={disabled}
      onClick={onClick}
    >
      {t('common.add')}
    </Button>
  )
}

/**
 * Whether this machine can actually raise a biometric prompt.
 *
 * The probe, never `isStandalone`: a Mac mini has no Touch ID sensor and the
 * Windows/Linux builds have no implementation, so offering "Add Touch ID"
 * there would be a button that cannot finish what it starts. The result is
 * cached at module level inside `isBiometricSupported`, so mounting the panel
 * repeatedly costs one IPC call in total.
 */
function useBiometricSupported(): boolean {
  const [supported, setSupported] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    void import('@/lib/security/vault/vault-biometric').then(async (m) => {
      const ok = await m.isBiometricSupported().catch(() => false)
      if (!cancelled) setSupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return supported
}

/** Same shape and same reasoning as `useBiometricSupported`, for passkeys. */
function usePasskeySupported(): boolean {
  const [supported, setSupported] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    void import('@/lib/security/vault/vault-passkey').then(async (m) => {
      const ok = await m.isPasskeySupported().catch(() => false)
      if (!cancelled) setSupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return supported
}

/**
 * The protector list needs the record, not just the summary state. Re-read on
 * every vault change — this is a settings panel, not a hot path.
 */
function useVaultRecord(vault: { protectors: number; enrolled: boolean }) {
  // The real record type rather than a structural stand-in: the removal button
  // asks `removalStrandsVault` whether it may be offered, and that rule reads
  // protector KINDS. A loose shape would let a `type: string` drift past it.
  const [record, setRecord] = React.useState<VaultRecord | null>(null)
  React.useEffect(() => {
    let cancelled = false
    void import('@/lib/security/vault/vault-session').then(async (m) => {
      const next = await m.ensureVaultLoaded().catch(() => null)
      if (!cancelled) setRecord(next)
    })
    return () => {
      cancelled = true
    }
  }, [vault.protectors, vault.enrolled])
  return record
}

/**
 * Desktop opt-out. Every value comes back out from under the data key and
 * lands in the OS keychain as plaintext before the record is deleted — the
 * ordering lives in `vault-teardown.ts` because it is crypto, not UI.
 */
function DisableVaultDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const vault = useVaultState()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setBusy(false)
      setError(null)
    }
  }, [open])

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const { disableVault } =
        await import('@/lib/security/vault/vault-teardown')
      await disableVault()
      track('security_vault_desktop_toggled', { enabled: false })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? () => undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('settings.security.vaultDesktopOptOutTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('settings.security.vaultDesktopOptOutBody')}
          </DialogDescription>
        </DialogHeader>
        {!vault.unlocked && (
          <p className="text-destructive text-xs">
            {t('security.vault.sealed')}
          </p>
        )}
        {error && <p className="text-destructive text-xs">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !vault.unlocked}
            onClick={() => void confirm()}
          >
            {busy && <Spinner />}
            {t('settings.security.vaultDesktopOptOutConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Fine print, and the hard lock ────────────────────────────────────

/**
 * The honest footnotes, at the foot. Every line here is load-bearing copy —
 * the shared attempt limit, where the password check lives, the CLI bypass —
 * but none of it is a control, so it must not sit BETWEEN controls dressed
 * up as one (that was the "wall of text in the middle" complaint). The lock
 * ceiling paragraph stays conditional on enrollment: it says the lock
 * "encrypts nothing", which stops being true the moment a vault exists.
 */
function FinePrint() {
  const { t } = useTranslation()
  const vault = useVaultState()

  return (
    <section className="space-y-1.5 px-1 pb-2 text-xs text-muted-foreground">
      <h3 className="text-sm font-medium text-foreground">
        {t('settings.security.protectsTitle')}
      </h3>
      {!vault.enrolled && <p>{t('settings.security.protectsBody')}</p>}
      <p>{t('settings.security.protectsBots')}</p>
      <p>{t('settings.security.vaultSharedBackoff')}</p>
      <p>
        {isStandalone
          ? t('settings.security.protectsDesktop')
          : t('settings.security.protectsBrowser')}
      </p>
      <p>{t('settings.security.vaultCliNote')}</p>
    </section>
  )
}

/** The hard lock, as the second row of the actions card. */
function HardLockRow() {
  const { t } = useTranslation()
  const vault = useVaultState()
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">
            {t('settings.security.hardLockTitle')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('settings.security.hardLockDescription')}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!vault.enrolled || !vault.unlocked}
          onClick={() => setConfirmOpen(true)}
        >
          <ShieldOff className="size-4" />
          {t('settings.security.hardLockButton')}
        </Button>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>{t('settings.security.hardLockWarning')}</span>
      </p>
      <HardLockConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} />
    </>
  )
}

/**
 * The consequence goes in the BODY, not a footnote. Someone reaching for this
 * because a person is standing behind them must not discover afterwards that
 * their stop-losses stopped running.
 */
export function HardLockConfirmDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="size-4 text-amber-600 dark:text-amber-400" />
            {t('settings.security.hardLockConfirmTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('settings.security.hardLockConfirmBody')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false)
              useSettingsDialogStore.getState().close()
              track('security_vault_hard_locked')
              void import('@/lib/security/vault/vault-hard-lock').then((m) =>
                m.hardLock(),
              )
            }}
          >
            <ShieldOff className="size-4" />
            {t('settings.security.hardLockButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      // items gives the closed trigger the formatted label — without it Base
      // UI renders the bare value ("15" instead of "15 minutes").
      items={Object.fromEntries(
        options.map((minutes) => [String(minutes), format(minutes)]),
      )}
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
  const vault = useVaultState()
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /**
   * With a password protector enrolled there is already a password for this
   * device, and it is the one that opens the keys. Minting a second one here
   * would produce a terminal whose lock screen and whose vault want different
   * secrets — so this asks for the existing one and proves it against the
   * vault instead.
   */
  const reuseVaultPassword = vault.hasPassword

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
    if (!reuseVaultPassword) {
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
      // Authoritative, not the render snapshot: `vault.hasPassword` is backed
      // by the untrusted UI mirror until the record has loaded, and a `false`
      // from a stale mirror would mint a second password here — leaving a lock
      // screen and a vault that want different secrets.
      if (await hasPasswordProtector()) {
        // Proving it against the vault is what makes writing a verifier for
        // it safe. This doubles as the re-sync path when a verifier went
        // missing while the vault kept its password protector.
        const { unlockVault } =
          await import('@/lib/security/vault/vault-protectors')
        await unlockVault({ kind: 'password', password })
      }
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
              {reuseVaultPassword
                ? t('settings.security.currentPassword')
                : t('settings.security.newPassword')}
            </Label>
            <Input
              autoFocus
              id="pairlens-new-lock-password"
              type="password"
              autoComplete={
                reuseVaultPassword ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {reuseVaultPassword && (
              <p className="text-xs text-muted-foreground">
                {t('security.vault.useExistingPassword')}
              </p>
            )}
          </div>
          {!reuseVaultPassword && (
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
        setError(
          t('settings.security.passwordTooShort', { min: MIN_PASSWORD_LENGTH }),
        )
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
      // Read the RECORD, never the render snapshot. `vault.hasPassword` falls
      // back to the untrusted UI mirror while the record is unloaded — which
      // includes the case where a desktop keychain read just failed — and both
      // branches below are exactly the ones where believing a wrong `false`
      // splits the verifier from the protector for good.
      const vaultHasPassword = await hasPasswordProtector()
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
        setLockEnabled(false)
        // The biometric door only ever opened the lock screen, so it dies with
        // it. Leaving the record would quietly re-arm the button if the lock is
        // switched back on later, under a password it was never enrolled
        // against — a way in the user did not choose this time round.
        const { clearLockBiometric } =
          await import('@/lib/security/lock-biometric')
        await clearLockBiometric()
        // The verifier is ALSO the vault's twin secret. Deleting it while a
        // password protector exists orphans that protector: the vault would
        // still expect the password, and the lock screen would have nothing
        // left to check it against. Turning off a screen lock must not be
        // able to do that — the vault has its own removal flow.
        if (!vaultHasPassword) await clearVerifier()
        track('security_lock_disabled')
      } else {
        // Order matters and is not negotiable: rewrap the DEK FIRST, write
        // the verifier SECOND. A crash between them otherwise leaves someone
        // who can pass the lock screen but cannot open their own keys, and
        // there is no way back from that except the destructive reset.
        if (vaultHasPassword) {
          const { changeVaultPassword } =
            await import('@/lib/security/vault/vault-protectors')
          await changeVaultPassword(current, next)
        }
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
