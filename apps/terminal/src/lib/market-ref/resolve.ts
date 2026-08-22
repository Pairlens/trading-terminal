// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Instrument → venue. The one place that decision is made.
 *
 * It used to be made in six: `resolveVenue` in the recents marquee,
 * `resolveMarketForAssetClass` behind three panes and the compare menu, and
 * the mobile shell's own binary stocks/not-stocks correction. All of them
 * ended the same way, `return preferred`, so a venue that could not serve the
 * instrument got asked anyway and answered with whatever its own symbol
 * mapping produced. That is how a spot-bitcoin ETF ended up priced under a
 * crypto pair's label.
 *
 * Two changes make that impossible rather than unlikely:
 *
 * 1. **There is a "no" answer.** `ok: false` is a real outcome the UI renders,
 *    the same way `PaneCredentialsRequired` renders "connect an account"
 *    instead of a badge that never resolves. A wrong price is worse than a
 *    blank pane, so nothing here falls back to a venue that cannot serve the
 *    class.
 * 2. **Both sides of the class comparison are normalized.** The instruments
 *    index says `'crypto'`, connectors say `'crypto-spot'`, and the raw
 *    `.includes()` between them never matched.
 */
import {
  isVenueBoundClass,
  marketServesClass,
  normalizeInstrumentClass,
} from '@pairlens/shared/market-ref'
import type { InstrumentRef, MarketRef } from '@pairlens/shared/market-ref'

import type { MarketOption } from '@/hooks/use-available-markets'

/** Why a ref resolved the way it did. Surfaced in dev logs and tests. */
export type ResolvedReason =
  /** The class binds its own venue (a token IS its chain). No choice made. */
  | 'bound'
  /** The ref already named a venue that can serve it. Believed as written. */
  | 'pinned'
  /** The preferred venue, confirmed by the instruments index to list it. */
  | 'listed'
  /** The preferred venue, which serves the class. Index had nothing to say. */
  | 'preferred'
  /** The preferred venue cannot serve this class; first one that can. */
  | 'substituted'

export type UnresolvedReason =
  /** No connected venue serves this asset class at all. */
  | 'no-venue'
  /** The ref names a venue that is not installed or not active. */
  | 'venue-missing'

export type MarketRefResolution =
  | { ok: true; ref: MarketRef; reason: ResolvedReason }
  | { ok: false; reason: UnresolvedReason; cls: InstrumentRef['cls'] }

export type MarketRefContext = {
  /**
   * Connected venues. Empty during plugin boot, which resolves as
   * `no-venue` — callers already gate on `pluginsReady`/`markets.length`
   * before rendering, so this never flashes a refusal at startup.
   */
  markets: ReadonlyArray<MarketOption>
  /** The venue the user last charted (`terminal.market`). */
  preferred: string
  /**
   * Venues the instruments index says list this instrument. Optional: that
   * index is an App Server read, so standalone, offline or signed out it is
   * empty for everything, and an empty list means "unknown", never "nobody
   * lists it" (the snapshot contract is explicit about this).
   */
  listedOn?: ReadonlyArray<string>
}

/**
 * Venues that could serve this class in this build. `desktopOnly` is already
 * platform-aware, so filtering on it here excludes the four CORS-blocked
 * venues in a browser and nothing at all on desktop. Resolving INTO one of
 * them would hand the user a chart that can never seed.
 */
function candidatesFor(
  cls: InstrumentRef['cls'],
  markets: ReadonlyArray<MarketOption>,
): Array<MarketOption> {
  return markets.filter(
    (m) => !m.desktopOnly && marketServesClass(m.assetClasses, cls),
  )
}

