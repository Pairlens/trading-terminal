// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The wire, scoped to what the reader owns.
 *
 * This is the column that explains the movers table beside it, so it is built
 * for scanning rather than for reading: no banner, no summary, and a mono lead
 * that carries the symbol AND its live 24h move. A headline is worth stopping
 * on when the asset it names has already moved, and that pairing is the one
 * thing a generic feed cannot tell you.
 *
 * Section-aware, exactly like the movers table: on the equities board the
 * chips are Earnings/Macro/All and the % join comes from the broker's bulk
 * snapshot; everywhere else they are Your assets/Macro/All and the join comes
 * from the top-coins snapshot the board already holds. Both variants share one
 * feed component, because the difference between them is three parameters and
 * a lookup, not a second pane.
 *
 * It opens no new stream and no new request per chip. The percentages ride
 * maps the board already fetched for the scanner; the asset scopes are applied
 * over the same 5-minute feed the All chip reads, because the provider's own
 * `tickers` parameter is AND rather than OR (see `params` below).
 */
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import { usePluginFetch, usePluginInfiniteQuery } from '@pairlens/plugin-sdk'
import type {
  NewsArticle,
  NewsFeedParams,
  NewsFeedResponse,
} from '@pairlens/shared/instrument-types'

import type { NewsTickerRef } from '@/components/news/news-shared'
import { NewsReaderDialog } from '@/components/news/news-reader'
import {
  ArticleRow,
  ArticleRowSkeleton,
  NEWS_PAGE_TIME_FROM,
  NEWS_TOPIC_EARNINGS,
  NEWS_TOPIC_MACRO,
  NewsFeedStatus,
  countWatchedMentions,
  fetchNewsPage,
  flattenNewsPages,
  formatRelativeTime,
  isCryptoNewsTicker,
  isEquityNewsTicker,
  newsRowTag,
  newsTickerBase,
  nextNewsPageParam,
} from '@/components/news/news-shared'
import { useDiscoverySection } from '@/lib/discovery-section-context'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useTopCoinsSnapshot } from '@/hooks/use-top-coins-snapshot'
import { useWatchlistsStore } from '@/stores/watchlists-store'

/** Which slice of the wire is on screen. */
type NewsScope = 'assets' | 'macro' | 'all'

type ScopeChip = { id: NewsScope; label: string }

export function NewsPane() {
  const section = useDiscoverySection()
  return section === 'stocks' ? <EquityNews /> : <CryptoNews />
}

// ── Crypto (the spot board) ─────────────────────────────────────────

function CryptoNews() {
  const { t } = useTranslation()
  const [scope, setScope] = usePersistedState<NewsScope>('news.scope', 'assets')
  const allSymbolsSet = useWatchlistsStore((s) => s.allSymbolsSet)
  const coins = useTopCoinsSnapshot()

  // Watchlist entries are display ids ('BTC-USDT'); the feed indexes by base.
  const watched = useMemo(() => baseSymbols(allSymbolsSet), [allSymbolsSet])

  // Only symbols the provider namespaced as crypto get a crypto percentage.
  // Tickers collide across asset classes (CFG is Citizens Financial Group on
  // the wire and Centrifuge in the snapshot), and a bank's earnings headline
  // wearing a token's move is worse than a headline with no move at all.
  const changeFor = useCallback(
    (ticker: NewsTickerRef) =>
      isCryptoNewsTicker(ticker.raw)
        ? (coins.get(ticker.base)?.percentChange24h ?? null)
        : null,
    [coins],
  )

  const chips = useMemo<Array<ScopeChip>>(
    () => [
      { id: 'assets', label: t('news.scope.assets') },
      { id: 'macro', label: t('news.scope.macro') },
      { id: 'all', label: t('news.scope.all') },
    ],
    [t],
  )

  const watchedSet = useMemo(() => new Set(watched), [watched])

  return (
    <NewsFeed
      chips={chips}
      scope={scope}
      onScopeChange={setScope}
      scopeTo={scope === 'assets' ? watchedSet : null}
      // "Your assets" with an empty watchlist would silently widen to the whole
      // wire, which looks like the filter is broken. Say so instead.
      scopedEmptyBody={
        scope === 'assets' && watched.length === 0
          ? t('news.noWatchedAssets')
          : null
      }
      filteredEmptyBody={t('news.noAssetNews')}
      changeFor={changeFor}
      watched={watched}
    />
  )
}

