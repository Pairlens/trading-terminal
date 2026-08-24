// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one-time explainer the Equities desk owes a trader who has never
 * connected a broker.
 *
 * Discovery's stocks board draws five panes, and without a key three of them
 * come up gated while the two calendars fill in normally. Every other section
 * loads itself, so the honest reading of that half-empty board is "this is
 * broken", and the inline pane gates cannot fix it: each one states its own
 * fact in eleven point type, and a trader who has just arrived reads a wall of
 * the same sentence rather than the reason behind it.
 *
 * So the board says it once, in full: US market data is licensed, {{venue}}
 * serves it to your key and nobody else's, and here is the button. Dismissing
 * is a real answer and it sticks; the panes keep their gates for every visit
 * after. Rules live in `lib/equities/connect-prompt.ts`.
 */
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, KeyRound, LineChart, ShieldCheck } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import type { DiscoverySectionId } from '@/lib/layout/workspaces/discovery-sections'
import {
  areSectionTipsDisabled,
  isSectionTourPending,
} from '@/components/onboarding/use-section-tour'
import { assetClassIcon } from '@/lib/asset-class/icons'
import { isOnboardingComplete } from '@/lib/onboarding-state'
import { track } from '@/lib/analytics-events'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketCredentialGate } from '@/hooks/use-market-credential-gate'
import { usePersistedState } from '@/hooks/use-persisted-state'
import {
  EQUITIES_CONNECT_PROMPT_KEY,
  EQUITIES_CONNECT_PROMPT_SECTION,
  shouldShowEquitiesConnectPrompt,
} from '@/lib/equities/connect-prompt'

/**
 * The three facts, in the order a trader needs them: what is missing, what is
 * not, and where the key ends up. Icons carry the shape so the block scans
 * before it is read.
 */
const FACTS = [
  { icon: LineChart, key: 'equitiesConnect.factPrices' },
  { icon: CalendarDays, key: 'equitiesConnect.factCalendars' },
  { icon: ShieldCheck, key: 'equitiesConnect.factKeys' },
] as const

export function EquitiesConnectDialog({
  section,
}: {
  section: DiscoverySectionId
}) {
  const { t } = useTranslation()
  const { markets } = useAvailableMarkets()
  const [seen, setSeen] = usePersistedState<boolean>(
    EQUITIES_CONNECT_PROMPT_KEY,
    false,
  )

  // The venue the stocks board is drawn from, rather than a hardcoded
  // 'alpaca': a deployment that ships a different broker connector gets its
  // name in the copy and its id in the deep link.
  const venue = useMemo(
    () => markets.find((m) => m.assetClasses.includes('stocks')),
    [markets],
  )
  const gate = useMarketCredentialGate(venue?.value ?? '')

  // The onboarding and tour flags are read straight off localStorage rather
  // than subscribed to. Both are written by surfaces that cover this one
  // while they are up, so by the time this board is being read they have
  // settled, and the state that does move (`seen`) is the reactive one.
  const open =
    Boolean(venue) &&
    shouldShowEquitiesConnectPrompt({
      section,
      gate: gate.state,
      seen,
      onboardingDone: isOnboardingComplete(),
      tourPending: isSectionTourPending('pairs'),
      tipsDisabled: areSectionTipsDisabled(),
    })

  const market = venue?.value
  useEffect(() => {
    if (open && market)
      track('equities_connect_prompt_shown', { venue: market })
  }, [open, market])

  if (!venue) return null

  // Every way out marks it seen. An explainer that returns because the trader
  // pressed Escape instead of the button is a nag, and the panes behind it
  // still carry the same CTA.
  const dismiss = (action: 'connect' | 'dismissed') => {
    setSeen(true)
    track('equities_connect_prompt_decided', { venue: venue.value, action })
  }

  const Icon = assetClassIcon(EQUITIES_CONNECT_PROMPT_SECTION)

  return (
    // `open` rather than an early return, so dismissing plays the dialog's
    // own exit rather than vanishing the frame the flag is written.
    <Dialog onOpenChange={(next) => !next && dismiss('dismissed')} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-asset-stocks/12 text-asset-stocks">
            <Icon className="size-5" />
          </div>
          <DialogTitle>
            {t('equitiesConnect.title', { venue: venue.label })}
          </DialogTitle>
          <DialogDescription>
            {t('equitiesConnect.description', { venue: venue.label })}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5">
          {FACTS.map(({ icon: FactIcon, key }) => (
            <li className="flex gap-2.5 text-sm" key={key}>
              <FactIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="leading-snug text-muted-foreground">
                {t(key, { venue: venue.label })}
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button onClick={() => dismiss('dismissed')} variant="outline">
            {t('equitiesConnect.dismiss')}
          </Button>
          {/* The same `?connect=` deep link the pane gates carry, so the
              wizard opens ON this venue instead of a page where the trader
              has to find it again. */}
          <Button
            nativeButton={false}
            onClick={() => dismiss('connect')}
            render={<Link search={{ connect: venue.value }} to="/accounts" />}
          >
            <KeyRound className="size-4" />
            {t('equitiesConnect.connect', { venue: venue.label })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
