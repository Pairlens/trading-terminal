// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Discover → "All markets": the whole catalog as a screen.
 *
 * This is the desktop Markets pane's data, not its layout. It reads the same
 * `useMarketInstruments` pages (so arriving here from Discover is a cache
 * read), resolves each row's venue with the same `usePreferredMarketResolver`,
 * and ends each row with the same `TrendQuoteCell` the watchlist and the
 * featured strip use — which is what makes the trend lines land on one column
 * across all three lists.
 *
 * Filtering goes to the catalog rather than to the loaded page: typing filters
 * two thousand instruments, not the fifty that happen to be in memory. The
 * query is deferred so a keystroke does not mint a react-query key per
 * character.
 *
 * The list windows. `FullScreenOverlay` scrolls its own body, but a virtualizer
 * needs a scroll element it can measure and a definite height to window
 * against, so this screen takes the scroll itself: its root is `h-full` (the
 * overlay body's content box, padding excluded, so nothing overflows outward)
 * and the rows scroll inside it. One effective scroller, one measured element.
 */
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'

import { Skeleton } from '@pairlens/ui/components/ui/skeleton'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { MobileRow } from '../primitives/mobile-row'
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import { TrendQuoteCell } from '../panels/trend-quote-cell'
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import type { MobileOverlay } from '../mobile-focus-context'
import { instrumentToPairEntry } from '@/components/pair-picker/pair-picker-data'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { useTopCoinsSnapshot } from '@/hooks/use-top-coins-snapshot'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { quoteForPair } from '@/components/discovery/pair-quote'
import { useRecentPairs } from '@/lib/recent-tickers'

/** Same box as `MobileRow` renders: 10px padding twice, 34px of content, 1px rule. */
const ROW_HEIGHT = 55

/** Rows left below the viewport before the next page is asked for. */
const PAGE_AHEAD = 12

export default memo(function MarketsScreen({
  onClose,
}: {
  overlay: Extract<MobileOverlay, { kind: 'markets' }>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { focusedPair, focusedVenue } = useMobileFocus()
  const { setFocusedPair, setFocusedVenue, closeOverlays } = useMobileActions()

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())

  const {
    items,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
  } = useMarketInstruments({ q: deferredQuery || undefined })

  const quotes = useBulkTickerQuotes()
  const topCoins = useTopCoinsSnapshot()
  const resolveMarket = usePreferredMarketResolver()
  const [, trackRecent] = useRecentPairs()

  const pairs = useMemo(() => items.map(instrumentToPairEntry), [items])

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: pairs.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollRef.current,
    overscan: 8,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? 0

  // Paging rides the window rather than a sentinel div: the sentinel would be
  // unmounted by the virtualizer for every page but the last one.
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    if (lastIndex < pairs.length - PAGE_AHEAD) return
    void fetchNextPage()
  }, [lastIndex, pairs.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleSelect = useCallback(
    (pair: PairEntry, market: string) => {
      if (market !== focusedVenue) setFocusedVenue(market)
      setFocusedPair(pair.symbol)
      trackRecent(pair.symbol)
      // The whole stack, not one level: this screen was opened from a panel
      // the user is done with, and the point of the tap was the chart.
      closeOverlays()
    },
    [focusedVenue, setFocusedVenue, setFocusedPair, trackRecent, closeOverlays],
  )

  const searching = deferredQuery.length > 0
  const padTop = virtualItems[0]?.start ?? 0
  const padBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() -
        (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  return (
    <FullScreenOverlay display onBack={onClose} title={t('markets.title')}>
      <div className="flex h-full flex-col">
        <div className="shrink-0 px-4 pb-2.5">
          <div className="pl-field flex h-[38px] items-center gap-2 rounded-[11px] px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              aria-label={t('mobile.markets.filterPlaceholder')}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('mobile.markets.filterPlaceholder')}
              spellCheck={false}
              value={query}
            />
            {query ? (
              <button
                aria-label={t('common.clear')}
                className="pl-hit-44 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-muted-foreground"
                onClick={() => setQuery('')}
                type="button"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] leading-none text-muted-foreground">
            {searching
              ? t('mobile.markets.matchCount', { count: total })
              : t('markets.pairCount', { count: total })}
          </p>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-markets-rows
          ref={scrollRef}
        >
          {isLoading ? (
            <MarketsSkeleton />
          ) : pairs.length === 0 ? (
            <p className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">
              {t('markets.noPairsFound')}
            </p>
          ) : (
            <>
              {padTop > 0 ? <div style={{ height: padTop }} /> : null}
              {virtualItems.map((item) => {
                const pair = pairs[item.index]
                if (!pair) return null
                const market = resolveMarket(pair.assetClass)
                return (
                  <MarketRow
                    focused={pair.symbol === focusedPair}
                    key={pair.symbol}
                    market={market}
                    onSelect={handleSelect}
                    pair={pair}
                    quote={quoteForPair(pair, quotes, topCoins)}
                  />
                )
              })}
              {padBottom > 0 ? <div style={{ height: padBottom }} /> : null}
            </>
          )}
        </div>
      </div>
    </FullScreenOverlay>
  )
})

const MarketRow = memo(function MarketRow({
  pair,
  market,
  quote,
  focused,
  onSelect,
}: {
  pair: PairEntry
  /** Venue this row prices and draws against — resolved for its asset class. */
  market: string
  quote: ReturnType<typeof quoteForPair>
  focused: boolean
  onSelect: (pair: PairEntry, market: string) => void
}) {
  const handlePress = useCallback(
    () => onSelect(pair, market),
    [onSelect, pair, market],
  )

  return (
    <MobileRow
      leading={
        <PairAvatar
          assetClass={pair.assetClass}
          base={pair.base}
          className="size-8"
          size="md"
        />
      }
      onPress={handlePress}
      selected={focused}
      subtitle={pair.name}
      title={<span className="font-mono">{pair.symbol}</span>}
      trailing={
        <TrendQuoteCell market={market} pair={pair.symbol} quote={quote} />
      }
    />
  )
})

function MarketsSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
        <div
          className="flex h-[55px] items-center gap-[11px] border-t border-t-[rgba(255,255,255,0.055)] px-4"
          key={row}
        >
          {/* `bg-muted` all but disappears against this surface — the tint
              that reads over it is the same white the row hairlines use. */}
          <Skeleton className="size-8 shrink-0 rounded-full bg-white/[0.09]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-[92px] bg-white/[0.09]" />
            <Skeleton className="h-2.5 w-[124px] bg-white/[0.06]" />
          </div>
          <Skeleton className="h-6 w-[54px] shrink-0 bg-white/[0.06]" />
          <Skeleton className="h-3.5 w-[86px] shrink-0 bg-white/[0.09]" />
        </div>
      ))}
    </div>
  )
}
