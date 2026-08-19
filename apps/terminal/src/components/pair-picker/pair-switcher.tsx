// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pair title in the terminal top bar, doubling as the pair switcher.
 *
 * Clicking the symbol opens a search-first panel: type to filter (the same
 * `usePairSearchData` the pane picker and the phone use, so the ≥2-char server
 * search and the 1-char client filter behave identically everywhere), and with
 * an empty box it offers what a trader actually reaches for — the pairs they
 * just came from, then the popular ones.
 *
 * Recents are resolved against the loaded instrument catalog but never gated on
 * it: a pair the catalog page hasn't got (a DEX long-tail token, a symbol
 * beyond the first discovery page) still lists, synthesized from its own
 * BASE-QUOTE key. A recents list that silently drops what you were just looking
 * at is worse than no recents list.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import { Skeleton } from '@pairlens/ui/components/ui/skeleton'

import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import { HEADER_CHIP } from '@/components/chrome/header-chrome'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'
import {
  instrumentToPairEntry,
  pinSelectedEntry,
} from '@/components/pair-picker/pair-picker-data'
import { usePairSearchData } from '@/components/pair-picker/pair-search-results'
import { isSearchInFlight } from '@/components/pair-picker/search-progress'
import { VenueBadge } from '@/components/pair-picker/venue-badge'
import { SnapshotAgeFooter } from '@/components/pair-picker/snapshot-age-footer'
import { useInstrumentSearch } from '@/hooks/use-instrument-search'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useRecentPairs } from '@/lib/recent-tickers'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { entryToMarketRef } from '@/lib/market-ref/entry'
import { chartLinkProps } from '@/lib/market-ref/link'
import { usePairlens } from '@/lib/pairlens-provider'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import {
  lookupPredictionEvent,
  lookupPredictionOutcome,
} from '@/stores/prediction-directory-store'

const MAX_RECENT = 6
const MAX_POPULAR = 8
const MAX_RESULTS = 20

type PairSwitcherProps = {
  pairKey: string
  assetClass?: string
  /**
   * Fired after a row stays highlighted (hover or arrow keys) for 200 ms —
   * the switch-warmup hook. Dwell-gated so a sweep down the list doesn't
   * fire per row; the provider additionally caps concurrent warmups.
   */
  onPairHover?: (pair: string) => void
}

type Section = {
  id: string
  label: string
  items: Array<PairEntry>
}

/**
 * Asset class of a symbol. The catalog's own field when it has one; otherwise
 * the shape of the symbol says it — equities are bare tickers (AAPL) while
 * every crypto pair carries its quote (BTC-USDT). A pair opened from a direct
 * link has no `assetClassMap` entry yet, so the fallback is the common case.
 */
function classOf(symbol: string, assetClass?: string): string {
  if (assetClass) return assetClass
  // A prediction key is a venue ticker with dashes in it, so the shape test
  // below would call it crypto. The directory is the only thing that knows,
  // and it knows because the row that opened this pair pinned it.
  if (lookupPredictionEvent(symbol) || lookupPredictionOutcome(symbol))
    return 'prediction'
  return symbol.includes('-') ? 'crypto' : 'stocks'
}

/**
 * A pair the catalog doesn't know, rendered from its symbol alone.
 *
 * The prediction arm is directory-backed rather than parsed: an outcome key
 * has no base/quote to split, and its display name is a question that exists
 * nowhere in the key. A pinned outcome renders as what the user picked; an
 * unpinned one falls through to the BASE-QUOTE reading, which is at worst the
 * bare key it already was.
 */
function synthesizeEntry(symbol: string): PairEntry {
  const event = lookupPredictionEvent(symbol)
  if (event) {
    return {
      id: symbol,
      symbol,
      name: event.title,
      base: symbol,
      quote: '',
      assetClass: 'prediction',
      categories: [],
      rank: Number.MAX_SAFE_INTEGER,
      predictionMarketId: event.eventId,
      outcome: event.leader?.label ?? '',
      market: event.market,
      eventTitle: event.title,
      eventId: event.eventId,
      ...(typeof event.endMs === 'number' ? { endMs: event.endMs } : {}),
    }
  }
  const pinned = lookupPredictionOutcome(symbol)
  if (pinned) {
    return {
      id: symbol,
      symbol,
      name: pinned.name,
      base: symbol,
      quote: '',
      assetClass: 'prediction',
      categories: [],
      rank: Number.MAX_SAFE_INTEGER,
      predictionMarketId: pinned.predictionMarketId,
      outcome: pinned.outcome,
      market: pinned.market,
      ...(pinned.shortTitle ? { shortTitle: pinned.shortTitle } : {}),
      ...(pinned.eventTitle ? { eventTitle: pinned.eventTitle } : {}),
      ...(pinned.eventId ? { eventId: pinned.eventId } : {}),
      ...(typeof pinned.endMs === 'number' ? { endMs: pinned.endMs } : {}),
    }
  }
  const idx = symbol.indexOf('-')
  const base = idx === -1 ? symbol : symbol.slice(0, idx)
  const quote = idx === -1 ? '' : symbol.slice(idx + 1)
  return {
    id: symbol,
    symbol,
    name: base,
    base,
    quote,
    categories: [],
    rank: Number.MAX_SAFE_INTEGER,
  }
}

