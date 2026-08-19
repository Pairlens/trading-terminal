// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
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
import { Kbd } from '@pairlens/ui/components/ui/kbd'
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

import { PREDICTION_DISCOVERY_TEMPLATE_ID } from '@pairlens/plugins/pairlens-predictions/workspaces'

import { useVirtualizer } from '@tanstack/react-virtual'
import { normalizeInstrumentClass } from '@pairlens/shared/market-ref'
import type {
  AssetClassFilter,
  PairCategory,
  PairEntry,
} from '@/components/pair-picker/pair-picker-data'
import type { BulkQuote } from '@/hooks/use-bulk-ticker-quotes'
import type { TopCoin } from '@pairlens/shared/instrument-types'
import type { InstrumentRef } from '@pairlens/shared/market-ref'
import { assetClassVisual } from '@/lib/asset-class/visuals'
import { PANE_COLUMN_HEADER } from '@/components/panes/pane-primitives'
import { PaneHeaderMetric } from '@/components/layout/pane-header-slot'
import { useOmniSearch } from '@/components/omni-search/omni-search-provider'
import { useKeybindingLabel } from '@/hooks/use-keybindings'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'
import {
  ASSET_CLASSES,
  ASSET_CLASS_FILTER_FOR,
  CATEGORIES,
  instrumentToPairEntry,
} from '@/components/pair-picker/pair-picker-data'
import { useDiscoverySection } from '@/lib/discovery-section-context'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { useTopCoinsSnapshot } from '@/hooks/use-top-coins-snapshot'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { useRecentPairs } from '@/lib/recent-tickers'
import { track } from '@/lib/analytics-events'
import { workspaceAnalyticsKind } from '@/lib/analytics-panels'
import { useLayout } from '@/lib/layout/context'
import { useWorkspace } from '@/lib/layout/workspace-context'
import { useRoutePresets } from '@/lib/layout/use-route-presets'
import { workspaceTemplateRegistry } from '@/lib/workspace-store/workspace-template-registry'
import {
  entryToInstrumentRef,
  entryToMarketRef,
  isEntryWatched,
} from '@/lib/market-ref/entry'
import { chartLinkProps } from '@/lib/market-ref/link'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
// Extracted verbatim so the mobile lists render the same reserved column and
// the same tick flash as this pane instead of a second implementation.
import { PairQuote, quoteForPair } from '@/components/discovery/pair-quote'

/**
 * Asset classes the crypto SECTOR taxonomy (Layer 1, DeFi, meme, …) actually
 * describes. Everything else hides the category row: an equity has no sector
 * in this vocabulary, a prediction outcome is a question rather than an asset,
 * and a perpetual contract inherits its base asset's sector but is not
 * catalogued under one.
 */
const SECTORED_ASSET_CLASSES = new Set<AssetClassFilter>(['all', 'crypto'])

/**
 * What the shared `TableHead` needs to sit in a pane: the 40px row height it
 * was built for is a third of a pane's visible list.
 */
const TABLE_HEAD = 'h-7 pb-1.5 align-bottom'

/**
 * The way out of the predictions empty state.
 *
 * Prediction outcomes are never in the catalog this pane reads, so the chip
 * has always been a dead end: correct copy, nowhere to go. The event browser
 * is where they live, and the predictions plugin ships a home board built
 * around it.
 *
 * Whether that board EXISTS is a question about the plugin registry, not about
 * this route's menu: the board is a discovery preset, so on a pair route or a
 * custom workspace it is filtered out of `useRoutePresets` and reading
 * availability from there told the user to install a plugin they already had.
 * So: apply in place when this workspace offers it, send them to Discovery
 * with the board when it exists elsewhere, and only offer the Plugin Store
 * when the family is genuinely gone.
 *
 * Its own component so the hooks it needs only run when the empty state is on
 * screen.
 */
