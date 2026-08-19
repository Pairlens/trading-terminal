// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  OrderbookUpdate,
  TickerUpdate,
} from '@pairlens/market-engine/types'
import type { MarketOption } from '@/hooks/use-available-markets'
import type { VenuePrice } from '@/lib/venue-spread'
import { useBulkTickerSnapshots } from '@/hooks/use-bulk-ticker-quotes'
import { useMarketData } from '@/lib/market-data-provider'
import { normalizePairKey } from '@/lib/pairs'
import { topOfBookState, wantsFallbackBook } from '@/lib/venue-top-of-book'

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
 * Top of book is the one field a ticker channel cannot be trusted for. Two of
 * the venues that published none were connector bugs and are fixed where they
 * belong (HTX was on ccxt's `market.<id>.detail`, Binance's batched ticker on
 * `miniTicker`; both venue specs now name the channel that quotes). Three are
 * the venue's own design and no channel choice fixes them: ByBit and Upbit
 * send 24h statistics with no quote in them, and MEXC's `miniTicker` is
 * statistics by construction because its book rides a second channel.
 *
 * A pane that ranks on bid/ask read those three as bookless venues, while the
 * depth pane one column over streamed the same exchange's spread. `topOfBook`
 * closes that: a venue that keeps ticking WITHOUT quoting gets its own order
 * book opened, and level 0 fills the gap. Demand-driven and self-limiting — a
 * venue that quotes on its ticker never gets a book, the charted venue's is
 * already open so it costs nothing, and no more than `MAX_BOOK_FALLBACKS` are
 * held at once. Panes that only read `last` leave the option off and pay
 * nothing.
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
/**
 * Ceiling on fallback book streams held at once. Three bundled venues quote no
 * book on their ticker, so this is those plus one venue of headroom: the cap
 * only bites when a third-party connector joins them, and then it bites at the
 * bottom of the venue list rather than on anything that would rank first.
 */
const MAX_BOOK_FALLBACKS = 4

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
  /**
   * Top of book is still being chased — the venue quotes none on its ticker
   * and its order book has not painted yet. False once the answer is settled,
   * either way, so a consumer can stop showing a spinner that will never end.
   */
  bookPending: boolean
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
    a.fromSnapshot === b.fromSnapshot &&
    a.bookPending === b.bookPending
  )
}

export type UseVenueQuotesOptions = {
  pairKey: string
  /** Venues to quote, in the order the pane will list them. */
  markets: Array<MarketOption>
  /** Pause every socket without unmounting the pane. */
  enabled?: boolean
  /**
   * Fill bid/ask from the order book for venues that quote none on their
   * ticker. Off by default: it opens a stream per such venue, which only a
   * consumer that actually ranks on top of book should pay for.
   */
  topOfBook?: boolean
}