/**
 * The venues a picker may OFFER while an instrument of `cls` is on screen.
 *
 * Unlike `candidatesFor` this keeps the ones this build cannot reach: the
 * pickers show them with a "Desktop" mark on purpose, because hiding a third
 * of the connector list makes the product look smaller than it is. What it
 * does drop is the other asset classes, which are not a lesser choice but a
 * dead one — the pair id means nothing to them, and picking one took the
 * whole surface dark.
 *
 * A venue-bound class comes back as the current venue alone. Kalshi and
 * Polymarket are both prediction venues and neither can answer for the
 * other's contract, so "same class" is not a tight enough rule there: the
 * instrument names its venue, and there is nothing to switch to.
 *
 * `current` is kept whatever it declares, so the list always contains the row
 * the checkmark is on.
 */
export function venuesForClass(
  cls: InstrumentRef['cls'],
  current: string,
  markets: ReadonlyArray<MarketOption>,
): Array<MarketOption> {
  if (isVenueBoundClass(cls)) {
    return markets.filter((m) => m.value === current)
  }
  return markets.filter(
    (m) => m.value === current || marketServesClass(m.assetClasses, cls),
  )
}

/** The class a connected venue serves, or undefined if it names none we know. */
export function venueClassOf(
  option: MarketOption | undefined,
): InstrumentRef['cls'] | undefined {
  return normalizeInstrumentClass(option?.assetClasses[0])
}

/**
 * The venues an empty state may offer INSTEAD of the current one.
 *
 * Every "no data here, try one of these" affordance in the terminal was
 * offering the whole connector list, so a stock with no print suggested
 * Binance and a Kalshi contract behind the browser wall suggested OKX. Both
 * land on the same dark screen the user was trying to leave, one click later.
 *
 * Empty for a venue-bound class, and that is the honest answer rather than a
 * missing feature: a Polymarket outcome id means nothing to Kalshi, and a
 * pool address on another chain is another asset entirely.
 */
export function alternativeVenuesFor(
  current: MarketOption | undefined,
  markets: ReadonlyArray<MarketOption>,
): Array<MarketOption> {
  const cls = venueClassOf(current)
  if (!cls || isVenueBoundClass(cls)) return []
  return candidatesFor(cls, markets).filter((m) => m.value !== current?.value)
}

/**
 * The venue half of the decision, for callers that hold a class rather than a
 * whole instrument (a discovery row picking where to draw its trend line).
 * Returns null when nothing connected serves the class, which is the answer
 * the old `resolveMarketForAssetClass` could not give.
 */
export function resolveVenueForClass(
  cls: InstrumentRef['cls'],
  ctx: MarketRefContext,
): string | null {
  const candidates = candidatesFor(cls, ctx.markets)
  if (candidates.length === 0) return null
  const listed = ctx.listedOn?.length
    ? candidates.filter((c) => ctx.listedOn!.includes(c.value))
    : []
  const pool = listed.length > 0 ? listed : candidates
  return (pool.find((m) => m.value === ctx.preferred) ?? pool[0]).value
}

export function resolveMarketRef(
  inst: InstrumentRef,
  ctx: MarketRefContext,
): MarketRefResolution {
  // ── Venue-bound arms: identity already names the venue ──────────────
  if (isVenueBoundClass(inst.cls)) {
    if (!inst.market) return { ok: false, reason: 'no-venue', cls: inst.cls }
    const known = ctx.markets.some((m) => m.value === inst.market)
    if (!known) return { ok: false, reason: 'venue-missing', cls: inst.cls }
    return {
      ok: true,
      reason: 'bound',
      ref: { cls: inst.cls, market: inst.market, id: inst.id },
    }
  }

  const candidates = candidatesFor(inst.cls, ctx.markets)
  if (candidates.length === 0) {
    return { ok: false, reason: 'no-venue', cls: inst.cls }
  }

  // A stored ref that already names a venue is believed, so the recents strip
  // takes you back to the tape you were actually on rather than to whatever
  // you prefer today. Deliberately lenient: a venue whose connector has since
  // been removed falls through to normal resolution instead of dead-ending,
  // because a stale entry in a history list should still be clickable. The
  // URL does NOT come through here, so an explicit link stays strict.
  if (inst.market) {
    const pinned = candidates.find((m) => m.value === inst.market)
    if (pinned) {
      return {
        ok: true,
        reason: 'pinned',
        ref: { cls: inst.cls, market: pinned.value, id: inst.id },
      }
    }
  }

  // The index narrows the field when it has something to say. When what it
  // names is unreachable here, fall back to the full candidate set rather
  // than refusing: the snapshot can be incomplete, and only a venue that
  // published a live listing may ground a negative claim.
  const listed = ctx.listedOn?.length
    ? candidates.filter((c) => ctx.listedOn!.includes(c.value))
    : []
  const pool = listed.length > 0 ? listed : candidates

  const preferred = pool.find((m) => m.value === ctx.preferred)
  if (preferred) {
    return {
      ok: true,
      reason: listed.length > 0 ? 'listed' : 'preferred',
      ref: { cls: inst.cls, market: preferred.value, id: inst.id },
    }
  }

  return {
    ok: true,
    reason: 'substituted',
    ref: { cls: inst.cls, market: pool[0].value, id: inst.id },
  }
}

