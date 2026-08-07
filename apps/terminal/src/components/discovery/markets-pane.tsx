// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Clock,
  LayoutGrid,
  List,
  Loader2,
  Search,
  Star,
} from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pairlens/ui/components/ui/table'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@pairlens/ui/components/ui/toggle-group'

import { useVirtualizer } from '@tanstack/react-virtual'
import type {
  AssetClassFilter,
  PairCategory,
  PairEntry,
} from '@/components/pair-picker/pair-picker-data'
import type { TopCoin } from '@pairlens/shared/instrument-types'
import type { BulkQuote } from '@/hooks/use-bulk-ticker-quotes'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'
import {
  ASSET_CLASSES,
  CATEGORIES,
  instrumentToPairEntry,
} from '@/components/pair-picker/pair-picker-data'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { useTopCoinsSnapshot } from '@/hooks/use-top-coins-snapshot'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { usePriceTick } from '@/hooks/use-price-tick'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { TickArrow } from '@/components/tick-arrow'
import { formatPrice } from '@/lib/format-price'

/** Live exchange quote by exact pair symbol; top-coins base join as fallback. */
function quoteForPair(
  pair: PairEntry,
  liveQuotes: Map<string, BulkQuote>,
  coinsBySymbol: Map<string, TopCoin>,
): BulkQuote | undefined {
  const live = liveQuotes.get(pair.symbol)
  if (live) return live
  const coin = coinsBySymbol.get(pair.base.toUpperCase())
  return coin
    ? { price: coin.price, change24h: coin.percentChange24h }
    : undefined
}

