// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Pair picker (design flow D) — the most-used control on the phone, so it gets
 * the whole screen.
 *
 * Search order is the desktop's and is not re-derived: `usePairSearchData` is
 * the same hook `PairSearchResults` uses, so results → recent → watched, the
 * ≥2-char server search, the 1-char client filter and the 8-item recents cap
 * all behave identically. What is NOT reused is `PairSearchResults` itself —
 * its row is a 28px desk row with no venue line and no room for the callout.
 *
 * Mobile's addition is venue awareness. Because one venue is always in focus,
 * every result says which venue it would trade on, and a pair the focused
 * venue does not list says so BEFORE it is picked. That answer comes from the
 * venues' own bulk ticker snapshots (each one is the complete list of what a
 * venue trades) rather than from a discovery query filtered by market:
 * `pluginManager.execute` falls back to wildcard providers when a venue's call
 * fails, so a discovery read cannot answer a question *about a venue*.
 *
 * "No results" is a claim, and the screen only makes it once the search has
 * settled. Server search fans out across every DEX connector plus the catalog
 * and lands hundreds of milliseconds after the keystroke, so the naive
 * `results.length === 0` said "No pairs found" on the way to finding them —
 * the single most-reported bug on this screen. `searching` below is the
 * in-flight signal, and it drives skeleton rows instead.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Star, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Skeleton } from '@pairlens/ui/components/ui/skeleton'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { useVenueTradePermission } from '../lib/venue-permission'
import { VENUE_KIND_KEY, venueKindOf } from '../lib/venue-kind'
import { MobileRow } from '../primitives/mobile-row'
import {
  MobileSheet,
  useSheetExit,
  useSheetScrollRef,
} from '../primitives/mobile-sheet'
import { PRESS } from '../primitives/press'
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import type { MobileOverlay } from '../mobile-focus-context'
import type { VenueKind } from '../lib/venue-kind'
import { SnapshotAgeFooter } from '@/components/pair-picker/snapshot-age-footer'
import { pinSelectedEntry } from '@/components/pair-picker/pair-picker-data'
import { haptic } from '@/lib/haptics'
import { isSearchInFlight } from '@/components/pair-picker/search-progress'
import { usePairSearchData } from '@/components/pair-picker/pair-search-results'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { useBulkTickerSnapshots } from '@/hooks/use-bulk-ticker-quotes'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useRecentPairs } from '@/lib/recent-tickers'
import { normalizePairKey } from '@/lib/pairs'
import { useInstrumentSearch } from '@/hooks/use-instrument-search'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { usePairlens } from '@/lib/pairlens-provider'
import { entryToMarketRef } from '@/lib/market-ref/entry'

type PairPickerScreenProps = {
  overlay: Extract<MobileOverlay, { kind: 'pairPicker' }>
  onClose: () => void
}

type PairFilter = 'all' | VenueKind

const FILTERS: Array<{ id: PairFilter; labelKey: string }> = [
  { id: 'all', labelKey: 'markets.assetClass.all' },
  { id: 'cex', labelKey: 'mobile.pickers.filterCex' },
  { id: 'dex', labelKey: 'mobile.pickers.filterDex' },
  { id: 'equities', labelKey: 'mobile.pickers.filterEquities' },
]

const MAX_RESULTS = 24

/** What a row needs to say about the venue it would trade on. */
type VenueRouting = {
  market: string
  label: string
  kind: VenueKind
  /**
   * The focused venue published everything it trades and this was not on it.
   * Carries that venue's own label, because the row says "not on OKX" while
   * `label` above has already moved on to where it *would* trade.
   */
  unlistedOn: string | null
}

