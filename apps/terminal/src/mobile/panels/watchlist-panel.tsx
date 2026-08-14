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
import { useVenueTradePermission } from '../lib/venue-permission'
import { VENUE_KIND_KEY, venueKindOf } from '../lib/venue-kind'
import { MobileRow } from '../primitives/mobile-row'
import { useSheetScrollRef } from '../primitives/mobile-sheet'
import { PRESS } from '../primitives/press'
import { TrendQuoteCell } from './trend-quote-cell'
import type { Instrument } from '@pairlens/shared/instrument-types'
import { haptic } from '@/lib/haptics'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { useInstrumentsBySymbols } from '@/hooks/use-market-instruments'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'

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

  // Sorted for the query key so reordering on the desktop does not refetch.
  const sortedSymbols = useMemo(
    () => [...(activeList?.symbols ?? [])].sort(),
    [activeList?.symbols],
  )
  const { items: instruments } = useInstrumentsBySymbols(sortedSymbols)
  const quotes = useBulkTickerQuotes()
  const resolveMarket = usePreferredMarketResolver()

  const rows = useMemo(() => {
    const bySymbol = new Map(instruments.map((i) => [i.symbol, i]))
    return (activeList?.symbols ?? []).map(
      (symbol) => bySymbol.get(symbol) ?? fallbackInstrument(symbol),
    )
  }, [activeList?.symbols, instruments])

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
                      const instrument = rows[item.index]
                      if (!instrument) return null
                      return (
                        <WatchlistRow
                          focused={instrument.symbol === focusedPair}
                          instrument={instrument}
                          key={instrument.symbol}
                          market={resolveMarket(instrument.assetClass)}
                          quote={quotes.get(instrument.symbol) ?? null}
                        />
                      )
                    })}
                    {padBottom > 0 ? (
                      <div style={{ height: padBottom }} />
                    ) : null}
                  </>
                )
              })()
            : rows.map((instrument) => (
                <WatchlistRow
                  focused={instrument.symbol === focusedPair}
                  instrument={instrument}
                  key={instrument.symbol}
                  market={resolveMarket(instrument.assetClass)}
                  quote={quotes.get(instrument.symbol) ?? null}
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
 */
function fallbackInstrument(symbol: string): Instrument {
  const [base = symbol, quote = ''] = symbol.split('-')
  return {
    id: symbol,
    // 'cex-pair' as the neutral default for an unknown watchlist symbol: the
    // pair-shaped arm carries no extra identity fields to fabricate.
    kind: 'cex-pair',
    market: '',
    symbol,
    name: symbol,
    base,
    quote,
    // Empty, not guessed: the market resolver reads a missing asset class as
    // "no constraint" and keeps the focused venue, which is the right answer
    // for a symbol we know nothing about.
    assetClass: '',
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
}: {
  instrument: Instrument
  market: string
  quote: { price: number; change24h: number } | null
  focused: boolean
}) {
  const { t } = useTranslation()
  const { focusedVenue } = useMobileFocus()
  const { setFocusedPair, setFocusedVenue, dismissPanel } = useMobileActions()
  const { markets } = useAvailableMarkets()
  const { availableMarkets } = useMarketData()
  const permission = useVenueTradePermission(market)

  const venueLabel =
    markets.find((m) => m.value === market)?.label ?? market.toUpperCase()
  const kind = venueKindOf(market, availableMarkets)

  const handlePress = useCallback(() => {
    haptic('selection')
    // An equity cannot stream from a crypto exchange, so a row whose venue was
    // resolved away from the focused one takes the venue with it.
    if (market !== focusedVenue) setFocusedVenue(market)
    setFocusedPair(instrument.symbol)
    // Then get out of the way: picking is the errand, and the chart the row
    // just changed is the half of the screen the sheet is sitting on.
    dismissPanel()
  }, [
    market,
    focusedVenue,
    setFocusedVenue,
    setFocusedPair,
    dismissPanel,
    instrument.symbol,
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
        <PairAvatar
          assetClass={instrument.assetClass}
          base={instrument.base}
          className="size-8"
          size="md"
        />
      }
      onPress={handlePress}
      selected={focused}
      subtitle={t('mobile.panels.venueLine', {
        venue: venueLabel,
        kind: t(VENUE_KIND_KEY[kind]),
        permission:
          permission === 'trade'
            ? t('mobile.panels.trading')
            : t('mobile.shell.readOnly'),
      })}
      title={<span className="font-mono">{instrument.symbol}</span>}
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