// ── Equities (the stocks board) ─────────────────────────────────────

function EquityNews() {
  const { t } = useTranslation()
  const [scope, setScope] = usePersistedState<NewsScope>(
    'news.scope.stocks',
    'assets',
  )
  const allSymbolsSet = useWatchlistsStore((s) => s.allSymbolsSet)
  const quotes = useBulkTickerQuotes()

  // The tradeable stock universe, read through the plugin system rather than
  // imported from the catalog module: this is the same discovery query the
  // scanner on this board already runs, so it costs nothing here, and a
  // deployment that ships a different equities catalog gets its own universe
  // instead of the one that happened to be compiled in.
  const { items } = useMarketInstruments({ assetClass: 'stocks' })
  const universe = useMemo(
    () => new Set(items.map((instrument) => instrument.symbol.toUpperCase())),
    [items],
  )

  const watched = useMemo(() => baseSymbols(allSymbolsSet), [allSymbolsSet])

  // The mirror of the crypto board's rule: a bare symbol is how the provider
  // spells a listed company, and a namespaced one (CRYPTO:, FOREX:) is not
  // something the broker's snapshot can price.
  const changeFor = useCallback(
    (ticker: NewsTickerRef) =>
      isEquityNewsTicker(ticker.raw)
        ? (quotes.get(ticker.base)?.change24h ?? null)
        : null,
    [quotes],
  )

  const chips = useMemo<Array<ScopeChip>>(
    () => [
      { id: 'assets', label: t('news.scope.earnings') },
      { id: 'macro', label: t('news.scope.macro') },
      { id: 'all', label: t('news.scope.all') },
    ],
    [t],
  )

  return (
    <NewsFeed
      chips={chips}
      scope={scope}
      onScopeChange={setScope}
      // Every scope but Macro is about listed companies, so it is held to the
      // stock universe. Macro is deliberately unheld: a CPI print is not
      // "about" any one ticker, and scoping it to fifty of them is how you get
      // a macro tab that returns nothing.
      scopeTo={scope === 'macro' ? null : universe}
      topics={scope === 'assets' ? NEWS_TOPIC_EARNINGS : undefined}
      filteredEmptyBody={t('news.noStockNews')}
      changeFor={changeFor}
      watched={watched}
    />
  )
}

// ── The feed both variants render ───────────────────────────────────

