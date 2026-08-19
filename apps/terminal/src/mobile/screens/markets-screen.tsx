// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Discover → "All pairs": the whole catalog as a screen.
 *
 * The title is `mobile.markets.title` rather than the desktop pane's own
 * label: the pane on a desk is one of several "Markets" surfaces and says so,
 * while the phone reached this screen through a button that promised pairs,
 * and the two words have to agree across that tap.
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
 * ## One scroller, and the filter row lives inside it
 *
 * The list windows. `FullScreenOverlay` scrolls its own body, but a virtualizer
 * needs a scroll element it can measure and a definite height to window
 * against, so this screen takes the scroll itself: its root is `h-full` (the
 * overlay body's content box, padding excluded, so nothing overflows outward)
 * and the rows scroll inside it. One effective scroller, one measured element.
 *
 * The filter row is the scroller's first child and `sticky`, not a sibling
 * above it. That is what buys the hide-on-scroll behaviour for free: sticky
 * keeps the row pinned while rows slide UNDER it, so hiding it is one
 * `translateY(-100%)` on the compositor and the rows beneath are already
 * painted. Nothing about the list's layout changes — its height, its scroll
 * element and its offsets are the same in both states, which is the property a
 * virtualizer cannot survive losing. The row's flow space is handed to the
 * virtualizer as `paddingStart`, measured rather than assumed so a longer
 * locale cannot desynchronise the two.
 *
 * The scroll listener writes `data-collapsed` and an opacity straight to the
 * DOM from a rAF. No React state changes while a finger is moving.
 */
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
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
import { PRESS } from '../primitives/press'
import { TrendQuoteCell } from '../panels/trend-quote-cell'
import type { RefObject } from 'react'
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import type { MobileOverlay } from '../mobile-focus-context'
import { haptic } from '@/lib/haptics'
import { entryToMarketRef } from '@/lib/market-ref/entry'
import { instrumentToPairEntry } from '@/components/pair-picker/pair-picker-data'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { useTopCoinsSnapshot } from '@/hooks/use-top-coins-snapshot'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { PairAvatar, PairSymbol } from '@/components/pair-picker/pair-avatar'
import { quoteForPair } from '@/components/discovery/pair-quote'
import { useRecentPairs } from '@/lib/recent-tickers'

/** Same box as `MobileRow` renders: 10px padding twice, 34px of content, 1px rule. */
const ROW_HEIGHT = 55

/** Rows left below the viewport before the next page is asked for. */
const PAGE_AHEAD = 12

/**
 * The filter row's height before it has been measured. Only ever used for the
 * first frame — a wrong guess costs one extra render, not a wrong layout.
 */
const FILTER_ROW_ESTIMATE = 67

/**
 * Trailing inset inside the scroller.
 *
 * The overlay body already stops `--pl-tabbar-total` above the bottom of the
 * screen and pads itself by 16px, so the list does not run under the tab bar.
 * What it used to do was END there, last row flush against a hard edge with a
 * strip of empty background under it that read as a gap rather than as a
 * margin. This is the margin, said deliberately, and the fade below finishes
 * the thought.
 */
const LIST_END_INSET = 10

/** Scroll depth under which the filter row is always shown. */
const FILTER_PIN_SLACK = 24

/** Sub-pixel scroll noise that must not count as a direction change. */
const DIRECTION_EPSILON = 4

/** Distance from the end at which the bottom fade is no longer honest. */
const END_OF_LIST_EPSILON = 8

/**
 * Hide-on-scroll-down, show-on-any-scroll-up, plus the bottom fade — both
 * driven from one passive listener and written straight to the DOM.
 *
 * React state is deliberately not involved: the list is virtualized and a
 * re-render per scroll event would re-run the windowing math sixty times a
 * second to change one attribute. `data-collapsed` is read back off the
 * element rather than kept in a closure so re-running this effect (a new page
 * of rows arrives, the locale changes) cannot leave the DOM and the bookkeeping
 * disagreeing.
 */
function useListChrome(
  scrollRef: RefObject<HTMLDivElement | null>,
  filterRef: RefObject<HTMLDivElement | null>,
  fadeRef: RefObject<HTMLDivElement | null>,
  filterHeight: number,
  /** Bumped whenever the content length changes, to re-evaluate the fade. */
  revision: number,
) {
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return

    let frame = 0
    let previousTop = scroll.scrollTop

    const apply = () => {
      frame = 0
      const filter = filterRef.current
      if (!filter) return
      const top = scroll.scrollTop
      const delta = top - previousTop
      previousTop = top

      const collapsed = filter.dataset.collapsed === 'true'
      // Never hide a field the user is typing into, and never hide it while
      // its own flow position is still on screen — the rows below it have not
      // scrolled up to take its place yet.
      let next = collapsed
      if (
        top <= filterHeight + FILTER_PIN_SLACK ||
        filter.contains(document.activeElement)
      ) {
        next = false
      } else if (delta > DIRECTION_EPSILON) {
        next = true
      } else if (delta < -DIRECTION_EPSILON) {
        next = false
      }
      if (next !== collapsed) filter.dataset.collapsed = next ? 'true' : 'false'

      const fade = fadeRef.current
      if (fade) {
        const remaining = scroll.scrollHeight - scroll.clientHeight - top
        fade.style.opacity = remaining > END_OF_LIST_EPSILON ? '1' : '0'
      }
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply)
    }

    scroll.addEventListener('scroll', onScroll, { passive: true })
    apply()
    return () => {
      scroll.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [scrollRef, filterRef, fadeRef, filterHeight, revision])
}

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
  const filterRef = useRef<HTMLDivElement>(null)
  const fadeRef = useRef<HTMLDivElement>(null)

  // The filter row's flow space, measured. The virtualizer offsets every item
  // by it, so a guess that drifts from the rendered height would put every row
  // in the wrong place.
  const [filterHeight, setFilterHeight] = useState(FILTER_ROW_ESTIMATE)
  useLayoutEffect(() => {
    const filter = filterRef.current
    if (!filter) return
    const measure = () => {
      const height = Math.round(filter.getBoundingClientRect().height)
      if (height > 0)
        setFilterHeight((prev) => (prev === height ? prev : height))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(filter)
    return () => observer.disconnect()
  }, [])

  const virtualizer = useVirtualizer({
    count: pairs.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollRef.current,
    overscan: 8,
    paddingStart: filterHeight,
    paddingEnd: LIST_END_INSET,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? 0

  useListChrome(scrollRef, filterRef, fadeRef, filterHeight, pairs.length)

  // Paging rides the window rather than a sentinel div: the sentinel would be
  // unmounted by the virtualizer for every page but the last one.
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    if (lastIndex < pairs.length - PAGE_AHEAD) return
    void fetchNextPage()
  }, [lastIndex, pairs.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleSelect = useCallback(
    (pair: PairEntry, market: string) => {
      haptic('selection')
      const ref = entryToMarketRef(pair, market)
      if (market !== focusedVenue) setFocusedVenue(market)
      setFocusedPair(pair.symbol, ref.cls)
      trackRecent(ref)
      // The whole stack, not one level: this screen was opened from a panel
      // the user is done with, and the point of the tap was the chart.
      closeOverlays()
    },
    [focusedVenue, setFocusedVenue, setFocusedPair, trackRecent, closeOverlays],
  )

  const searching = deferredQuery.length > 0
  // The virtualizer counts the filter row's flow space in every offset; the
  // row itself is rendered, so the spacer above the first item must not count
  // it twice.
  const padTop = Math.max((virtualItems[0]?.start ?? 0) - filterHeight, 0)
  const padBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() -
        (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  return (
    <FullScreenOverlay
      display
      onBack={onClose}
      title={t('mobile.markets.title')}
    >
      <div className="relative h-full">
        <div
          className="h-full overflow-y-auto overscroll-contain"
          data-markets-rows
          ref={scrollRef}
        >
          <div
            className="sticky top-0 z-10 bg-background px-4 pb-2.5 transition-[transform,opacity] duration-200 ease-out will-change-transform data-[collapsed=true]:pointer-events-none data-[collapsed=true]:-translate-y-full data-[collapsed=true]:opacity-0 motion-reduce:transition-none"
            data-collapsed="false"
            ref={filterRef}
          >
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
                  className="pl-hit-44 pl-press-soft flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--pl-wash-heavy)] text-muted-foreground"
                  onClick={() => setQuery('')}
                  type="button"
                  {...PRESS}
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

        {/* The list dissolves into the shell instead of being cut off at the
            scroller's edge, and stops doing so once there is nothing left
            below — a permanent fade over the final row would read as a render
            bug rather than as an edge. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-b from-transparent to-background opacity-0 transition-opacity duration-200 motion-reduce:transition-none"
          ref={fadeRef}
        />
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
      title={
        <PairSymbol
          assetClass={pair.assetClass}
          className="font-mono"
          symbol={pair.symbol}
        />
      }
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
          className="flex h-[55px] items-center gap-[11px] border-t border-t-[color:var(--pl-hairline)] px-4"
          key={row}
        >
          {/* `bg-muted` all but disappears against this surface — the tint
              that reads over it is the same foreground wash the rest of the
              shell's fills are made of. */}
          <Skeleton className="size-8 shrink-0 rounded-full bg-[color:var(--pl-wash-strong)]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-[92px] bg-[color:var(--pl-wash-strong)]" />
            <Skeleton className="h-2.5 w-[124px] bg-[color:var(--pl-wash-strong)]" />
          </div>
          <Skeleton className="h-6 w-[54px] shrink-0 bg-[color:var(--pl-wash-strong)]" />
          <Skeleton className="h-3.5 w-[86px] shrink-0 bg-[color:var(--pl-wash-strong)]" />
        </div>
      ))}
    </div>
  )
}