export function useVenueQuotes({
  pairKey,
  markets,
  enabled = true,
  topOfBook = false,
}: UseVenueQuotesOptions): Array<VenueQuote> {
  const {
    subscribeTicker,
    subscribeOrderbook,
    status: mdStatus,
    streamVersion,
  } = useMarketData()
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
  // Per venue: when its first tick landed, when its last one did, and when
  // one last carried a quote. `topOfBookState` reads all three — the clock on
  // "does this ticker carry a book?" cannot start at subscribe time (the
  // socket may still be dialing) and cannot latch on one quoting frame (a
  // REST seed is one).
  const firstTickAtRef = useRef(new Map<string, number>())
  const lastTickAtRef = useRef(new Map<string, number>())
  const lastQuotedAtRef = useRef(new Map<string, number>())
  // Top of book from the fallback order-book stream, per venue.
  const bookRef = useRef(
    new Map<string, { bid: number | null; ask: number | null }>(),
  )

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
  // Venues the fallback book is open for. State, not a ref: it is the only
  // thing here that has to re-arm an effect, and the publish pass is what
  // decides it — see `bookNeeded`.
  const [bookVenues, setBookVenues] = useState<Array<string>>([])
  const bookVenuesKey = bookVenues.join(',')
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
    firstTickAtRef.current.clear()
    lastTickAtRef.current.clear()
    lastQuotedAtRef.current.clear()
    bookRef.current.clear()
    publishedRef.current = []
    setBookVenues([])
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
          const bid = priceOrNull(ticker.bid)
          const ask = priceOrNull(ticker.ask)
          const seenAt = Date.now()
          if (!firstTickAtRef.current.has(market)) {
            firstTickAtRef.current.set(market, seenAt)
          }
          lastTickAtRef.current.set(market, seenAt)
          if (bid !== null || ask !== null) {
            lastQuotedAtRef.current.set(market, seenAt)
          }
          liveRef.current.set(market, {
            last,
            bid,
            ask,
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

  // ── Fallback top of book ──────────────────────────────────────────
  //
  // Only for the venues the publish pass proved need it. Multiplexed on
  // `orderbook:<venue>:<pair>` like every other book in the terminal, so the
  // charted venue's is already open and this joins it for free.
  useEffect(() => {
    if (!topOfBook || !enabled || normalizedPair.length === 0) return
    if (mdStatus !== 'connected') return
    if (bookVenuesKey.length === 0) return

    const unsubscribes = bookVenuesKey.split(',').map((market) =>
      // `subscribeOrderbook` absorbs a connector with no book to give (DEX
      // venues, a platform refusal) and hands back a no-op, so one venue
      // without depth cannot take the pane down.
      subscribeOrderbook(market, normalizedPair, (data) => {
        const update = data as OrderbookUpdate
        const bid = update?.bids?.[0]?.[0]
        const ask = update?.asks?.[0]?.[0]
        bookRef.current.set(market, {
          bid: priceOrNull(bid),
          ask: priceOrNull(ask),
        })
      }),
    )

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  }, [
    bookVenuesKey,
    enabled,
    mdStatus,
    normalizedPair,
    streamVersion,
    subscribeOrderbook,
    topOfBook,
  ])

  // ── Publish ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || normalizedPair.length === 0) return

    const publish = () => {
      const now = Date.now()
      const previous = publishedRef.current
      const byMarket = new Map(previous.map((q) => [q.market, q]))
      let changed = previous.length !== marketsRef.current.length
      // Venues that have ticked long enough without ever quoting a book.
      const bookNeeded: Array<string> = []

      const next = marketsRef.current.map((option): VenueQuote => {
        const market = option.value
        const live = liveRef.current.get(market)
        const listed = listingRef.current.get(market)
        const snapshot = listed?.get(normalizedPair) ?? null
        const source = live ?? snapshot
        const since = subscribedAtRef.current.get(market) ?? now
        // Where this venue stands on top of book — the whole fallback hangs
        // off it, so it lives in one pure function next door.
        const bookState =
          topOfBook && !option.desktopOnly
            ? topOfBookState({
                firstTickAt: firstTickAtRef.current.get(market) ?? null,
                lastTickAt: lastTickAtRef.current.get(market) ?? null,
                lastQuotedAt: lastQuotedAtRef.current.get(market) ?? null,
                now,
              })
            : 'quoted'
        const wantsBook = wantsFallbackBook(bookState)
        if (wantsBook && bookNeeded.length < MAX_BOOK_FALLBACKS) {
          bookNeeded.push(market)
        }
        const book = wantsBook ? bookRef.current.get(market) : undefined
        const bid = live?.bid ?? book?.bid ?? null
        const ask = live?.ask ?? book?.ask ?? null

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
          bid,
          ask,
          change24h: source?.change24h ?? null,
          volume24h: source?.volume24h ?? null,
          ts: source?.ts ?? 0,
          fromSnapshot: !live && snapshot !== null,
          // Still chasing: the venue ticks, quotes nothing, and its book has
          // not painted yet. Time-boxed, so a venue with no book to give
          // settles into an answer instead of a permanent spinner.
          bookPending: bookState === 'chasing' && bid === null && ask === null,
        }

        const before = byMarket.get(market)
        if (before && sameQuote(before, quote)) return before
        changed = true
        return quote
      })

      // Re-arms the fallback effect only when the set itself moves, so the
      // 400ms cadence never resubscribes a book that is already open.
      setBookVenues((current) =>
        current.length === bookNeeded.length &&
        current.every((venue, index) => venue === bookNeeded[index])
          ? current
          : bookNeeded,
      )

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
  }, [enabled, marketIdsKey, normalizedPair, snapshots, topOfBook])

  return quotes
}