export function PairSwitcher({
  pairKey,
  assetClass,
  onPairHover,
}: PairSwitcherProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // The class the TRIGGER renders with. The prop is empty for a pair opened
  // from a shared link, and the avatar and the title both need to know a
  // prediction from a pair — `classOf` asks the directory, which the row that
  // opened this pair wrote before it navigated.
  const triggerClass = classOf(pairKey, assetClass)

  const watchedSymbols = useWatchlistsStore((s) => s.allSymbolsSet)
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )
  const [recentSymbols] = useRecentPairs()
  const resolveMarket = usePreferredMarketResolver()

  // Same react-query key the search hook reads, so this is a cache hit rather
  // than a second discovery fetch.
  const { items: instruments, isLoading: catalogLoading } =
    useMarketInstruments()

  const { showResults, hasQuery } = usePairSearchData(
    searchValue,
    watchedSymbols,
  )

  // The same query again, asked for its status rather than its data — keyed
  // identically, so it is a cache read. "No pairs found" is a claim about the
  // whole market and must not be made while the search is still fanning out.
  const {
    isSearchActive,
    isFetching: searchFetching,
    isPending: searchPending,
    hasLocalResults,
  } = useInstrumentSearch(searchValue)
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

  const pairsBySymbol = useMemo(
    () => new Map(instruments.map((i) => [i.symbol, instrumentToPairEntry(i)])),
    [instruments],
  )

  const recentEntries = useMemo(
    () =>
      recentSymbols
        .map((ref) => ref.id)
        .filter((s) => s !== pairKey)
        .slice(0, MAX_RECENT)
        .map((s) => pairsBySymbol.get(s) ?? synthesizeEntry(s)),
    [recentSymbols, pairKey, pairsBySymbol],
  )

  // "Popular" is the catalog's own ordering — curated featured entries first,
  // then rank — narrowed to the class being charted. Ranks are per asset
  // class (BTC-USDT and AAPL are both rank 1), so an unnarrowed list
  // interleaves equities into a crypto trader's shortlist and vice versa.
  // Anything already offered as a recent is dropped so no pair is listed twice.
  const popularEntries = useMemo(() => {
    const skip = new Set([pairKey, ...recentEntries.map((p) => p.symbol)])
    const wanted = classOf(pairKey, assetClass)
    const ranked = [...pairsBySymbol.values()]
      .filter((p) => !skip.has(p.symbol))
      .sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1
        return a.rank - b.rank
      })
    const sameClass = ranked.filter(
      (p) => classOf(p.symbol, p.assetClass) === wanted,
    )
    // A venue serving only the other class (an equities-only build, a DEX with
    // no catalog entry for what's charted) still gets a list rather than a gap.
    return (sameClass.length > 0 ? sameClass : ranked).slice(0, MAX_POPULAR)
  }, [pairsBySymbol, recentEntries, pairKey, assetClass])

  const sections = useMemo<Array<Section>>(() => {
    if (hasQuery) {
      const items = showResults.slice(0, MAX_RESULTS)
      return items.length > 0
        ? [{ id: 'results', label: t('search.results'), items }]
        : []
    }
    const out: Array<Section> = []
    if (recentEntries.length > 0) {
      out.push({
        id: 'recent',
        label: t('search.recent'),
        items: recentEntries,
      })
    }
    if (popularEntries.length > 0) {
      out.push({
        id: 'popular',
        label: t('pairPicker.popular'),
        items: popularEntries,
      })
    }
    return out
  }, [hasQuery, showResults, recentEntries, popularEntries, t])

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections])

  // The highlight belongs to the list, not to the keystroke that changed it:
  // every re-filter parks it back on the first row so Enter always takes the
  // top match rather than whatever index survived from the previous query.
  useEffect(() => {
    setActiveIndex(0)
  }, [searchValue, sections])

  // A new query starts a new list at the top. The activeIndex effect below
  // cannot do this: when the index is already 0 it never fires again, so a
  // leftover scroll offset would survive the re-filter. Keyed on the query
  // only — async waves appending below must not yank the scroll.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [searchValue])

  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  // The switch lands warm: a row highlighted for ≥200 ms speculatively opens
  // its streams so selecting it renders instantly.
  useEffect(() => {
    if (!open || !onPairHover) return
    const item = flatItems[activeIndex]
    if (!item || item.symbol === pairKey) return
    const timer = setTimeout(() => onPairHover(item.symbol), 200)
    return () => clearTimeout(timer)
  }, [open, onPairHover, flatItems, activeIndex, pairKey])

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (next) {
      setSearchValue('')
      setActiveIndex(0)
    }
  }, [])

  const handleSelect = useCallback(
    (pair: PairEntry) => {
      // Pin BEFORE navigation: a selected token's exact address must be in
      // the directory before anything downstream resolves the symbol.
      pinSelectedEntry(pair)
      const cls = pair.assetClass
      if (cls) {
        setAssetClassMap((prev) => ({ ...prev, [pair.symbol]: cls }))
      }
      setOpen(false)
      setSearchValue('')
      // The route records the visit itself (every entry point must feed the
      // recents history, not just this one), so no tracking call here.
      void navigate(
        chartLinkProps(entryToMarketRef(pair, resolveMarket(pair.assetClass))),
      )
    },
    [navigate, setAssetClassMap],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) =>
          flatItems.length ? (i + 1) % flatItems.length : 0,
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) =>
          flatItems.length ? (i - 1 + flatItems.length) % flatItems.length : 0,
        )
      } else if (e.key === 'Enter') {
        const pair = flatItems[activeIndex]
        if (pair) {
          e.preventDefault()
          handleSelect(pair)
        }
      }
    },
    [flatItems, activeIndex, handleSelect],
  )

  // Where each section starts in `flatItems` — the arrow keys walk one flat
  // list across every section, so a row's highlight index is its offset there.
  const sectionOffsets = useMemo(() => {
    let n = 0
    return sections.map((s) => {
      const start = n
      n += s.items.length
      return start
    })
  }, [sections])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            // `min-w-0` + `max-w`, not `shrink-0`: a prediction title is as
            // long as its question, and a title that refuses to shrink pushes
            // the venue picker, the live badge and the panes menu off the bar.
            //
            // The one 28px chip on the bar: this is the thing the whole
            // screen is about, so it sits a step above the 26px controls
            // beside it without needing a second colour to say so.
            className={cn(
              HEADER_CHIP,
              'h-7 max-w-[min(28rem,45vw)] gap-[7px] pr-2 pl-[7px]',
            )}
            aria-label={t('pairPicker.switchPair')}
          />
        }
      >
        <PairLogo
          base={pairKey.split('-')[0] ?? ''}
          quote={pairKey.split('-')[1] ?? ''}
          assetClass={triggerClass}
          size="xs"
        />
        <PairSymbol
          symbol={pairKey}
          assetClass={triggerClass}
          className="min-w-0 text-[13px] font-semibold tracking-[-0.01em]"
        />
        <ChevronDown className="size-3 shrink-0 text-muted-foreground/55" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('layout.searchPairs')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 pl-7 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {sections.map((section, si) => (
            <div key={section.id}>
              <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {section.label}
              </div>
              {section.items.map((pair, i) => {
                const index = (sectionOffsets[si] ?? 0) + i
                return (
                  <PairSwitcherRow
                    key={`${section.id}:${pair.id}`}
                    pair={pair}
                    index={index}
                    isActive={index === activeIndex}
                    isCurrent={pair.symbol === pairKey}
                    onActivate={setActiveIndex}
                    onSelect={handleSelect}
                  />
                )
              })}
            </div>
          ))}

          {sections.length === 0 &&
            (searching || (!hasQuery && catalogLoading) ? (
              <div className="flex flex-col gap-1 px-3 py-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <Skeleton className="size-7 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {hasQuery
                  ? t('pairPicker.noPairsFound')
                  : t('pairPicker.startTyping')}
              </div>
            ))}

          <SnapshotAgeFooter visible={hasQuery} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