export default memo(function PairPickerScreen({
  overlay,
  onClose,
}: PairPickerScreenProps) {
  const { t } = useTranslation()
  const { focusedPair, focusedVenue } = useMobileFocus()
  const { setFocusedPair, setFocusedVenue } = useMobileActions()
  // Every dismiss routes through `requestClose` so the sheet gets to play its
  // exit before the overlay stack unmounts this screen. `overlay` is the
  // reopen key: a second tap on the pair chip during that exit pushes a new
  // one, and the sheet has to come back rather than stay shut behind it.
  const { open, isClosing, requestClose } = useSheetExit(onClose, overlay)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PairFilter>('all')

  const watchedSymbols = useWatchlistsStore((s) => s.allSymbolsSet)
  const activeListId = useWatchlistsStore((s) => s.state.activeListId)
  const addToWatchlist = useWatchlistsStore((s) => s.addToWatchlist)

  // `showSearchResults` is deliberately not read: it is `showResults.length >
  // 0` before the venue-kind filter runs, and the section here is driven by
  // what survives that filter.
  const { showResults, recentEntries, watchedEntries, hasQuery } =
    usePairSearchData(query, watchedSymbols)

  // The same two queries `usePairSearchData` reads, asked again for their
  // status. Both are react-query hooks keyed identically, so this is a cache
  // read and not a second fetch — and it is the only way to know the search is
  // still running, which the data-only hook cannot say.
  const {
    isSearchActive,
    isFetching: searchFetching,
    isPending: searchPending,
    hasLocalResults,
  } = useInstrumentSearch(query)
  const { isLoading: catalogLoading } = useMarketInstruments()

  // A one-character query is filtered client-side out of the catalog, and a
  // query the server answers needs a provider to answer it. Without this
  // guard, a build with no discovery-search plugin would hold the skeleton
  // open forever, because that query never leaves `pending`.
  const { pluginManager, pluginStateVersion } = usePairlens()
  const hasSearchProvider = useMemo(
    () =>
      pluginManager.getPluginForCapability('market-data:discovery:search') !==
      null,
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )

  const searching = isSearchInFlight({
    hasQuery,
    isSearchActive,
    hasSearchProvider,
    searchFetching,
    searchPending,
    catalogLoading,
    hasLocalResults,
  })

  const { markets } = useAvailableMarkets()
  const { availableMarkets: adapterInfos } = useMarketData()
  const resolveMarket = usePreferredMarketResolver()
  const snapshots = useBulkTickerSnapshots()

  const [, trackRecent] = useRecentPairs()
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  /** Every venue's complete listing, from the snapshot it already publishes. */
  const listings = useMemo(() => {
    const byMarket = new Map<string, Set<string>>()
    for (const snapshot of snapshots) {
      byMarket.set(
        snapshot.market,
        new Set(
          snapshot.tickers.map((entry) => normalizePairKey(entry.symbol)),
        ),
      )
    }
    return byMarket
  }, [snapshots])

  const labelFor = useCallback(
    (market: string) =>
      markets.find((m) => m.value === market)?.label ?? market.toUpperCase(),
    [markets],
  )

  const route = useCallback(
    (entry: PairEntry): VenueRouting => {
      const market = resolveMarket(entry.assetClass)
      const symbol = normalizePairKey(entry.symbol)
      const focusedListing = listings.get(focusedVenue)
      // Only a venue that actually published a listing can say "no".
      const unlisted =
        market === focusedVenue &&
        focusedListing !== undefined &&
        !focusedListing.has(symbol)

      let alternative: string | null = null
      if (unlisted) {
        for (const option of markets) {
          if (option.desktopOnly || option.value === focusedVenue) continue
          if (listings.get(option.value)?.has(symbol)) {
            alternative = option.value
            break
          }
        }
      }

      const effective = alternative ?? market
      return {
        market: effective,
        label: labelFor(effective),
        kind: venueKindOf(effective, adapterInfos),
        unlistedOn: unlisted ? labelFor(focusedVenue) : null,
      }
    },
    [resolveMarket, listings, focusedVenue, markets, labelFor, adapterInfos],
  )

  const apply = useCallback(
    (entries: Array<PairEntry>) =>
      entries
        .map((entry) => ({ entry, routing: route(entry) }))
        .filter(({ routing }) => filter === 'all' || routing.kind === filter),
    [route, filter],
  )

  // Filter BEFORE truncating: a venue-kind chip must see the whole result
  // set, or matches ranked past MAX_RESULTS read as a settled "No pairs
  // found" while they exist. route() is map lookups, cheap over the full set.
  const results = useMemo(
    () => apply(showResults).slice(0, MAX_RESULTS),
    [apply, showResults],
  )
  const recents = useMemo(() => apply(recentEntries), [apply, recentEntries])
  const watched = useMemo(() => apply(watchedEntries), [apply, watchedEntries])

  const isAdd = overlay.mode === 'watchlistAdd'

  const handleSelect = useCallback(
    (entry: PairEntry, routing: VenueRouting) => {
      // A row tapped while the sheet is already leaving is not a choice — see
      // `isClosing`.
      if (isClosing()) return
      haptic('selection')
      // Pin BEFORE navigation: a selected token's exact address must be in
      // the directory before anything downstream resolves the symbol.
      pinSelectedEntry(entry)
      if (isAdd) {
        addToWatchlist(entry.symbol, [activeListId])
        return
      }
      // Picking a pair the focused venue does not list takes the venue with it
      // — the callout said so before the tap.
      if (routing.market !== focusedVenue) setFocusedVenue(routing.market)
      setFocusedPair(entry.symbol)
      trackRecent(entryToMarketRef(entry, routing.market))
      if (entry.assetClass) {
        setAssetClassMap((prev) => ({
          ...prev,
          [entry.symbol]: entry.assetClass as string,
        }))
      }
      // The selection lands NOW and only the hand-off waits: the chart behind
      // the sheet is already on the new pair by the time it has slid away,
      // which is the whole point of animating the exit rather than cutting it.
      requestClose()
    },
    [
      isClosing,
      isAdd,
      addToWatchlist,
      activeListId,
      focusedVenue,
      setFocusedVenue,
      setFocusedPair,
      trackRecent,
      setAssetClassMap,
      requestClose,
    ],
  )

  /**
   * The first result the focused venue does not list AND that some other
   * reachable venue does — the callout explains the venue switch, so a pair
   * nobody else lists has nothing to explain and keeps only its inline tag.
   */
  const callout = results.find(
    ({ routing }) =>
      routing.unlistedOn !== null && routing.market !== focusedVenue,
  )

  return (
    <MobileSheet
      band="full"
      header={
        <div className="px-4 pb-2.5">
          <div className="flex items-center gap-3">
            <div className="pl-field flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-[11px] px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                aria-label={t('mobile.pickers.searchPlaceholder')}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                autoFocus={overlay.autoFocus}
                // 16px, not the design's 14: any focusable field under 16px
                // makes iOS Safari auto-zoom the page on focus, and the zoom
                // survives dismissal. The meta-viewport alternative
                // (maximum-scale=1) kills Android pinch-zoom, so the font is
                // the accessible fix.
                className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('mobile.pickers.searchPlaceholder')}
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
            <button
              className="pl-hit-44 pl-press-text shrink-0 text-[13.5px] font-medium text-foreground"
              onClick={requestClose}
              type="button"
              {...PRESS}
            >
              {t('common.cancel')}
            </button>
          </div>

          <div className="mt-2.5 flex gap-1.5">
            {FILTERS.map((option) => (
              <button
                className={cn(
                  'pl-press flex h-7 items-center rounded-full px-3 text-[12.5px] font-medium',
                  option.id === filter
                    ? 'bg-foreground text-background'
                    : 'pl-field text-muted-foreground',
                )}
                key={option.id}
                onClick={() => setFilter(option.id)}
                type="button"
                {...PRESS}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>
      }
      label={t('mobile.shell.overlays.pairPicker')}
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
      open={open}
    >
      {/* The tab bar floats above the sheet, so the list ends where it starts. */}
      <ListScrollReset filter={filter} query={query} />
      <div className="pb-[var(--pl-tabbar-total)]">
        {/* Stale results outlive a keystroke on purpose: react-query hands
            back the previous query's items while the new one is in flight, so
            the list holds still instead of blanking. The skeleton is only for
            the case where there is genuinely nothing to hold. */}
        {hasQuery && results.length > 0 ? (
          <PickerSection label={t('search.results')}>
            {results.map(({ entry, routing }) => (
              <PairResultRow
                entry={entry}
                focused={entry.symbol === focusedPair}
                key={entry.id}
                onSelect={handleSelect}
                routing={routing}
                watched={watchedSymbols.has(entry.symbol)}
              />
            ))}
          </PickerSection>
        ) : searching ? (
          <PickerSection label={t('search.results')}>
            <PairResultSkeletons />
          </PickerSection>
        ) : null}

        <SnapshotAgeFooter visible={hasQuery && results.length > 0} />

        {callout ? (
          <div className="mx-4 mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <TriangleAlert className="mt-px size-4 shrink-0 text-amber-500" />
            <p className="text-[12px] leading-[1.45] text-amber-200/90">
              {t('mobile.pickers.notListedCallout', {
                pair: callout.entry.symbol,
                venue: callout.routing.unlistedOn,
                other: callout.routing.label,
              })}
            </p>
          </div>
        ) : null}

        {!hasQuery && recents.length > 0 ? (
          <PickerSection label={t('search.recent')}>
            {recents.map(({ entry, routing }) => (
              <PairResultRow
                entry={entry}
                focused={entry.symbol === focusedPair}
                key={entry.symbol}
                onSelect={handleSelect}
                routing={routing}
                watched={watchedSymbols.has(entry.symbol)}
              />
            ))}
          </PickerSection>
        ) : null}

        {!hasQuery && watched.length > 0 ? (
          <PickerSection label={t('search.watched')}>
            {watched.map(({ entry, routing }) => (
              <PairResultRow
                entry={entry}
                focused={entry.symbol === focusedPair}
                key={entry.symbol}
                onSelect={handleSelect}
                routing={routing}
                watched
              />
            ))}
          </PickerSection>
        ) : null}

        {/* Only once the search has settled. Saying "no pairs" while a request
            is still out is the bug this screen was reported for. */}
        {hasQuery && !searching && results.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
            {t('pairPicker.noPairsFound')}
          </p>
        ) : null}

        {!hasQuery && recents.length === 0 && watched.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
            {t('pairPicker.startTyping')}
          </p>
        ) : null}
      </div>
    </MobileSheet>
  )
})