function PredictionsEmptyAction() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { dispatch } = useLayout()
  const workspace = useWorkspace()
  const presets = useRoutePresets(workspace)
  const preset = presets[PREDICTION_DISCOVERY_TEMPLATE_ID]

  // The registry, not the route menu, is what knows the board is installed.
  const registryVersion = useSyncExternalStore(
    workspaceTemplateRegistry.subscribe,
    workspaceTemplateRegistry.getSnapshot,
    workspaceTemplateRegistry.getSnapshot,
  )
  const boardExists = useMemo(() => {
    void registryVersion
    return workspaceTemplateRegistry
      .getTemplates()
      .some((tpl) => tpl.id === PREDICTION_DISCOVERY_TEMPLATE_ID)
  }, [registryVersion])

  const available = Boolean(preset) || boardExists

  return (
    <Button
      size="sm"
      variant="outline"
      className="mt-4"
      onClick={() => {
        if (preset) {
          track('preset_applied', {
            preset: PREDICTION_DISCOVERY_TEMPLATE_ID,
            workspace: workspaceAnalyticsKind(workspace.storageKey),
          })
          dispatch({
            type: 'APPLY_PRESET',
            layout: structuredClone(preset.layout),
          })
          return
        }
        if (boardExists) {
          // The board is the Predictions section's default, so send the user
          // to the section rather than stamping the board over this one.
          void navigate({ to: '/', search: { section: 'prediction' } })
          return
        }
        void navigate({ to: '/plugins' })
      }}
    >
      {available
        ? t('markets.predictionsBrowse')
        : t('markets.predictionsInstall')}
    </Button>
  )
}

/**
 * Below this the pane is a rail, not a table.
 *
 * 24rem is where the scanner's own header stops fitting: two chip rows, a view
 * toggle, five table columns. The rail variant is not the table shrunk, it is
 * a different pane — one search field that hands off to the palette, one
 * scrollable chip row, two-line rows, and a way out at the bottom.
 */
const RAIL_MAX_WIDTH = 384

/**
 * The pane's own width, measured rather than declared.
 *
 * A container query would have to render both trees and hide one, and the
 * hidden one is a virtualized table over every listed pair. Measuring lets the
 * pane mount exactly one of them. `useLayoutEffect` takes the first
 * measurement before paint, so a docked pane never flashes the table.
 */
function useIsRail(ref: React.RefObject<HTMLElement | null>): boolean {
  const [isRail, setIsRail] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const width = element.getBoundingClientRect().width
      // A pane mid-animation can measure 0; that is not a rail, it is a pane
      // that has not been laid out yet.
      if (width > 0) setIsRail(width < RAIL_MAX_WIDTH)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return isRail
}

