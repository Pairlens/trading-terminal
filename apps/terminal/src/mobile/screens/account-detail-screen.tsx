// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One connected credential: rename, what it is allowed to do, disconnect.
 *
 * Before this screen the phone's credential rows dead-ended — the list said
 * "OKX · trading" and there was nothing behind it, so the only way to rename or
 * revoke a key was to open the desktop app. That is the wrong shape for the one
 * surface a user is most likely to reach for when something looks wrong.
 *
 * Everything here routes through the SAME store the desktop accounts page uses
 * (`useCredentialsStore`), which is what keeps the keychain/vault envelope the
 * single writer of credential state:
 *
 *   - disconnect  → `removeCredential` + the `venue_disconnected` event, the
 *                   exact pair `accounts-page.tsx`'s `handleRemove` fires.
 *   - rename      → `renameCredential`, added to the store for this screen
 *                   because no rename path existed anywhere in the product.
 *                   It persists BEFORE it publishes, so a sealed vault (which
 *                   throws on write) surfaces as a failure instead of a label
 *                   that changed on screen and nowhere else.
 *
 * SEALED IS NOT EMPTY. A locked vault empties `credentials` in memory, so the
 * lookup by id finds nothing — and rendering "this account is gone" over keys
 * that are still on disk is exactly the lie the store's `sealed` flag exists to
 * prevent. Sealed gets its own state with the unlock flow, ahead of the
 * not-found one, mirroring the alert `accounts-page.tsx` puts above its list.
 */
