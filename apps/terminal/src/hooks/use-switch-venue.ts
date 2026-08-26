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
 * part that needs React and the router. The venue table comes in here because
 * the plan needs to know what the clicked venue actually trades — a switch
 * across asset classes has to move the class too, or refuse.
 */
import { useCallback, useContext } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'

import type { VenueSwitchPlan, VenueSwitchScope } from '@/lib/venue-switch'
import { planVenueSwitch } from '@/lib/venue-switch'
import { chartLinkProps } from '@/lib/market-ref/link'
import { PaneContext } from '@/lib/layout/pane-context'
import { switchActiveMarket } from '@/lib/switch-market'
import { useAvailableMarkets } from '@/hooks/use-available-markets'

export type { VenueSwitchPlan, VenueSwitchScope }

export function useSwitchVenue(): (market: string) => VenueSwitchPlan {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { markets } = useAvailableMarkets()
  // Optional on purpose: the geo dialog and the omni-search palette switch
  // venue from outside any pane.
  const pane = useContext(PaneContext)

  return useCallback(
    (market: string): VenueSwitchPlan => {
      const plan = planVenueSwitch({
        market,
        venueClasses:
          markets.find((m) => m.value === market)?.assetClasses ?? null,
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

      return plan
    },
    [markets, pane, pathname, navigate],
  )
}
