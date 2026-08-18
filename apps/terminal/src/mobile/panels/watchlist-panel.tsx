// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Watchlist (design screen 4) — the phone's fastest way to change what is in
 * focus.
 *
 * A row tap changes focus and CLOSES the panel (`setFocusedPair` then
 * `dismissPanel`). The list once stayed up so a trader could walk it tap by
 * tap, but the sheet covers the bottom half of the very chart the tap just
 * changed, so the tap looked like it had done nothing until you dismissed the
 * thing yourself. Picking is the errand; the errand ends at the chart, and the
 * way back is the one tap on the Watchlist tab that opened it.
 *
 * Prices come from ONE bulk snapshot map (`useBulkTickerQuotes`), never from a
 * per-row `useTickerStream` — fanning that hook across rows puts one setState
 * origin per row on the render path at socket rate, which is the single rule
 * the terminal's render budget is built around. The cell that renders them is
 * the desktop pane's own (`TrendQuoteCell` → `PairQuote`), so a row flashes
 * up/down on every snapshot exactly as the desktop watchlist does, and the
 * trend line lands at the same x on every row.
 *
 * The sheet owns the scroll container, so the search + list-chip header is
 * `sticky` rather than living in the sheet's header slot. Reordering stays on
 * the desktop: dnd-kit's 14px grip cannot be made a 44px target inside a 44px
 * row without swallowing the tap that selects it.
 *
 * Past `VIRTUALIZE_ABOVE` rows the list windows, because a row is not free —
 * it carries a sparkline with its own IntersectionObserver plus two store
 * subscriptions, and a 120-symbol list would mount all of them in one commit
 * in the middle of a scroll-fling. Below that the plain map wins: no measured
 * scroll offset, no spacers, nothing to get wrong.
 */
