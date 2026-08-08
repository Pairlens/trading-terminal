// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Settings (design screen 10) — list → detail, opened from the avatar and
 * never a tab.
 *
 * The list is derived from `SETTINGS_NAV_GROUPS` and the detail renders
 * `SettingsSectionBody`, both of which the desktop dialog also uses. That is
 * the whole point of extracting them: the phone reaches every section the
 * desktop reaches, in the same order, with the same visibility rules
 * (`isSectionVisible` hides the Tauri-only and App-Server-only ones), and a
 * section added tomorrow appears here without anyone remembering to.
 *
 * Accounts is INLINE at the top rather than a detail row, following the
 * design: what a key is allowed to do is the first thing this screen answers,
 * and burying it one tap down would make "am I connected?" a navigation.
 * `/accounts` deep-links land here for the same reason.
 */
import { memo, useCallback, useEffect, useState } from 'react'
import { ChevronRight, Lock, MonitorSmartphone, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileActions } from '../mobile-focus-context'
import { useVenueTradePermission } from '../lib/venue-permission'
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import { MobileRow } from '../primitives/mobile-row'
import { DesktopExperienceBody } from './desktop-experience-screen'
import type {
  MobileOverlay,
  MobileSettingsSection,
} from '../mobile-focus-context'
import type { ExchangeCredential } from '@/stores/credentials-store'
import type { SettingsNavId } from '@/components/settings/settings-nav'
import {
  VISIBLE_SETTINGS_NAV_GROUPS,
  settingsSectionNameKey,
} from '@/components/settings/settings-nav'
import { SettingsSectionBody } from '@/components/settings/settings-section-body'
import { StoredLocallyDisclosure } from '@/components/accounts/stored-locally-disclosure'
import { VaultUnlockDialog } from '@/components/security/vault-unlock-dialog'
import { ExchangeBadge } from '@/components/accounts/venue-badges'
import {
  CREDENTIAL_SCHEMAS,
  isBrokerMarket,
  useCredentialsStore,
} from '@/stores/credentials-store'
import { WALLET_SCHEMAS, useWalletsStore } from '@/stores/wallets-store'
import { useRiskConfigStore } from '@/stores/risk-config-store'
import { useDisplayCurrency } from '@/hooks/use-display-currency'
import { useOptimisticSession } from '@/lib/session'
import { hasAppServer } from '@/lib/auth-client'
import { isStandalone } from '@/lib/platform'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { track } from '@/lib/analytics-events'

type SettingsScreenProps = {
  overlay: Extract<MobileOverlay, { kind: 'settings' }>
  onClose: () => void
}

/** `accounts` is not a detail screen — it is the top of the list. */
function initialSection(
  section: MobileSettingsSection | undefined,
): SettingsNavId | null {
  if (!section || section === 'accounts') return null
  return section
}

export default memo(function SettingsScreen({
  overlay,
  onClose,
}: SettingsScreenProps) {
  const { t } = useTranslation()
  const [section, setSection] = useState<SettingsNavId | null>(() =>
    initialSection(overlay.section),
  )
  const [unlockOpen, setUnlockOpen] = useState(false)
  // A screen, not an overlay kind: it is reached from one banner on one
  // screen, and a local branch keeps the whole feature inside two files that
  // one workstream owns. Same shape the section detail already uses.
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => {
    if (section) track('settings_section_viewed', { section })
  }, [section])

  const back = useCallback(() => setSection(null), [])
  const closeInvite = useCallback(() => setInviteOpen(false), [])

  // One frame for all three states. Swapping the CHILDREN of a persistent
  // `FullScreenOverlay` keeps the same element, so a step inside Settings is
  // an instant swap; mounting a second frame would remount and play the
  // entry animation over a 220ms hole with the chart showing through.
  if (inviteOpen) {
    return (
      <FullScreenOverlay
        anchor="screen"
        exitOnDismiss={false}
        onBack={closeInvite}
        title={t('mobile.desktopInvite.screenTitle')}
      >
        <DesktopExperienceBody />
      </FullScreenOverlay>
    )
  }

  if (section) {
    return (
      <FullScreenOverlay
        anchor="screen"
        exitOnDismiss={false}
        onBack={back}
        title={t(settingsSectionNameKey(section))}
      >
        <div className="px-4 pb-6 pt-1">
          {section === 'profile' ? (
            <ProfileDetail />
          ) : (
            <SettingsSectionBody section={section} />
          )}
        </div>
      </FullScreenOverlay>
    )
  }

  return (
    <FullScreenOverlay
      anchor="screen"
      dismiss="close"
      onBack={onClose}
      title={t('mobile.shell.overlays.settings')}
    >
      <DesktopInviteBanner onOpen={() => setInviteOpen(true)} />
      <ProfileRow onOpen={() => setSection('profile')} />
      <AccountsSection onUnlock={() => setUnlockOpen(true)} />
      <VaultUnlockDialog onOpenChange={setUnlockOpen} open={unlockOpen} />

      <SectionLabel>{t('mobile.settings.terminalHeader')}</SectionLabel>
      {VISIBLE_SETTINGS_NAV_GROUPS.map((group, index) => (
        <div className={cn(index > 0 && 'mt-3')} key={group[0].id}>
          {group.map((item) => (
            <SettingsNavRow
              icon={<item.icon className="size-[18px] text-muted-foreground" />}
              id={item.id}
              key={item.id}
              label={t(item.nameKey)}
              onOpen={setSection}
            />
          ))}
        </div>
      ))}
    </FullScreenOverlay>
  )
})

