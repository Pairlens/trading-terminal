// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which intervals a venue actually serves, and what to chart when the user's
 * choice is not one of them.
 *
 * Every CEX on the ccxt bridge accepts the nine intervals the terminal offers,
 * so for years the toolbar could hardcode the list and the persisted
 * `terminal.timeframe` could be handed straight to the connector. Prediction
 * venues broke that: Kalshi's OHLCV endpoint takes 1m/1h/1d and 400s on
 * anything else, Polymarket takes four. A persisted `15m` therefore reached
 * Polymarket, the history probe failed, and the chart sat on "Analyzing
 * market…" — and because that probe is also the availability probe, the pair
 * was then published as unlisted and the trade pane hid itself behind "isn't
 * available on Polymarket" while the ticket worked perfectly.
 *
 * So the clamp happens at the CONSUMER and the preference is never rewritten.
 * The user picked 15m; a venue that cannot draw it is the venue's limitation,
 * not a change of mind, and switching back to a CEX has to land on 15m again.
 * Same shape as the asset-class coercion in `market-asset-classes.ts`: the
 * stored value stays, the resolved one adapts.
 */

import { TIMEFRAME_TO_MS } from '@pairlens/shared/timeframe'

/**
 * Duration of each interval, for ordering only — the shared union's own
 * table, not a copy. An interval added to `Timeframe` is therefore orderable
 * here the moment it exists, where a local copy would have gone on quietly
 * treating it as unknown. A string that is NOT in the union (a third-party
 * connector's own spelling) has no position in the order and is never chosen
 * as a clamp target, though it is still honoured when the venue and the user
 * agree on it.
 */
const TIMEFRAME_MS: Record<string, number> = TIMEFRAME_TO_MS

/**
 * The venue's list, ordered shortest first. Unknown spellings sort last in
 * their declared order rather than being dropped: a connector may serve an
 * interval this build has no chip for, and the user can still be ON it.
 */
export function orderTimeframes(timeframes: Array<string>): Array<string> {
  return [...timeframes].sort((a, b) => {
    const left = TIMEFRAME_MS[a]
    const right = TIMEFRAME_MS[b]
    if (left === undefined && right === undefined) return 0
    if (left === undefined) return 1
    if (right === undefined) return -1
    return left - right
  })
}

/**
 * The interval to actually chart, given what the user wants and what the venue
 * serves.
 *
 * The rule is **nearest smaller, else smallest**:
 *  - the venue serves it, or declares nothing at all → the user's choice
 *    (an empty list means "this venue did not say", and assuming capability is
 *    what every other unknown-venue check in the terminal does);
 *  - otherwise the longest supported interval SHORTER than the request. Down
 *    rather than up because a shorter bar is strictly more information: the
 *    user's window still fits on screen, just in finer bars. Rounding up hides
 *    detail they asked to see and can leave a young market with two bars;
 *  - and when nothing is shorter (a 1m request on a venue whose floor is 1h),
 *    the shortest one there is — the closest thing to what was asked for.
 *
 * Deterministic and pure: the same request on the same venue always charts the
 * same interval, so a reload does not move the chart.
 */
export function clampTimeframeToVenue(
  desired: string,
  supported: Array<string>,
): string {
  if (supported.length === 0) return desired
  if (supported.includes(desired)) return desired

  const ordered = orderTimeframes(supported)
  const target = TIMEFRAME_MS[desired]
  if (target === undefined) return ordered[0] ?? desired

  let best: string | null = null
  for (const candidate of ordered) {
    const ms = TIMEFRAME_MS[candidate]
    if (ms === undefined || ms >= target) continue
    best = candidate
  }
  return best ?? ordered[0] ?? desired
}
