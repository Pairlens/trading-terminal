// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef, useState } from 'react'

import {
  isGeoRestrictedError,
  isPlatformRestrictedError,
  isProviderThrottledError,
  isTransportError,
} from '@pairlens/market-engine/errors'

import type { MarketOption } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import { normalizePairKey } from '@/lib/pairs'

/**
 * Does this venue carry this pair? Asked of the venue itself, one at a time.
 *
 * The empty states that say "no data here, try one of these" used to offer
 * every connected venue of the same asset class and leave the user to find out
 * which of them had ever heard of the pair. On a mid-cap quoted in USDT that
 * is a coin flip, and each wrong guess costs a venue switch, a reconnect and
 * another twelve-second wall. So the offer is now checked before it is taken:
 * every candidate is probed the moment the empty state renders, and the answer
 * rides on the button as a spinner, a check or a cross.
 *
 * The probe is `probeVenueHistory` — ONE venue, no fallback chain — which is
 * the same question `useCandleStream` asks about the venue you are already on,
 * so the two can't disagree. What it can't ask, it says so about: a venue with
 * no history provider of its own, one behind the browser wall, or one that
 * needs the user's own API key comes back `unknown` and stays clickable,
 * because a cross has to mean "this venue answered no", never "we didn't ask".
 */
export type VenueListingStatus =
  /** Probe in flight. */
  | 'checking'
  /** The venue answered with candles for this pair. */
  | 'listed'
  /** The venue answered, and it has no such market. */
  | 'unlisted'
  /** The venue refuses this region — reachable elsewhere, not from here. */
  | 'blocked'
  /** Nothing was proven either way. Offered without a mark. */
  | 'unknown'

type Verdict = Exclude<VenueListingStatus, 'checking'>

type ProbeVenueHistory = ReturnType<typeof useMarketData>['probeVenueHistory']

/**
 * Coarse on purpose: a listing changes on the scale of a venue announcement,
 * and the verdict is only ever used to decorate a button. `unknown` expires
 * fast because it is not an answer, just the absence of one.
 */
const VERDICT_TTL_MS = 5 * 60_000
const UNKNOWN_TTL_MS = 30_000
/**
 * Six REST calls landing at once is the burst that trips a free-tier limiter,
 * and a throttled provider answers `unknown` for pairs it carries perfectly
 * well. Three at a time still settles the whole row inside a second.
 */
const MAX_CONCURRENT_PROBES = 3
/**
 * One bar is all the question needs. The interval is clamped per venue inside
 * `probeVenueHistory`, so a venue that doesn't serve hourly gets asked for
 * something it does serve rather than answering "no such market" about the
 * timeframe.
 */
const PROBE_TIMEFRAME = '1h'
/**
 * How many venues an empty state may ASK about. Deliberately larger than the
 * six chips a pane shows: which of them is worth a chip is the answer, not the
 * question, and a top-six cut made before anyone was asked is what hid the two
 * venues that actually quote BGB-USDT.
 */
export const MAX_CHECKED_ALTERNATIVES = 10

const cache = new Map<string, { verdict: Verdict; at: number }>()
const inFlight = new Map<string, Promise<Verdict>>()

let activeProbes = 0
const waiting: Array<() => void> = []

const cacheKey = (market: string, pairKey: string): string =>
  `${market}:${normalizePairKey(pairKey)}`

function readCache(market: string, pairKey: string): Verdict | null {
  const hit = cache.get(cacheKey(market, pairKey))
  if (!hit) return null
  const ttl = hit.verdict === 'unknown' ? UNKNOWN_TTL_MS : VERDICT_TTL_MS
  if (Date.now() - hit.at > ttl) return null
  return hit.verdict
}

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeProbes >= MAX_CONCURRENT_PROBES) {
    await new Promise<void>((resolve) => waiting.push(resolve))
  }
  activeProbes += 1
  try {
    return await run()
  } finally {
    activeProbes -= 1
    waiting.shift()?.()
  }
}

/**
 * Classify what the venue said. Only a real refusal earns a cross.
 *
 * Exported for its own test: this is where a rate limit turns into a wrong
 * answer if the split ever drifts.
 */