const PairSwitcherRow = memo(function PairSwitcherRow({
  pair,
  index,
  isActive,
  isCurrent,
  onActivate,
  onSelect,
}: {
  pair: PairEntry
  index: number
  isActive: boolean
  isCurrent: boolean
  onActivate: (index: number) => void
  onSelect: (pair: PairEntry) => void
}) {
  return (
    <button
      type="button"
      data-active={isActive}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left transition-colors',
        isActive && 'bg-accent',
      )}
      // The mouse moves the same highlight the arrow keys move, rather than
      // painting a second hover state next to it — so Enter and a click can
      // never disagree about which row is selected.
      onMouseEnter={() => onActivate(index)}
      onClick={() => onSelect(pair)}
    >
      <PairLogo
        base={pair.base}
        quote={pair.quote}
        assetClass={pair.assetClass}
        size="sm"
      />
      {/* Both halves are bounded: a prediction's subject and its question are
          each free to be a sentence, and an unbounded one pushed the venue
          badge and the current-pair check clean out of the popover. */}
      <PairSymbol
        symbol={pair.symbol}
        assetClass={pair.assetClass}
        className="min-w-0 max-w-[55%] text-sm"
      />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {pair.name}
      </span>
      <VenueBadge symbol={pair.symbol} />
      {isCurrent && <Check className="size-3.5 shrink-0 text-primary" />}
    </button>
  )
})
