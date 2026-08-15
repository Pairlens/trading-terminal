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
 */
import { KeyRound, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'

import { VaultUnlockDialog } from '@/components/security/vault-unlock-dialog'

export function PaneCredentialsRequired({
  state,
  market,
  venueLabel,
  compact = false,
}: {
  state: 'sealed' | 'missing'
  /** Venue id, for the `?connect=` deep link the CTA carries. */
  market: string
  venueLabel: string
  /** Narrow-pane layout: tighter type, no buttons. */
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [unlockOpen, setUnlockOpen] = useState(false)

  const sealed = state === 'sealed'
  const Icon = sealed ? LockKeyhole : KeyRound

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
          {t(
            sealed
              ? 'layout.paneCredentials.sealedTitle'
              : 'layout.paneCredentials.missingTitle',
            { venue: venueLabel },
          )}
        </p>
        <p
          className={cn(
            'mt-1 text-muted-foreground',
            compact ? 'text-[10px] leading-snug' : 'text-xs leading-relaxed',
          )}
        >
          {t(
            sealed
              ? 'layout.paneCredentials.sealedDescription'
              : 'layout.paneCredentials.missingDescription',
            { venue: venueLabel },
          )}
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