import { memo, useCallback, useEffect, useState } from 'react'
import { KeyRound, Link2Off, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from '@pairlens/ui'
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
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { useVenueTradePermission } from '../lib/venue-permission'
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import type { MobileOverlay } from '../mobile-focus-context'
import type { ExchangeCredential } from '@/stores/credentials-store'
import {
  CREDENTIAL_SCHEMAS,
  getExpiryStatus,
  isBrokerMarket,
  useCredentialsStore,
} from '@/stores/credentials-store'
import { ExchangeBadge } from '@/components/accounts/venue-badges'
import { StoredLocallyDisclosure } from '@/components/accounts/stored-locally-disclosure'
import { VaultUnlockDialog } from '@/components/security/vault-unlock-dialog'
import { isVaultSealed } from '@/lib/security/vault/vault-errors'
import { track } from '@/lib/analytics-events'

type AccountDetailScreenProps = {
  overlay: Extract<MobileOverlay, { kind: 'accountDetail' }>
  onClose: () => void
}

function venueLabel(market: string): string {
  return CREDENTIAL_SCHEMAS[market]?.label ?? market.toUpperCase()
}

/**
 * The key, recognisable but not readable. Same shape the desktop card uses —
 * enough to tell two keys on the same venue apart, not enough to be worth a
 * shoulder-surf.
 */
function apiKeyHint(apiKey: string): string {
  if (!apiKey) return ''
  return apiKey.length >= 8
    ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
    : '••••'
}

export default memo(function AccountDetailScreen({
  overlay,
  onClose,
}: AccountDetailScreenProps) {
  const { t } = useTranslation()
  const credential = useCredentialsStore((s) =>
    s.credentials.find((c) => c.id === overlay.credentialId),
  )
  const sealed = useCredentialsStore((s) => s.sealed)
  const load = useCredentialsStore((s) => s.load)
  const [unlockOpen, setUnlockOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  if (sealed) {
    return (
      <FullScreenOverlay
        anchor="screen"
        onBack={onClose}
        title={t('mobile.accounts.sealedTitle')}
      >
        <div className="px-4 pt-3">
          <StateCard
            body={t('accounts.vaultSealedBody')}
            icon={<KeyRound className="size-5 text-amber-400" />}
            title={t('mobile.accounts.sealedTitle')}
          >
            <Button
              className="mt-4 h-11 w-full"
              onClick={() => setUnlockOpen(true)}
            >
              <Lock className="size-4" />
              {t('security.vault.sealedBannerAction')}
            </Button>
          </StateCard>
        </div>
        <VaultUnlockDialog onOpenChange={setUnlockOpen} open={unlockOpen} />
      </FullScreenOverlay>
    )
  }

  if (!credential) {
    return (
      <FullScreenOverlay
        anchor="screen"
        onBack={onClose}
        title={t('mobile.accounts.missingTitle')}
      >
        <div className="px-4 pt-3">
          <StateCard
            body={t('mobile.accounts.missingBody')}
            icon={<Link2Off className="size-5 text-muted-foreground" />}
            title={t('mobile.accounts.missingTitle')}
          />
        </div>
      </FullScreenOverlay>
    )
  }

  return <AccountDetail credential={credential} onClose={onClose} />
})

function AccountDetail({
  credential,
  onClose,
}: {
  credential: ExchangeCredential
  onClose: () => void
}) {
  const { t } = useTranslation()
  const renameCredential = useCredentialsStore((s) => s.renameCredential)
  const removeCredential = useCredentialsStore((s) => s.removeCredential)
  const permission = useVenueTradePermission(credential.market)
  const expiry = getExpiryStatus(credential)

  const [label, setLabel] = useState(credential.label)
  const [savingName, setSavingName] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)

  /**
   * A vault sealed DURING the session leaves the credential list in memory on
   * purpose (`vault-bootstrap`: a seal protects the ciphertext, and blanking
   * the page would gain nothing). So this screen can be open, fully populated,
   * over a vault that will refuse the next write. The failure is not the user's
   * to decode — sealed means "unlock", not "that didn't work".
   */
  const reportFailure = useCallback(
    (error: unknown, titleKey: string) => {
      if (isVaultSealed(error)) {
        setUnlockOpen(true)
        return
      }
      toast.error(t(titleKey), {
        description:
          error instanceof Error ? error.message : t('common.unknownError'),
      })
    },
    [t],
  )

  // The field follows the store when the store changes underneath it (another
  // window renamed the same key), but never while the user is mid-edit.
  const stored = credential.label
  useEffect(() => {
    setLabel(stored)
  }, [stored])

  const trimmed = label.trim()
  const dirty = trimmed.length > 0 && trimmed !== stored

  const handleRename = useCallback(async () => {
    if (!dirty) return
    setSavingName(true)
    try {
      await renameCredential(credential.id, trimmed)
      toast.success(t('mobile.accounts.renameSaved'))
    } catch (error) {
      // The store persists before it publishes, so a rejection means nothing
      // moved — the field is put back to what is actually stored.
      setLabel(stored)
      reportFailure(error, 'mobile.accounts.renameFailed')
    } finally {
      setSavingName(false)
    }
  }, [
    credential.id,
    dirty,
    renameCredential,
    reportFailure,
    stored,
    t,
    trimmed,
  ])

  const handleDisconnect = useCallback(async () => {
    setRemoving(true)
    try {
      // Exactly `accounts-page.tsx`'s `handleRemove`: the store's keychain
      // deletion, then the venue event. No second persistence path exists.
      await removeCredential(credential.id)
      track('venue_disconnected', { venue: credential.market })
      toast.success(t('accounts.accountRemovedFeedback'))
      setConfirmOpen(false)
      onClose()
    } catch (error) {
      setConfirmOpen(false)
      reportFailure(error, 'accounts.accountRemoveFailed')
      setRemoving(false)
    }
  }, [
    credential.id,
    credential.market,
    onClose,
    removeCredential,
    reportFailure,
    t,
  ])

  const name = venueLabel(credential.market)
  const keyHint = apiKeyHint(credential.apiKey)

  return (
    <FullScreenOverlay anchor="screen" onBack={onClose} title={name}>
      <div className="px-4 pb-8 pt-1">
        {/* Who this key belongs to */}
        <div className="flex items-center gap-3">
          <ExchangeBadge market={credential.market} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold leading-tight text-foreground">
              {name}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {isBrokerMarket(credential.market)
                ? t('accounts.typeBroker')
                : t('accounts.typeExchange')}
            </p>
          </div>
          <ModePill mode={credential.mode} />
        </div>

        {/* Rename */}
        <FieldLabel>{t('accounts.name')}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            aria-label={t('accounts.name')}
            className="h-11 flex-1 text-[15px]"
            enterKeyHint="done"
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleRename()
              }
            }}
            value={label}
          />
          <Button
            className="h-11 shrink-0 px-4"
            disabled={!dirty || savingName}
            onClick={() => void handleRename()}
          >
            {savingName ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('common.save')}
          </Button>
        </div>

        {/* What it is allowed to do */}
        <FieldLabel>{t('mobile.accounts.permissionsLabel')}</FieldLabel>
        <PermissionCard permission={permission} />

        {/* Metadata */}
        <div className="mt-5 overflow-hidden rounded-xl bg-white/[0.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
          <MetaRow
            label={t('mobile.accounts.modeLabel')}
            value={
              credential.mode === 'paper'
                ? t('accounts.paper')
                : t('accounts.live')
            }
          />
          {keyHint ? (
            <MetaRow
              label={t('mobile.accounts.apiKeyLabel')}
              mono
              value={keyHint}
            />
          ) : null}
          <MetaRow
            label={t('mobile.accounts.connectedLabel')}
            value={
              credential.createdAt > 0
                ? new Date(credential.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : t('accounts.unknownDate')
            }
          />
        </div>

        {/* The venue's own key-expiry policy, when it has one */}
        {expiry?.warning ? (
          <p
            className={cn(
              'mt-3 rounded-lg px-3 py-2 text-[11.5px] leading-relaxed',
              expiry.expired
                ? 'bg-down/10 text-down'
                : 'bg-amber-500/10 text-amber-400',
            )}
          >
            {expiry.expired
              ? t('accounts.keyExpiredWarning', {
                  daysInactive: expiry.daysInactive,
                  limitDays: expiry.policy.days,
                })
              : t('accounts.keyInactiveWarning', {
                  daysInactive: expiry.daysInactive,
                  limitDays: expiry.policy.days,
                })}
          </p>
        ) : null}

        <div className="mt-4">
          <StoredLocallyDisclosure />
        </div>

        {/* Disconnect */}
        <Button
          className="mt-7 h-11 w-full"
          onClick={() => setConfirmOpen(true)}
          variant="destructive"
        >
          <Link2Off className="size-4" />
          {t('accounts.disconnect')}
        </Button>
      </div>

      {/* The overlay this screen lives in is z-60 and the dialog's own backdrop
          is z-50, so it would sit behind. One scrim of our own, and the popup
          raised above it. */}
      {confirmOpen ? (
        <div aria-hidden className="pl-scrim fixed inset-0 z-[69]" />
      ) : null}
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent className="z-[70]" size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('mobile.accounts.disconnectTitle', { label: stored || name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('mobile.accounts.disconnectBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t('accounts.keep')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => {
                event.preventDefault()
                void handleDisconnect()
              }}
              variant="destructive"
            >
              {removing ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('accounts.disconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VaultUnlockDialog onOpenChange={setUnlockOpen} open={unlockOpen} />
    </FullScreenOverlay>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pb-2 pt-6 text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
      {children}
    </h3>
  )
}

function ModePill({ mode }: { mode: 'paper' | 'live' }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-1 text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em]',
        mode === 'live'
          ? 'border-up/50 text-up'
          : 'border-amber-500/50 text-amber-400',
      )}
    >
      {mode === 'live' ? t('accounts.live') : t('accounts.paper')}
    </span>
  )
}

