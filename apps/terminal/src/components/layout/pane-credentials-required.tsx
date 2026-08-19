// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a market pane shows when the venue has no public feed and the key that
 * would serve one is missing or locked away.
 *
 * Sibling of `PaneDataUnavailable`, and the split is deliberate: that one says
 * "this venue doesn't carry this pair", which no button of ours can fix, so it
 * offers other venues. This one says "we can't reach YOUR data", which one tap
 * does fix — so it carries the tap rather than sending the user to Settings to
 * work out what happened.
 *
 * `compact` follows the same rule as its sibling: the narrow panes state the
 * fact and stop, because the chart pane beside them already carries the CTA
 * and four unlock buttons in one workspace is noise, not helpfulness.
 *
 * `variant` is a different axis, and the discovery boards are why it exists.
 * A board is five panes and no chart, so three of them drawing the full
 * centred hero turns an honest state into a wall of the same paragraph, and
 * the board reads as broken rather than as waiting for a key. `compact` there
 * is one line, one sentence and one small button laid out as a strip — the
 * shape of a row, not of an error page. It supersedes the `compact` density
 * flag when both are passed.
 *
 * `kind` picks WHICH truth is told. The default body says the venue publishes no
 * public price feed, which is the reason a chart, book or tape needs a key. An
 * account pane's reason is a different one — margin, positions and balances are
 * private on every venue, public feed or not — so telling it the price-feed
 * sentence is simply false there.
 */
import { KeyRound, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'

import { VaultUnlockDialog } from '@/components/security/vault-unlock-dialog'

/**
 * The copy each pane kind gets, as whole literals so the i18n orphan audit can
 * see them.
 *
 * The sealed TITLE is shared on purpose: "Unlock to load {{venue}} data" is
 * accurate for a chart and for a margin gauge alike, and a second key would be
 * seventeen catalogs of the same sentence.
 */
const COPY = {
  market: {
    sealed: {
      title: 'layout.paneCredentials.sealedTitle',
      body: 'layout.paneCredentials.sealedDescription',
    },
    missing: {
      title: 'layout.paneCredentials.missingTitle',
      body: 'layout.paneCredentials.missingDescription',
    },
  },
  account: {
    sealed: {
      title: 'layout.paneCredentials.sealedTitle',
      body: 'layout.paneCredentials.accountSealedDescription',
    },
    missing: {
      title: 'layout.paneCredentials.accountMissingTitle',
      body: 'layout.paneCredentials.accountMissingDescription',
    },
  },
  wallet: {
    sealed: {
      title: 'layout.paneCredentials.sealedTitle',
      body: 'layout.paneCredentials.walletSealedDescription',
    },
    missing: {
      title: 'layout.paneCredentials.walletMissingTitle',
      body: 'layout.paneCredentials.walletMissingDescription',
    },
  },
} as const

export function PaneCredentialsRequired({
  state,
  market,
  venueLabel,
  compact = false,
  kind = 'market',
  variant = 'block',
}: {
  state: 'sealed' | 'missing'
  /** Venue id, for the `?connect=` deep link the CTA carries. */
  market: string
  venueLabel: string
  /** Narrow-pane layout: tighter type, no buttons. */
  compact?: boolean
  /**
   * `block` (default): the centred hero every pane shipped with. `compact`: one
   * line, one sentence and a small inline button, for a discovery board where
   * several panes share the same gate and no chart carries the CTA for them.
   */
  variant?: 'block' | 'compact'
  /**
   * `market` (default): the key is what streams prices. `account`: the key is
   * what reads balances, positions and orders, on a venue whose prices are
   * public — margin health, your position. `wallet`: the pane works with a
   * connected on-chain wallet — LP positions, fees, bridging — where the
   * price-feed sentence would promise a chart the pane never draws.
   */
  kind?: 'market' | 'account' | 'wallet'
}) {
  const { t } = useTranslation()
  const [unlockOpen, setUnlockOpen] = useState(false)

  const sealed = state === 'sealed'
  const Icon = sealed ? LockKeyhole : KeyRound
  const copy = COPY[kind][state]

  if (variant === 'compact') {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center gap-2.5 py-2">
        <Icon className="size-4 shrink-0 text-muted-foreground/50" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-foreground">
            {t(copy.title, { venue: venueLabel })}
          </p>
          <p className="text-[10.5px] leading-snug text-muted-foreground">
            {t(
              sealed
                ? 'layout.paneCredentials.compactSealedDescription'
                : 'layout.paneCredentials.compactMissingDescription',
              { venue: venueLabel },
            )}
          </p>
        </div>

        {sealed ? (
          <>
            <Button
              className="h-7 shrink-0 px-2.5 text-[11px]"
              onClick={() => setUnlockOpen(true)}
              size="sm"
              variant="secondary"
            >
              {t('security.vault.sealedBannerAction')}
            </Button>
            <VaultUnlockDialog onOpenChange={setUnlockOpen} open={unlockOpen} />
          </>
        ) : (
          <Button
            className="h-7 shrink-0 px-2.5 text-[11px]"
            nativeButton={false}
            render={<Link search={{ connect: market }} to="/accounts" />}
            size="sm"
          >
            {t('layout.paneCredentials.compactConnectAction')}
          </Button>
        )}
      </div>
    )
  }

  return (
    // `flex-1` for the same reason as PaneDataUnavailable: the parent is a
    // flex ROW, and without it the box shrinks to its content and centres
    // nothing.
    <div
      className={cn(
        'flex min-h-0 flex-1 items-center justify-center',
        compact ? 'h-full p-3' : 'p-6',
      )}
    >
      <div
        className={cn('text-center', compact ? 'max-w-[15rem]' : 'max-w-xs')}
      >
        <Icon
          className={cn(
            'mx-auto text-muted-foreground/40',
            compact ? 'mb-2 size-5' : 'mb-3 size-8',
          )}
        />
        <p
          className={cn(
            'font-medium text-foreground',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {t(copy.title, { venue: venueLabel })}
        </p>
        <p
          className={cn(
            'mt-1 text-muted-foreground',
            compact ? 'text-[10px] leading-snug' : 'text-xs leading-relaxed',
          )}
        >
          {t(copy.body, { venue: venueLabel })}
        </p>

        {!compact && sealed && (
          <Button
            size="sm"
            className="mt-4"
            onClick={() => setUnlockOpen(true)}
          >
            <LockKeyhole className="size-3.5" />
            {t('security.vault.sealedBannerAction')}
          </Button>
        )}

        {/* Same deep link the trade ticket's connect gate uses, so it opens
            the wizard ON this venue instead of a page where the user has to
            find it again. The mobile route sync reads `?connect=` too, which
            is why this one component serves both shells. */}
        {!compact && !sealed && (
          <Button
            size="sm"
            className="mt-4"
            nativeButton={false}
            render={<Link to="/accounts" search={{ connect: market }} />}
          >
            <KeyRound className="size-3.5" />
            {t('layout.paneCredentials.connectAction', { venue: venueLabel })}
          </Button>
        )}
      </div>

      {/* Mounted only by the pane that drew the button, so a workspace with
          five market panes opens one dialog rather than racing five. */}
      {!compact && sealed && (
        <VaultUnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} />
      )}
    </div>
  )
}
