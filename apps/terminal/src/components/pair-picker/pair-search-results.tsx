// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'

import { parseInstrumentRef } from '@pairlens/shared/market-ref'
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import type { InstrumentRef } from '@pairlens/shared/market-ref'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'
import {
  instrumentToPairEntry,
  isPredictionEntry,
  pairEntryForRef,
  pinSelectedEntry,
  predictionQuestionOf,
} from '@/components/pair-picker/pair-picker-data'
import { VenueBadge } from '@/components/pair-picker/venue-badge'
import { useInstrumentSearch } from '@/hooks/use-instrument-search'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { useRecentPairs } from '@/lib/recent-tickers'
import { useWatchlistsStore } from '@/stores/watchlists-store'

export type PairSearchResultsProps = {
  searchValue: string
  watchedSymbols: Set<string>
  /** The whole row. A token's identity is its chain+address, which a
   * symbol string cannot carry, so callers get the entry. */
  onSelect: (entry: PairEntry) => void
  maxResults?: number
}

export function usePairSearchData(
  searchValue: string,
  watchedSymbols: Set<string>,
) {
  const { items: instruments } = useMarketInstruments()
  const { data: searchResults, isSearchActive } =
    useInstrumentSearch(searchValue)
  const [recentPairs] = useRecentPairs()
  // The watchlist's own refs, not the symbol set the caller passes: a token is
  // stored by address, so a symbol-keyed lookup would drop it from this list.
  const watchedEntryKeys = useWatchlistsStore((s) => s.watchedRefs)

  const allPairs: Array<PairEntry> = useMemo(() => {
    if (instruments && instruments.length > 0) {
      return instruments.map(instrumentToPairEntry)
    }
    return []
  }, [instruments])

  const pairsBySymbol = useMemo(
    () => new Map(allPairs.map((p) => [p.symbol, p])),
    [allPairs],
  )

  // Server search results (query >= 2 chars)
  const serverResults = useMemo(() => {
    if (!isSearchActive || !searchResults) return []
    return searchResults.map(instrumentToPairEntry).sort((a, b) => {
      const aFav = watchedSymbols.has(a.symbol) ? 0 : 1
      const bFav = watchedSymbols.has(b.symbol) ? 0 : 1
      if (aFav !== bFav) return aFav - bFav
      return a.rank - b.rank
    })
  }, [isSearchActive, searchResults, watchedSymbols])

  // Client-side filter for 1-char queries
  const clientResults = useMemo(() => {
    const trimmed = searchValue.trim().replace(/[\s/]+/g, '-')
    if (trimmed.length !== 1) return []
    const q = trimmed.toLowerCase()
    return allPairs
      .filter(
        (p) =>
          p.symbol.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.base.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const aFav = watchedSymbols.has(a.symbol) ? 0 : 1
        const bFav = watchedSymbols.has(b.symbol) ? 0 : 1
        if (aFav !== bFav) return aFav - bFav
        return a.rank - b.rank
      })
      .slice(0, 20)
  }, [searchValue, allPairs, watchedSymbols])

  const recentEntries = useMemo(
    () =>
      recentPairs
        .map((ref) => pairEntryForRef(ref, pairsBySymbol))
        .filter((p): p is PairEntry => p !== null)
        .slice(0, 8),
    [recentPairs, pairsBySymbol],
  )

  const watchedEntries = useMemo(
    () =>
      [...watchedEntryKeys]
        .map((key) => parseInstrumentRef(key))
        .filter((ref): ref is InstrumentRef => ref !== null)
        .map((ref) => pairEntryForRef(ref, pairsBySymbol))
        .filter((p): p is PairEntry => p !== null)
        .slice(0, 8),
    [watchedEntryKeys, pairsBySymbol],
  )

  const hasQuery = searchValue.trim().length > 0
  const showResults = isSearchActive ? serverResults : clientResults
  const showSearchResults = hasQuery && showResults.length > 0

  return {
    showSearchResults,
    showResults,
    recentEntries,
    watchedEntries,
    hasQuery,
  }
}

