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
 * The second question, and the reason this file grew past a table: the clicked
 * venue may not trade what is on screen. Every pane picker offers same-class
 * venues only (`venuesForClass`), but the omni search lists all of them under
 * one heading, so "Binance Futures" was reachable from a spot chart. The venue
 * swapped into the address and the class did not, which left the terminal on
 * `/spot/binance-futures/BTC-USDT`: the spot board, a two-segment key no
 * futures venue resolves, and — the arm that matters — `/spot/alpaca/BTC-USDT`,
 * where the base leg is a real spot-bitcoin ETF and a ~$28 equity price would
 * render under a crypto pair's label. So the class moves WITH the venue when
 * the instrument exists on the other side of it, and when it does not the
 * switch degrades to the preference alone rather than navigating somewhere
 * nothing can answer.
 *
 * The decision is pure so it can be stated as a table; `useSwitchVenue` is the
 * three lines that carry it out.
 */
import {
  isVenueBoundClass,
  marketServesClass,
  normalizeInstrumentClass,
  parseMarketRefPath,
} from '@pairlens/shared/market-ref'
import type { MarketRef } from '@pairlens/shared/market-ref'

import { sameAssetInClass } from '@/lib/market-ref/cross-class'

/**
 * Where an instrument goes when a venue is picked for it.
 *
 * Split out from the plan because two surfaces ask it and only one of them is
 * a "switch": the omni search hands over a venue with no idea what is on
 * screen, while the chart's own dropdown has already narrowed its list to
 * venues that can take this instrument and just needs the address. One answer
 * for both, so the dropdown cannot drift back into keeping the class.
 */
export type VenueTarget =
  /** Already on this venue. */
  | { kind: 'same' }
  /** The venue serves the class charted; only the tape moves. */
  | { kind: 'chart'; ref: MarketRef }
  /** The venue trades another class, and the instrument exists there. */
  | { kind: 'cross-class'; ref: MarketRef }
  /** The venue trades another class and this instrument is not on it. */
  | { kind: 'unavailable' }

export function venueTargetFor({
  ref,
  market,
  venueClasses,
}: {
  ref: MarketRef
  /** The venue that was picked. */
  market: string
  /**
   * Asset classes it declares, spelled however its manifest spells them.
   * Null means the caller cannot say, and then the venue is believed.
   */
  venueClasses?: ReadonlyArray<string> | null
}): VenueTarget {
  // Already here. Never a refusal, whatever the venue declares: the checkmark
  // in a picker has to stay clickable.
  if (ref.market === market) return { kind: 'same' }

  // A venue-bound class has no tape to move to. A token IS its chain plus its
  // address and an outcome IS its venue plus its market id, so the same string
  // on another venue is a different asset or, far more often, nothing.
  if (isVenueBoundClass(ref.cls)) return { kind: 'unavailable' }

  if (!venueClasses || marketServesClass(venueClasses, ref.cls)) {
    return { kind: 'chart', ref: { ...ref, market } }
  }

  // Another class. The whole page moves to it — class, venue and instrument
  // together — when the asset exists on that side. Spot to perp is the one hop
  // that qualifies, which is the one users ask for.
  for (const declared of venueClasses) {
    const cls = normalizeInstrumentClass(declared)
    if (!cls) continue
    const id = sameAssetInClass(ref.id, ref.cls, cls)
    if (!id) continue
    return { kind: 'cross-class', ref: { cls, market, id } }
  }

  return { kind: 'unavailable' }
}

/** Which owner took the switch. Callers report it; nothing branches on it. */
export type VenueSwitchScope =
  | 'override'
  | 'variable'
  | 'chart'
  /** The venue trades another class, and the page moved to that class with it. */
  | 'cross-class'
  /** The venue trades another class, and this instrument has no counterpart there. */
  | 'unavailable'
  | 'preference'

export type VenueSwitchPlan = {
  scope: VenueSwitchScope
  /** Write this pair into the pane override or the bound variable. */
  setPair: { pairKey: string; market: string } | null
  /** Write the global venue preference (`terminal.market`). */
  writePreference: boolean
  /** Move the chart route here. */
  navigateTo: MarketRef | null
  /**
   * What stayed behind, set only for `unavailable`. The caller needs it to
   * name the pair it could not move, because that is the whole content of the
   * message: a venue switch that changed nothing on screen has to say so.
   */
  stranded: MarketRef | null
}

export type VenueSwitchInput = {
  /** The venue that was clicked. */
  market: string
  /**
   * Asset classes the clicked venue declares, spelled however its manifest
   * spells them (`'crypto-perp'`, `'crypto-spot'`, `'dex'`, ...).
   *
   * Null means the caller cannot say, and then the venue is believed: the pane
   * pickers narrow their own lists to the class already on screen, so a switch
   * arriving from one of them is same-class by construction.
   */
  venueClasses?: ReadonlyArray<string> | null
  /** Where the pane's pair came from, null outside a pane. */
  pairSource: 'override' | 'variable' | 'global' | null
  /** The pane's resolved pair, null outside a pane or before it resolves. */
  panePair: { pairKey: string; market: string } | null
  /** The current location, which is where the chart route keeps its venue. */
  pathname: string
}

export function planVenueSwitch({
  market,
  venueClasses,
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
      stranded: null,
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
      stranded: null,
    }
  }

  const target = venueTargetFor({ ref, market, venueClasses })

  if (target.kind === 'unavailable') {
    return {
      scope: 'unavailable',
      setPair: null,
      // The user still named a venue, and the classes it does trade should
      // open there next time. This is exactly the off-chart outcome.
      writePreference: true,
      navigateTo: null,
      stranded: ref,
    }
  }

  return {
    scope: target.kind === 'cross-class' ? 'cross-class' : 'chart',
    setPair: null,
    writePreference: true,
    navigateTo: target.kind === 'same' ? null : target.ref,
    stranded: null,
  }
}