/**
 * The resolved ref, or null. For the many call sites that only want to render
 * a row and have a sensible empty state already.
 */
export function resolveMarketRefOrNull(
  inst: InstrumentRef,
  ctx: MarketRefContext,
): MarketRef | null {
  const result = resolveMarketRef(inst, ctx)
  return result.ok ? result.ref : null
}

/**
 * Whether a chart sitting on `market` has to be moved off it, and where to.
 *
 * The chart terminal has always carried a correction for a venue that went
 * away under it — a connector disabled in the Plugin Store while its chart was
 * open. It read the venue table alone, and that table answers two different
 * questions with the same silence: "this venue is gone" and "this venue has
 * not activated yet". Connectors activate one at a time and publish as they
 * go, so during boot every venue below the one currently activating is absent
 * from a list that is already non-empty.
 *
 * The desktop chart route never noticed, because it refuses to mount until the
 * venue in its URL is in the table. The phone mounts on the first connector
 * that publishes, so it ran the correction against a half-filled list: a link
 * to `/dex/jupiter/<mint>-USDC` had its venue swapped for the user's preferred
 * CEX, `useMobileRouteSync` wrote that back into the address, and the pair
 * route then refused a Solana mint on OKX.
 *
 * Two rules, and the second one is `resolveMarketRef`'s own:
 *
 * 1. Absence only counts once every connector has had its turn. `settled` is
 *    the caller's `pluginsReady`, which flips after the bootstrap activation
 *    loop rather than during it.
 * 2. A venue-bound class is never substituted. A token IS its chain plus
 *    address and an outcome IS its venue plus market id, so moving the venue
 *    does not re-price the instrument, it names a different one. When such a
 *    venue really is missing the honest answer is the refusal the surfaces
 *    already render (`venue-missing`, and the phone's "only exists on ..."),
 *    never another venue's tape under the same address.
 *
 * Returns the venue to move to, or null to stay put.
 */
export function correctStaleMarket(input: {
  market: string
  /**
   * What the chart is drawing, when something above owns the answer (the
   * chart route's URL, the mobile shell's focus). Undefined means "not
   * stated", which only costs rule 2 — a caller that cannot name the class
   * keeps the old behaviour.
   */
  cls: InstrumentRef['cls'] | undefined
  /**
   * The venue table. Structural rather than `MarketOption`, because presence
   * is the whole question here and the chart terminal holds a narrower row.
   */
  markets: ReadonlyArray<{ value: string }>
  defaultMarket: string
  /** Every bundled connector has activated. Until then absence proves nothing. */
  settled: boolean
}): string | null {
  if (!input.settled || input.markets.length === 0) return null
  if (input.markets.some((m) => m.value === input.market)) return null
  if (input.cls && isVenueBoundClass(input.cls)) return null
  return input.defaultMarket === input.market ? null : input.defaultMarket
}