export function MarketsPane() {
  const { t } = useTranslation()
  // Inside a Discovery section the scanner opens on that section's asset
  // class, and remembers its own chip per section: widening the perps board to
  // "All" is a decision about the perps board, not about every board. Off
  // Discovery (a pair route, a custom workspace) there is no section and the
  // pane keeps the single global chip it always had.
  const section = useDiscoverySection()
  const [assetClassFilter, setAssetClassFilter] =
    usePersistedState<AssetClassFilter>(
      section ? `pair-picker.assetClass.${section}` : 'pair-picker.assetClass',
      section ? ASSET_CLASS_FILTER_FOR[section] : 'all',
    )
  const [activeCategory, setActiveCategory] = usePersistedState<
    PairCategory | 'all' | 'watchlists'
  >('pair-picker.category', 'all')
  const [viewMode, setViewMode] = usePersistedState<'list' | 'grid'>(
    'pair-picker.viewMode',
    'list',
  )
  const allSymbolsSet = useWatchlistsStore((s) => s.allSymbolsSet)
  const watchedRefs = useWatchlistsStore((s) => s.watchedRefs)
  const openAddDialog = useWatchlistsStore((s) => s.openAddDialog)
  const coinsBySymbol = useTopCoinsSnapshot()
  const liveQuotes = useBulkTickerQuotes()
  // Trend lines come from candles, which need a venue — an equity row can't
  // ask a crypto exchange, so each row resolves its own.
  const resolveMarket = usePreferredMarketResolver()
  // The shared store, not a second `pair-picker.recent` writer. This pane
  // used to write raw symbols straight to that key while the marquee wrote
  // qualified refs to the same one, so whichever surface wrote last decided
  // what the other could read.
  const [recentPairs, trackRecentRef] = useRecentPairs()
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
    (pair: PairEntry) => {
      trackRecentRef(entryToMarketRef(pair, resolveMarket(pair.assetClass)))
      if (pair.assetClass) {
        setAssetClassMap((prev) => ({
          ...prev,
          [pair.symbol]: pair.assetClass as string,
        }))
      }
    },
    [trackRecentRef, resolveMarket, setAssetClassMap],
  )

  const recentPairEntries = useMemo(
    () =>
      recentPairs
        .map((ref) => pairsBySymbol.get(ref.id))
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
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)
  // The rows don't start at the top of the scroll container — the recent
  // strip, the featured tiles and the table header scroll above them. The
  // virtualizer must know that offset (scrollMargin), otherwise every row is
  // placed too high by exactly that height and scrolling opens a blank band
  // between the header and the first rendered row.
  const [rowsScrollMargin, setRowsScrollMargin] = useState(0)
  useLayoutEffect(() => {
    const scrollEl = scrollContainerRef.current
    if (!scrollEl) return

    const measure = () => {
      const bodyEl = tableBodyRef.current
      if (!bodyEl) return
      const offset =
        bodyEl.getBoundingClientRect().top -
        scrollEl.getBoundingClientRect().top +
        scrollEl.scrollTop
      setRowsScrollMargin((prev) => (prev === offset ? prev : offset))
    }

    measure()
    // Width changes rewrap the featured tiles and change their height;
    // content-driven height changes (recent strip appearing, featured pairs
    // loading) re-run this effect via its deps below.
    const observer = new ResizeObserver(measure)
    observer.observe(scrollEl)
    return () => observer.disconnect()
  }, [showLoader, recentPairEntries.length, showFeatured, featuredPairs.length])

  const rowVirtualizer = useVirtualizer({
    count: sortedPairs.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 52,
    overscan: 10,
    scrollMargin: rowsScrollMargin,
  })

  // Docked at 18% of a board, the scanner is a rail rather than a table. The
  // measurement drives which of the two trees mounts at all.
  const rootRef = useRef<HTMLDivElement>(null)
  const isRail = useIsRail(rootRef)

  const virtualItems = rowVirtualizer.getVirtualItems()
  // Item starts include scrollMargin; getTotalSize() excludes it. Normalize
  // both spacers back into table-local coordinates.
  const virtualPaddingTop =
    virtualItems.length > 0
      ? (virtualItems[0]?.start ?? 0) - rowsScrollMargin
      : 0
  const virtualPaddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() -
        ((virtualItems[virtualItems.length - 1]?.end ?? 0) - rowsScrollMargin)
      : 0

  if (isRail) {
    return (
      <div ref={rootRef} className="flex h-full flex-col overflow-hidden">
        <MarketsRail
          total={total}
          pairs={sortedPairs}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          liveQuotes={liveQuotes}
          coinsBySymbol={coinsBySymbol}
          resolveMarket={resolveMarket}
          onNavigate={trackRecent}
          loading={showLoader}
        />
      </div>
    )
  }

  return (
    <div ref={rootRef} className="flex h-full flex-col overflow-hidden">
      {/* The pane's name and its count are the shell's row now; what is left
          is the filter toolbar, with the view toggle riding on the end of the
          asset-class line rather than owning a row of its own. */}
      <header className="shrink-0 space-y-1.5 pb-2">
        <PaneHeaderMetric>
          {t('markets.pairCount', { count: total })}
        </PaneHeaderMetric>

        {/* Asset class filter: the same five colours the Discovery tabs and
            the pair badge wear, so the chip a trader picks here matches the
            badge on the pair it opens. */}
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {ASSET_CLASSES.map((ac) => {
              const cls = normalizeInstrumentClass(ac.id)
              const visual = cls ? assetClassVisual(cls) : null
              const selected = assetClassFilter === ac.id
              return (
                <Button
                  key={ac.id}
                  size="xs"
                  variant={selected && !visual ? 'default' : 'ghost'}
                  className={cn(
                    'gap-1 border border-transparent',
                    selected &&
                      visual && [visual.activeBg, visual.border, visual.text],
                  )}
                  onClick={() => {
                    setAssetClassFilter(ac.id)
                    // Reset category when switching to a class the crypto sector
                    // taxonomy doesn't describe (equities, prediction outcomes,
                    // perpetual contracts)
                    if (
                      !SECTORED_ASSET_CLASSES.has(ac.id) &&
                      activeCategory !== 'all' &&
                      activeCategory !== 'watchlists'
                    ) {
                      setActiveCategory('all')
                    }
                  }}
                >
                  <ac.icon className={cn('size-3', visual?.text)} />
                  {t(`markets.assetClass.${ac.id}`, ac.label)}
                </Button>
              )
            })}
          </div>

          <ToggleGroup
            aria-label={t('markets.viewMode')}
            className="shrink-0"
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

        {/* Category tabs (hidden for classes the crypto sector taxonomy doesn't
            describe: equities, prediction outcomes, perpetual contracts) */}
        {SECTORED_ASSET_CLASSES.has(assetClassFilter) && (
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="mb-3 size-6 animate-spin text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {t('markets.loading')}
            </p>
          </div>
        ) : (
          <>
            {/* Prediction outcomes are never in the catalog this pane reads —
                they are born and resolved daily. Saying where they ARE beats
                an empty grid that reads as "no prediction markets exist". */}
            {assetClassFilter === 'prediction' && sortedPairs.length === 0 && (
              <div className="py-10 text-center">
                <p className="text-sm font-medium">
                  {t('markets.predictionsEmptyTitle')}
                </p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  {t('markets.predictionsEmptyBody')}
                </p>
                <PredictionsEmptyAction />
              </div>
            )}

            {/* Perpetuals are not in the curated catalog either: the contract
                list comes off each futures connector's own market table, which
                exists only once that venue has been reached. An empty grid
                would read as "no perpetual markets exist" when the truth is
                that no futures venue is connected yet. */}
            {assetClassFilter === 'crypto-perp' && sortedPairs.length === 0 && (
              <div className="py-10 text-center">
                <p className="text-sm font-medium">
                  {t('markets.futuresEmptyTitle')}
                </p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  {t('markets.futuresEmptyBody')}
                </p>
              </div>
            )}

            {/* Recent strip */}
            {recentPairEntries.length > 0 && (
              <div className="flex items-center gap-2 py-2">
                <Clock className="size-3 shrink-0 text-muted-foreground" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('markets.recent')}
                </span>
                <div className="flex flex-wrap gap-1">
                  {recentPairEntries.map((pair) => (
                    <Link
                      key={pair.symbol}
                      className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-0.5 text-xs transition-colors hover:bg-accent/40"
                      {...chartLinkProps(
                        entryToMarketRef(pair, resolveMarket(pair.assetClass)),
                      )}
                    >
                      <PairLogo
                        base={pair.base}
                        quote={pair.quote}
                        assetClass={pair.assetClass}
                        size="sm"
                        className="mr-0.5"
                      />
                      <PairSymbol
                        symbol={pair.symbol}
                        assetClass={pair.assetClass}
                        className="min-w-0 text-xs"
                      />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Featured row */}
            {showFeatured && (
              <div className="py-3">
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
                      className="@container/tile group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 p-2.5 transition-colors hover:bg-accent/40"
                      {...chartLinkProps(
                        entryToMarketRef(pair, resolveMarket(pair.assetClass)),
                      )}
                      onClick={() => trackRecent(pair)}
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
                          assetClass={pair.assetClass}
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

            {/* Empty states. The hints above already explain an empty
                prediction or futures list; "No pairs found · show all" under
                one would send the user back to a category that never had
                any. */}
            {sortedPairs.length === 0 &&
            assetClassFilter !== 'prediction' &&
            assetClassFilter !== 'crypto-perp' ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
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
                <Table className="[&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0">
                  {/* No rule under the head row: the board draws one line and
                      this is not it. */}
                  <TableHeader className="[&_tr]:border-0">
                    <TableRow>
                      <TableHead
                        className={cn(PANE_COLUMN_HEADER, TABLE_HEAD, 'w-10')}
                      />
                      <TableHead className={cn(PANE_COLUMN_HEADER, TABLE_HEAD)}>
                        {t('markets.colPair')}
                      </TableHead>
                      {/* A share of the table, not a fixed 96px. At a fixed
                          width the line covered barely half the distance to
                          the right-aligned price and read as a chart that had
                          stopped drawing rather than a short one. */}
                      <TableHead
                        className={cn(
                          PANE_COLUMN_HEADER,
                          TABLE_HEAD,
                          'hidden w-[26%] @lg/pane:table-cell',
                        )}
                      >
                        {t('common.trend')}
                      </TableHead>
                      <TableHead
                        className={cn(
                          PANE_COLUMN_HEADER,
                          TABLE_HEAD,
                          'text-right',
                        )}
                      >
                        {t('markets.colPrice24h')}
                      </TableHead>
                      {/* Later than the trend line, at the measured width the
                          badges actually fit on one row (640px pane). Sharing
                          @lg with the trend column left them 74px, narrow
                          enough to wrap and make the row heights ragged. */}
                      <TableHead
                        className={cn(
                          PANE_COLUMN_HEADER,
                          TABLE_HEAD,
                          'hidden @min-[40rem]/pane:table-cell',
                        )}
                      >
                        {t('markets.colCategory')}
                      </TableHead>
                      <TableHead
                        className={cn(PANE_COLUMN_HEADER, TABLE_HEAD, 'w-10')}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody ref={tableBodyRef}>
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
                          isWatched={isEntryWatched(pair, watchedRefs)}
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
                'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2 py-3',
                viewMode === 'list' ? '@md/pane:hidden' : '',
              )}
            >
              {sortedPairs.map((pair) => (
                <PairCard
                  key={pair.symbol}
                  pair={pair}
                  quote={quoteForPair(pair, liveQuotes, coinsBySymbol)}
                  market={resolveMarket(pair.assetClass)}
                  isWatched={isEntryWatched(pair, watchedRefs)}
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

// ── Rail variant ────────────────────────────────────────────────────

/**
 * The scanner docked in an 18% column.
 *
 * Three deliberate differences from the table. The search field does not
 * search: typing in a 200px input against two thousand instruments is worse
 * than the palette in every way, so the field is a target that opens the
 * palette and says which chord does the same thing. The chip row is one line
 * that scrolls rather than two that wrap, because a rail cannot spend a third
 * of its height on filters. And the list is capped, with the way past the cap
 * spelled out in the footer: an infinite scroll inside a rail is a place
 * people get lost, not a feature.
 */
const RAIL_ROW_LIMIT = 100

function MarketsRail({
  total,
  pairs,
  activeCategory,
  onCategoryChange,
  liveQuotes,
  coinsBySymbol,
  resolveMarket,
  onNavigate,
  loading,
}: {
  total: number
  pairs: Array<PairEntry>
  activeCategory: PairCategory | 'all' | 'watchlists'
  onCategoryChange: (category: PairCategory | 'all' | 'watchlists') => void
  liveQuotes: Map<string, BulkQuote>
  coinsBySymbol: Map<string, TopCoin>
  resolveMarket: (assetClass?: string) => string
  onNavigate: (pair: PairEntry) => void
  loading: boolean
}) {
  const { t } = useTranslation()
  const { open } = useOmniSearch()
  const searchShortcut = useKeybindingLabel('general.commandPalette')

  const rows = useMemo(() => pairs.slice(0, RAIL_ROW_LIMIT), [pairs])

  return (
    <>
      <PaneHeaderMetric>
        {t('markets.pairCount', { count: total })}
      </PaneHeaderMetric>

      <div className="flex shrink-0 flex-col gap-1.5 pb-2">
        {/* Dressed as a field, built as a button. There is never a caret in a
            box that cannot answer, click and Enter both reach the palette, and
            it is deliberately NOT wired to `onFocus`: the palette returns
            focus to whatever opened it, so a focus handler here would reopen
            itself every time the user closed it. */}
        <button
          type="button"
          onClick={open}
          className="flex h-6 items-center gap-1.5 rounded-lg bg-muted/40 px-2 text-left transition-colors hover:bg-accent/40"
        >
          <Search className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {t('markets.searchPairs', { count: total })}
          </span>
          {searchShortcut ? (
            <Kbd className="shrink-0 text-[9.5px]">{searchShortcut}</Kbd>
          ) : null}
        </button>

        {/* One line, scrolled. Wrapping these cost the rail two rows of
            height and still truncated the last chip. */}
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              aria-pressed={activeCategory === cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={cn(
                'shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium transition-colors',
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/40 hover:bg-accent/50',
              )}
            >
              {t(`markets.category.${cat.id}`, cat.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[13px] font-medium">
              {t('markets.noPairsFound')}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('markets.tryDifferent')}{' '}
              <button
                className="text-primary underline underline-offset-2"
                onClick={() => onCategoryChange('all')}
              >
                {t('markets.showAll')}
              </button>
            </p>
          </div>
        ) : (
          rows.map((pair) => (
            <PairRailRow
              key={pair.symbol}
              pair={pair}
              quote={quoteForPair(pair, liveQuotes, coinsBySymbol)}
              market={resolveMarket(pair.assetClass)}
              onNavigate={onNavigate}
            />
          ))
        )}
      </div>

      <button
        type="button"
        onClick={open}
        className="mt-1.5 flex shrink-0 items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[11px] text-primary transition-colors hover:bg-accent/40"
      >
        <span className="truncate">
          {t('markets.browseAll', { count: total })}
        </span>
        <ArrowRight className="size-3 shrink-0" />
      </button>
    </>
  )
}

const PairRailRow = memo(function PairRailRow({
  pair,
  quote,
  market,
  onNavigate,
}: {
  pair: PairEntry
  quote: BulkQuote | undefined
  market: string
  onNavigate: (pair: PairEntry) => void
}) {
  return (
    <Link
      className="flex items-center gap-2 border-b border-border/40 px-1.5 py-1.5 transition-colors hover:bg-accent/40"
      {...chartLinkProps(entryToMarketRef(pair, market))}
      onClick={() => onNavigate(pair)}
    >
      <PairLogo
        base={pair.base}
        quote={pair.quote}
        assetClass={pair.assetClass}
        size="sm"
        className="size-[18px] text-[8px]"
      />
      <div className="min-w-0 flex-1">
        <PairSymbol
          symbol={pair.symbol}
          assetClass={pair.assetClass}
          className="block truncate text-[11.5px]"
        />
        <p className="truncate text-[10px] text-muted-foreground">
          {pair.name}
        </p>
      </div>
      <PairQuote quote={quote} variant="rail" className="shrink-0" />
    </Link>
  )
})

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
  onStarClick: (target: InstrumentRef) => void
  onNavigate: (pair: PairEntry) => void
}) {
  const { t } = useTranslation()
  const categoryLabels = CATEGORIES.filter(
    (c) =>
      c.id !== 'all' &&
      c.id !== 'watchlists' &&
      pair.categories.includes(c.id as PairCategory),
  )

  return (
    <TableRow className="group cursor-pointer border-border/40">
      <TableCell>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onStarClick(entryToInstrumentRef(pair))
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
          {...chartLinkProps(entryToMarketRef(pair, market))}
          onClick={() => onNavigate(pair)}
        >
          <PairLogo
            base={pair.base}
            quote={pair.quote}
            assetClass={pair.assetClass}
            size="sm"
          />
          <div className="min-w-0">
            <PairSymbol
              symbol={pair.symbol}
              assetClass={pair.assetClass}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">{pair.name}</p>
          </div>
        </Link>
      </TableCell>
      <TableCell className="hidden @lg/pane:table-cell">
        <Link
          className="block"
          {...chartLinkProps(entryToMarketRef(pair, market))}
          onClick={() => onNavigate(pair)}
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
          {...chartLinkProps(entryToMarketRef(pair, market))}
          onClick={() => onNavigate(pair)}
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
  onStarClick: (target: InstrumentRef) => void
  onNavigate: (pair: PairEntry) => void
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
      className="group flex items-start gap-3 rounded-lg bg-muted/40 p-2.5 transition-colors hover:bg-accent/40"
      {...chartLinkProps(entryToMarketRef(pair, market))}
      onClick={() => onNavigate(pair)}
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
              assetClass={pair.assetClass}
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
            onStarClick(entryToInstrumentRef(pair))
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
