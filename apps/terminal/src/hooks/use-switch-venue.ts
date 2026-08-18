// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Switch an instrument to another venue, through whoever owns the venue here.
 *
 * Panes that let the user pick a venue (the ladder, the multi-price board) all
 * used to call `switchActiveMarket`, which writes the `terminal.market`
 * preference. On the chart route that preference is not what the chart reads:
 * the venue lives in the URL (`/{class}/{venue}/{id}`), which is what puts the
 * tape in a shared link. So the click wrote a value nothing on screen read.
 *
 * `planVenueSwitch` holds the decision and is tested on its own; this is the
 * part that needs React and the router.
 */
import { useCallback, useContext } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'

import type { VenueSwitchScope } from '@/lib/venue-switch'
import { planVenueSwitch } from '@/lib/venue-switch'
import { chartLinkProps } from '@/lib/market-ref/link'
import { PaneContext } from '@/lib/layout/pane-context'
import { switchActiveMarket } from '@/lib/switch-market'

export type { VenueSwitchScope }

export function useSwitchVenue(): (market: string) => VenueSwitchScope {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Optional on purpose: the geo dialog and the omni-search palette switch
  // venue from outside any pane.
  const pane = useContext(PaneContext)

  return useCallback(
    (market: string): VenueSwitchScope => {
      const plan = planVenueSwitch({
        market,
        pairSource: pane?.pairSource ?? null,
        panePair: pane?.resolvedPair ?? null,
        pathname,
      })

      if (plan.setPair) {
        if (plan.scope === 'variable') pane?.setVariableValue(plan.setPair)
        else pane?.setPaneOverride('active-pair', plan.setPair)
      }
      if (plan.writePreference) switchActiveMarket(market)
      if (plan.navigateTo) {
        // `replace`, matching the venue dropdown: flicking through venues on
        // one pair should not build a back stack to walk out of.
        void navigate({ ...chartLinkProps(plan.navigateTo), replace: true })
      }

      return plan.scope
    },
    [pane, pathname, navigate],
  )
}