import { memo, useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'

import { cn } from '@pairlens/ui'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { watchEntriesFrom } from '../lib/watch-entries'
import { useVenueTradePermission } from '../lib/venue-permission'
import { VENUE_KIND_KEY, venueKindOf } from '../lib/venue-kind'
import { MobileRow } from '../primitives/mobile-row'
import { useSheetScrollRef } from '../primitives/mobile-sheet'
import { PRESS } from '../primitives/press'
import { TrendQuoteCell } from './trend-quote-cell'
import type { Instrument } from '@pairlens/shared/instrument-types'
import type { InstrumentRef } from '@pairlens/shared/market-ref'
import type {
  PredictionEventEntry,
  PredictionOutcomeEntry,
} from '@/stores/prediction-directory-store'
import { haptic } from '@/lib/haptics'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { useInstrumentsBySymbols } from '@/hooks/use-market-instruments'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import {
  PairAvatar,
  PairSymbol,
  PredictionAvatar,
} from '@/components/pair-picker/pair-avatar'
import { predictionQuestionOf } from '@/components/pair-picker/pair-picker-data'
import {
  isPredictionEventEntry,
  usePredictionPin,
} from '@/stores/prediction-directory-store'

/** Lists at or below this length render as a plain map. */
const VIRTUALIZE_ABOVE = 30

/**
 * A watchlist row, measured: the 32px avatar and the two-line title/subtitle
 * both clear the 44px minimum, so it is 10px padding × 2 + ~34px of content +
 * the 1px hairline. Every row is the same height — the subtitle truncates
 * rather than wrapping — so this is exact, not an estimate that drifts.
 */
const ROW_HEIGHT = 55

export default memo(function MobileWatchlistPanel() {
  const { t } = useTranslation()
  const { focusedPair } = useMobileFocus()
  const { pushOverlay } = useMobileActions()

  const state = useWatchlistsStore((s) => s.state)
  const setActiveList = useWatchlistsStore((s) => s.setActiveList)

  const lists = state.lists
  const activeList = lists.find((l) => l.id === state.activeListId) ?? lists[0]

  // A stored entry is a QUALIFIED ref, not a bare symbol. See
  // `lib/watch-entries.ts` for what that broke and why the split lives there.
  const entries = useMemo(
    () => watchEntriesFrom(activeList?.symbols ?? []),
    [activeList?.symbols],
  )

  // Sorted for the query key so reordering on the desktop does not refetch.
  const sortedSymbols = useMemo(
    () => entries.map((entry) => entry.symbol).sort(),
    [entries],
  )
  const { items: instruments } = useInstrumentsBySymbols(sortedSymbols)
  const quotes = useBulkTickerQuotes()
  const resolveMarket = usePreferredMarketResolver()

  const rows = useMemo(() => {
    const bySymbol = new Map(instruments.map((i) => [i.symbol, i]))
    return entries.map((entry) => ({
      ...entry,
      instrument:
        bySymbol.get(entry.symbol) ??
        fallbackInstrument(entry.symbol, entry.ref),
    }))
  }, [entries, instruments])

  // Windowing rides the sheet's scroll container — the panel has none of its
  // own, and giving it one would nest a second scroller inside the sheet.
  const scrollRef = useSheetScrollRef()
  const virtualize = rows.length > VIRTUALIZE_ABOVE && scrollRef != null

  // The sticky header sits inside that same scroller, so the list starts some
  // way down it. Measured once rather than hardcoded: the chip strip's height
  // depends on how many lists the user has.
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    const scroller = scrollRef?.current
    if (!listNode || !scroller) return
    setScrollMargin(
      listNode.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop,
    )
  }, [listNode, scrollRef, lists.length])

  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollRef?.current ?? null,
    overscan: 6,
    scrollMargin,
  })

  const openSearch = useCallback(
    () => pushOverlay({ kind: 'pairPicker', autoFocus: true }),
    [pushOverlay],
  )
  const openAdd = useCallback(
    () =>
      pushOverlay({
        kind: 'pairPicker',
        autoFocus: true,
        mode: 'watchlistAdd',
      }),
    [pushOverlay],
  )

  return (
    <div className="flex flex-col">
      {/* Sticky rather than the sheet's header slot: the sheet owns the scroll
          container. `.pl-sheet-solid` and not `.pl-sheet`: the sheet's fill is
          0.97 alpha, so rows scrolling beneath a translucent copy of it ghost
          through, and its hairline pseudo/transition belong to the sheet's own
          edge, not to this strip. */}
      <div className="pl-sheet-solid sticky top-0 z-10 pb-2">
        <div className="flex items-center gap-2 px-4 pt-1">
          <button
            className="pl-field pl-press flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-[11px] px-3 text-left"
            onClick={openSearch}
            type="button"
            {...PRESS}
          >
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate text-[14px] text-muted-foreground">
              {t('mobile.panels.searchAnyPair')}
            </span>
          </button>
          <button
            aria-label={t('watchlist.addSymbol')}
            className="pl-field pl-press flex size-[38px] shrink-0 items-center justify-center rounded-[11px] text-foreground"
            onClick={openAdd}
            type="button"
            {...PRESS}
          >
            <Plus className="size-[18px]" />
          </button>
        </div>

        <div className="mt-2.5 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {lists.map((list) => (
            <button
              className={cn(
                'pl-press flex h-7 shrink-0 items-center rounded-full px-3 text-[12.5px] font-medium',
                list.id === activeList?.id
                  ? 'pl-chip-active text-foreground'
                  : 'text-muted-foreground',
              )}
              key={list.id}
              onClick={() => setActiveList(list.id)}
              type="button"
              {...PRESS}
            >
              {list.name}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-8 py-12 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            {t('watchlist.emptyTitle')}
          </p>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {t('watchlist.emptyDescription')}
          </p>
        </div>
      ) : (
        <div ref={setListNode}>
          {virtualize
            ? (() => {
                const items = virtualizer.getVirtualItems()
                const first = items[0]
                const last = items[items.length - 1]
                // Spacers rather than absolute positioning: the rows keep
                // their own flow height, so a row that measures taller than
                // ROW_HEIGHT cannot overlap its neighbour.
                const padTop = first ? first.start - scrollMargin : 0
                const padBottom = last
                  ? virtualizer.getTotalSize() - (last.end - scrollMargin)
                  : 0
                return (
                  <>
                    {padTop > 0 ? <div style={{ height: padTop }} /> : null}
                    {items.map((item) => {
                      const row = rows[item.index]
                      if (!row) return null
                      return (
                        <WatchlistRow
                          focused={row.symbol === focusedPair}
                          instrument={row.instrument}
                          key={row.key}
                          market={
                            row.ref?.market ??
                            resolveMarket(row.instrument.assetClass)
                          }
                          quote={quotes.get(row.symbol) ?? null}
                          refClass={row.ref?.cls}
                        />
                      )
                    })}
                    {padBottom > 0 ? (
                      <div style={{ height: padBottom }} />
                    ) : null}
                  </>
                )
              })()
            : rows.map((row) => (
                <WatchlistRow
                  focused={row.symbol === focusedPair}
                  instrument={row.instrument}
                  key={row.key}
                  market={
                    row.ref?.market ?? resolveMarket(row.instrument.assetClass)
                  }
                  quote={quotes.get(row.symbol) ?? null}
                  refClass={row.ref?.cls}
                />
              ))}
        </div>
      )}
    </div>
  )
})

/**
 * A symbol the discovery provider has no metadata for still gets a row: the
 * user put it on the list, and dropping it would look like data loss.
 *
 * The parsed ref's class is carried through when there is one. Without it the
 * market resolver reads "no constraint" and keeps the focused venue, which
 * charted a stock on a crypto exchange and a prediction key on OKX.
 */
