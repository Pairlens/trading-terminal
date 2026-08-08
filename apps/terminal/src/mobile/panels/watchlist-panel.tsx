// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Watchlist (design screen 4) — the phone's fastest way to change what is in
 * focus.
 *
 * The headline behaviour is that a row tap does NOT close the panel: the chart
 * behind repaints in place and the list stays where the thumb is, so scanning a
 * list is a sequence of taps rather than a sequence of open/close cycles. That
 * is why `setFocusedPair` is called without `dismissPanel`.
 *
 * Prices come from ONE bulk snapshot map (`useBulkTickerQuotes`), never from a
 * per-row `useTickerStream` — fanning that hook across rows puts one setState
 * origin per row on the render path at socket rate, which is the single rule
 * the terminal's render budget is built around.
 *
 * The sheet owns the scroll container, so the search + list-chip header is
 * `sticky` rather than living in the sheet's header slot. Reordering stays on
 * the desktop: dnd-kit's 14px grip cannot be made a 44px target inside a 44px
 * row without swallowing the tap that selects it.
 */
import { memo, useCallback, useMemo } from 'react'
import { Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { useVenueTradePermission } from '../lib/venue-permission'
import { VENUE_KIND_KEY, venueKindOf } from '../lib/venue-kind'
import { MobileRow } from '../primitives/mobile-row'
import type { Instrument } from '@pairlens/shared/instrument-types'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { useInstrumentsBySymbols } from '@/hooks/use-market-instruments'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { formatPrice } from '@/lib/format-price'

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
          container, and `.pl-sheet` is the sanctioned fill for it — its radius,
          border and shadow belong to the sheet's own edge, not to this strip. */}
      <div className="pl-sheet sticky top-0 z-10 rounded-none border-t-0 pb-2 shadow-none">
        <div className="flex items-center gap-2 px-4 pt-1">
          <button
            className="pl-field flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-[11px] px-3 text-left"
            onClick={openSearch}
            type="button"
          >
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate text-[14px] text-muted-foreground">
              {t('mobile.panels.searchAnyPair')}
            </span>
          </button>
          <button
            aria-label={t('watchlist.addSymbol')}
            className="pl-field flex size-[38px] shrink-0 items-center justify-center rounded-[11px] text-foreground"
            onClick={openAdd}
            type="button"
          >
            <Plus className="size-[18px]" />
          </button>
        </div>

        <div className="mt-2.5 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {lists.map((list) => (
            <button
              className={cn(
                'flex h-7 shrink-0 items-center rounded-full px-3 text-[12.5px] font-medium',
                list.id === activeList?.id
                  ? 'pl-chip-active text-foreground'
                  : 'text-muted-foreground',
              )}
              key={list.id}
              onClick={() => setActiveList(list.id)}
              type="button"
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
        rows.map((instrument) => (
          <WatchlistRow
            focused={instrument.symbol === focusedPair}
            instrument={instrument}
            key={instrument.symbol}
            market={resolveMarket(instrument.assetClass)}
            quote={quotes.get(instrument.symbol) ?? null}
          />
        ))
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
  const { setFocusedPair, setFocusedVenue } = useMobileActions()
  const { markets } = useAvailableMarkets()
  const { availableMarkets } = useMarketData()
  const permission = useVenueTradePermission(market)

  const venueLabel =
    markets.find((m) => m.value === market)?.label ?? market.toUpperCase()
  const kind = venueKindOf(market, availableMarkets)

  const handlePress = useCallback(() => {
    // An equity cannot stream from a crypto exchange, so a row whose venue was
    // resolved away from the focused one takes the venue with it. The panel
    // stays open either way — that is the screen's whole point.
    if (market !== focusedVenue) setFocusedVenue(market)
    setFocusedPair(instrument.symbol)
  }, [market, focusedVenue, setFocusedVenue, setFocusedPair, instrument.symbol])

  const change = quote?.change24h ?? null

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
        <span className="flex items-center gap-2.5">
          <MiniPriceChart
            className="h-6 w-[50px] opacity-85"
            market={market}
            pair={instrument.symbol}
          />
          <span className="flex min-w-[68px] flex-col items-end gap-0.5">
            <span className="font-mono text-[14.5px] font-medium tabular-nums leading-none text-foreground">
              {quote ? formatPrice(quote.price) : '—'}
            </span>
            {change != null ? (
              <span
                className={cn(
                  'font-mono text-[11.5px] tabular-nums leading-none',
                  change >= 0 ? 'text-up' : 'text-down',
                )}
              >
                {change >= 0 ? '+' : ''}
                {change.toFixed(2)}%
              </span>
            ) : null}
          </span>
        </span>
      }
    />
  )
})
