// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react'

import type { TickerUpdate } from '@pairlens/market-engine/types'
import type { MarketOption } from '@/hooks/use-available-markets'
import type { VenuePrice } from '@/lib/venue-spread'
import { useBulkTickerSnapshots } from '@/hooks/use-bulk-ticker-quotes'
import { useMarketData } from '@/lib/market-data-provider'
import { normalizePairKey } from '@/lib/pairs'

/**
 * One pair, every venue at once — the data half of the multi-price pane.
 *
 * Deliberately NOT `useTickerStream` in a loop. That hook holds a `useState`
 * per stream, so fifteen of them would put fifteen independent setState
 * origins on the render path, each firing at socket rate; the terminal's
 * render budget has exactly one per-tick setState origin and it is the chart's
 * own provider. Here every venue writes into one ref and the hook publishes a
 * single immutable snapshot on a fixed cadence, so the pane re-renders at a
 * known rate no matter how many exchanges are shouting.
 *
 * Venue objects keep their identity across a publish when nothing they show
 * has changed, so a memoized row only re-renders when its own venue moved.
 *
 * Three different reasons a venue shows no price, kept distinct because the
 * recovery differs:
 *  - `desktop-only` — this build cannot reach the venue at all (the four
 *    CORS-closed connectors in a browser). Never subscribed; the desktop app
 *    is the answer.
 *  - `unlisted` — the venue's own bulk snapshot carries every symbol it
 *    trades and this pair is not among them. A definite answer, not a wait.
 *  - `no-data` — subscribed, listed (or unknown), and still silent. Illiquid
 *    pairs genuinely go minutes between prints, so this is worded as silence
 *    rather than absence.
 */

/** How often the accumulated ticks are published to React. */
const PUBLISH_INTERVAL_MS = 400
/** Past this, a venue's last print is old enough to mark rather than trust. */
const STALE_AFTER_MS = 90_000
/**
 * How long a subscribed venue may stay silent before the pane stops implying
 * something is still loading. Generous on purpose — a thin pair on a small
 * venue can sit a long time between prints, and calling that "no data" too
 * early would be wrong more often than it is right.
 */
const SILENCE_AFTER_MS = 15_000

export type VenueQuoteStatus =
  | 'pending'
  | 'live'
  | 'stale'
  | 'unlisted'
  | 'no-data'
  | 'desktop-only'

export type VenueQuote = VenuePrice & {
  status: VenueQuoteStatus
  /** 24h change in percent, when the venue reports one. */
  change24h: number | null
  /** 24h volume in base units, when the venue reports one. */
  volume24h: number | null
  /** Epoch ms of the last update, 0 when nothing has arrived. */
  ts: number
  /** The price came from the 60s REST snapshot, not the socket. */
  fromSnapshot: boolean
}

