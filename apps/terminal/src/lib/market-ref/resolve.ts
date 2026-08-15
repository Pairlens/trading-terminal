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
