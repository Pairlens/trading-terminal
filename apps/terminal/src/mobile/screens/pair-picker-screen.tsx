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
 */
import { memo, useCallback, useMemo, useState } from 'react'
import { Search, Star, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { useVenueTradePermission } from '../lib/venue-permission'
import { VENUE_KIND_KEY, venueKindOf } from '../lib/venue-kind'
import { MobileRow } from '../primitives/mobile-row'
import { MobileSheet } from '../primitives/mobile-sheet'
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import type { MobileOverlay } from '../mobile-focus-context'
import type { VenueKind } from '../lib/venue-kind'
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

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PairFilter>('all')

  const watchedSymbols = useWatchlistsStore((s) => s.allSymbolsSet)
  const activeListId = useWatchlistsStore((s) => s.state.activeListId)
  const addToWatchlist = useWatchlistsStore((s) => s.addToWatchlist)

  const {
    showSearchResults,
    showResults,
    recentEntries,
    watchedEntries,
    hasQuery,
  } = usePairSearchData(query, watchedSymbols)

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

  const results = useMemo(
    () => apply(showResults.slice(0, MAX_RESULTS)),
    [apply, showResults],
  )
  const recents = useMemo(() => apply(recentEntries), [apply, recentEntries])
  const watched = useMemo(() => apply(watchedEntries), [apply, watchedEntries])

  const isAdd = overlay.mode === 'watchlistAdd'

  const handleSelect = useCallback(
    (entry: PairEntry, routing: VenueRouting) => {
      if (isAdd) {
        addToWatchlist(entry.symbol, [activeListId])
        return
      }
      // Picking a pair the focused venue does not list takes the venue with it
      // — the callout said so before the tap.
      if (routing.market !== focusedVenue) setFocusedVenue(routing.market)
      setFocusedPair(entry.symbol)
      trackRecent(entry.symbol)
      if (entry.assetClass) {
        setAssetClassMap((prev) => ({
          ...prev,
          [entry.symbol]: entry.assetClass as string,
        }))
      }
      onClose()
    },
    [
      isAdd,
      addToWatchlist,
      activeListId,
      focusedVenue,
      setFocusedVenue,
      setFocusedPair,
      trackRecent,
      setAssetClassMap,
      onClose,
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
                className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('mobile.pickers.searchPlaceholder')}
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
            <button
              className="pl-hit-44 shrink-0 text-[13.5px] font-medium text-foreground"
              onClick={onClose}
              type="button"
            >
              {t('common.cancel')}
            </button>
          </div>

          <div className="mt-2.5 flex gap-1.5">
            {FILTERS.map((option) => (
              <button
                className={cn(
                  'flex h-7 items-center rounded-full px-3 text-[12.5px] font-medium',
                  option.id === filter
                    ? 'bg-foreground text-background'
                    : 'pl-field text-muted-foreground',
                )}
                key={option.id}
                onClick={() => setFilter(option.id)}
                type="button"
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>
      }
      label={t('mobile.shell.overlays.pairPicker')}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      open
    >
      {/* The tab bar floats above the sheet, so the list ends where it starts. */}
      <div className="pb-[var(--pl-tabbar-total)]">
        {hasQuery && showSearchResults ? (
          <PickerSection label={t('search.results')}>
            {results.map(({ entry, routing }) => (
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

        {hasQuery && results.length === 0 ? (
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