type LiveEntry = {
  last: number | null
  bid: number | null
  ask: number | null
  change24h: number | null
  volume24h: number | null
  ts: number
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/** Positive-or-null, so a venue's "unknown" never reads as a price of zero. */
const priceOrNull = (v: unknown): number | null =>
  isFiniteNumber(v) && v > 0 ? v : null

const numberOrNull = (v: unknown): number | null =>
  isFiniteNumber(v) ? v : null

function sameQuote(a: VenueQuote, b: VenueQuote): boolean {
  return (
    a.market === b.market &&
    a.status === b.status &&
    a.last === b.last &&
    a.bid === b.bid &&
    a.ask === b.ask &&
    a.change24h === b.change24h &&
    a.volume24h === b.volume24h &&
    a.ts === b.ts &&
    a.fromSnapshot === b.fromSnapshot
  )
}

export type UseVenueQuotesOptions = {
  pairKey: string
  /** Venues to quote, in the order the pane will list them. */
  markets: Array<MarketOption>
  /** Pause every socket without unmounting the pane. */
  enabled?: boolean
}

export function useVenueQuotes({
  pairKey,
  markets,
  enabled = true,
}: UseVenueQuotesOptions): Array<VenueQuote> {
  const { subscribeTicker, status: mdStatus, streamVersion } = useMarketData()
  const snapshots = useBulkTickerSnapshots()

  const normalizedPair = useMemo(() => normalizePairKey(pairKey), [pairKey])

  // Venue ids drive the subscription effect. Derived as a string so a fresh
  // `markets` array with the same venues doesn't tear down every socket.
  const marketIds = useMemo(
    () => markets.filter((m) => !m.desktopOnly).map((m) => m.value),
    [markets],
  )
  const marketIdsKey = marketIds.join(',')

  // Every venue's latest tick, written straight from the socket callback —
  // never through setState, which is the whole point of this hook.
  const liveRef = useRef(new Map<string, LiveEntry>())
  // When each venue's subscription opened, so silence can be timed.
  const subscribedAtRef = useRef(new Map<string, number>())

  // The bulk snapshot is read inside the publish pass; a ref keeps that pass
  // off the effect's dependency list and out of the interval's closure.
  const listingRef = useRef(new Map<string, Map<string, LiveEntry>>())
  useEffect(() => {
    const byMarket = new Map<string, Map<string, LiveEntry>>()
    for (const snapshot of snapshots) {
      const bySymbol = new Map<string, LiveEntry>()
      for (const t of snapshot.tickers) {
        bySymbol.set(normalizePairKey(t.symbol), {
          last: priceOrNull(t.price),
          bid: null,
          ask: null,
          change24h: numberOrNull(t.change24h),
          volume24h: null,
          ts: snapshot.ts,
        })
      }
      byMarket.set(snapshot.market, bySymbol)
    }
    listingRef.current = byMarket
  }, [snapshots])

  const [quotes, setQuotes] = useState<Array<VenueQuote>>([])
  // The published array, read by the interval without re-arming it.
  const publishedRef = useRef<Array<VenueQuote>>([])
  // Latest venue list for the publish pass. Kept in an effect rather than the
  // effect below's dependencies so a fresh array identity doesn't restart the
  // cadence; declared ahead of the publish effect so it is already current
  // when that effect's immediate publish() runs.
  const marketsRef = useRef(markets)
  useEffect(() => {
    marketsRef.current = markets
  })

  // A new pair (or a different venue set) invalidates everything collected so
  // far. Toggling `enabled` deliberately does NOT: pausing freezes the last
  // prices on screen instead of blanking the pane.
  useEffect(() => {
    liveRef.current.clear()
    subscribedAtRef.current.clear()
    publishedRef.current = []
    setQuotes([])
  }, [marketIdsKey, normalizedPair])

  // ── Subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || normalizedPair.length === 0) return
    if (mdStatus !== 'connected') return

    const ids = marketIdsKey.length > 0 ? marketIdsKey.split(',') : []
    const now = Date.now()
    const unsubscribes: Array<() => void> = []

    for (const market of ids) {
      subscribedAtRef.current.set(market, now)
      // `subscribeTicker` swallows a connector that refuses synchronously
      // (region block, platform block) and hands back a no-op, so a venue
      // that cannot be reached simply stays silent rather than taking the
      // whole pane down with it.
      unsubscribes.push(
        subscribeTicker(market, normalizedPair, (data) => {
          const update = data as TickerUpdate
          const ticker = update?.ticker
          if (!ticker) return
          const last = priceOrNull(ticker.last)
          if (last === null) return
          liveRef.current.set(market, {
            last,
            bid: priceOrNull(ticker.bid),
            ask: priceOrNull(ticker.ask),
            change24h: numberOrNull(ticker.change24h),
            volume24h: numberOrNull(ticker.volume24h),
            ts: isFiniteNumber(ticker.ts) ? ticker.ts : Date.now(),
          })
        }),
      )
    }

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  }, [
    enabled,
    marketIdsKey,
    mdStatus,
    normalizedPair,
    streamVersion,
    subscribeTicker,
  ])

  // ── Publish ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || normalizedPair.length === 0) return

    const publish = () => {
      const now = Date.now()
      const previous = publishedRef.current
      const byMarket = new Map(previous.map((q) => [q.market, q]))
      let changed = previous.length !== marketsRef.current.length

      const next = marketsRef.current.map((option): VenueQuote => {
        const market = option.value
        const live = liveRef.current.get(market)
        const listed = listingRef.current.get(market)
        const snapshot = listed?.get(normalizedPair) ?? null
        const source = live ?? snapshot
        const since = subscribedAtRef.current.get(market) ?? now

        let status: VenueQuoteStatus
        if (option.desktopOnly) {
          status = 'desktop-only'
        } else if (live) {
          status = now - live.ts > STALE_AFTER_MS ? 'stale' : 'live'
        } else if (listed && !snapshot) {
          // The venue told us everything it trades and this was not on the
          // list — a definite answer, so say so without waiting out silence.
          status = 'unlisted'
        } else if (snapshot) {
          status = 'live'
        } else {
          status = now - since > SILENCE_AFTER_MS ? 'no-data' : 'pending'
        }

        const quote: VenueQuote = {
          market,
          status,
          last: source?.last ?? null,
          bid: live?.bid ?? null,
          ask: live?.ask ?? null,
          change24h: source?.change24h ?? null,
          volume24h: source?.volume24h ?? null,
          ts: source?.ts ?? 0,
          fromSnapshot: !live && snapshot !== null,
        }

        const before = byMarket.get(market)
        if (before && sameQuote(before, quote)) return before
        changed = true
        return quote
      })

      if (!changed) return
      publishedRef.current = next
      setQuotes(next)
    }

    publish()
    const timer = setInterval(publish, PUBLISH_INTERVAL_MS)
    return () => clearInterval(timer)
    // `markets` rides in through marketsRef so a new array identity doesn't
    // restart the cadence; its venue set is already covered by marketIdsKey.
    // `snapshots` is here so a fresh bulk listing publishes immediately
    // rather than waiting out the interval.
  }, [enabled, marketIdsKey, normalizedPair, snapshots])

  return quotes
}