/**
 * What this key can do, said in a sentence rather than a badge. "read-only" on
 * its own reads as a fault; the reason is the part that stops a user hunting
 * for a permission toggle that is not theirs to flip.
 */
function PermissionCard({
  permission,
}: {
  permission: 'none' | 'read' | 'trade'
}) {
  const { t } = useTranslation()

  const [title, body, tone] =
    permission === 'trade'
      ? ([
          t('mobile.accounts.canTrade'),
          t('mobile.accounts.canTradeHint'),
          'up',
        ] as const)
      : permission === 'read'
        ? ([
            t('mobile.accounts.readOnlyTitle'),
            t('mobile.accounts.readOnlyHint'),
            'muted',
          ] as const)
        : ([
            t('mobile.accounts.unavailableTitle'),
            t('mobile.pickers.desktopOnlyVenue'),
            'muted',
          ] as const)

  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-white/[0.035] px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
      {tone === 'up' ? (
        <ShieldCheck className="mt-px size-4 shrink-0 text-up" />
      ) : (
        <Lock className="mt-px size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0">
        <span
          className={cn(
            'block text-[13.5px] font-semibold leading-tight',
            tone === 'up' ? 'text-up' : 'text-foreground',
          )}
        >
          {title}
        </span>
        <span className="mt-1 block text-[11.5px] leading-relaxed text-muted-foreground">
          {body}
        </span>
      </span>
    </div>
  )
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-t border-t-[rgba(255,255,255,0.055)] px-3.5 py-2 first:border-t-0">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-[12.5px] text-foreground',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function StateCard({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-white/[0.035] px-4 py-5 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-white/[0.05]">
        {icon}
      </span>
      <p className="mt-3 text-[15px] font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {children}
    </div>
  )
}