function fallbackInstrument(
  symbol: string,
  ref: InstrumentRef | null,
): Instrument {
  const [base = symbol, quote = ''] = symbol.split('-')
  return {
    id: symbol,
    // 'cex-pair' as the neutral default for an unknown watchlist symbol: the
    // pair-shaped arm carries no extra identity fields to fabricate.
    kind: 'cex-pair',
    market: ref?.market ?? '',
    symbol,
    name: symbol,
    base,
    quote,
    assetClass: ref?.cls ?? '',
    categories: [],
    rank: Number.MAX_SAFE_INTEGER,
    featured: false,
  }
}

const WatchlistRow = memo(function WatchlistRow({
  instrument,
  market,
  quote,
  focused,
  refClass,
}: {
  instrument: Instrument
  /** Already venue-resolved: the ref's own venue, else the class resolver's. */
  market: string
  quote: { price: number; change24h: number } | null
  focused: boolean
  /** The stored ref's class, when the entry carried one. */
  refClass?: InstrumentRef['cls']
}) {
  const { t } = useTranslation()
  const { focusedVenue } = useMobileFocus()
  const { setFocusedPair, setFocusedVenue, dismissPanel } = useMobileActions()
  const { markets } = useAvailableMarkets()
  const { availableMarkets } = useMarketData()
  // The instruments index carries no prediction rows, so a watched market
  // arrives here as `fallbackInstrument` — a bare key with no name. The
  // directory pin is what the row was BUILT from, and it is the only thing
  // that knows what the user was actually looking at when they starred it.
  // A watched prediction is an EVENT, so that map answers first; the outcome
  // map still covers a leg starred before the question became the pair.
  const pinned = usePredictionPin(instrument.symbol)
  const isPrediction = refClass === 'prediction' || pinned !== null
  const permission = useVenueTradePermission(market)

  const venueLabel =
    markets.find((m) => m.value === market)?.label ?? market.toUpperCase()
  const kind = venueKindOf(market, availableMarkets)

  const handlePress = useCallback(() => {
    haptic('selection')
    // An equity cannot stream from a crypto exchange, so a row whose venue was
    // resolved away from the focused one takes the venue with it.
    if (market !== focusedVenue) setFocusedVenue(market)
    // The stored ref's class first: it is what the row was written as, and it
    // is right for the arms whose symbol shape cannot be read back (a bare
    // prediction ticker looks like a three-segment futures key).
    setFocusedPair(
      instrument.symbol,
      refClass ?? (pinned ? 'prediction' : undefined),
    )
    // Then get out of the way: picking is the errand, and the chart the row
    // just changed is the half of the screen the sheet is sitting on.
    dismissPanel()
  }, [
    market,
    focusedVenue,
    setFocusedVenue,
    setFocusedPair,
    dismissPanel,
    instrument,
    pinned,
    refClass,
  ])

  return (
    <MobileRow
      badge={
        focused ? (
          <span className="shrink-0 rounded border border-primary/50 px-[5px] py-[3px] text-[8.5px] font-semibold uppercase leading-none tracking-[0.09em] text-primary">
            {t('mobile.panels.inFocus')}
          </span>
        ) : undefined
      }
      leading={
        // Three letters of an event slug lettered every outcome of one event
        // the same way ("DEM", "WIL"). The class mark says what it is; the
        // question under the title says which one.
        isPrediction ? (
          <PredictionAvatar className="size-8" size="md" />
        ) : (
          <PairAvatar
            assetClass={instrument.assetClass}
            base={instrument.base}
            className="size-8"
            size="md"
          />
        )
      }
      onPress={handlePress}
      selected={focused}
      subtitle={
        // The question, not the venue line. The title above is already
        // subject + side, so the one line the row has left is better spent on
        // what is actually being asked than on repeating a venue name the
        // context bar prints whenever this pair is in focus.
        pinned
          ? predictionSubtitle(pinned)
          : t('mobile.panels.venueLine', {
              venue: venueLabel,
              kind: t(VENUE_KIND_KEY[kind]),
              permission:
                permission === 'trade'
                  ? t('mobile.panels.trading')
                  : t('mobile.shell.readOnly'),
            })
      }
      title={
        // Mono is the ticker face and a subject is prose — the context bar and
        // the pair picker make the same swap.
        <PairSymbol
          assetClass={isPrediction ? 'prediction' : instrument.assetClass}
          className={isPrediction ? undefined : 'font-mono'}
          symbol={instrument.symbol}
        />
      }
      trailing={
        <TrendQuoteCell
          market={market}
          pair={instrument.symbol}
          quote={quote}
        />
      }
    />
  )
})

/**
 * The one line a prediction row has under its title.
 *
 * The title is already the question, so the line is spent on the reading the
 * question does not carry: which answer the market currently rates highest.
 * An event with no favourite yet, and a row still holding a single leg, both
 * fall back to naming what they are.
 */
function predictionSubtitle(
  pinned: PredictionEventEntry | PredictionOutcomeEntry,
): string {
  if (!isPredictionEventEntry(pinned)) return predictionQuestionOf(pinned)
  return pinned.leader?.label ?? pinned.title
}