function NewsFeed({
  chips,
  scope,
  onScopeChange,
  scopeTo,
  topics,
  scopedEmptyBody = null,
  filteredEmptyBody = null,
  changeFor,
  watched,
}: {
  chips: Array<ScopeChip>
  scope: NewsScope
  onScopeChange: (scope: NewsScope) => void
  /**
   * Base symbols this scope is about, filtered CLIENT-side. Null means the
   * whole wire. See the note on `params` for why this is not a query param.
   */
  scopeTo: ReadonlySet<string> | null
  /** Topic slug for the leading chip, when that chip is a topic filter. */
  topics?: string
  /** Why this scope has nothing to ask for, when that is the reason it is empty. */
  scopedEmptyBody?: string | null
  /** Why the filter, rather than the wire, is the reason there are no rows. */
  filteredEmptyBody?: string | null
  changeFor: (ticker: NewsTickerRef) => number | null | undefined
  watched: Array<string>
}) {
  const { t } = useTranslation()
  const apiFetch = usePluginFetch()
  const [readerIndex, setReaderIndex] = useState<number | null>(null)

  const watchedSet = useMemo(() => new Set(watched), [watched])

  /**
   * Only the topic ever reaches the provider.
   *
   * Its `tickers` parameter reads as AND, not OR: ask for BTC and the wire
   * answers, ask for BTC,ETH and it answers with nothing, because almost no
   * story is about both. A watchlist-scoped request is therefore a tab that is
   * permanently empty, and a fifty-symbol one is also rate-limited outright.
   * So the scope is applied here, over the same unscoped feed the All chip
   * reads — which also means switching chips is instant and costs no request.
   */
  const params: NewsFeedParams = useMemo(
    () => ({
      sort: 'LATEST',
      ...(scope === 'macro'
        ? { topics: NEWS_TOPIC_MACRO }
        : topics
          ? { topics }
          : {}),
    }),
    [scope, topics],
  )

  const serializedParams = JSON.stringify(params)

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePluginInfiniteQuery<NewsFeedResponse, Error, string | null>({
    queryKey: ['news-feed', serializedParams],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams()
      if (params.tickers) qs.set('tickers', params.tickers)
      if (params.topics) qs.set('topics', params.topics)
      if (params.sort) qs.set('sort', params.sort)
      if (pageParam) {
        qs.set('time_from', NEWS_PAGE_TIME_FROM)
        qs.set('time_to', pageParam)
      }
      return fetchNewsPage(apiFetch, qs.toString())
    },
    initialPageParam: null,
    getNextPageParam: (lastPage, _pages, lastPageParam) => {
      const next = nextNewsPageParam(lastPage)
      // A non-advancing cursor would refetch the same page forever.
      return next && next !== lastPageParam ? next : null
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    // A provider outage isn't worth three rounds of backoff before we say so.
    retry: 1,
  })

  const pages = data?.pages
  const feed = useMemo(() => flattenNewsPages(pages ?? []), [pages])
  const articles = useMemo(
    () =>
      scopeTo === null
        ? feed
        : feed.filter((article) =>
            article.tickerSentiment.some((entry) =>
              scopeTo.has(newsTickerBase(entry.ticker)),
            ),
          ),
    [feed, scopeTo],
  )
  const fetchedAt = pages?.[0]?.fetchedAt ?? null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b px-3.5 py-2">
        <h2 className="truncate text-[14px] font-semibold">
          {t('news.title')}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {/* Not a "Live" dot. The feed is a five-minute poll, and a green
              pulse over a number that is four minutes old is a lie a trader
              will eventually act on. */}
          {fetchedAt && (
            <span className="text-[11px] text-muted-foreground">
              {t('common.updated', { time: formatRelativeTime(fetchedAt) })}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={t('news.refresh')}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn('size-3.5', isFetching && 'animate-spin')}
            />
          </Button>
        </div>
      </header>

      <div className="flex shrink-0 gap-1.5 border-b px-3.5 py-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            aria-pressed={scope === chip.id}
            onClick={() => onScopeChange(chip.id)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              scope === chip.id
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-foreground hover:bg-accent/50',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <ArticleRowSkeleton key={i} />
          ))}
        </div>
      ) : error || articles.length === 0 ? (
        // Three different "nothing here", and they are not the same problem:
        // the scope has nothing to ask for, the scope filtered the wire down
        // to nothing, or the wire itself is quiet.
        <NewsFeedStatus
          error={error}
          emptyBody={
            scopedEmptyBody ??
            (feed.length > 0 ? filteredEmptyBody : null) ??
            t('news.adjustScope')
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {articles.map((article: NewsArticle, i: number) => (
            <ArticleRow
              key={article.url}
              article={article}
              tag={newsRowTag(article, changeFor)}
              mentions={countWatchedMentions(article, watchedSet)}
              onClick={() => setReaderIndex(i)}
            />
          ))}
        </div>
      )}

      {/* Immersive article reader — unchanged: the row is a way in, not a
          second reading surface. */}
      {readerIndex !== null && (
        <NewsReaderDialog
          articles={articles}
          initialIndex={readerIndex}
          onClose={() => setReaderIndex(null)}
          onEndReached={fetchNextPage}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
        />
      )}
    </div>
  )
}

/** 'BTC-USDT' → 'BTC'; a bare equity ticker passes through unchanged. */
function baseSymbols(symbols: ReadonlySet<string>): Array<string> {
  const out = new Set<string>()
  for (const symbol of symbols) {
    const base = symbol.split('-')[0]?.toUpperCase()
    if (base) out.add(base)
  }
  return [...out]
}