export async function classifyVenueProbe(
  market: string,
  pairKey: string,
  probeVenueHistory: ProbeVenueHistory,
): Promise<Verdict> {
  const request = probeVenueHistory(market, pairKey, PROBE_TIMEFRAME, 1)
  // No history provider declares this venue — there is nobody to ask, and
  // the connector may still stream the pair over its socket.
  if (!request) return 'unknown'
  try {
    const candles = await request
    return candles.length > 0 ? 'listed' : 'unlisted'
  } catch (err) {
    // The request was refused, not the market: a rate limit, a dead socket or
    // a venue this build cannot reach says nothing about the listing. Same
    // split `useCandleStream` makes before it publishes a verdict.
    if (
      isPlatformRestrictedError(err) ||
      isProviderThrottledError(err) ||
      isTransportError(err)
    ) {
      return 'unknown'
    }
    // Reachable, listed, and still not somewhere this user can go.
    if (isGeoRestrictedError(err)) return 'blocked'
    // Everything else is the venue naming the market as invalid.
    return 'unlisted'
  }
}

/**
 * One probe per (venue, pair) at a time, cached across mounts: four panes
 * showing the same empty state ask the question once, and coming back to it
 * after a venue switch answers from memory.
 */
export function listingVerdict(
  market: string,
  pairKey: string,
  probeVenueHistory: ProbeVenueHistory,
): Promise<Verdict> {
  const key = cacheKey(market, pairKey)
  const cached = readCache(market, pairKey)
  if (cached) return Promise.resolve(cached)
  const existing = inFlight.get(key)
  if (existing) return existing
  const probe = withSlot(() =>
    classifyVenueProbe(market, pairKey, probeVenueHistory),
  )
    .then((verdict) => {
      cache.set(key, { verdict, at: Date.now() })
      return verdict
    })
    .finally(() => {
      inFlight.delete(key)
    })
  inFlight.set(key, probe)
  return probe
}

/** Test seam: verdicts are session state, and a suite must start clean. */
export function resetVenueListingCache(): void {
  cache.clear()
  inFlight.clear()
}

/**
 * Live listing status for each candidate venue, keyed by market id.
 *
 * Venues this build cannot reach and venues whose market data needs the user's
 * own key are never probed: the first would answer with the browser wall and
 * the second with "no credentials", and neither is a statement about the pair.
 */
export function useVenueListings(
  pairKey: string,
  venues: ReadonlyArray<MarketOption>,
  enabled = true,
): Record<string, VenueListingStatus> {
  const { probeVenueHistory, status } = useMarketData()
  const [statuses, setStatuses] = useState<Record<string, VenueListingStatus>>(
    {},
  )

  // The effect keys on the venue LIST, not on the array identity: callers
  // rebuild their candidate array inside panes that re-render on every tick,
  // and re-probing four venues per price update is not a feature. The array
  // itself is read through a ref so the flags stay current without waking the
  // effect.
  const venueIds = venues.map((m) => m.value).join(',')
  const venuesRef = useRef(venues)
  venuesRef.current = venues

  useEffect(() => {
    if (!enabled || pairKey.length === 0 || venueIds.length === 0) {
      setStatuses({})
      return
    }
    // Plugins that haven't connected yet would answer with transport errors
    // for every venue at once. Wait for the provider rather than burning the
    // row on `unknown`.
    if (status !== 'connected') return

    let alive = true
    const candidates = venuesRef.current
    const initial: Record<string, VenueListingStatus> = {}
    for (const venue of candidates) {
      // A venue behind the browser wall or one with no public feed would
      // answer about the platform or the missing key, never about the pair.
      const askable = !venue.desktopOnly && !venue.credentialedMarketData
      initial[venue.value] = askable
        ? (readCache(venue.value, pairKey) ?? 'checking')
        : 'unknown'
    }
    setStatuses(initial)

    for (const venue of candidates) {
      const id = venue.value
      if (initial[id] !== 'checking') continue
      void listingVerdict(id, pairKey, probeVenueHistory).then((verdict) => {
        if (!alive) return
        setStatuses((prev) =>
          prev[id] === verdict ? prev : { ...prev, [id]: verdict },
        )
      })
    }

    return () => {
      alive = false
    }
  }, [enabled, pairKey, probeVenueHistory, status, venueIds])

  return statuses
}