export function PairSearchResults({
  searchValue,
  watchedSymbols,
  onSelect,
  maxResults = 20,
}: PairSearchResultsProps) {
  const { t } = useTranslation()
  const {
    showSearchResults,
    showResults,
    recentEntries,
    watchedEntries,
    hasQuery,
  } = usePairSearchData(searchValue, watchedSymbols)

  return (
    <div className="flex flex-col gap-1 overflow-y-auto">
      {showSearchResults && (
        <ResultSection label={t('search.results')}>
          {showResults.slice(0, maxResults).map((pair) => (
            <PairResultItem
              key={pair.id}
              pair={pair}
              isWatched={watchedSymbols.has(pair.symbol)}
              onSelect={onSelect}
            />
          ))}
        </ResultSection>
      )}

      {!hasQuery && recentEntries.length > 0 && (
        <ResultSection label={t('search.recent')}>
          {recentEntries.map((pair) => (
            <PairResultItem
              key={pair.symbol}
              pair={pair}
              isWatched={watchedSymbols.has(pair.symbol)}
              onSelect={onSelect}
            />
          ))}
        </ResultSection>
      )}

      {!hasQuery && watchedEntries.length > 0 && (
        <ResultSection label={t('search.watched')}>
          {watchedEntries.map((pair) => (
            <PairResultItem
              key={pair.symbol}
              pair={pair}
              isWatched={watchedSymbols.has(pair.symbol)}
              onSelect={onSelect}
            />
          ))}
        </ResultSection>
      )}

      {hasQuery && !showSearchResults && (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          {t('pairPicker.noPairsFound')}
        </div>
      )}

      {!hasQuery &&
        recentEntries.length === 0 &&
        watchedEntries.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t('pairPicker.startTyping')}
          </div>
        )}
    </div>
  )
}

function ResultSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      {children}
    </div>
  )
}

const PairResultItem = memo(function PairResultItem({
  pair,
  isWatched,
  onSelect,
}: {
  pair: PairEntry
  isWatched: boolean
  /** The whole row. A token's identity is its chain+address, which a
   * symbol string cannot carry, so callers get the entry. */
  onSelect: (entry: PairEntry) => void
}) {
  // Pin BEFORE navigation: the selected row's exact identity — a token's
  // address, an outcome's venue+market — must be in its directory before
  // anything downstream resolves the symbol.
  const select = () => {
    pinSelectedEntry(pair)
    onSelect(pair)
  }

  // A prediction row is read, not scanned: its identity is a question and its
  // "symbol" is a venue ticker nobody recognises. So the question leads and
  // the outcome plus the venue sit under it, rather than the symbol-first
  // layout every other asset class wants.
  if (isPredictionEntry(pair)) {
    return (
      <button
        className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors rounded-sm"
        onClick={select}
      >
        <PairLogo
          base={pair.base}
          quote={pair.quote}
          assetClass={pair.assetClass}
          size="sm"
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm leading-5">
            {predictionQuestionOf(pair)}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{pair.outcome}</span>
            <VenueBadge symbol={pair.symbol} market={pair.market} />
          </span>
        </span>
        {isWatched && (
          <Star className="mt-0.5 size-3 shrink-0 fill-amber-400 text-amber-400" />
        )}
      </button>
    )
  }

  return (
    <button
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors rounded-sm"
      onClick={select}
    >
      <PairLogo
        base={pair.base}
        quote={pair.quote}
        assetClass={pair.assetClass}
        size="sm"
      />
      <PairSymbol symbol={pair.symbol} className="text-sm" />
      <span className="flex-1 truncate text-xs text-muted-foreground">
        {pair.name}
      </span>
      <VenueBadge symbol={pair.symbol} />
      {isWatched && (
        <Star className="ml-auto size-3 fill-amber-400 text-amber-400" />
      )}
    </button>
  )
})
