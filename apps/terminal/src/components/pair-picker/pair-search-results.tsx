// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useMemo } from 'react'
import { Star } from 'lucide-react'

import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'
import { instrumentToPairEntry } from '@/components/pair-picker/pair-picker-data'
import { useInstrumentSearch } from '@/hooks/use-instrument-search'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { usePersistedState } from '@/hooks/use-persisted-state'

export type PairSearchResultsProps = {
  searchValue: string
  watchedSymbols: Set<string>
  onSelect: (symbol: string, assetClass?: string) => void
  maxResults?: number
}

export function usePairSearchData(
  searchValue: string,
  watchedSymbols: Set<string>,
) {
  const { items: instruments } = useMarketInstruments()
  const { data: searchResults, isSearchActive } =
    useInstrumentSearch(searchValue)
  const [recentPairs] = usePersistedState<Array<string>>(
    'pair-picker.recent',
    [],
  )

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
        .map((s) => pairsBySymbol.get(s))
        .filter((p): p is PairEntry => p !== undefined)
        .slice(0, 8),
    [recentPairs, pairsBySymbol],
  )

  const watchedEntries = useMemo(
    () =>
      [...watchedSymbols]
        .map((s) => pairsBySymbol.get(s))
        .filter((p): p is PairEntry => p !== undefined)
        .slice(0, 8),
    [watchedSymbols, pairsBySymbol],
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
        <ResultSection label="Results">
          {showResults.slice(0, maxResults).map((pair) => (
            <PairResultItem
              key={pair.symbol}
              pair={pair}
              isWatched={watchedSymbols.has(pair.symbol)}
              onSelect={onSelect}
            />
          ))}
        </ResultSection>
      )}

      {!hasQuery && recentEntries.length > 0 && (
        <ResultSection label="Recent">
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
        <ResultSection label="Watched">
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
          No pairs found.
        </div>
      )}

      {!hasQuery &&
        recentEntries.length === 0 &&
        watchedEntries.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Start typing to search pairs.
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
  onSelect: (symbol: string, assetClass?: string) => void
}) {
  return (
    <button
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors rounded-sm"
      onClick={() => onSelect(pair.symbol, pair.assetClass)}
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
      {isWatched && (
        <Star className="ml-auto size-3 fill-amber-400 text-amber-400" />
      )}
    </button>
  )
})