/**
 * The invitation at the top of Settings.
 *
 * Dismissible, and the dismissal sticks: the phone is a companion surface,
 * and a permanent ad for the desktop at the top of a screen the user visits
 * to change a currency would wear out fast. It stays out of the way in the
 * desktop app for the obvious reason.
 *
 * The open and the dismiss are SIBLING buttons in one bordered row, not a
 * button inside a button: nested interactive elements are invalid, and the
 * inner one's taps are the ones that get eaten.
 */
function DesktopInviteBanner({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = usePersistedState(
    'mobile.desktopInviteDismissed',
    false,
  )

  if (dismissed || isStandalone) return null

  return (
    <div className="px-4 pb-1 pt-3">
      <div
        className="flex items-center rounded-2xl border border-primary/25"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in oklch, var(--primary) 14%, transparent), color-mix(in oklch, var(--primary) 4%, transparent))',
        }}
      >
        <button
          className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 pr-1 text-left"
          onClick={onOpen}
          type="button"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <MonitorSmartphone className="size-[18px] text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold leading-snug text-foreground">
              {t('mobile.desktopInvite.bannerTitle')}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
              {t('mobile.desktopInvite.bannerBody')}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-primary" />
        </button>
        <button
          aria-label={t('mobile.desktopInvite.bannerDismiss')}
          className="pl-hit-44 mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          onClick={() => setDismissed(true)}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

function SectionLabel({
  children,
  action,
  onAction,
}: {
  children: React.ReactNode
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pb-1.5 pt-5">
      <h3 className="text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
        {children}
      </h3>
      {action && onAction ? (
        <button
          className="pl-hit-44 shrink-0 text-[12.5px] font-medium text-primary"
          onClick={onAction}
          type="button"
        >
          {action}
        </button>
      ) : null}
    </div>
  )
}

const Chevron = <ChevronRight className="size-4 text-muted-foreground/70" />

/**
 * The two rows whose current value is worth restating in the list. Kept to
 * settings a trader changes and then wants to confirm at a glance; a value for
 * every row would turn the list into a table.
 */
function SettingsNavRow({
  id,
  label,
  icon,
  onOpen,
}: {
  id: SettingsNavId
  label: string
  icon: React.ReactNode
  onOpen: (id: SettingsNavId) => void
}) {
  const { t } = useTranslation()
  const { currency } = useDisplayCurrency()
  const maxPositionSize = useRiskConfigStore((s) => s.maxPositionSize)

  const value =
    id === 'currency'
      ? currency
      : id === 'risk' && maxPositionSize > 0
        ? t('mobile.settings.perOrder', { percent: maxPositionSize })
        : null

  return (
    <MobileRow
      leading={icon}
      onPress={() => onOpen(id)}
      title={label}
      trailing={
        <span className="flex items-center gap-1.5">
          {value ? (
            <span className="text-[12px] text-muted-foreground">{value}</span>
          ) : null}
          {Chevron}
        </span>
      }
    />
  )
}

function ProfileRow({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  const { session } = useOptimisticSession()
  const name = session?.user.name ?? session?.user.email ?? ''

  return (
    <MobileRow
      className="border-t-0"
      leading={
        <span
          className="flex size-10 items-center justify-center rounded-full text-[13px] font-semibold text-foreground"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in oklch, var(--primary) 32%, transparent), color-mix(in oklch, var(--primary) 9%, transparent))',
            boxShadow:
              'inset 0 0 0 1px color-mix(in oklch, var(--primary) 24%, transparent)',
          }}
        >
          {initialsFrom(name)}
        </span>
      }
      onPress={onOpen}
      subtitle={
        session ? session.user.email : t('settings.profile.notSignedIn')
      }
      title={session ? name : t('settings.nav.profile')}
      trailing={Chevron}
    />
  )
}

function initialsFrom(name: string): string {
  const derived = name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('')
  return derived || 'PL'
}

/**
 * Profile on the phone is identity plus a way in — the desktop dialog's avatar
 * upload and display-name form stay on the desktop, where the file picker and
 * the wide form belong. Signing IN is the part a phone genuinely needs.
 */
