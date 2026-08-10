// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the chart's switch indicator is allowed to say.
 *
 * The phone shows the same "we are fetching the next market" hint the desktop
 * panes show (`PaneTransition`), and it borrows the desktop's wording rule with
 * it: name the venue only when the venue is what changed. A pair switch inside
 * one venue says "Switching…", because "Switching to Kraken…" under a top bar
 * that already reads Kraken tells the user nothing.
 *
 * The rule needs one bit of memory — the venue is swapped in the same render
 * that clears the snapshot, so by the time the indicator mounts the change has
 * already happened — which is why this is a state machine and not a comparison
 * at the call site. It lives here, pure, so the bookkeeping is testable without
 * a renderer; `MobileChartSurface` holds the single instance of it in a ref.
 */

export type ChartSwitchState = {
  /** The venue the previous evaluation saw. */
  market: string
  /** True while the switch in flight is also a venue change. */
  venueChanged: boolean
}

/** The state a surface starts on: whatever venue it mounted with, at rest. */
export function initialChartSwitchState(market: string): ChartSwitchState {
  return { market, venueChanged: false }
}

/**
 * Fold one render's inputs into the switch state.
 *
 * Pure and idempotent: called twice with the same arguments it returns an
 * equal state, which is what makes it safe to run during render (and under
 * StrictMode's double invocation).
 *
 * @param prev        the state from the previous evaluation
 * @param market      the venue the chart is pointed at now
 * @param hasSnapshot whether that venue has answered with candles yet
 */
export function advanceChartSwitch(
  prev: ChartSwitchState,
  market: string,
  hasSnapshot: boolean,
): ChartSwitchState {
  if (prev.market !== market) return { market, venueChanged: true }
  // The snapshot landing ends the episode — including one that started as a
  // venue change, so the NEXT pair switch on that venue doesn't inherit its
  // wording.
  if (hasSnapshot && prev.venueChanged) return { market, venueChanged: false }
  return prev
}
