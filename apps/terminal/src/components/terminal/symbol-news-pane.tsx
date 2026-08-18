// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  usePanePair,
  usePluginFetch,
  usePluginInfiniteQuery,
} from '@pairlens/plugin-sdk'
import type {
  NewsArticle,
  NewsFeedResponse,
} from '@pairlens/shared/instrument-types'

import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { NewsReaderDialog } from '@/components/news/news-reader'
import {
  ArticleCard,
  ArticleCardSkeleton,
  NEWS_PAGE_TIME_FROM,
  NewsFeedStatus,
  fetchNewsPage,
  flattenNewsPages,
  formatRelativeTime,
  newsFeedView,
  nextNewsPageParam,
  useNewsFeedResume,
} from '@/components/news/news-shared'

function SymbolNewsPaneInner({ pairKey }: { pairKey: string }) {
  const { t } = useTranslation()
  const apiFetch = usePluginFetch()

  const [readerIndex, setReaderIndex] = useState<number | null>(null)

  // Extract base symbol: "BTC-USDT" → "BTC"
  const baseSymbol = pairKey.split('-')[0] ?? pairKey

  const {
    data,
    isPending,
    fetchStatus,
    isFetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePluginInfiniteQuery<NewsFeedResponse, Error, string | null>({
    queryKey: ['symbol-news', baseSymbol],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ tickers: baseSymbol })
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
    enabled: !!baseSymbol,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    // A provider outage isn't worth three rounds of backoff before we say so.
    retry: 1,
  })

  // A cancelled fetch reverts to pending+idle with nothing scheduled; kick it
  // so the loading skeletons below always resolve into an answer. Guarded by
  // the query's own `enabled`, which refetch() would otherwise ignore.
  useNewsFeedResume({ isPending, fetchStatus, refetch }, !!baseSymbol)

  const pages = data?.pages
  const articles = useMemo(() => flattenNewsPages(pages ?? []), [pages])
  const fetchedAt = pages?.[0]?.fetchedAt ?? null
  const view = newsFeedView({ isPending, error, articleCount: articles.length })

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{t('news.title')}</h2>
          <Badge variant="secondary" className="text-[10px]">
            {baseSymbol}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {fetchedAt && (
            <span className="text-xs text-muted-foreground">
              {t('common.updated', { time: formatRelativeTime(fetchedAt) })}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn('size-3.5', isFetching && 'animate-spin')}
            />
          </Button>
        </div>
      </header>

      {/* Content */}
      {view === 'loading' ? (
        // Covers every pending shape, not just an active fetch: a retry that
        // paused while the tab was hidden is still loading, not an empty feed.
        <div className="flex-1 grid grid-cols-1 @lg/pane:grid-cols-2 @4xl/pane:grid-cols-3 gap-3 overflow-y-auto p-4 auto-rows-max content-start">
          {Array.from({ length: 6 }, (_, i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      ) : view !== 'articles' ? (
        <NewsFeedStatus
          error={error}
          emptyBody={t('news.noRecentFor', { symbol: baseSymbol })}
        />
      ) : (
        <div className="flex-1 grid grid-cols-1 @lg/pane:grid-cols-2 @4xl/pane:grid-cols-3 gap-3 overflow-y-auto p-4 auto-rows-max content-start">
          {articles.map((article: NewsArticle, i: number) => (
            <ArticleCard
              key={article.url}
              article={article}
              onClick={() => setReaderIndex(i)}
            />
          ))}
        </div>
      )}

      {/* Immersive article reader */}
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

export function SymbolNewsPane() {
  const activePair = usePanePair()

  if (!activePair) {
    return <PanePairPicker />
  }

  return <SymbolNewsPaneInner pairKey={activePair.pairKey} />
}