/**
 * A new query (or venue-kind filter) starts a new list, so it starts at the
 * top — the desktop pickers make the same reset. A child of the sheet rather
 * than an effect in the screen because the scroll region belongs to
 * `MobileSheet` and is only published through context to what it wraps.
 * Keyed on the query and filter only: async search waves appending rows must
 * not yank a scroll the user owns.
 */
function ListScrollReset({ query, filter }: { query: string; filter: string }) {
  const scrollRef = useSheetScrollRef()
  useEffect(() => {
    scrollRef?.current?.scrollTo({ top: 0 })
  }, [scrollRef, query, filter])
  return null
}

/** Rows the settled list will occupy, so the section does not jump on arrival. */
const SKELETON_ROWS = [0, 1, 2, 3, 4]

/**
 * Deliberately shaped like `PairResultRow`: the same 44px row box, the same
 * 32px avatar slot, the same two text lines. A generic spinner would tell the
 * user something is happening; this tells them what is about to be there, and
 * the list does not reflow when it lands.
 */
function PairResultSkeletons() {
  return (
    <div aria-hidden>
      {SKELETON_ROWS.map((row) => (
        <div
          className="flex min-h-[44px] w-full items-center gap-[11px] border-t border-t-[color:var(--pl-hairline)] px-4 py-2.5"
          key={row}
        >
          {/* `bg-muted` is nearly the sheet's own colour on this theme, so the
              placeholder reads as an empty list. The sheet's own hairline
              tint is the contrast that works over it. */}
          <Skeleton className="size-8 shrink-0 rounded-full bg-[color:var(--pl-wash-strong)]" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-[92px] bg-[color:var(--pl-wash-strong)]" />
            <Skeleton className="h-2.5 w-[132px] bg-[color:var(--pl-wash-strong)]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function PickerSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="px-4 pb-1 pt-3.5 text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  )
}

const PairResultRow = memo(function PairResultRow({
  entry,
  routing,
  watched,
  focused,
  onSelect,
}: {
  entry: PairEntry
  routing: VenueRouting
  watched: boolean
  focused: boolean
  onSelect: (entry: PairEntry, routing: VenueRouting) => void
}) {
  const { t } = useTranslation()
  const permission = useVenueTradePermission(routing.market)

  const capability =
    routing.kind === 'dex'
      ? t(VENUE_KIND_KEY.dex)
      : permission === 'trade'
        ? t('mobile.panels.trading')
        : t('mobile.shell.readOnly')

  return (
    <MobileRow
      leading={
        <PairAvatar
          assetClass={entry.assetClass}
          base={entry.base}
          className="size-8"
          size="md"
        />
      }
      onPress={() => onSelect(entry, routing)}
      selected={focused}
      subtitle={
        routing.unlistedOn ? (
          <>
            {entry.name}
            <span className="pl-2 text-amber-500/90">
              {t('mobile.pickers.notListed', { venue: routing.unlistedOn })}
            </span>
          </>
        ) : (
          `${entry.name} · ${routing.label} · ${capability}`
        )
      }
      title={<span className="font-mono">{entry.symbol}</span>}
      trailing={
        watched ? (
          <Star className="size-4 fill-amber-400 text-amber-400" />
        ) : undefined
      }
    />
  )
})
