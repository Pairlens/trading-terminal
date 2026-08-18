// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Who owns the venue here, and therefore what "switch to Kraken" has to write.
 *
 * There are four owners and they do not overlap, so a caller that picks the
 * wrong one writes a value nothing reads. That is not hypothetical: clicking a
 * venue row used to write the `terminal.market` PREFERENCE, which the chart
 * route stopped reading when the venue moved into the URL, and the click
 * looked inert.
 *
 * The decision is pure so it can be stated as a table; `useSwitchVenue` is the
 * three lines that carry it out.
 */
import { parseMarketRefPath } from '@pairlens/shared/market-ref'
import type { MarketRef } from '@pairlens/shared/market-ref'

/** Which owner took the switch. Callers report it; nothing branches on it. */
export type VenueSwitchScope = 'override' | 'variable' | 'chart' | 'preference'

export type VenueSwitchPlan = {
  scope: VenueSwitchScope
  /** Write this pair into the pane override or the bound variable. */
  setPair: { pairKey: string; market: string } | null
  /** Write the global venue preference (`terminal.market`). */
  writePreference: boolean
  /** Move the chart route here. */
  navigateTo: MarketRef | null
}

export type VenueSwitchInput = {
  /** The venue that was clicked. */
  market: string
  /** Where the pane's pair came from, null outside a pane. */
  pairSource: 'override' | 'variable' | 'global' | null
  /** The pane's resolved pair, null outside a pane or before it resolves. */
  panePair: { pairKey: string; market: string } | null
  /** The current location, which is where the chart route keeps its venue. */
  pathname: string
}

export function planVenueSwitch({
  market,
  pairSource,
  panePair,
  pathname,
}: VenueSwitchInput): VenueSwitchPlan {
  // A pane holding its own pair is answered here and nowhere else, even when
  // it already sits on the venue that was clicked. Falling through would move
  // the whole page to a venue only this one pane was on.
  if (panePair && (pairSource === 'override' || pairSource === 'variable')) {
    return {
      scope: pairSource,
      setPair:
        panePair.market === market
          ? null
          : { pairKey: panePair.pairKey, market },
      writePreference: false,
      navigateTo: null,
    }
  }

  // Everything else is the user's own venue, so the preference moves with it:
  // discovery panes and pickers read it to price a row they have no venue for.
  const ref = parseMarketRefPath(pathname)
  if (!ref) {
    return {
      scope: 'preference',
      setPair: null,
      writePreference: true,
      navigateTo: null,
    }
  }

  return {
    scope: 'chart',
    setPair: null,
    writePreference: true,
    navigateTo: ref.market === market ? null : { ...ref, market },
  }
}