function PairQuote({
  quote,
  className,
}: {
  quote: BulkQuote | undefined
  className?: string
}) {
  // These prices come from the 60s bulk snapshots, not a per-row stream —
  // fanning a ticker subscription over two thousand instruments is the thing
  // the bulk endpoint exists to avoid. So the flash marks a refresh rather
  // than a trade, which is still exactly when the number on screen moved.
  const direction = usePriceTick(quote?.price)
  const change = quote?.change24h
  return (
    // A reserved column, not a shrink-wrapped one. Digit count varies per
    // pair ($64,570.60 against $0.1984) and a venue with no price at all used
    // to collapse the slot entirely — either way the chart beside it moved,
    // and a list of charts that each start at a different x reads as broken
    // alignment rather than as data.
    <div className={cn('min-w-24 text-right tabular-nums', className)}>
      <p
        className={cn(
          'tick-cell flex items-center justify-end gap-0.5 text-sm font-medium transition-colors duration-700',
          direction === 'up'
            ? 'tick-up text-up'
            : direction === 'down'
              ? 'tick-down text-down'
              : undefined,
        )}
      >
        <TickArrow direction={direction} />
        {quote ? (
          formatPrice(quote.price)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </p>
      {change != null && (
        <p className={cn('text-xs', change >= 0 ? 'text-up' : 'text-down')}>
          {change >= 0 ? '+' : ''}
          {change.toFixed(2)}%
        </p>
      )}
    </div>
  )
}

export function MarketsPane() {
  const { t } = useTranslation()
  const [assetClassFilter, setAssetClassFilter] =
    usePersistedState<AssetClassFilter>('pair-picker.assetClass', 'all')
  const [activeCategory, setActiveCategory] = usePersistedState<
    PairCategory | 'all' | 'watchlists'
  >('pair-picker.category', 'all')
  const [viewMode, setViewMode] = usePersistedState<'list' | 'grid'>(
    'pair-picker.viewMode',
    'list',
  )
  const allSymbolsSet = useWatchlistsStore((s) => s.allSymbolsSet)
  const openAddDialog = useWatchlistsStore((s) => s.openAddDialog)
  const coinsBySymbol = useTopCoinsSnapshot()
  const liveQuotes = useBulkTickerQuotes()
  // Trend lines come from candles, which need a venue — an equity row can't
  // ask a crypto exchange, so each row resolves its own.
  const resolveMarket = usePreferredMarketResolver()
  const [recentPairs, setRecentPairs] = usePersistedState<Array<string>>(
    'pair-picker.recent',
    [],
  )
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )
  // Build query params for server-side filtering
  const serverAssetClass =
    assetClassFilter !== 'all' ? assetClassFilter : undefined
  const serverCategory =
    activeCategory !== 'all' && activeCategory !== 'watchlists'
      ? activeCategory
      : undefined
  const serverSymbols =
    activeCategory === 'watchlists' ? [...allSymbolsSet].join(',') : undefined

  const {
    items,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    pluginsReady,
  } = useMarketInstruments({
    assetClass: serverAssetClass,
    category: serverCategory,
    symbols: serverSymbols,
  })

  const allPairs: Array<PairEntry> = useMemo(
    () => items.map(instrumentToPairEntry),
    [items],
  )

  const pairsBySymbol = useMemo(
    () => new Map(allPairs.map((p) => [p.symbol, p])),
    [allPairs],
  )

  // Sort favorites to top (client-side)
  const sortedPairs = useMemo(() => {
    return [...allPairs].sort((a, b) => {
      const aFav = allSymbolsSet.has(a.symbol) ? 0 : 1
      const bFav = allSymbolsSet.has(b.symbol) ? 0 : 1
      if (aFav !== bFav) return aFav - bFav
      return a.rank - b.rank
    })
  }, [allPairs, allSymbolsSet])

  const featuredPairs = useMemo(
    () => allPairs.filter((p) => p.featured),
    [allPairs],
  )

  const showFeatured = activeCategory === 'all' && featuredPairs.length > 0

  const trackRecent = useCallback(
    (symbol: string, assetClass?: string) => {
      setRecentPairs((prev) => {
        const deduped = prev.filter((s) => s !== symbol)
        return [symbol, ...deduped].slice(0, 10)
      })
      if (assetClass) {
        setAssetClassMap((prev) => ({ ...prev, [symbol]: assetClass }))
      }
    },
    [setRecentPairs, setAssetClassMap],
  )

  const recentPairEntries = useMemo(
    () =>
      recentPairs
        .map((s) => pairsBySymbol.get(s))
        .filter((p): p is PairEntry => p !== undefined),
    [recentPairs, pairsBySymbol],
  )

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const showLoader = !pluginsReady || isLoading

  // Table virtualization
  const scrollContainerRef = useRef<HTMLElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: sortedPairs.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 52,
    overscan: 10,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const virtualPaddingTop = virtualItems[0]?.start ?? 0
  const virtualPaddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() -
        (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="space-y-3 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">{t('markets.title')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('markets.pairCount', { count: total })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <ToggleGroup
              aria-label={t('markets.viewMode')}
              multiple={false}
              size="sm"
              value={[viewMode]}
              variant="outline"
              onValueChange={(next) => {
                const v = next[0]
                if (v === 'list' || v === 'grid') setViewMode(v)
              }}
            >
              <ToggleGroupItem aria-label={t('markets.listView')} value="list">
                <List className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem aria-label={t('markets.gridView')} value="grid">
                <LayoutGrid className="size-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Asset class filter */}
        <div className="flex flex-wrap gap-1">
          {ASSET_CLASSES.map((ac) => (
            <Button
              key={ac.id}
              size="xs"
              variant={assetClassFilter === ac.id ? 'default' : 'ghost'}
              className="gap-1"
              onClick={() => {
                setAssetClassFilter(ac.id)
                // Reset category when switching to stocks (crypto categories don't apply)
                if (
                  ac.id === 'stocks' &&
                  activeCategory !== 'all' &&
                  activeCategory !== 'watchlists'
                ) {
                  setActiveCategory('all')
                }
              }}
            >
              <ac.icon className="size-3" />
              {t(`markets.assetClass.${ac.id}`, ac.label)}
            </Button>
          ))}
        </div>

        {/* Category tabs (hidden when stocks selected — crypto-specific categories don't apply) */}
        {assetClassFilter !== 'stocks' && (
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.id}
                size="xs"
                variant={activeCategory === cat.id ? 'default' : 'outline'}
                className="gap-1"
                onClick={() => setActiveCategory(cat.id)}
              >
                <cat.icon className="size-3" />
                {t(`markets.category.${cat.id}`, cat.label)}
              </Button>
            ))}
          </div>
        )}
      </header>

      <section ref={scrollContainerRef} className="flex-1 overflow-auto">
        {showLoader ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <Loader2 className="mb-3 size-6 animate-spin text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {t('markets.loading')}
            </p>
          </div>
        ) : (
          <>
            {/* Recent strip */}
            {recentPairEntries.length > 0 && (
              <div className="flex items-center gap-2 border-b px-4 py-2">
                <Clock className="size-3 shrink-0 text-muted-foreground" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('markets.recent')}
                </span>
                <div className="flex flex-wrap gap-1">
                  {recentPairEntries.map((pair) => (
                    <Link
                      key={pair.symbol}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-accent/40"
                      params={{ pair: pair.symbol }}
                      to="/pair/$pair"
                    >
                      <PairLogo
                        base={pair.base}
                        quote={pair.quote}
                        assetClass={pair.assetClass}
                        size="sm"
                        className="mr-0.5"
                      />
                      <PairSymbol symbol={pair.symbol} className="text-xs" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Featured row */}
            {showFeatured && (
              <div className="border-b px-4 py-3">
                {/* Column count follows the available width rather than a
                    breakpoint. Three fixed columns meant a 384px pane gave
                    each tile 112px — less than the logo, symbol and price
                    need — so the symbol wrapped mid-pair ("BTC-" / "USDT")
                    and collided with the price. */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-2">
                  {featuredPairs.map((pair) => (
                    <Link
                      key={pair.symbol}
                      // Its own container: how a tile lays out depends on how
                      // wide that tile ended up, which the pane's width alone
                      // no longer tells us.
                      className="@container/tile group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                      params={{ pair: pair.symbol }}
                      to="/pair/$pair"
                      onClick={() => trackRecent(pair.symbol, pair.assetClass)}
                    >
                      <PairLogo
                        base={pair.base}
                        quote={pair.quote}
                        assetClass={pair.assetClass}
                        size="lg"
                      />
                      <div className="min-w-20 flex-1">
                        {/* A ticker never wraps — it truncates or it fits. */}
                        <PairSymbol
                          symbol={pair.symbol}
                          className="block truncate text-sm"
                        />
                        <p className="truncate text-xs text-muted-foreground">
                          {pair.name}
                        </p>
                      </div>
                      {/* Only once the tile is wide enough to hold logo,
                          pair, chart and price on one line — below that the
                          tile has already dropped its arrow to make room. */}
                      <MiniPriceChart
                        market={resolveMarket(pair.assetClass)}
                        pair={pair.symbol}
                        className="hidden h-6 w-10 @min-[19rem]/tile:block @min-[27rem]/tile:w-16"
                      />
                      <PairQuote
                        quote={quoteForPair(pair, liveQuotes, coinsBySymbol)}
                        className="ml-auto shrink-0"
                      />
                      {/* Decoration, and the first thing to go: below this
                          the price has already wrapped to its own line. */}
                      <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 @min-[21rem]/tile:block" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Empty states */}
            {sortedPairs.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                {activeCategory === 'watchlists' ? (
                  <>
                    <Star className="mb-3 size-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">
                      {t('markets.noWatchedPairs')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('markets.starHint')}
                    </p>
                  </>
                ) : (
                  <>
                    <Search className="mb-3 size-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">
                      {t('markets.noPairsFound')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('markets.tryDifferent')}{' '}
                      <button
                        className="text-primary underline underline-offset-2"
                        onClick={() => setActiveCategory('all')}
                      >
                        {t('markets.showAll')}
                      </button>
                    </p>
                  </>
                )}
              </div>
            ) : viewMode === 'list' ? (
              /* Table view */
              <div className="hidden @md/pane:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>{t('markets.colPair')}</TableHead>
                      {/* A share of the table, not a fixed 96px. At a fixed
                          width the line covered barely half the distance to
                          the right-aligned price and read as a chart that had
                          stopped drawing rather than a short one. */}
                      <TableHead className="hidden w-[26%] @lg/pane:table-cell">
                        {t('common.trend')}
                      </TableHead>
                      <TableHead className="text-right">
                        {t('markets.colPrice24h')}
                      </TableHead>
                      {/* Later than the trend line, at the measured width the
                          badges actually fit on one row (640px pane). Sharing
                          @lg with the trend column left them 74px, narrow
                          enough to wrap and make the row heights ragged. */}
                      <TableHead className="hidden @min-[40rem]/pane:table-cell">
                        {t('markets.colCategory')}
                      </TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {virtualPaddingTop > 0 && (
                      <tr>
                        <td style={{ height: virtualPaddingTop }} />
                      </tr>
                    )}
                    {virtualItems.map((virtualRow) => {
                      const pair = sortedPairs[virtualRow.index]!
                      return (
                        <PairTableRow
                          key={pair.symbol}
                          pair={pair}
                          quote={quoteForPair(pair, liveQuotes, coinsBySymbol)}
                          market={resolveMarket(pair.assetClass)}
                          isWatched={allSymbolsSet.has(pair.symbol)}
                          onStarClick={openAddDialog}
                          onNavigate={trackRecent}
                        />
                      )
                    })}
                    {virtualPaddingBottom > 0 && (
                      <tr>
                        <td style={{ height: virtualPaddingBottom }} />
                      </tr>
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {/* Card grid (shown on mobile always if list mode, or on all sizes if grid mode) */}
            <div
              className={cn(
                // Same reason as the featured row: a fixed second column at
                // @xs meant 150px cards, narrower than the content they hold.
                'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2 p-4',
                viewMode === 'list' ? '@md/pane:hidden' : '',
              )}
            >
              {sortedPairs.map((pair) => (
                <PairCard
                  key={pair.symbol}
                  pair={pair}
                  quote={quoteForPair(pair, liveQuotes, coinsBySymbol)}
                  market={resolveMarket(pair.assetClass)}
                  isWatched={allSymbolsSet.has(pair.symbol)}
                  onStarClick={openAddDialog}
                  onNavigate={trackRecent}
                />
              ))}
            </div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

const PairTableRow = memo(function PairTableRow({
  pair,
  quote,
  market,
  isWatched,
  onStarClick,
  onNavigate,
}: {
  pair: PairEntry
  quote: BulkQuote | undefined
  /** Venue the trend line is drawn from — resolved for the asset class. */
  market: string
  isWatched: boolean
  onStarClick: (symbol: string) => void
  onNavigate: (symbol: string, assetClass?: string) => void
}) {
  const { t } = useTranslation()
  const categoryLabels = CATEGORIES.filter(
    (c) =>
      c.id !== 'all' &&
      c.id !== 'watchlists' &&
      pair.categories.includes(c.id as PairCategory),
  )

  return (
    <TableRow className="group cursor-pointer">
      <TableCell>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onStarClick(pair.symbol)
          }}
        >
          <Star
            className={cn(
              'size-3.5',
              isWatched
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground',
            )}
          />
        </Button>
      </TableCell>
      <TableCell>
        <Link
          className="flex items-center gap-2.5"
          params={{ pair: pair.symbol }}
          to="/pair/$pair"
          onClick={() => onNavigate(pair.symbol, pair.assetClass)}
        >
          <PairLogo
            base={pair.base}
            quote={pair.quote}
            assetClass={pair.assetClass}
            size="sm"
          />
          <div>
            <PairSymbol symbol={pair.symbol} className="text-sm" />
            <p className="text-xs text-muted-foreground">{pair.name}</p>
          </div>
        </Link>
      </TableCell>
      <TableCell className="hidden @lg/pane:table-cell">
        <Link
          className="block"
          params={{ pair: pair.symbol }}
          to="/pair/$pair"
          onClick={() => onNavigate(pair.symbol, pair.assetClass)}
        >
          <MiniPriceChart
            market={market}
            pair={pair.symbol}
            className="h-6 w-full"
          />
        </Link>
      </TableCell>
      <TableCell>
        <PairQuote quote={quote} />
      </TableCell>
      <TableCell className="hidden @min-[40rem]/pane:table-cell">
        <div className="flex flex-wrap gap-1">
          {categoryLabels.map((cat) => (
            <Badge key={cat.id} variant="secondary" className="text-[10px]">
              {t(`markets.category.${cat.id}`, cat.label)}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <Link
          params={{ pair: pair.symbol }}
          to="/pair/$pair"
          onClick={() => onNavigate(pair.symbol, pair.assetClass)}
        >
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </TableCell>
    </TableRow>
  )
})

const PairCard = memo(function PairCard({
  pair,
  quote,
  market,
  isWatched,
  onStarClick,
  onNavigate,
}: {
  pair: PairEntry
  quote: BulkQuote | undefined
  /** Venue the trend line is drawn from — resolved for the asset class. */
  market: string
  isWatched: boolean
  onStarClick: (symbol: string) => void
  onNavigate: (symbol: string, assetClass?: string) => void
}) {
  const { t } = useTranslation()
  const categoryLabels = CATEGORIES.filter(
    (c) =>
      c.id !== 'all' &&
      c.id !== 'watchlists' &&
      pair.categories.includes(c.id as PairCategory),
  )

  return (
    <Link
      className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
      params={{ pair: pair.symbol }}
      to="/pair/$pair"
      onClick={() => onNavigate(pair.symbol, pair.assetClass)}
    >
      <PairLogo
        base={pair.base}
        quote={pair.quote}
        assetClass={pair.assetClass}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <PairSymbol
              symbol={pair.symbol}
              className="block truncate text-sm"
            />
            <p className="truncate text-xs text-muted-foreground">
              {pair.name}
            </p>
          </div>
          <PairQuote quote={quote} className="shrink-0" />
        </div>
        {/* Its own line: a card is narrow enough that squeezing the trend in
            beside the symbol costs the price its last digits. */}
        <MiniPriceChart
          market={market}
          pair={pair.symbol}
          className="mt-2 h-6 w-full"
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {categoryLabels.map((cat) => (
            <Badge key={cat.id} variant="secondary" className="text-[10px]">
              {t(`markets.category.${cat.id}`, cat.label)}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onStarClick(pair.symbol)
          }}
        >
          <Star
            className={cn(
              'size-3.5',
              isWatched
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground',
            )}
          />
        </Button>
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
})