function ProfileDetail() {
  const { t } = useTranslation()
  const { session } = useOptimisticSession()

  if (session) {
    return (
      <div className="pt-2">
        <p className="text-[15px] font-semibold text-foreground">
          {session.user.name || session.user.email}
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {session.user.email}
        </p>
      </div>
    )
  }

  return (
    <div className="pt-2">
      <p className="text-[15px] font-semibold text-foreground">
        {t('settings.profile.signInTitle')}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
        {t('settings.profile.signInDescription')}
      </p>
      {hasAppServer ? (
        <a
          className="mt-4 flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
          href="/sign-in"
        >
          {t('settings.profile.signInButton')}
        </a>
      ) : null}
    </div>
  )
}

/**
 * Every key this device holds, in one list, each row saying what it is allowed
 * to do. The cards from the desktop accounts page are deliberately not reused:
 * each one opens its own portfolio subscription and draws a poster, which is a
 * lot of machinery for a row whose job is to answer "trade or read-only?".
 */
function AccountsSection({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation()
  const { pushOverlay } = useMobileActions()
  const credentials = useCredentialsStore((s) => s.credentials)
  const sealed = useCredentialsStore((s) => s.sealed)
  const load = useCredentialsStore((s) => s.load)
  const wallets = useWalletsStore((s) => s.wallets)
  const loadWallets = useWalletsStore((s) => s.load)

  useEffect(() => {
    void load()
    void loadWallets()
  }, [load, loadWallets])

  const openConnect = useCallback(
    () => pushOverlay({ kind: 'connect' }),
    [pushOverlay],
  )

  return (
    <>
      <SectionLabel action={t('common.add')} onAction={openConnect}>
        {t('mobile.settings.accountsHeader')}
      </SectionLabel>

      {sealed ? (
        // A sealed vault is a row you can ACT on. Desktop puts an Unlock button
        // in its banner; the phone shipped the same sentence with nothing
        // behind it, which left "your accounts are still here" as a statement
        // the user could read but not use.
        <MobileRow
          leading={<Lock className="size-[18px] text-muted-foreground" />}
          onPress={onUnlock}
          subtitle={t('accounts.vaultSealedBody')}
          title={t('security.vault.sealedBannerAction')}
          trailing={Chevron}
        />
      ) : credentials.length === 0 && wallets.length === 0 ? (
        <MobileRow
          leading={<Plus className="size-[18px] text-muted-foreground" />}
          onPress={openConnect}
          subtitle={t('accounts.noExchangeAccountsDesc')}
          title={t('accounts.connect')}
          trailing={Chevron}
        />
      ) : (
        <>
          {credentials.map((credential) => (
            <CredentialRow credential={credential} key={credential.id} />
          ))}
          {wallets.map((wallet) => (
            <MobileRow
              badge={<Tag tone="neutral">{t('mobile.settings.connected')}</Tag>}
              key={wallet.id}
              leading={
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-[10px] font-bold uppercase text-foreground">
                  {wallet.chain.slice(0, 3)}
                </span>
              }
              subtitle={`${t('accounts.typeCrypto')} · ${
                WALLET_SCHEMAS[wallet.chain]?.label ?? wallet.chain
              }`}
              title={wallet.label}
            />
          ))}
        </>
      )}

      <div className="px-4 pt-3">
        <StoredLocallyDisclosure />
      </div>
    </>
  )
}

/**
 * A credential row is a door, not a label. The account detail behind it is
 * where rename and disconnect live — before it existed this row was the end of
 * the road on the phone and revoking a key meant opening the desktop app.
 */
function CredentialRow({ credential }: { credential: ExchangeCredential }) {
  const { t } = useTranslation()
  const { pushOverlay } = useMobileActions()
  const permission = useVenueTradePermission(credential.market)
  const canTrade = permission === 'trade'

  const open = useCallback(
    () => pushOverlay({ kind: 'accountDetail', credentialId: credential.id }),
    [credential.id, pushOverlay],
  )

  return (
    <MobileRow
      badge={
        <Tag tone={canTrade ? 'up' : 'neutral'}>
          {canTrade ? t('mobile.settings.trading') : t('mobile.shell.readOnly')}
        </Tag>
      }
      leading={<ExchangeBadge market={credential.market} />}
      onPress={open}
      // The venue names the row and the user's own label is the sub-line: two
      // keys on one venue are told apart by the name they were given.
      subtitle={`${
        credential.label ||
        (isBrokerMarket(credential.market)
          ? t('accounts.typeBroker')
          : t('accounts.typeExchange'))
      } · ${
        credential.mode === 'paper' ? t('accounts.paper') : t('accounts.live')
      }`}
      title={CREDENTIAL_SCHEMAS[credential.market]?.label ?? credential.label}
      trailing={Chevron}
    />
  )
}

function Tag({
  tone,
  children,
}: {
  tone: 'up' | 'neutral'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'shrink-0 rounded border px-[5px] py-[3px] text-[8.5px] font-semibold uppercase leading-none tracking-[0.09em]',
        tone === 'up'
          ? 'border-up/50 text-up'
          : 'border-border text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}
